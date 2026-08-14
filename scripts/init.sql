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
    ('Bankinter', 0),
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
