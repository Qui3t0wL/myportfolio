from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import databases
import asyncpg
from typing import Optional
import json
import io
import csv
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from config import DATABASE_URL, PRICE_CACHE_TTL
from prices import get_prices_for_tickers, get_redis
from portfolio import compute_portfolio
from models import ManualAccount, Transaction

db = databases.Database(DATABASE_URL)

PORTFOLIO_CACHE_KEY = "portfolio:result"

async def get_cached_portfolio(force: bool = False):
    r = await get_redis()
    if not force:
        cached = await r.get(PORTFOLIO_CACHE_KEY)
        if cached:
            return json.loads(cached)

    rows = await db.fetch_all("SELECT * FROM transactions ORDER BY data ASC")
    transactions = [dict(r) for r in rows]
    accounts = [dict(a) for a in await db.fetch_all("SELECT * FROM manual_accounts")]
    from config import NO_PRICE_TICKERS, ALL_PRICED_TICKERS
    tickers = list({t["ticker"] for t in transactions
                    if t["ticker"] in ALL_PRICED_TICKERS})
    logger.info(f"Tickers com preço automático: {tickers}")
    prices = await get_prices_for_tickers(tickers)
    result = compute_portfolio(transactions, prices, accounts)

    await r.setex(PORTFOLIO_CACHE_KEY, PRICE_CACHE_TTL, json.dumps(result, default=str))
    return result

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()

app = FastAPI(title="Portfolio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Transactions ──────────────────────────────────────────────────────────────

@app.get("/api/transactions")
async def list_transactions(ticker: Optional[str] = None, limit: int = 500, offset: int = 0):
    q = "SELECT * FROM transactions"
    params = {}
    if ticker:
        q += " WHERE ticker = :ticker"
        params["ticker"] = ticker
    q += " ORDER BY data DESC LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    rows = await db.fetch_all(q, params)
    return [dict(r) for r in rows]

@app.post("/api/transactions")
async def add_transaction(t: Transaction):
    q = """INSERT INTO transactions (data, ticker, accao, qtd, preco, comissao, total, notas)
           VALUES (:data, :ticker, :accao, :qtd, :preco, :comissao, :total, :notas)
           RETURNING id"""
    row = await db.fetch_one(q, t.model_dump())
    return {"id": row["id"]}

@app.delete("/api/transactions/{tid}")
async def delete_transaction(tid: int):
    await db.execute("DELETE FROM transactions WHERE id = :id", {"id": tid})
    return {"ok": True}

@app.post("/api/transactions/import")
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    inserted = 0
    errors = []
    for i, row in enumerate(reader):
        try:
            data_raw = row.get("Data", "").strip()
            ticker = row.get("Ticker", "").strip()
            accao = row.get("Acção", row.get("Accao", "")).strip()
            if not data_raw or not ticker:
                continue

            # Parse date MM/DD/YYYY or DD/MM/YYYY
            from datetime import datetime
            for fmt in ("%m/%d/%Y", "%d/%m/%Y"):
                try:
                    dt = datetime.strptime(data_raw, fmt).date()
                    break
                except ValueError:
                    continue

            def parse_num(s):
                return float(str(s).replace(",", ".").strip() or "0")

            qtd = parse_num(row.get("Qtd", 0))
            preco = parse_num(row.get("Preço", row.get("Preco", 0)))
            comissao = parse_num(row.get("Comissão", row.get("Comissao", 0)))
            total = parse_num(row.get("Total", 0))
            notas = row.get("", "").strip()  # 8th unnamed column

            # Normalise ticker names
            ticker_map = {"VIaInvest": "ViaInvest"}
            ticker = ticker_map.get(ticker, ticker)

            await db.execute(
                """INSERT INTO transactions (data, ticker, accao, qtd, preco, comissao, total, notas)
                   VALUES (:data, :ticker, :accao, :qtd, :preco, :comissao, :total, :notas)
                   ON CONFLICT DO NOTHING""",
                {"data": dt, "ticker": ticker, "accao": accao,
                 "qtd": qtd, "preco": preco, "comissao": comissao,
                 "total": total, "notas": notas}
            )
            inserted += 1
        except Exception as e:
            errors.append(f"Row {i+2}: {e}")

    return {"inserted": inserted, "errors": errors[:20]}

# ── Portfolio summary ─────────────────────────────────────────────────────────

@app.get("/api/portfolio")
async def get_portfolio():
    return await get_cached_portfolio()

# ── Manual accounts ───────────────────────────────────────────────────────────

@app.get("/api/accounts")
async def get_accounts():
    rows = await db.fetch_all("SELECT * FROM manual_accounts ORDER BY nome")
    return [dict(r) for r in rows]

@app.put("/api/accounts/{nome}")
async def update_account(nome: str, body: ManualAccount):
    await db.execute(
        "UPDATE manual_accounts SET valor = :valor, updated_at = NOW() WHERE nome = :nome",
        {"nome": nome, "valor": body.valor}
    )
    return {"ok": True}

@app.post("/api/accounts")
async def create_account(body: ManualAccount):
    await db.execute(
        "INSERT INTO manual_accounts (nome, valor) VALUES (:nome, :valor) ON CONFLICT (nome) DO UPDATE SET valor = :valor",
        {"nome": body.nome, "valor": body.valor}
    )
    return {"ok": True}

@app.delete("/api/accounts/{nome}")
async def delete_account(nome: str):
    await db.execute("DELETE FROM manual_accounts WHERE nome = :nome", {"nome": nome})
    return {"ok": True}

# ── Price refresh ─────────────────────────────────────────────────────────────

@app.post("/api/prices/refresh")
async def refresh_prices():
    r = await get_redis()
    await r.delete(PORTFOLIO_CACHE_KEY)
    result = await get_cached_portfolio(force=True)
    return {"refreshed": True}

@app.get("/api/prices")
async def get_all_prices():
    rows = await db.fetch_all("SELECT * FROM price_cache ORDER BY ticker")
    return [dict(r) for r in rows]
