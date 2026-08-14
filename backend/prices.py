"""
Price fetching:
- ETFs: Yahoo Finance v8/chart com sessão e retry (sem yfinance)
- Crypto: CoinGecko
- PPRs: Yahoo Finance (tickers .F Frankfurt) com fallback investing.com
"""

import asyncio
import httpx
from bs4 import BeautifulSoup
import redis.asyncio as aioredis
import json
import re
import logging
import random

from config import REDIS_URL, PRICE_CACHE_TTL, CRYPTO_TICKERS, PPR_TICKERS

logger = logging.getLogger(__name__)

redis_client = None

async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return redis_client

# ── Yahoo Finance v8 — sessão com cookies e retry ─────────────────────────────

# Yahoo tem dois endpoints equivalentes; alternamos para evitar rate limit
YAHOO_HOSTS = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
]

YAHOO_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}

async def _yahoo_get_session(client: httpx.AsyncClient) -> dict:
    """Obtém cookies de sessão visitando a homepage do Yahoo Finance."""
    try:
        r = await client.get(
            "https://finance.yahoo.com/",
            headers={**YAHOO_HEADERS, "Accept": "text/html"},
            follow_redirects=True,
            timeout=10,
        )
        # Extrai crumb se disponível na página
        crumb_match = re.search(r'"crumb":"([^"]+)"', r.text)
        crumb = crumb_match.group(1) if crumb_match else None
        logger.debug(f"Yahoo sessão OK, crumb={'obtido' if crumb else 'não encontrado'}")
        return {"crumb": crumb}
    except Exception as e:
        logger.warning(f"Yahoo sessão falhou: {e}")
        return {}

async def _yahoo_quote_single(
    client: httpx.AsyncClient,
    ticker: str,
    host: str,
    crumb: str | None = None,
    retries: int = 3,
) -> dict | None:
    params = {"interval": "1d", "range": "5d", "includePrePost": "false"}
    if crumb:
        params["crumb"] = crumb

    for attempt in range(retries):
        url = f"https://{host}/v8/finance/chart/{ticker}"
        try:
            r = await client.get(url, params=params, timeout=15)

            if r.status_code == 429:
                wait = 2 ** attempt + random.uniform(0, 1)
                logger.warning(f"Yahoo 429 para {ticker} (tentativa {attempt+1}), aguarda {wait:.1f}s")
                await asyncio.sleep(wait)
                continue

            if r.status_code == 404:
                logger.warning(f"Yahoo 404: {ticker} não encontrado")
                return None

            r.raise_for_status()
            data = r.json()

            result = data.get("chart", {}).get("result")
            if not result:
                err = data.get("chart", {}).get("error", {})
                logger.warning(f"Yahoo sem dados para {ticker}: {err}")
                return None

            meta   = result[0].get("meta", {})
            price  = meta.get("regularMarketPrice")
            prev   = meta.get("chartPreviousClose") or meta.get("previousClose")

            if not price:
                closes = (
                    result[0]
                    .get("indicators", {})
                    .get("quote", [{}])[0]
                    .get("close", [])
                )
                closes = [c for c in closes if c is not None]
                if closes:
                    price = closes[-1]
                    prev  = closes[-2] if len(closes) >= 2 else price

            if not price:
                logger.warning(f"Yahoo: preço nulo para {ticker}")
                return None

            prev       = prev or price
            change     = round(float(price) - float(prev), 4)
            change_pct = round((change / float(prev) * 100) if prev else 0, 2)

            logger.info(f"Yahoo OK [{host}]: {ticker} = {price:.4f} ({change_pct:+.2f}%)")
            return {
                "price":          round(float(price), 4),
                "change_24h":     change,
                "change_24h_pct": change_pct,
                "currency":       meta.get("currency", "EUR"),
            }

        except httpx.HTTPStatusError as e:
            logger.error(f"Yahoo HTTP {e.response.status_code} [{host}] para {ticker}")
        except Exception as e:
            logger.error(f"Yahoo erro [{host}] para {ticker}: {type(e).__name__}: {e}")

        if attempt < retries - 1:
            await asyncio.sleep(1.5 * (attempt + 1))

    return None

async def fetch_yahoo_prices(tickers: list[str]) -> dict:
    if not tickers:
        return {}

    # Limite de concorrência para não disparar rate limit
    semaphore = asyncio.Semaphore(3)

    async with httpx.AsyncClient(
        headers=YAHOO_HEADERS,
        follow_redirects=True,
        timeout=20,
    ) as client:
        session_info = await _yahoo_get_session(client)
        crumb = session_info.get("crumb")

        async def fetch_one(ticker: str, idx: int) -> tuple[str, dict | None]:
            async with semaphore:
                # Pequeno delay escalonado para evitar burst
                await asyncio.sleep(idx * 0.3)
                host = YAHOO_HOSTS[idx % len(YAHOO_HOSTS)]
                result = await _yahoo_quote_single(client, ticker, host, crumb)
                return ticker, result

        tasks = [fetch_one(t, i) for i, t in enumerate(tickers)]
        pairs = await asyncio.gather(*tasks, return_exceptions=True)

    out = {}
    for item in pairs:
        if isinstance(item, Exception):
            logger.error(f"Erro inesperado: {item}")
            continue
        ticker, data = item
        if data:
            out[ticker] = data
        else:
            logger.warning(f"Sem preço final para {ticker}")
    return out

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
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={
                    "ids": ",".join(ids),
                    "vs_currencies": "eur",
                    "include_24hr_change": "true",
                },
            )
            r.raise_for_status()
            data = r.json()

        reverse = {v: k for k, v in COINGECKO_IDS.items()}
        result = {}
        for cg_id, vals in data.items():
            ticker = reverse.get(cg_id)
            if not ticker:
                continue
            price      = vals.get("eur", 0)
            change_pct = vals.get("eur_24h_change") or 0
            result[ticker] = {
                "price":          round(float(price), 4),
                "change_24h":     round(float(price) * float(change_pct) / 100, 4),
                "change_24h_pct": round(float(change_pct), 2),
                "currency":       "EUR",
            }
            logger.info(f"CoinGecko OK: {ticker} = {price:.2f} ({change_pct:+.2f}%)")
        return result
    except Exception as e:
        logger.error(f"CoinGecko erro: {e}")
        return {}

# ── PPRs — Yahoo Finance (Frankfurt) com fallback investing.com ───────────────

PPR_YAHOO_TICKERS = {
    "Optimize PPR Ag S": "0P0001FEUD.F",
    "Optimize PPR Ag M": "0P0001FEUD.F",
    "Optimize PPR Ag V": "0P0001FEUD.F",
    "Stoik PPR":         "0P00017TQN.F",
}

PPR_INVESTING_URLS = {
    "Optimize PPR Ag S": "https://pt.investing.com/funds/ptopzehm0017",
    "Optimize PPR Ag M": "https://pt.investing.com/funds/ptopzg690019",
    "Optimize PPR Ag V": "https://pt.investing.com/funds/ptopzehm0017",
    "Stoik PPR":         "https://pt.investing.com/funds/sgf-stoik-accoes-ppr-fp",
}

async def _scrape_investing(ticker: str, url: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "pt-PT,pt;q=0.9",
                "Referer": "https://pt.investing.com/",
            })
            r.raise_for_status()

        soup = BeautifulSoup(r.text, "lxml")
        price = None
        for sel in ['[data-test="instrument-price-last"]', ".text-5xl", "#last_last"]:
            el = soup.select_one(sel)
            if el:
                txt = re.sub(r"[^\d,.]", "", el.get_text()).replace(",", ".")
                try:
                    price = float(txt); break
                except ValueError:
                    continue

        change_pct = None
        for sel in ['[data-test="instrument-price-change-percent"]', '[class*="percent"]']:
            el = soup.select_one(sel)
            if el:
                txt = re.sub(r"[^\d.,-]", "", el.get_text()).replace(",", ".")
                try:
                    change_pct = float(txt); break
                except ValueError:
                    continue

        if price:
            logger.info(f"investing.com OK: {ticker} = {price:.4f}")
            return {
                "price":          round(price, 4),
                "change_24h":     round(price * (change_pct or 0) / 100, 4),
                "change_24h_pct": round(change_pct or 0, 2),
                "currency":       "EUR",
            }
        logger.warning(f"investing.com: preço não encontrado para {ticker}")
    except Exception as e:
        logger.error(f"investing.com erro {ticker}: {e}")
    return None

async def fetch_ppr_prices(tickers: list[str]) -> dict:
    out = {}

    # Tenta Yahoo Finance primeiro (mais rápido)
    yahoo_reverse = {}
    yahoo_tickers_to_fetch = []
    seen_yahoo = set()
    for ppr_name in tickers:
        yt = PPR_YAHOO_TICKERS.get(ppr_name)
        if yt and yt not in seen_yahoo:
            yahoo_tickers_to_fetch.append(yt)
            seen_yahoo.add(yt)
        if yt:
            yahoo_reverse.setdefault(yt, []).append(ppr_name)

    if yahoo_tickers_to_fetch:
        yahoo_results = await fetch_yahoo_prices(yahoo_tickers_to_fetch)
        for yt, data in yahoo_results.items():
            for ppr_name in yahoo_reverse.get(yt, []):
                out[ppr_name] = data
                logger.info(f"PPR via Yahoo: {ppr_name} = {data['price']:.4f}")

    # Fallback investing.com para os que falharam
    missing = [t for t in tickers if t not in out]
    if missing:
        results = await asyncio.gather(*[
            _scrape_investing(t, PPR_INVESTING_URLS[t])
            for t in missing if t in PPR_INVESTING_URLS
        ], return_exceptions=True)
        for t, res in zip(missing, results):
            if isinstance(res, dict):
                out[t] = res

    return out

# ── Ponto de entrada principal ────────────────────────────────────────────────

async def get_prices_for_tickers(tickers: list[str], force: bool = False) -> dict:
    r = await get_redis()
    prices = {}

    yahoo_tickers  = [t for t in tickers if t not in CRYPTO_TICKERS and t not in PPR_TICKERS]
    crypto_tickers = [t for t in tickers if t in CRYPTO_TICKERS]
    ppr_tickers    = [t for t in tickers if t in PPR_TICKERS]

    to_fetch_yahoo, to_fetch_crypto, to_fetch_ppr = [], [], []

    for bucket, to_fetch in [
        (yahoo_tickers,  to_fetch_yahoo),
        (crypto_tickers, to_fetch_crypto),
        (ppr_tickers,    to_fetch_ppr),
    ]:
        for t in bucket:
            cached = None if force else await r.get(f"price:{t}")
            if cached:
                prices[t] = json.loads(cached)
            else:
                to_fetch.append(t)

    logger.info(
        f"A obter preços — Yahoo: {to_fetch_yahoo}, "
        f"Crypto: {to_fetch_crypto}, PPRs: {to_fetch_ppr}"
    )

    fetch_tasks, labels = [], []
    if to_fetch_yahoo:
        fetch_tasks.append(fetch_yahoo_prices(to_fetch_yahoo));  labels.append("yahoo")
    if to_fetch_crypto:
        fetch_tasks.append(fetch_crypto_prices(to_fetch_crypto)); labels.append("crypto")
    if to_fetch_ppr:
        fetch_tasks.append(fetch_ppr_prices(to_fetch_ppr));       labels.append("ppr")

    if fetch_tasks:
        results = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        for label, res in zip(labels, results):
            if isinstance(res, Exception):
                logger.error(f"Erro no fetch {label}: {res}")
                continue
            for t, v in res.items():
                prices[t] = v
                await r.setex(f"price:{t}", PRICE_CACHE_TTL, json.dumps(v))

    logger.info(f"Preços obtidos: {len(prices)}/{len(tickers)} — {list(prices.keys())}")
    return prices
