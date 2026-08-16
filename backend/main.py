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

async def _scrape_ctt_reembolso() -> dict:
    """
    Scrapes the CTT Série E reembolso table.
    Table structure:
      - Columns: current month (mes_atual)
      - Rows:    subscription month (mes_subscricao)
      - Cell:    valor unitário de reembolso (already includes capitalisation + tax)
    Returns: {(ano_sub, mes_sub): valor_unitario}
    """
    import httpx, re
    from bs4 import BeautifulSoup

    url = "https://appserver2.ctt.pt/feapl/app/open/certaforro/certificadosreembolsoList.jspx?request_locale=pt&serie_Nr=E"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
        "Referer": "https://appserver2.ctt.pt/",
    }
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()

        soup = BeautifulSoup(r.text, "lxml")
        result = {}

        # Find the main table
        table = soup.find("table")
        if not table:
            logger.warning("CTT: tabela não encontrada")
            return result

        rows = table.find_all("tr")
        if not rows:
            return result

        # Parse header row to get current month columns
        # Header format: "Ago/2026", "Set/2026", etc.
        months_pt = {"jan":1,"fev":2,"mar":3,"abr":4,"mai":5,"jun":6,
                     "jul":7,"ago":8,"set":9,"out":10,"nov":11,"dez":12}

        header_cols = []
        header_row = rows[0]
        for th in header_row.find_all(["th","td"]):
            txt = th.get_text(strip=True).lower()
            m = re.match(r"([a-z]+)[/\-](\d{4})", txt)
            if m:
                mes_num = months_pt.get(m.group(1)[:3])
                ano_num = int(m.group(2))
                if mes_num:
                    header_cols.append((ano_num, mes_num))
                else:
                    header_cols.append(None)
            else:
                header_cols.append(None)

        logger.info(f"CTT header cols: {header_cols}")

        # Parse data rows — each row is a subscription month
        for row in rows[1:]:
            cells = row.find_all(["th","td"])
            if not cells:
                continue

            # First cell is the subscription month label: "Set/2022", "Nov/2022", etc.
            label = cells[0].get_text(strip=True).lower()
            m = re.match(r"([a-z]+)[/\-](\d{4})", label)
            if not m:
                continue
            mes_sub = months_pt.get(m.group(1)[:3])
            ano_sub = int(m.group(2))
            if not mes_sub:
                continue

            # Remaining cells are values for each column (current month)
            for i, cell in enumerate(cells[1:], 0):
                if i >= len(header_cols) or header_cols[i] is None:
                    continue
                col_ano, col_mes = header_cols[i]
                val_txt = cell.get_text(strip=True).replace(",", ".").replace("\xa0","").strip()
                try:
                    val = float(val_txt)
                    # Key: (ano_sub, mes_sub, col_ano, col_mes)
                    result[(ano_sub, mes_sub, col_ano, col_mes)] = val
                except ValueError:
                    continue

        logger.info(f"CTT: {len(result)} valores extraídos")
        return result

    except Exception as e:
        logger.error(f"CTT scraping erro: {e}")
        return {}


async def _calc_ca_internal() -> dict:
    """
    Calculates CA values using CTT reembolso table (most accurate).
    Falls back to manual trimester calculation if CTT is unavailable.
    """
    import datetime
    from dateutil.relativedelta import relativedelta

    hoje = datetime.date.today()

    # Get CA transactions
    rows = await db.fetch_all(
        "SELECT * FROM transactions WHERE ticker LIKE 'CA -%' AND accao = 'Compra' ORDER BY data"
    )

    # Try CTT table first
    ctt_table = await _scrape_ctt_reembolso()
    use_ctt = len(ctt_table) > 0

    # Get historical rates for fallback
    taxas_rows = await db.fetch_all(
        "SELECT mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual FROM ca_taxas ORDER BY vigencia_ano, vigencia_mes"
    )
    taxas = {
        (r["mes_subscricao"], r["vigencia_ano"], r["vigencia_mes"]): float(r["taxa_anual"])
        for r in taxas_rows
    }
    taxas_keys = sorted(taxas.keys())

    resultado, total_valor, total_investido = [], 0, 0

    for row in rows:
        sub_date = row["data"] if isinstance(row["data"], datetime.date)                    else datetime.date.fromisoformat(str(row["data"]))
        unidades  = int(float(row["qtd"]))
        mes_sub   = sub_date.month
        ano_sub   = sub_date.year

        valor_unitario = None

        if use_ctt:
            # Look up current month in CTT table
            valor_unitario = ctt_table.get((ano_sub, mes_sub, hoje.year, hoje.month))
            # Try adjacent months if exact match not found
            if valor_unitario is None:
                for delta in [-1, 1, -2, 2]:
                    alt = hoje + relativedelta(months=delta)
                    valor_unitario = ctt_table.get((ano_sub, mes_sub, alt.year, alt.month))
                    if valor_unitario:
                        break

        if valor_unitario:
            # CTT value: valor_unitario is the reembolso value per unit subscribed
            valor      = unidades * valor_unitario
            ganhos_liq = valor - unidades
            # CTT values already net of tax, so bruto = liq / 0.72
            ganhos_brutos = ganhos_liq / 0.72
            imposto       = ganhos_brutos * 0.28
            source        = "CTT"
        else:
            # Fallback: manual trimester calculation
            valor   = float(unidades)
            current = sub_date
            trimestre = 0
            while True:
                try:
                    prox = current + relativedelta(months=3)
                except Exception:
                    prox = (current + relativedelta(months=4)).replace(day=1)
                if prox > hoje:
                    break
                taxa_anual = taxas.get((mes_sub, current.year, current.month))
                if taxa_anual is None:
                    prev = [k for k in taxas_keys if k[0] == mes_sub and (k[1], k[2]) <= (current.year, current.month)]
                    taxa_anual = taxas[prev[-1]] if prev else 2.112
                juros_brutos = valor * taxa_anual / 4 / 100
                valor       += juros_brutos * 0.72
                trimestre   += 1
                current      = prox
            ganhos_liq    = valor - unidades
            ganhos_brutos = ganhos_liq / 0.72
            imposto       = ganhos_brutos * 0.28
            valor_unitario = valor / unidades if unidades else 1
            source        = "calc"

        proxima_cap = sub_date + relativedelta(months=3)
        current_tmp = sub_date
        while True:
            nxt = current_tmp + relativedelta(months=3)
            if nxt > hoje:
                proxima_cap = nxt
                break
            current_tmp = nxt

        data_venc = sub_date + relativedelta(years=10)

        # Current rate from taxas table
        taxa_atual = taxas.get((mes_sub, hoje.year, hoje.month))
        if not taxa_atual:
            prev = [k for k in taxas_keys if k[0] == mes_sub]
            taxa_atual = taxas[prev[-1]] if prev else None

        resultado.append({
            "ticker":              row["ticker"],
            "data_subscricao":     sub_date.isoformat(),
            "unidades":            unidades,
            "taxa_atual":          taxa_atual,
            "valorizacao_unitaria":round(valor_unitario, 5),
            "valor_atual":         round(valor, 2),
            "ganhos":              round(ganhos_liq, 2),
            "ganhos_brutos":       round(ganhos_brutos, 2),
            "imposto_retido":      round(imposto, 2),
            "ganhos_pct":          round((ganhos_liq / unidades * 100) if unidades else 0, 2),
            "proxima_capitalizacao": proxima_cap.isoformat(),
            "data_vencimento":     data_venc.isoformat(),
            "meses_para_vencimento": max(0, (data_venc - hoje).days // 30),
            "source":              source,
        })
        total_valor     += valor
        total_investido += unidades

    total_ganhos_liq    = total_valor - total_investido
    total_ganhos_brutos = sum(r["ganhos_brutos"] for r in resultado)
    total_imposto       = sum(r["imposto_retido"] for r in resultado)

    return {
        "subscricoes": resultado,
        "source": "CTT" if use_ctt else "calc",
        "summary": {
            "valor_atual":    round(total_valor, 2),
            "investido":      round(total_investido, 2),
            "ganhos":         round(total_ganhos_liq, 2),
            "ganhos_brutos":  round(total_ganhos_brutos, 2),
            "imposto_retido": round(total_imposto, 2),
            "ganhos_pct":     round((total_ganhos_liq / total_investido * 100) if total_investido else 0, 2),
            "taxa_atual":     None,
        }
    }


async def get_cached_portfolio(force: bool = False):
    r = await get_redis()
    if not force:
        cached = await r.get(PORTFOLIO_CACHE_KEY)
        if cached:
            return json.loads(cached)

    rows = await db.fetch_all("SELECT * FROM transactions ORDER BY data ASC")
    transactions = [dict(r) for r in rows]
    accounts = [dict(a) for a in await db.fetch_all("SELECT * FROM manual_accounts")]
    from config import ALL_PRICED_TICKERS
    import asyncio as _asyncio
    tickers = list({t["ticker"] for t in transactions
                    if t["ticker"] in ALL_PRICED_TICKERS})
    logger.info(f"Tickers com preço automático: {tickers}")
    prices, ca_calculo = await _asyncio.gather(
        get_prices_for_tickers(tickers),
        _calc_ca_internal(),
    )
    result = compute_portfolio(transactions, prices, accounts, ca_calculo=ca_calculo)

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
    """
    Faz download do PDF do IGCP e extrai as taxas por grupo de subscrição.
    
    O PDF publica uma tabela por ano de subscrição (2022, 2023, ...) com 3 linhas:
      - Grupo A: Jan/Abr/Jul/Out
      - Grupo B: Fev/Mai/Ago/Nov  
      - Grupo C: Mar/Jun/Set/Dez
    Cada linha tem a taxa vigente e a data "desde <mês> de <ano>".
    O URL usa o mês ANTERIOR ao mês de publicação (ex: publicado em Nov/2025 → URL /2025-10/).
    """
    import httpx, datetime, re, io
    try:
        import pdfplumber
    except ImportError:
        return {"error": "pdfplumber não instalado"}

    today = datetime.date.today()
    errors = []

    # Try last 3 months (PDF URL uses previous month)
    for months_back in range(1, 5):
        year  = today.year
        month = today.month - months_back
        if month <= 0:
            month += 12
            year  -= 1
        url = f"https://www.igcp.pt/sites/default/files/{year}-{month:02d}/Taxa_Anual_E%2BPP.pdf"
        try:
            async with httpx.AsyncClient(timeout=20, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/pdf,*/*",
            }) as client:
                r = await client.get(url)
                r.raise_for_status()

            # Extract text from PDF
            with pdfplumber.open(io.BytesIO(r.content)) as pdf:
                pages_text = []
                for page in pdf.pages:
                    # Try table extraction first (more structured)
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            for row in table:
                                pages_text.append(" | ".join(str(c or "") for c in row))
                    else:
                        pages_text.append(page.extract_text() or "")
                full_text = "\n".join(pages_text)

            logger.info(f"PDF CA obtido: {url}\nTexto:\n{full_text[:1000]}")

            # Parse the extracted text to find rates per subscription year and group
            # Pattern: year (2022, 2023...) followed by month groups and percentage
            parsed = _parse_igcp_pdf(full_text, today)

            return {
                "url": url,
                "text_preview": full_text[:1200],
                "parsed": parsed,
                "mes_publicacao": month + 1 if month < 12 else 1,
                "ano_publicacao": year if month < 12 else year + 1,
            }

        except Exception as e:
            errors.append(f"{year}-{month:02d}: {str(e)[:100]}")
            continue

    return {"error": "Não foi possível obter o PDF do IGCP", "details": errors}


def _parse_igcp_pdf(text: str, today) -> dict:
    """
    Parse IGCP PDF text to extract rates per subscription year and group.
    
    Returns dict: {
      "2022": {"A": 3.509, "B": 3.544, "C": 3.528, "desde_mes": 11, "desde_ano": 2025},
      "2023": {...},
      ...
    }
    """
    import re
    result = {}

    # Normalise text
    text = text.replace(",", ".").replace("\xa0", " ")

    # Find all percentage values in order
    pct_pattern = re.compile(r"(\d{1,2}\.\d{2,4})\s*%")

    # Find year sections (2022, 2023, ...)
    year_pattern = re.compile(r"\b(20\d{2})\b")

    # Month name mapping PT
    months_pt = {
        "janeiro":1,"fevereiro":2,"março":3,"marco":3,"abril":4,
        "maio":5,"junho":6,"julho":7,"agosto":8,"setembro":9,
        "outubro":10,"novembro":11,"dezembro":12
    }

    # Group keywords
    group_a_kw = ["janeiro","abril","julho","outubro"]
    group_b_kw = ["fevereiro","maio","agosto","novembro"]
    group_c_kw = ["março","marco","junho","setembro","dezembro"]

    lines = text.split("\n")
    current_year = None

    for line in lines:
        line_lower = line.lower()

        # Detect subscription year
        ym = year_pattern.search(line)
        if ym and not any(m in line_lower for m in months_pt):
            yr = int(ym.group(1))
            if 2020 <= yr <= today.year:
                current_year = str(yr)
                if current_year not in result:
                    result[current_year] = {}
                continue

        if current_year is None:
            continue

        # Find percentage in this line
        pct_match = pct_pattern.search(line)
        if not pct_match:
            continue
        taxa = float(pct_match.group(1))

        # Determine group from month keywords
        group = None
        if any(m in line_lower for m in group_a_kw):
            group = "A"
        elif any(m in line_lower for m in group_b_kw):
            group = "B"
        elif any(m in line_lower for m in group_c_kw):
            group = "C"

        if group:
            result[current_year][group] = taxa
            # Extract "desde <mês> de <ano>"
            desde = re.search(r"desde\s+(\w+)\s+de\s+(\d{4})", line_lower)
            if desde:
                mes_nome = desde.group(1)
                mes_num  = months_pt.get(mes_nome)
                ano_num  = int(desde.group(2))
                result[current_year][f"desde_{group}"] = {"mes": mes_num, "ano": ano_num}

    logger.info(f"PDF parsed: {result}")
    return result

@app.get("/api/ca/calculo")
async def calc_ca():
    """Calcula o valor actual de todos os CA (via CTT com fallback para cálculo manual)."""
    return await _calc_ca_internal()


