-- Migração v2: substitui ca_taxas por estrutura correcta
-- Corre: docker exec -i portfolio_db psql -U portfolio portfolio < scripts/migrate_ca_taxas_v2.sql

DROP TABLE IF EXISTS ca_taxas;

-- Cada linha representa a taxa publicada num PDF do IGCP
-- para um determinado mês de subscrição (1-12) e a partir de quando vigora
CREATE TABLE ca_taxas (
    id SERIAL PRIMARY KEY,
    mes_subscricao INTEGER NOT NULL CHECK (mes_subscricao BETWEEN 1 AND 12),
    vigencia_ano   INTEGER NOT NULL,
    vigencia_mes   INTEGER NOT NULL CHECK (vigencia_mes BETWEEN 1 AND 12),
    taxa_anual     NUMERIC(6,4) NOT NULL,
    fonte          VARCHAR(100) DEFAULT 'manual',
    created_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE (mes_subscricao, vigencia_ano, vigencia_mes)
);

-- Índice para lookup rápido
CREATE INDEX idx_ca_taxas_lookup ON ca_taxas (mes_subscricao, vigencia_ano, vigencia_mes);

-- ── Seed com dados históricos ─────────────────────────────────────────────────
-- Grupos de meses de subscrição com o mesmo ciclo trimestral:
--   Grupo A (Jan, Abr, Jul, Out): vence em Jan, Abr, Jul, Out
--   Grupo B (Fev, Mai, Ago, Nov): vence em Fev, Mai, Ago, Nov
--   Grupo C (Mar, Jun, Set, Dez): vence em Mar, Jun, Set, Dez
--
-- Taxas históricas aproximadas (Euribor 3m + spread + bonificações)
-- Serão refinadas à medida que inseres os PDFs reais

-- Grupo A: Jan=1, Abr=4, Jul=7, Out=10
-- Grupo B: Fev=2, Mai=5, Ago=8, Nov=11
-- Grupo C: Mar=3, Jun=6, Set=9, Dez=12

-- Helper: insere a mesma taxa para todos os meses do mesmo grupo
-- Função temporária para simplificar o seed
DO $$
DECLARE
    -- (vigencia_ano, vigencia_mes, taxa_A, taxa_B, taxa_C)
    rates RECORD;
BEGIN
    FOR rates IN (
        SELECT * FROM (VALUES
            -- 2022
            (2022, 10, 0.857, 0.857, 0.857),
            (2022, 11, 1.228, 1.228, 1.228),
            (2022, 12, 1.735, 1.735, 1.735),
            -- 2023
            (2023,  1, 2.139, 2.139, 2.139),
            (2023,  2, 2.442, 2.442, 2.442),
            (2023,  3, 2.642, 2.642, 2.642),
            (2023,  4, 2.883, 2.883, 2.883),
            (2023,  5, 2.969, 2.969, 2.969),
            (2023,  6, 3.174, 3.174, 3.174),
            (2023,  7, 3.429, 3.429, 3.429),
            (2023,  8, 3.706, 3.706, 3.706),
            (2023,  9, 3.858, 3.858, 3.858),
            (2023, 10, 3.938, 3.938, 3.938),
            (2023, 11, 4.071, 4.071, 4.071),
            (2023, 12, 4.080, 4.080, 4.080),
            -- 2024
            (2024,  1, 4.028, 4.028, 4.028),
            (2024,  2, 3.941, 3.941, 3.941),
            (2024,  3, 3.937, 3.937, 3.937),
            (2024,  4, 3.934, 3.934, 3.934),
            (2024,  5, 3.933, 3.933, 3.933),
            (2024,  6, 3.917, 3.917, 3.917),
            (2024,  7, 3.829, 3.829, 3.829),
            (2024,  8, 3.753, 3.753, 3.753),
            (2024,  9, 3.651, 3.651, 3.651),
            (2024, 10, 3.534, 3.534, 3.534),
            (2024, 11, 3.523, 3.523, 3.523),
            (2024, 12, 3.267, 3.267, 3.267),
            -- 2025
            (2025,  1, 3.144, 3.144, 3.144),
            (2025,  2, 2.989, 2.989, 2.989),
            (2025,  3, 2.810, 2.810, 2.810),
            (2025,  4, 2.630, 2.630, 2.630),
            (2025,  5, 2.510, 2.510, 2.510),
            (2025,  6, 2.398, 2.398, 2.398),
            (2025,  7, 2.287, 2.287, 2.287),
            (2025,  8, 2.217, 2.217, 2.217),
            (2025,  9, 2.160, 2.160, 2.160),
            -- Nov/2025 PDF (real, da imagem):
            (2025, 10, 3.509, 3.509, 3.509),
            (2025, 11, 3.509, 3.544, 3.528),
            (2025, 12, 3.509, 3.544, 3.528),
            -- 2026 (estimado até termos PDFs reais)
            (2026,  1, 3.509, 3.544, 3.528),
            (2026,  2, 3.509, 3.544, 3.528),
            (2026,  3, 3.509, 3.544, 3.528),
            (2026,  4, 3.509, 3.544, 3.528),
            (2026,  5, 3.509, 3.544, 3.528),
            (2026,  6, 3.509, 3.544, 3.528),
            (2026,  7, 3.509, 3.544, 3.528),
            (2026,  8, 3.509, 3.544, 3.528)
        ) AS t(vig_ano, vig_mes, taxa_a, taxa_b, taxa_c)
    ) LOOP
        -- Grupo A: meses 1,4,7,10
        INSERT INTO ca_taxas (mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual, fonte)
        VALUES (1,  rates.vig_ano, rates.vig_mes, rates.taxa_a, 'histórico'),
               (4,  rates.vig_ano, rates.vig_mes, rates.taxa_a, 'histórico'),
               (7,  rates.vig_ano, rates.vig_mes, rates.taxa_a, 'histórico'),
               (10, rates.vig_ano, rates.vig_mes, rates.taxa_a, 'histórico')
        ON CONFLICT (mes_subscricao, vigencia_ano, vigencia_mes) DO NOTHING;

        -- Grupo B: meses 2,5,8,11
        INSERT INTO ca_taxas (mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual, fonte)
        VALUES (2,  rates.vig_ano, rates.vig_mes, rates.taxa_b, 'histórico'),
               (5,  rates.vig_ano, rates.vig_mes, rates.taxa_b, 'histórico'),
               (8,  rates.vig_ano, rates.vig_mes, rates.taxa_b, 'histórico'),
               (11, rates.vig_ano, rates.vig_mes, rates.taxa_b, 'histórico')
        ON CONFLICT (mes_subscricao, vigencia_ano, vigencia_mes) DO NOTHING;

        -- Grupo C: meses 3,6,9,12
        INSERT INTO ca_taxas (mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual, fonte)
        VALUES (3,  rates.vig_ano, rates.vig_mes, rates.taxa_c, 'histórico'),
               (6,  rates.vig_ano, rates.vig_mes, rates.taxa_c, 'histórico'),
               (9,  rates.vig_ano, rates.vig_mes, rates.taxa_c, 'histórico'),
               (12, rates.vig_ano, rates.vig_mes, rates.taxa_c, 'histórico')
        ON CONFLICT (mes_subscricao, vigencia_ano, vigencia_mes) DO NOTHING;
    END LOOP;
END $$;

SELECT mes_subscricao, vigencia_ano, vigencia_mes, taxa_anual, fonte
FROM ca_taxas
WHERE vigencia_ano = 2025 AND vigencia_mes >= 10
ORDER BY mes_subscricao, vigencia_ano, vigencia_mes;
