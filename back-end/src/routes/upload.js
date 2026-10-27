const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const { transaction } = require('../db');
const { DEFAULT_USER_ID } = require('../config');
const { toTransactionRows } = require('../statementRows');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// the parser exits with this when it cannot read the PDF as the selected source
const UNREADABLE_STATEMENT_EXIT_CODE = 3;

// the sources the parser can read
const SOURCES = ['rbc_debit', 'rbc_credit'];

// the merchant the parser assigns when a description names no merchant
const PLACEHOLDER_MERCHANT = 'bank transaction';

// Finds this user's latest categorized row for the merchant, matching on
// description too when the merchant is the placeholder.
const MERCHANT_MEMORY_SQL = `
  SELECT category_id FROM transactions
  WHERE user_id = $1
    AND category_id IS NOT NULL
    AND lower(btrim(merchant)) = lower(btrim($2))
  ORDER BY date DESC, id DESC
  LIMIT 1`;
const PLACEHOLDER_MEMORY_SQL = `
  SELECT category_id FROM transactions
  WHERE user_id = $1
    AND category_id IS NOT NULL
    AND lower(btrim(merchant)) = '${PLACEHOLDER_MERCHANT}'
    AND lower(btrim(description)) = lower(btrim($2))
  ORDER BY date DESC, id DESC
  LIMIT 1`;

function isPlaceholderMerchant(merchant) {
  return merchant.trim().toLowerCase() === PLACEHOLDER_MERCHANT;
}

router.post('/', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

  const { source } = req.body;
  if (!source) return res.status(400).json({ error: 'source is required' });
  if (!SOURCES.includes(source)) {
    return res.status(400).json({ error: `Unknown source '${source}'` });
  }

  const parserPath = path.join(__dirname, '..', '..', 'parser', 'pdf_parser.py');
  const python = spawn('python3', [parserPath, '--source', source]);

  let stdout = '';
  let stderr = '';

  python.stdout.on('data', chunk => { stdout += chunk; });
  python.stderr.on('data', chunk => { stderr += chunk; });

  python.on('close', async code => {
    if (code === UNREADABLE_STATEMENT_EXIT_CODE) {
      return res.status(400).json({ error: stderr.trim() });
    }
    if (code !== 0) {
      return res.status(500).json({ error: 'Parser failed', details: stderr });
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return res.status(500).json({ error: 'Invalid JSON from parser', raw: stdout });
    }

    try {
      const { inserted, skipped } = await transaction(async client => {
        const inserted = [];
        let skipped = 0;
        for (const row of toTransactionRows(parsed.transactions)) {
          const placeholder = isPlaceholderMerchant(row.merchant);
          const memory = await client.query(
            placeholder ? PLACEHOLDER_MEMORY_SQL : MERCHANT_MEMORY_SQL,
            [DEFAULT_USER_ID, placeholder ? row.description : row.merchant]
          );
          const categoryId = memory.rows[0]?.category_id ?? null;
          // skips rows an earlier upload already persisted
          const result = await client.query(
            `INSERT INTO transactions (amount, date, merchant, description, occurrence, source, user_id, category_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT ON CONSTRAINT transactions_dedupe_unique DO NOTHING
             RETURNING *`,
            [row.amount, row.date, row.merchant, row.description, row.occurrence, source, DEFAULT_USER_ID, categoryId]
          );
          if (result.rows.length === 0) {
            skipped += 1;
          } else {
            inserted.push(result.rows[0]);
          }
        }
        return { inserted, skipped };
      });
      res.json({
        period: parsed.period,
        // balances the statement does not report stay absent from the response
        ...(parsed.opening_balance !== undefined && { opening_balance: parsed.opening_balance }),
        ...(parsed.closing_balance !== undefined && { closing_balance: parsed.closing_balance }),
        transactions: inserted,
        inserted_count: inserted.length,
        skipped_count: skipped,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to persist transactions', details: err.message });
    }
  });

  python.stdin.write(req.file.buffer);
  python.stdin.end();
});

module.exports = router;
