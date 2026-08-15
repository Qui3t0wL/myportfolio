-- Corre este script se já tens a base de dados criada (sem reiniciar o container)
-- docker exec -i portfolio_db psql -U portfolio portfolio < scripts/migrate_ca_taxas.sql

CREATE TABLE IF NOT EXISTS ca_taxas (
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    taxa_anual NUMERIC(6,4) NOT NULL,
    fonte VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (ano, mes)
);

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

SELECT COUNT(*) as taxas_inseridas FROM ca_taxas;
