CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR UNIQUE NOT NULL,
  email VARCHAR UNIQUE NOT NULL, 
  first_name VARCHAR NOT NULL, 
  last_name VARCHAR NOT NULL
);

CREATE TABLE categories(
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR NOT NULL,
  user_id BIGINT REFERENCES users (id) ON DELETE CASCADE -- null if default, not null if user 
);

CREATE TABLE transactions(
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL,
  date DATE NOT NULL,
  merchant VARCHAR NOT NULL,
  description TEXT, -- nullable (optional)
  source VARCHAR NOT NULL, -- short identifier for which statement/card this came from, e.g. "rbc_debit"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  category_id BIGINT REFERENCES categories (id) ON DELETE SET NULL,
  occurrence SMALLINT NOT NULL DEFAULT 1, -- 1, 2, ... for rows a statement repeats verbatim
  CONSTRAINT transactions_dedupe_unique
    UNIQUE NULLS NOT DISTINCT (user_id, source, date, amount, merchant, description, occurrence)
);

-- serves the merchant lookup an upload runs per parsed row
CREATE INDEX transactions_merchant_memory_idx
  ON transactions (user_id, lower(btrim(merchant)), date DESC, id DESC)
  WHERE category_id IS NOT NULL;
-- serves the merchant lookup for placeholder-merchant rows, keyed on description
CREATE INDEX transactions_placeholder_memory_idx
  ON transactions (user_id, lower(btrim(description)), date DESC, id DESC)
  WHERE category_id IS NOT NULL AND lower(btrim(merchant)) = 'bank transaction';
