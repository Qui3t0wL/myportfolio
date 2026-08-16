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

@app.put("/api/transactions/{tid}")
async def update_transaction(tid: int, t: Transaction):
    await db.execute(
        """UPDATE transactions
           SET data=:data, ticker=:ticker, accao=:accao, qtd=:qtd,
               preco=:preco, comissao=:comissao, total=:total, notas=:notas
           WHERE id=:id""",
        {**t.model_dump(), "id": tid}
    )
    # Invalidate portfolio cache
    r = await get_redis()
    await r.delete(PORTFOLIO_CACHE_KEY)
    return {"ok": True}

@app.delete("/api/transactions/{tid}")
async def delete_transaction(tid: int):
    await db.execute("DELETE FROM transactions WHERE id = :id", {"id": tid})
    r = await get_redis()
    await r.delete(PORTFOLIO_CACHE_KEY)
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

# ── Certificados de Aforro ────────────────────────────────────────────────────

@app.get("/api/ca/taxas")
async def get_ca_taxas():
    rows = await db.fetch_all(
        "SELECT * FROM ca_taxas ORDER BY vigencia_ano DESC, vigencia_mes DESC, mes_subscricao"
    )
    return [dict(r) for r in rows]

@app.put("/api/ca/taxas/{mes_sub}/{ano}/{mes}")
async def update_ca_taxa(mes_sub: int, ano: int, mes: int, body: dict):
    await db.execute(
        """INSERT INTO ca_taxas (mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual, fonte)
           VALUES (:mes_sub, :ano, :mes, :taxa_anual, :fonte)
           ON CONFLICT (mes_subscricao, vigencia_ano, vigencia_mes)
           DO UPDATE SET taxa_anual = :taxa_anual, fonte = :fonte""",
        {"mes_sub": mes_sub, "ano": ano, "mes": mes,
         "taxa_anual": body["taxa_anual"], "fonte": body.get("fonte", "manual")}
    )
    r = await get_redis()
    await r.delete(PORTFOLIO_CACHE_KEY)
    return {"ok": True}

@app.post("/api/ca/taxas/bulk")
async def bulk_update_ca_taxas(body: dict):
    """Insere taxas de um PDF completo: {vig_ano, vig_mes, taxa_a, taxa_b, taxa_c, fonte}"""
    vig_ano  = body["vig_ano"]
    vig_mes  = body["vig_mes"]
    taxa_a   = body["taxa_a"]   # grupos Jan,Abr,Jul,Out
    taxa_b   = body["taxa_b"]   # grupos Fev,Mai,Ago,Nov
    taxa_c   = body["taxa_c"]   # grupos Mar,Jun,Set,Dez
    fonte    = body.get("fonte", "manual")
    grupos = {1:[1,4,7,10], 2:[2,5,8,11], 3:[3,6,9,12]}
    taxas_map = {1: taxa_a, 2: taxa_b, 3: taxa_c}
    for grp, meses in grupos.items():
        for ms in meses:
            await db.execute(
                """INSERT INTO ca_taxas (mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual, fonte)
                   VALUES (:ms, :ano, :mes, :taxa, :fonte)
                   ON CONFLICT (mes_subscricao, vigencia_ano, vigencia_mes)
                   DO UPDATE SET taxa_anual = :taxa, fonte = :fonte""",
                {"ms": ms, "ano": vig_ano, "mes": vig_mes,
                 "taxa": taxas_map[grp], "fonte": fonte}
            )
    r = await get_redis()
    await r.delete(PORTFOLIO_CACHE_KEY)
    return {"ok": True, "inserted": 12}

@app.post("/api/ca/taxas/fetch-pdf")
async def fetch_ca_taxa_from_pdf():
    """Tenta fazer download do PDF do IGCP e extrair a taxa do mês actual."""
    import httpx, datetime, re
    try:
        import pdfplumber
    except ImportError:
        return {"error": "pdfplumber não instalado. Adiciona ao requirements.txt"}

    today = datetime.date.today()
    errors = []
    for months_back in range(1, 4):
        year = today.year
        month = today.month - months_back
        if month <= 0:
            month += 12
            year -= 1
        url = f"https://www.igcp.pt/sites/default/files/{year}-{month:02d}/Taxa_Anual_E%2BPP.pdf"
        try:
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "Mozilla/5.0"}) as client:
                r = await client.get(url)
                r.raise_for_status()
            # Parse PDF
            import io
            with pdfplumber.open(io.BytesIO(r.content)) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            logger.info(f"PDF CA obtido: {url}\n{text[:500]}")
            # Extract rates - look for percentage patterns
            rates = re.findall(r"(\d{1,2}[.,]\d{2,4})\s*%", text)
            logger.info(f"Taxas encontradas no PDF: {rates}")
            return {"url": url, "text_preview": text[:800], "rates_found": rates}
        except Exception as e:
            errors.append(f"{year}-{month:02d}: {e}")

    return {"error": "Não foi possível obter o PDF", "details": errors}

@app.get("/api/ca/calculo")
async def calc_ca():
    """Calcula o valor actual de todos os CA com base nas taxas históricas."""
    from dateutil.relativedelta import relativedelta
    import datetime

    # Get all CA transactions
    rows = await db.fetch_all(
        "SELECT * FROM transactions WHERE ticker LIKE 'CA -%' AND accao = 'Compra' ORDER BY data"
    )
    # Get all historical rates indexed by (mes_subscricao, vigencia_ano, vigencia_mes)
    taxas_rows = await db.fetch_all(
        "SELECT mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual FROM ca_taxas ORDER BY vigencia_ano, vigencia_mes"
    )
    # Build lookup: (mes_subscricao, vig_ano, vig_mes) -> taxa
    taxas = {
        (r["mes_subscricao"], r["vigencia_ano"], r["vigencia_mes"]): float(r["taxa_anual"])
        for r in taxas_rows
    }
    # Also build sorted list of (mes_sub, vig_ano, vig_mes) for fallback lookup
    taxas_keys = sorted(taxas.keys())

    hoje = datetime.date.today()
    resultado = []
    total_valor = 0
    total_investido = 0

    for row in rows:
        sub_date = row["data"] if isinstance(row["data"], datetime.date) else datetime.date.fromisoformat(str(row["data"]))
        unidades = int(float(row["qtd"]))
        mes_sub = sub_date.month  # key for rate lookup

        # Calculate trimester by trimester with actual historical rates
        valor = float(unidades)
        current = sub_date
        trimestre = 0

        while True:
            # Next capitalization: exactly 3 months after current
            try:
                prox = current + relativedelta(months=3)
            except Exception:
                prox = (current + relativedelta(months=4)).replace(day=1)

            if prox > hoje:
                break

            # Rate for this trimester: keyed by (mes_subscricao, current_year, current_month)
            taxa_anual = taxas.get((mes_sub, current.year, current.month))
            if taxa_anual is None:
                # Fall back to nearest previous rate for this mes_subscricao
                prev_keys = [k for k in taxas_keys
                             if k[0] == mes_sub and (k[1], k[2]) <= (current.year, current.month)]
                if prev_keys:
                    taxa_anual = taxas[prev_keys[-1]]
                else:
                    # Last resort: any rate for this mes_subscricao
                    fallback = [v for k, v in taxas.items() if k[0] == mes_sub]
                    taxa_anual = fallback[-1] if fallback else 2.112

            taxa_trim = taxa_anual / 4 / 100
            juros_brutos = valor * taxa_trim
            juros_liquidos = juros_brutos * (1 - 0.28)  # retenção na fonte 28% IRS
            valor += juros_liquidos
            trimestre += 1
            current = prox

        # Next capitalization
        proxima_cap = sub_date + relativedelta(months=(trimestre + 1) * 3)
        data_venc = sub_date + relativedelta(years=10)
        ganhos_liquidos = valor - unidades
        # Para mostrar o bruto: juros_liquidos = juros_brutos * 0.72, logo brutos = liquidos / 0.72
        ganhos_brutos = ganhos_liquidos / 0.72
        imposto_retido = ganhos_brutos * 0.28
        ganhos_pct = (ganhos_liquidos / unidades * 100) if unidades > 0 else 0

        # Current rate
        taxa_atual = taxas.get((hoje.year, hoje.month)) or list(taxas.values())[-1]

        resultado.append({
            "ticker": row["ticker"],
            "data_subscricao": sub_date.isoformat(),
            "unidades": unidades,
            "trimestres": trimestre,
            "taxa_atual": taxa_atual,
            "valorizacao_unitaria": round(valor / unidades, 5) if unidades else 1,
            "valor_atual": round(valor, 2),
            "ganhos": round(ganhos_liquidos, 2),
            "ganhos_brutos": round(ganhos_brutos, 2),
            "imposto_retido": round(imposto_retido, 2),
            "ganhos_pct": round(ganhos_pct, 2),
            "proxima_capitalizacao": proxima_cap.isoformat(),
            "data_vencimento": data_venc.isoformat(),
            "meses_para_vencimento": max(0, (data_venc - hoje).days // 30),
        })
        total_valor += valor
        total_investido += unidades

    total_ganhos_liq = total_valor - total_investido
    total_ganhos_brutos = sum(r.get("ganhos_brutos", 0) for r in resultado)
    total_imposto = sum(r.get("imposto_retido", 0) for r in resultado)
    return {
        "subscricoes": resultado,
        "summary": {
            "valor_atual": round(total_valor, 2),
            "investido": round(total_investido, 2),
            "ganhos": round(total_ganhos_liq, 2),
            "ganhos_brutos": round(total_ganhos_brutos, 2),
            "imposto_retido": round(total_imposto, 2),
            "ganhos_pct": round((total_ganhos_liq / total_investido * 100) if total_investido else 0, 2),
            "taxa_atual": taxas.get((hoje.year, hoje.month)) or list(taxas.values())[-1] if taxas else 0,
        }
    }
