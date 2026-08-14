import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://portfolio:portfolio123@localhost:5432/portfolio")
REDIS_URL    = os.getenv("REDIS_URL", "redis://localhost:6379")
PRICE_CACHE_TTL = 43200  # 1 hora

# Tickers com preço via Yahoo Finance
ETF_TICKERS = ["VWCE.DE", "EUNL.DE", "L0CK.DE", "QDVF.DE"]

# Tickers com preço via CoinGecko
CRYPTO_TICKERS = ["BTC-EUR", "ETH-EUR"]

# Tickers com preço via Yahoo (.F Frankfurt) ou investing.com scraping
PPR_TICKERS = ["Optimize PPR Ag S", "Optimize PPR Ag M", "Optimize PPR Ag V", "Stoik PPR"]

# Tickers que NÃO têm preço de mercado — valores introduzidos manualmente
# O backend nunca tenta fazer fetch destes
NO_PRICE_TICKERS = {
    # P2P
    "Bondora", "ViaInvest", "Viainvest", "PeerBerry",
    # Certificados de Aforro
    "CA - Série E", "CA - Serie E",
}

# Todos os tickers com preço automático (para validação rápida)
ALL_PRICED_TICKERS = set(ETF_TICKERS) | set(CRYPTO_TICKERS) | set(PPR_TICKERS)
