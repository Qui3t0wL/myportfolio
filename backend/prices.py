import asyncio
import httpx
import yfinance as yf
from bs4 import BeautifulSoup
from datetime import datetime
import redis.asyncio as aioredis
import json
import re
import logging

from config import REDIS_URL, PRICE_CACHE_TTL, ETF_TICKERS, CRYPTO_TICKERS, PPR_TICKERS

logger = logging.getLogger(__name__)

redis_client = None

async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return redis_client

# ── ETFs via yfinance (batch) ─────────────────────────────────────────────────

async def fetch_etf_prices(tickers: list[str]) -> dict:
    if not tickers:
        return {}

    loop = asyncio.get_event_loop()

    def _fetch():
        out = {}
        try:
            # Batch download — much faster than individual Ticker() calls
            if len(tickers) == 1:
                raw = yf.download(
                    tickers[0], period="5d", interval="1d",
                    auto_adjust=True, progress=False
                )
                frames = {tickers[0]: raw}
            else:
                raw = yf.download(
                    tickers, period="5d", interval="1d",
                    group_by="ticker", auto_adjust=True, progress=False
                )
                frames = {t: raw[t] for t in tickers if t in raw.columns.get_level_values(0)}

            for ticker, df in frames.items():
                df = df.dropna(subset=["Close"])
                if df.empty:
                    logger.warning(f"yfinance: sem dados para {ticker}")
                    continue
                price = float(df["Close"].iloc[-1])
                prev  = float(df["Close"].iloc[-2]) if len(df) >= 2 else price
                change     = round(price - prev, 4)
                change_pct = round((change / prev * 100) if prev else 0, 2)
                out[ticker] = {
                    "price": round(price, 4),
                    "change_24h": change,
                    "change_24h_pct": change_pct,
                    "currency": "EUR",
                }
                logger.info(f"yfinance OK: {ticker} = {price:.2f} ({change_pct:+.2f}%)")

        except Exception as e:
            logger.error(f"yfinance batch error: {e}")
            # Fallback: try each ticker individually
            for t in tickers:
                try:
                    tk = yf.Ticker(t)
                    info = tk.fast_info
                    price = info.last_price
                    prev  = info.previous_close or price
                    if price:
                        change     = round(price - prev, 4)
                        change_pct = round((change / prev * 100) if prev else 0, 2)
                        out[t] = {
                            "price": round(price, 4),
                            "change_24h": change,
                            "change_24h_pct": change_pct,
                            "currency": "EUR",
                        }
                        logger.info(f"yfinance fallback OK: {t} = {price:.2f}")
                except Exception as e2:
                    logger.error(f"yfinance fallback error {t}: {e2}")
        return out

    return await loop.run_in_executor(None, _fetch)

# ── Crypto via CoinGecko ──────────────────────────────────────────────────────

COINGECKO_IDS = {
    "BTC-EUR": "bitcoin",
    "ETH-EUR": "ethereum",
}

async def fetch_crypto_prices(tickers: list[str]) -> dict:
    if not tickers:
        return {}
    ids = [COINGECKO_IDS[t] for t in tickers if t in COINGECKO_IDS]
    if not ids:
        return {}

    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(ids),
        "vs_currencies": "eur",
        "include_24hr_change": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        reverse = {v: k for k, v in COINGECKO_IDS.items()}
        result = {}
        for cg_id, vals in data.items():
            ticker = reverse.get(cg_id)
            if not ticker:
                continue
            price      = vals.get("eur", 0)
            change_pct = vals.get("eur_24h_change", 0) or 0
            change     = round(price * change_pct / 100, 4)
            result[ticker] = {
                "price": round(price, 4),
                "change_24h": change,
                "change_24h_pct": round(change_pct, 2),
                "currency": "EUR",
            }
            logger.info(f"CoinGecko OK: {ticker} = {price:.2f} ({change_pct:+.2f}%)")
        return result

    except Exception as e:
        logger.error(f"CoinGecko error: {e}")
        return {}

# ── PPRs via investing.com ────────────────────────────────────────────────────

PPR_URLS = {
    "Optimize PPR Ag S": "https://pt.investing.com/funds/ptopzehm0017",
    "Optimize PPR Ag M": "https://pt.investing.com/funds/ptopzg690019",
    "Optimize PPR Ag V": "https://pt.investing.com/funds/ptopzehm0017",
    "Stoik PPR":         "https://pt.investing.com/funds/sgf-stoik-accoes-ppr-fp",
}

PRICE_SELECTORS = [
    '[data-test="instrument-price-last"]',
    ".text-5xl",
    "#last_last",
    '[class*="last-price"]',
    '[class*="Price"]',
]
PCT_SELECTORS = [
    '[data-test="instrument-price-change-percent"]',
    '[class*="percent"]',
    '[class*="Percent"]',
]

async def _scrape_investing(ticker: str, url: str) -> dict | None:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://pt.investing.com/",
    }
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")

        price = None
        for sel in PRICE_SELECTORS:
            el = soup.select_one(sel)
            if el:
                txt = re.sub(r"[^\d,.]", "", el.get_text()).replace(",", ".")
                try:
                    price = float(txt)
                    break
                except ValueError:
                    continue

        change_pct = None
        for sel in PCT_SELECTORS:
            el = soup.select_one(sel)
            if el:
                txt = re.sub(r"[^\d.,-]", "", el.get_text()).replace(",", ".")
                try:
                    change_pct = float(txt)
                    break
                except ValueError:
                    continue

        if price:
            change = round(price * (change_pct or 0) / 100, 4)
            logger.info(f"investing.com OK: {ticker} = {price:.4f} ({change_pct or 0:+.2f}%)")
            return {
                "price": round(price, 4),
                "change_24h": change,
                "change_24h_pct": round(change_pct or 0, 2),
                "currency": "EUR",
            }
        else:
            logger.warning(f"investing.com: preço não encontrado para {ticker} em {url}")

    except Exception as e:
        logger.error(f"investing.com scraping error {ticker}: {e}")
    return None

async def fetch_ppr_prices(tickers: list[str]) -> dict:
    tasks, labels = [], []
    for t in tickers:
        url = PPR_URLS.get(t)
        if url:
            tasks.append(_scrape_investing(t, url))
            labels.append(t)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    return {t: r for t, r in zip(labels, results) if isinstance(r, dict)}

# ── Main price fetcher ────────────────────────────────────────────────────────

async def get_prices_for_tickers(tickers: list[str], force: bool = False) -> dict:
    r = await get_redis()
    prices = {}

    etfs    = [t for t in tickers if t not in CRYPTO_TICKERS and t not in PPR_TICKERS]
    cryptos = [t for t in tickers if t in CRYPTO_TICKERS]
    pprs    = [t for t in tickers if t in PPR_TICKERS]

    to_fetch_etf, to_fetch_crypto, to_fetch_ppr = [], [], []

    for t in etfs:
        cached = None if force else await r.get(f"price:{t}")
        if cached:
            prices[t] = json.loads(cached)
        else:
            to_fetch_etf.append(t)

    for t in cryptos:
        cached = None if force else await r.get(f"price:{t}")
        if cached:
            prices[t] = json.loads(cached)
        else:
            to_fetch_crypto.append(t)

    for t in pprs:
        cached = None if force else await r.get(f"price:{t}")
        if cached:
            prices[t] = json.loads(cached)
        else:
            to_fetch_ppr.append(t)

    logger.info(f"Fetching prices — ETFs: {to_fetch_etf}, Crypto: {to_fetch_crypto}, PPRs: {to_fetch_ppr}")

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
                for t, v in res.items():
                    await r.setex(f"price:{t}", PRICE_CACHE_TTL, json.dumps(v))

    logger.info(f"Preços obtidos: {list(prices.keys())}")
    return prices
