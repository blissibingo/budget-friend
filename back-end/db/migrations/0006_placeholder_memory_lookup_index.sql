-- serves the merchant lookup for placeholder-merchant rows, keyed on description
CREATE INDEX transactions_placeholder_memory_idx
  ON transactions (user_id, lower(btrim(description)), date DESC, id DESC)
  WHERE category_id IS NOT NULL AND lower(btrim(merchant)) = 'bank transaction';
