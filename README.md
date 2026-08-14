# Portfolio Dashboard

Dashboard de portfolio de investimentos — ETFs, Crypto, PPRs, P2P, Certificados de Aforro.

## Requisitos

- Docker + Docker Compose instalados no LXC Proxmox

## Instalação rápida

```bash
# 1. Copiar o projecto para o LXC (ex: via SCP ou git)
scp -r portfolio/ root@<ip-lxc>:/opt/portfolio

# 2. No LXC:
cd /opt/portfolio
docker compose up -d --build

# 3. Aguardar ~2 minutos para o build do frontend
# 4. Abrir http://<ip-lxc>:8080
```

## Importar histórico de transações

Depois de a aplicação estar a correr, copia o teu ficheiro CSV e importa:

```bash
# Opção A: via interface web
# → Vai a "Histórico" → clica "↑ Importar CSV" → selecciona o ficheiro

# Opção B: via linha de comando
chmod +x scripts/import_csv.sh
./scripts/import_csv.sh /caminho/para/Histórico.csv
```

## Estrutura

```
portfolio/
├── docker-compose.yml
├── backend/          # FastAPI (Python) — cálculos + preços
│   ├── main.py       # API endpoints
│   ├── portfolio.py  # Motor de cálculo de posições
│   ├── prices.py     # yfinance, CoinGecko, investing.com scraping
│   └── config.py     # Configuração (tickers, categorias)
├── frontend/         # React + Recharts
│   └── src/
│       ├── pages/    # Overview, ETFs, P2P, Crypto, PPRs, Aforro, Histórico
│       └── components/
├── nginx/            # Reverse proxy
└── scripts/
    ├── init.sql      # Schema PostgreSQL
    └── import_csv.sh # Script de importação
```

## Atualização de preços

- **ETFs** (VWCE.DE, EUNL.DE, etc.): via Yahoo Finance — actualiza automaticamente a cada 5 min
- **Crypto** (BTC, ETH): via CoinGecko API — actualiza a cada 5 min
- **PPRs** (Optimize, Stoik): via scraping investing.com — pode falhar se o site mudar
- **Certificados de Aforro**: calculado localmente com taxa ~3,25%/ano (Euribor 3m + 1%)

Podes forçar atualização no botão "↻ Atualizar preços" na Visão Geral.

## Contas bancárias

Na página "Visão Geral", clica no valor de qualquer conta para editar. As contas são guardadas na base de dados.

## Adicionar novos tickers

Edita `backend/config.py`:
- `ETF_TICKERS` — ETFs cotados (Yahoo Finance)
- `CRYPTO_TICKERS` — Crypto (CoinGecko)
- `PPR_TICKERS` — PPRs (investing.com)

## Atualizar

```bash
cd /opt/portfolio
docker compose pull
docker compose up -d --build
```

## Backup da base de dados

```bash
docker exec portfolio_db pg_dump -U portfolio portfolio > backup_$(date +%Y%m%d).sql
```

## Restore

```bash
docker exec -i portfolio_db psql -U portfolio portfolio < backup_20240101.sql
```
