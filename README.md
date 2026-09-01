# budget-friend
A website to make budgets easier!

## Reason behind this project

I want to get better at tracking my budget, but sitting down and manually
categorizing every expense is annoying.

## Goal

Create a site that takes in debit/credit card statements and returns cleanly
formatted data on how I spent money — with categorization that doesn't
require re-doing the same manual work every month.

## Tech stack

- **Frontend:** React (component-based, potential for React Native later)
- **Backend:** Express.js, with a Python script for PDF parsing (communication
  via stdin/stdout using child processes)
- **Database:** PostgreSQL — stable schema, relationships (Users → Categories
  → Transactions), supports the queries this app needs
- **API:** REST
- **File handling:** Multer, in-memory buffers only (no disk writes), files
  discarded immediately after parsing — no sensitive info (account/card
  numbers) is ever stored

## Running locally

One-time setup: PostgreSQL 15+, the schema, and the seeded user — see
[back-end/README.md](back-end/README.md). Then install every workspace's
dependencies:

```
npm run install:all
```

To run the app:

```
npm start
```

That starts both servers together, tagging each line of output `[api]` or
`[web]`. Open **http://localhost:5173** — Vite proxies `/api` to the API on
port 3000, so the front end is the only URL you need.

**Ctrl+C stops both.** There is no stop script and none is needed; closing the
terminal stops them too. If a port is somehow still held afterwards,
`lsof -ti:3000 -ti:5173 | xargs kill` clears it.

### Running the servers separately

Useful when you want to restart one without the other, or read one's output on
its own:

```
npm run start:api    # API only, port 3000
npm run start:web    # front end only, port 5173
```

### Environment variables

`npm start` supplies both of these, so you only need them when running
`node back-end/src/index.js` directly. Neither has a fallback in code:

| Variable | Default in `npm start` | Without it |
| --- | --- | --- |
| `PGDATABASE` | `budget_friend` | `pg` connects to a database named after your OS user; every request 500s with `relation "transactions" does not exist` |
| `DEFAULT_USER_ID` | `1` | queries are scoped to `undefined` and every list comes back empty |

Exporting either one in your shell overrides the default. `1` is the id of the
seeded user row — confirm it with:

```
psql -d budget_friend -c "SELECT id, username FROM users;"
```

### The list shows one month at a time

The page opens on the current calendar month. Use the `‹`/`›` stepper above
the list to reach other months; forward stops at the current month, backward
is unbounded. The chosen month is not persisted — a refresh returns to the
current month. A fresh database with only the sample March 2004 statement
shows "No transactions for &lt;this month&gt;" until you step back to March 2004.

To view what months you have:

```
psql -d budget_friend -c "SELECT to_char(date,'YYYY-MM') AS month, count(*) FROM transactions GROUP BY 1 ORDER BY 1 DESC;"
```

## v1 — functional for personal use

v1 is scoped to be usable by me, locally, as fast as possible. No
deployment, no real auth — everything runs on `localhost` against the
existing hardcoded single-user row.

**Core loop:**
- Upload an RBC debit statement (single format for now) → parsed → checked
  for duplicates against already-uploaded periods → persisted.
- View the current month's transactions (archive/past-months browsing is a
  v2 feature — the `month`/`year` filters already exist to make that cheap
  later).

**Categorization:**
- Manual categorization via an inline dropdown per transaction.
- Merchant memory: once a merchant is categorized, future transactions from
  that merchant auto-apply the same category.
- A hardcoded default set of categories ships with the app (Groceries,
  Dining, Transport, Bills, Shopping, Income, Other, etc.). Custom
  categories are supported by the backend, but there's no "add category" UI
  yet — add one via the API/SQL directly if needed.

**Data integrity:**
- Duplicate-upload protection, so re-uploading the same statement doesn't
  double-insert transactions.
- `PATCH`/`DELETE` on a transaction, to fix parser mistakes (merchant,
  amount, description) or remove a bad row — the same endpoint also handles
  category assignment.

**Frontend:**
- A single page: upload control, a summary strip (total spent, total by
  category), and the current month's transaction list with an inline
  category dropdown and edit/delete per row.

## Future additions (post-v1)

- Multi-bank/format parser templates — the parser currently only handles
  RBC debit and RBC credit card statements; other banks/cards will need
  their own templates.
- Real authentication (Clerk) and deployment/hosting, so the app is usable
  outside `localhost`.
- "Add category" UI, instead of requiring direct DB/API access.
- Smarter auto-categorization — e.g. a rules engine (regex/pattern-based)
  beyond simple merchant memory.
