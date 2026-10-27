-- Adds a colour and a spending-exclusion flag to categories, and seeds the
-- excluded Transfer and Savings defaults. Safe to re-run.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS color VARCHAR,
  ADD COLUMN IF NOT EXISTS excluded_from_spend BOOLEAN NOT NULL DEFAULT false;

INSERT INTO categories (name, user_id, excluded_from_spend)
SELECT name, NULL, true FROM (VALUES
  ('Transfer'),
  ('Savings')
) AS defaults(name)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE categories.name = defaults.name AND categories.user_id IS NULL
);
