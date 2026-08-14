import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://portfolio:portfolio123@localhost:5432/portfolio")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
PRICE_CACHE_TTL = 300  # 5 minutes

# Ticker category mapping
ETF_TICKERS = ["VWCE.DE", "EUNL.DE", "L0CK.DE", "QDVF.DE"]
CRYPTO_TICKERS = ["BTC-EUR", "ETH-EUR"]
PPR_TICKERS = ["Optimize PPR Ag S", "Optimize PPR Ag M", "Optimize PPR Ag V", "Stoik PPR"]
P2P_TICKERS = ["Bondora", "ViaInvest", "PeerBerry"]
CA_TICKERS = ["CA - Série E"]  # Certificados de Aforro

# Investing.com fund IDs for scraping
PPR_INVESTING_IDS = {
    "Optimize PPR Ag S": "ptopzehm0017",
    "Optimize PPR Ag M": "ptopzehm0017",  # Same fund, different share class - adjust if needed
    "Optimize PPR Ag V": "ptopzehm0017",
    "Stoik PPR": "sgf-stoik-accoes-ppr-fp",
}
