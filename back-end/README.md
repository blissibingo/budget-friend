# back-end

## Layout

- `src/` — Express API (`index.js`, `db.js`, `config.js`, `routes/`)
- `parser/` — Python PDF-statement parser and its own venv/tests
- `tests/` — JS integration tests for the API, run against a real Postgres test db
- `db/` — Postgres schema (`schema.sql`, `migrations/`)

## Database setup

Requires **PostgreSQL 15 or newer** — the transactions dedupe constraint uses
`UNIQUE NULLS NOT DISTINCT`, which older versions reject with a syntax error.

1. Create the database and apply the schema, then the migrations `schema.sql`
   does not already include:
   ```
   psql -d budget_friend -f db/schema.sql
   psql -d budget_friend -f db/migrations/0002_seed_default_categories.sql
   psql -d budget_friend -f db/migrations/0003_unique_category_name_per_user.sql
   psql -d budget_friend -f db/migrations/0007_category_color_and_exclusion.sql
   ```
   `schema.sql` is the current table shape, so `0001`, `0004`, `0005`, and `0006` are
   already baked into it — running them on a fresh database will fail. `0002`
   and `0003` are not, so a fresh database needs them. `0007` is safe on a
   fresh database and is needed for its Transfer and Savings seeds.

   **Upgrading a database created before 2026-08-16** — run `0004` on it:
   ```
   psql -d budget_friend -f db/migrations/0004_unique_transaction_per_upload.sql
   ```
   Without it every upload returns 500: the route names
   `transactions_dedupe_unique` directly. Apply it to `budget_friend_test` too,
   or the upload tests fail.

   **Upgrading a database created before 2026-08-17** — run `0005` on it:
   ```
   psql -d budget_friend -f db/migrations/0005_merchant_memory_lookup_index.sql
   ```
   It only adds an index, so uploads work without it, just with a sequential
   scan per parsed row.

   **Upgrading a database created before 2026-10-27** — run `0006` and `0007`
   on it:
   ```
   psql -d budget_friend -f db/migrations/0006_placeholder_memory_lookup_index.sql
   psql -d budget_friend -f db/migrations/0007_category_color_and_exclusion.sql
   ```
   `0006` only adds an index for looking up `Bank transaction` rows by
   description. `0007` adds `color` and `excluded_from_spend` to categories and
   seeds the Transfer and Savings defaults. Apply both to `budget_friend_test`
   too, or the upload and category tests fail.
2. Seed the single hardcoded user (v1 has no auth — every persisted
   transaction and read is scoped to this one row):
   ```
   psql -d budget_friend -c "INSERT INTO users (username, email, first_name, last_name) VALUES ('default', 'default@budgetfriend.local', 'Default', 'User') RETURNING id;"
   ```

## Database cheat sheet

Run these from `back-end/`. `budget_friend` is your real data;
`budget_friend_test` is the throwaway copy the tests wipe on every run.

### Start Postgres

Postgres runs from **Postgres.app** — open it and click **Start** (the
elephant appears in the menu bar). Check it is up:

```
pg_isready          # "accepting connections" means it's running
psql -l             # lists databases; both budget_friend* should appear
```

### Look around

```
psql -d budget_friend          # opens a SQL prompt on your real data
```

Inside the prompt:

| Command | Does |
| --- | --- |
| `\dt` | list tables |
| `\d transactions` | show a table's columns and indexes |
| `\x` | toggle one-field-per-line output for wide rows |
| `\q` | quit |

SQL statements end with `;`. A few useful ones:

```sql
-- every category, and whether it counts toward spending
SELECT id, name, user_id, excluded_from_spend FROM categories ORDER BY name;

-- one month's transactions
SELECT date, amount, merchant, description, category_id
FROM transactions WHERE date >= '2026-09-01' AND date < '2026-10-01'
ORDER BY date;

-- what still needs a category
SELECT count(*) FROM transactions WHERE category_id IS NULL;
```

To run a single query without opening the prompt:
`psql -d budget_friend -c "SELECT count(*) FROM transactions;"`

### Apply a migration

New migrations land in `db/migrations/`. Apply each one to **both** databases
— the tests run against `budget_friend_test` and fail if it is behind:

```
psql -d budget_friend      -f db/migrations/0007_category_color_and_exclusion.sql
psql -d budget_friend_test -f db/migrations/0007_category_color_and_exclusion.sql
```

Nothing records which migrations have run, so check by looking for what each
one adds:

| Migration | Applied if… | Check with |
| --- | --- | --- |
| `0004` | `transactions_dedupe_unique` is listed | `\d transactions` |
| `0005` | `transactions_merchant_memory_idx` is listed | `\d transactions` |
| `0006` | `transactions_placeholder_memory_idx` is listed | `\d transactions` |
| `0007` | `color` and `excluded_from_spend` columns exist | `\d categories` |

### Back up and restore

Take a backup before anything destructive:

```
pg_dump -Fc -d budget_friend -f ~/budget_friend_$(date +%F).dump
```

Restore one over the current data (replaces what is there):

```
pg_restore --clean --if-exists -d budget_friend ~/budget_friend_2026-10-27.dump
```

### Fix or remove data

```sql
-- delete one month so its statements can be re-imported
DELETE FROM transactions WHERE date >= '2026-09-01' AND date < '2026-10-01';

-- clear a category from every transaction (they return to uncategorized)
UPDATE transactions SET category_id = NULL WHERE category_id = 12;
```

`DELETE` and `UPDATE` without a `WHERE` change every row — back up first.

### Rebuild the test database

If the test database is in a bad state, recreate it from scratch. The tests
seed their own user, so no step 2 is needed:

```
dropdb budget_friend_test
createdb budget_friend_test
psql -d budget_friend_test -f db/schema.sql
psql -d budget_friend_test -f db/migrations/0002_seed_default_categories.sql
psql -d budget_friend_test -f db/migrations/0003_unique_category_name_per_user.sql
```

Plus any migration the setup steps above list for a fresh database.

## Environment variables

Connection is configured via the standard `pg` environment variables
(`DATABASE_URL`, or `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `PG*` | Postgres connection, read by `src/db.js` via `pg`'s defaults |
| `DEFAULT_USER_ID` | id of the seeded user row from step 2 above; read via `src/config.js` |

Neither has a fallback in code. Start the API with both set:

```
PGDATABASE=budget_friend DEFAULT_USER_ID=1 node src/index.js
```

`npm start` from the repo root supplies both defaults and starts the front end
alongside — see the root [README](../README.md#running-locally).

## Duplicate uploads

Re-uploading a statement that overlaps one already imported skips the rows
already stored and imports only the new ones, reporting both counts.

A row is identified by `(user_id, source, date, amount, merchant, description,
occurrence)`, enforced by the `transactions_dedupe_unique` constraint. Each
insert uses `ON CONFLICT DO NOTHING`, so a collision skips that row instead of
failing the whole statement. `NULLS NOT DISTINCT` is required because
`description` is nullable — without it, rows with no description never collide
and would duplicate on every upload.

`occurrence` exists because a statement can legitimately list the same
date/amount/merchant/description twice — two $20 ATM withdrawals on one day —
with nothing else to tell them apart. `src/statementRows.js` numbers repeats
within a statement 1, 2, 3..., so both rows persist. Re-uploads still
deduplicate because the same statement always numbers the same way.

The one gap: numbering only lines up if both uploads contain the whole day. A
statement boundary splitting a day across two PDFs would number each half's row
as 1 and wrongly skip the second. RBC statements run on a fixed monthly cycle,
so this needs a custom date range to happen.

## Statement sources

The `source` selected at upload decides how the PDF is read.
`parser/pdf_parser.py --source` dispatches on it:

| Source | Parser | Layout |
| --- | --- | --- |
| `rbc_debit` | `parser/pdf_parser.py` | Date, Description, Withdrawals, Deposits, Balance columns |
| `rbc_credit` | `parser/credit_parser.py` | transaction date, posting date, activity description, one amount |

Both emit the same row shape, and `src/statementRows.js` signs them the same
way: a negative amount is money spent. A credit statement prints a purchase as
a positive charge and a payment or refund in parentheses, so the credit parser
inverts the page: purchases become withdrawals, payments and refunds deposits.

A credit statement has no running balance, so `opening_balance` and
`closing_balance` are absent from the upload response rather than null. Its
statement period is normalised out of the French `Revelé du … au …` line into
the same `Month D, YYYY to Month D, YYYY` form the account parser reports, so
the front end can move to the imported month either way.

Each parser rejects the other's layout. The parser exits `3` with a message
naming the expected format, which the upload route returns as a 400 — so
selecting the wrong source fails instead of importing wrong data. A credit
statement with no readable period is rejected the same way, since nothing else
on the page dates its transactions. (Exit `2` is argparse's own, and stays a
500.) Dedupe is per-source (`source` is part of `transactions_dedupe_unique`),
so an account row and a credit row that share every other fact both persist.

**Known limitation** — the credit parser reads the French statement layout
(`MONTANT ($)` headers, `Relevé du … au …`, `1 000,00 $` amounts, credits in
parentheses). It was built and verified against four real French RBC Visa
statements. An English-language RBC credit statement would be rejected as the
wrong source; adding it needs a sample to work from.

`parser/tests/sample_credit_statement.pdf` is generated by
`parser/tests/make_credit_sample.py` — invented cardholder and merchants, real
RBC layout. Regenerate it with `python tests/make_credit_sample.py` from
`parser/`.

## Merchant memory

An uploaded row arrives already categorized when the user has a categorized
transaction with the same merchant — compared trimmed and lowercased. The most
recent such row by `date`, then `id`, supplies the category; with no match the
row arrives with `category_id` null.

There is no mapping table: the lookup is a subquery against `transactions` in
the same insert. It runs only on insert, so editing one row's category leaves
every other row alone, and clearing a category does not clear the memory —
an earlier categorized row still matches.

The account parser labels every row whose description has no ` - ` separator
`Bank transaction` (ATM withdrawals, cheques, transfers, interest). They all
share that merchant, so categorizing one of them categorizes the rest on
future uploads.

The credit parser reads the merchant out of the activity description instead,
dropping a trailing city and province or state and everything from the first
token carrying a digit — `SUNRISE BAKERY #221 ORLEANS ON` becomes
`SUNRISE BAKERY`, so the same shop at different branches shares one memory.

## Shared modules

- `src/db.js` — shared `pg` `Pool`, `query()`, and `transaction()` helpers used by routes. Also registers the `pg` type parsers that return `DATE` as a `YYYY-MM-DD` string and `BIGINT` as a number, so ids and dates serialize as JSON numbers and plain dates.
- `src/config.js` — exports `DEFAULT_USER_ID`, the hardcoded user id for v1.
- `src/statementRows.js` — turns parsed statement rows into the columns `transactions` stores.
- `parser/statement_words.py` — the `Transaction` record and the word-to-row grouping both parsers read PDFs with.

## Tests

```
npm test        # python pdf parser tests (parser/tests)
npm run test:js # node:test integration tests against a real Postgres test db (needs PGDATABASE=budget_friend_test reachable)
```
