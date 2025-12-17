-- Seed lobby templates (idempotent)
-- Note: the canonical lobbies table schema is defined in 20240101000000_create_profile_tables.sql
INSERT INTO lobbies (id, amount, currency, capacity, high_roller, match_type, is_coming_soon)
VALUES
    ('free-1', 0, 'FREE', 8, FALSE, 'ranked', FALSE),
    ('free-2', 0, 'FREE', 8, FALSE, 'ranked', FALSE),
    ('free-3', 0, 'FREE', 8, FALSE, 'ranked', FALSE),
    ('free-4', 0, 'FREE', 8, FALSE, 'ranked', FALSE),
    ('lobby-0.01', 0.01, 'SOL', 8, FALSE, 'ranked', TRUE),
    ('lobby-0.25', 0.25, 'SOL', 8, FALSE, 'ranked', TRUE),
    ('lobby-0p005', 0.05, 'SOL', 8, FALSE, 'ranked', TRUE),
    ('lobby-0p005-2', 0.1, 'SOL', 8, FALSE, 'ranked', TRUE)
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    capacity = EXCLUDED.capacity,
    high_roller = EXCLUDED.high_roller,
    match_type = EXCLUDED.match_type,
    is_coming_soon = EXCLUDED.is_coming_soon;