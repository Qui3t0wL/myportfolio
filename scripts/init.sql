CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL,
    ticker VARCHAR(100) NOT NULL,
    accao VARCHAR(50) NOT NULL,
    qtd NUMERIC(20, 8) NOT NULL,
    preco NUMERIC(20, 8) NOT NULL,
    comissao NUMERIC(20, 8) NOT NULL DEFAULT 0,
    total NUMERIC(20, 8) NOT NULL,
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manual_accounts (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    valor NUMERIC(20, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_cache (
    ticker VARCHAR(100) PRIMARY KEY,
    price NUMERIC(20, 8),
    change_24h NUMERIC(20, 8),
    change_24h_pct NUMERIC(10, 4),
    currency VARCHAR(10) DEFAULT 'EUR',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default bank accounts
INSERT INTO manual_accounts (nome, valor) VALUES
    ('Montepio', 0),
    ('Moey!', 0),
    ('Revolut', 0),
    ('ActivoBank', 0)
ON CONFLICT (nome) DO NOTHING;

-- Certificados de Aforro series data
CREATE TABLE IF NOT EXISTS ca_series (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(50) NOT NULL,
    data_subscricao DATE NOT NULL,
    unidades INTEGER NOT NULL,
    taxa_base NUMERIC(8,4) NOT NULL DEFAULT 2.5,
    spread NUMERIC(8,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_transactions_data ON transactions(data);
CREATE INDEX IF NOT EXISTS idx_transactions_accao ON transactions(accao);

-- Tabela de taxas históricas dos CA Série E (actualizada manualmente ou via PDF)
CREATE TABLE IF NOT EXISTS ca_taxas (
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    taxa_anual NUMERIC(6,4) NOT NULL,  -- taxa em %, ex: 3.25
    fonte VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (ano, mes)
);

-- Seed com taxas históricas aproximadas Série E (Euribor 3m + 1%)
-- Fonte: IGCP boletins históricos
INSERT INTO ca_taxas (ano, mes, taxa_anual, fonte) VALUES
  (2022,  9, 1.228, 'IGCP histórico'),
  (2022, 10, 1.735, 'IGCP histórico'),
  (2022, 11, 2.139, 'IGCP histórico'),
  (2022, 12, 2.442, 'IGCP histórico'),
  (2023,  1, 2.642, 'IGCP histórico'),
  (2023,  2, 2.883, 'IGCP histórico'),
  (2023,  3, 2.969, 'IGCP histórico'),
  (2023,  4, 3.174, 'IGCP histórico'),
  (2023,  5, 3.429, 'IGCP histórico'),
  (2023,  6, 3.706, 'IGCP histórico'),
  (2023,  7, 3.858, 'IGCP histórico'),
  (2023,  8, 3.938, 'IGCP histórico'),
  (2023,  9, 4.071, 'IGCP histórico'),
  (2023, 10, 4.080, 'IGCP histórico'),
  (2023, 11, 4.028, 'IGCP histórico'),
  (2023, 12, 3.941, 'IGCP histórico'),
  (2024,  1, 3.937, 'IGCP histórico'),
  (2024,  2, 3.934, 'IGCP histórico'),
  (2024,  3, 3.933, 'IGCP histórico'),
  (2024,  4, 3.917, 'IGCP histórico'),
  (2024,  5, 3.829, 'IGCP histórico'),
  (2024,  6, 3.753, 'IGCP histórico'),
  (2024,  7, 3.651, 'IGCP histórico'),
  (2024,  8, 3.534, 'IGCP histórico'),
  (2024,  9, 3.523, 'IGCP histórico'),
  (2024, 10, 3.267, 'IGCP histórico'),
  (2024, 11, 3.144, 'IGCP histórico'),
  (2024, 12, 2.989, 'IGCP histórico'),
  (2025,  1, 2.810, 'IGCP histórico'),
  (2025,  2, 2.630, 'IGCP histórico'),
  (2025,  3, 2.510, 'IGCP histórico'),
  (2025,  4, 2.398, 'IGCP histórico'),
  (2025,  5, 2.287, 'IGCP histórico'),
  (2025,  6, 2.217, 'IGCP histórico'),
  (2025,  7, 2.160, 'IGCP histórico'),
  (2025,  8, 2.113, 'IGCP histórico'),
  (2025,  9, 2.112, 'IGCP histórico'),
  (2025, 10, 2.112, 'IGCP histórico'),
  (2025, 11, 2.112, 'IGCP histórico'),
  (2025, 12, 2.112, 'IGCP histórico'),
  (2026,  1, 2.112, 'IGCP estimado'),
  (2026,  2, 2.112, 'IGCP estimado'),
  (2026,  3, 2.112, 'IGCP estimado'),
  (2026,  4, 2.112, 'IGCP estimado'),
  (2026,  5, 2.112, 'IGCP estimado'),
  (2026,  6, 2.112, 'IGCP estimado'),
  (2026,  7, 2.112, 'IGCP estimado'),
  (2026,  8, 2.112, 'IGCP estimado')
ON CONFLICT (ano, mes) DO NOTHING;
