import asyncio
import httpx
import yfinance as yf
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import redis.asyncio as aioredis
import json
import re

from config import REDIS_URL, PRICE_CACHE_TTL, ETF_TICKERS, CRYPTO_TICKERS, PPR_TICKERS, CA_TICKERS

redis_client = None

async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return redis_client

# ── ETFs via yfinance ─────────────────────────────────────────────────────────

async def fetch_etf_prices(tickers: list[str]) -> dict:
    result = {}
    loop = asyncio.get_event_loop()

    def _fetch():
        out = {}
        for t in tickers:
            try:
                tk = yf.Ticker(t)
                hist = tk.history(period="5d", interval="1d")
                if hist.empty:
                    continue
                price = float(hist["Close"].iloc[-1])
                prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else price
                change = price - prev
                change_pct = (change / prev * 100) if prev else 0
                out[t] = {"price": round(price, 4), "change_24h": round(change, 4),
                           "change_24h_pct": round(change_pct, 2), "currency": "EUR"}
            except Exception as e:
                print(f"yfinance error for {t}: {e}")
        return out

    return await loop.run_in_executor(None, _fetch)

# ── Crypto via CoinGecko ──────────────────────────────────────────────────────

COINGECKO_IDS = {
    "BTC-EUR": "bitcoin",
    "ETH-EUR": "ethereum",
}

async def fetch_crypto_prices(tickers: list[str]) -> dict:
    result = {}
    ids = [COINGECKO_IDS[t] for t in tickers if t in COINGECKO_IDS]
    if not ids:
        return result

    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": ",".join(ids), "vs_currencies": "eur",
              "include_24hr_change": "true"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params=params)
            data = r.json()
        reverse = {v: k for k, v in COINGECKO_IDS.items()}
        for cg_id, vals in data.items():
            ticker = reverse.get(cg_id)
            if ticker:
                price = vals.get("eur", 0)
                change_pct = vals.get("eur_24h_change", 0)
                change = price * change_pct / 100
                result[ticker] = {
                    "price": round(price, 4),
                    "change_24h": round(change, 4),
                    "change_24h_pct": round(change_pct, 2),
                    "currency": "EUR"
                }
    except Exception as e:
        print(f"CoinGecko error: {e}")
    return result

# ── PPRs via investing.com scraping ──────────────────────────────────────────

PPR_URLS = {
    "Optimize PPR Ag S": "https://pt.investing.com/funds/ptopzehm0017",
    "Optimize PPR Ag M": "https://pt.investing.com/funds/ptopzehm0017",
    "Optimize PPR Ag V": "https://pt.investing.com/funds/ptopzehm0017",
    "Stoik PPR": "https://pt.investing.com/funds/sgf-stoik-accoes-ppr-fp",
}

async def fetch_ppr_price(ticker: str, url: str) -> dict | None:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "pt-PT,pt;q=0.9",
    }
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            soup = BeautifulSoup(r.text, "lxml")

            # Try multiple selectors for price
            price = None
            for sel in ['[data-test="instrument-price-last"]', '.text-5xl', '[class*="last-price"]', '#last_last']:
                el = soup.select_one(sel)
                if el:
                    txt = re.sub(r"[^\d,.]", "", el.get_text())
                    txt = txt.replace(",", ".")
                    try:
                        price = float(txt)
                        break
                    except:
                        continue

            change_pct = None
            for sel in ['[data-test="instrument-price-change-percent"]', '[class*="percent"]']:
                el = soup.select_one(sel)
                if el:
                    txt = re.sub(r"[^\d.,-]", "", el.get_text())
                    txt = txt.replace(",", ".")
                    try:
                        change_pct = float(txt)
                        break
                    except:
                        continue

            if price:
                change = (price * (change_pct or 0) / 100)
                return {
                    "price": round(price, 4),
                    "change_24h": round(change, 4),
                    "change_24h_pct": round(change_pct or 0, 2),
                    "currency": "EUR"
                }
    except Exception as e:
        print(f"PPR scraping error for {ticker}: {e}")
    return None

async def fetch_ppr_prices(tickers: list[str]) -> dict:
    tasks = []
    valid = []
    for t in tickers:
        url = PPR_URLS.get(t)
        if url:
            tasks.append(fetch_ppr_price(t, url))
            valid.append(t)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    out = {}
    for t, r in zip(valid, results):
        if isinstance(r, dict):
            out[t] = r
    return out

# ── Certificados de Aforro via IGCP ──────────────────────────────────────────

async def fetch_ca_rate() -> float:
    """Fetch current Certificados de Aforro Série E rate from IGCP."""
    try:
        url = "https://www.igcp.pt/pt/menu-principal/instrumentos/retalho/certificados-de-aforro/"
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers=headers)
        soup = BeautifulSoup(r.text, "lxml")
        # Look for the current rate in the page
        for el in soup.find_all(string=re.compile(r"\d+[,\.]\d+\s*%")):
            m = re.search(r"(\d+[,\.]\d+)", el)
            if m:
                return float(m.group(1).replace(",", "."))
    except Exception as e:
        print(f"IGCP scraping error: {e}")
    # Fallback: current Série E rate (approx 3.25% base + Euribor 3m spread)
    return 3.5

# ── Main price fetcher ────────────────────────────────────────────────────────

async def get_prices_for_tickers(tickers: list[str], force: bool = False) -> dict:
    r = await get_redis()
    prices = {}

    etfs = [t for t in tickers if t in ETF_TICKERS or (t.endswith(".DE") or t.endswith(".IE"))]
    cryptos = [t for t in tickers if t in CRYPTO_TICKERS]
    pprs = [t for t in tickers if t in PPR_TICKERS]

    # Check cache
    to_fetch_etf, to_fetch_crypto, to_fetch_ppr = [], [], []

    for t in etfs:
        cached = await r.get(f"price:{t}") if not force else None
        if cached:
            prices[t] = json.loads(cached)
        else:
            to_fetch_etf.append(t)

    for t in cryptos:
        cached = await r.get(f"price:{t}") if not force else None
        if cached:
            prices[t] = json.loads(cached)
        else:
            to_fetch_crypto.append(t)

    for t in pprs:
        cached = await r.get(f"price:{t}") if not force else None
        if cached:
            prices[t] = json.loads(cached)
        else:
            to_fetch_ppr.append(t)

    # Fetch in parallel
    fetch_tasks = []
    if to_fetch_etf:
        fetch_tasks.append(fetch_etf_prices(to_fetch_etf))
    if to_fetch_crypto:
        fetch_tasks.append(fetch_crypto_prices(to_fetch_crypto))
    if to_fetch_ppr:
        fetch_tasks.append(fetch_ppr_prices(to_fetch_ppr))

    if fetch_tasks:
        results = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, dict):
                prices.update(res)
                # Cache results
                for t, v in res.items():
                    await r.setex(f"price:{t}", PRICE_CACHE_TTL, json.dumps(v))

    return prices
