-- Migração: tabela de empréstimos à habitação
-- Corre: docker exec -i portfolio_db psql -U portfolio portfolio < scripts/migrate_credito.sql

CREATE TABLE IF NOT EXISTS emprestimos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL DEFAULT 'Crédito Habitação',
    banco VARCHAR(100),
    data_inicio DATE NOT NULL,
    valor_inicial NUMERIC(20,2) NOT NULL,
    prazo_meses INTEGER NOT NULL,
    taxa_juros_anual NUMERIC(8,4) NOT NULL,  -- Euribor + spread, em %
    spread NUMERIC(8,4) NOT NULL DEFAULT 0,  -- spread fixo
    tipo_taxa VARCHAR(20) DEFAULT 'variavel', -- 'variavel' ou 'fixa'
    prestacao_mensal NUMERIC(20,2),          -- calculada ou manual
    data_revisao_taxa DATE,                  -- próxima revisão Euribor
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Histórico de revisões de taxa (quando o Euribor muda)
CREATE TABLE IF NOT EXISTS emprestimo_taxas (
    id SERIAL PRIMARY KEY,
    emprestimo_id INTEGER REFERENCES emprestimos(id) ON DELETE CASCADE,
    data_vigor DATE NOT NULL,
    euribor NUMERIC(8,4) NOT NULL,
    spread NUMERIC(8,4) NOT NULL,
    taxa_total NUMERIC(8,4) NOT NULL,  -- euribor + spread
    fonte VARCHAR(100) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(emprestimo_id, data_vigor)
);

-- Pagamentos extra (amortizações antecipadas)
CREATE TABLE IF NOT EXISTS emprestimo_amortizacoes (
    id SERIAL PRIMARY KEY,
    emprestimo_id INTEGER REFERENCES emprestimos(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    valor NUMERIC(20,2) NOT NULL,
    tipo VARCHAR(20) DEFAULT 'capital',  -- 'capital' ou 'prestacao'
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emprestimo_taxas_emp ON emprestimo_taxas(emprestimo_id, data_vigor);
CREATE INDEX IF NOT EXISTS idx_emprestimo_amort_emp ON emprestimo_amortizacoes(emprestimo_id);
