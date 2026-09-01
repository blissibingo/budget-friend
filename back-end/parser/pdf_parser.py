import argparse
import json
import sys
import pymupdf
import re
from dataclasses import dataclass, asdict
from typing import Optional

from credit_parser import parse_credit_statement_from_bytes
from statement_words import Transaction, group_words_by_row

ACCOUNT_SOURCE = "rbc_debit"
CREDIT_SOURCE = "rbc_credit"

WRONG_SOURCE_MESSAGE = (
    "This PDF does not look like an RBC account statement — no Date, Description, "
    "Withdrawals, Deposits and Balance table was found. Check the source selected "
    "at upload."
)


@dataclass
class StatementColumns:
    """X-coordinate boundaries for each column, detected from the header row."""
    date_end: float        # x where date column ends
    description_end: float # x where description column ends
    withdrawals_end: float # x where withdrawals column ends
    deposits_end: float    # x where deposits column ends


def _parse_amount(text: str) -> Optional[float]:
    cleaned = text.replace(",", "").replace("$", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_amount(parts: list[str]) -> Optional[float]:
    """Return the first parseable numeric amount from a list of strings."""
    for part in parts:
        value = _parse_amount(part)
        if value is not None:
            return value
    return None


def _detect_columns(header_row: list) -> StatementColumns:
    """
    Derive column x-boundaries from the positions of header words.
    Each column boundary is set at the midpoint between adjacent header words.
    """
    # Map header text (lowercased) to the x-center of that word
    header_centers = {}
    for word in header_row:
        x0, _, x1, _, text, *_ = word
        header_centers[text.lower()] = (x0 + x1) / 2

    # Identify the x-center of each expected header
    date_x = header_centers.get("date", 0)
    desc_x = header_centers.get("description", 0)

    # "Withdrawals" and "Deposits" may be split across two words with "($)" on next line
    # so we look for partial matches
    withdrawals_x = next(
        (v for k, v in header_centers.items() if "withdrawal" in k), None
    )
    deposits_x = next(
        (v for k, v in header_centers.items() if "deposit" in k), None
    )
    balance_x = next(
        (v for k, v in header_centers.items() if "balance" in k), None
    )

    if None in (withdrawals_x, deposits_x, balance_x):
        raise ValueError(
            f"{WRONG_SOURCE_MESSAGE} Found headers: {list(header_centers.keys())}"
        )

    def midpoint(a, b):
        return (a + b) / 2

    return StatementColumns(
        date_end=midpoint(date_x, desc_x),
        description_end=midpoint(desc_x, withdrawals_x),
        withdrawals_end=midpoint(withdrawals_x, deposits_x),
        deposits_end=midpoint(deposits_x, balance_x),
    )


def _assign_word_to_column(x_center: float, cols: StatementColumns) -> str:
    if x_center <= cols.date_end:
        return "date"
    elif x_center <= cols.description_end:
        return "description"
    elif x_center <= cols.withdrawals_end:
        return "withdrawal"
    elif x_center <= cols.deposits_end:
        return "deposit"
    else:
        return "balance"


def _parse_transaction_rows(
    data_rows: list[list], cols: StatementColumns
) -> list[Transaction]:
    """
    Convert grouped word rows into Transaction records.
    Rows without a date inherit the date from the most recent row that had one.
    """
    transactions = []
    current_date = None
    # Buffer for the current transaction being assembled
    current: Optional[dict] = None

    MONTH_ABBREVS = {
        "jan", "feb", "mar", "apr", "may", "jun",
        "jul", "aug", "sep", "oct", "nov", "dec"
    }

    def flush():
        if current:
            description = " ".join(current["desc_parts"]).strip()
            transactions.append(Transaction(
                date=current["date"],
                description=description,
                withdrawal=current["withdrawal"],
                deposit=current["deposit"],
                balance=current["balance"],
                merchant=_extract_merchant(description),
            ))

    for row in data_rows:
        buckets: dict[str, list[str]] = {
            "date": [], "description": [], "withdrawal": [], "deposit": [], "balance": []
        }

        for word in row:
            x0, _, x1, _, text, *_ = word
            x_center = (x0 + x1) / 2
            col = _assign_word_to_column(x_center, cols)
            buckets[col].append(text)

        date_parts = buckets["date"]
        desc_parts = buckets["description"]
        withdrawal_parts = buckets["withdrawal"]
        deposit_parts = buckets["deposit"]
        balance_parts = buckets["balance"]

        # A row starts a new transaction if it has a day number + month abbreviation
        has_day = any(p.rstrip(".").isdigit() for p in date_parts)
        has_month = any(p.lower().rstrip(".") in MONTH_ABBREVS for p in date_parts)
        is_new_transaction = has_day and has_month

        has_amount = bool(withdrawal_parts or deposit_parts)

        if is_new_transaction:
            flush()
            current_date = " ".join(date_parts)
            current = {
                "date": current_date,
                "desc_parts": desc_parts,
                "withdrawal": _extract_amount(withdrawal_parts),
                "deposit": _extract_amount(deposit_parts),
                "balance": _extract_amount(balance_parts),
            }
        elif has_amount and current is not None:
            # New transaction on the same date — flush previous and start fresh
            flush()
            current = {
                "date": current_date,
                "desc_parts": desc_parts,
                "withdrawal": _extract_amount(withdrawal_parts),
                "deposit": _extract_amount(deposit_parts),
                "balance": _extract_amount(balance_parts),
            }
        elif current is not None:
            # No date, no amount — pure description continuation
            current["desc_parts"].extend(desc_parts)
            if balance_parts and current["balance"] is None:
                current["balance"] = _extract_amount(balance_parts)

    flush()
    return transactions


def _parse_doc(doc) -> dict:
    """Core parsing logic shared by both file-path and bytes entry points."""
    all_words = []

    for page in doc:
        words = page.get_text("words")
        # Offset y-coordinates per page height so multi-page docs stay sorted
        page_height = page.rect.height
        offset = page.number * page_height
        all_words.extend(
            (w[0], w[1] + offset, w[2], w[3] + offset, w[4]) for w in words
        )

    doc.close()

    period = _extract_period(all_words)

    # find the header row
    header_row, header_y = _find_header_row(all_words)
    cols = _detect_columns(header_row)

    # Collect words below the header, stop at the closing balance line
    closing_balance_y = _find_closing_balance_y(all_words, header_y)
    data_words = [
        w for w in all_words
        if w[1] > header_y and (closing_balance_y is None or w[1] < closing_balance_y)
    ]

    # skip the "Opening balance" row
    opening_balance_row_y = _find_opening_balance_y(data_words)
    if opening_balance_row_y is not None:
        data_words = [w for w in data_words if abs(w[1] - opening_balance_row_y) > 2]

    data_rows = group_words_by_row(data_words)
    transactions = _parse_transaction_rows(data_rows, cols)
    transactions = _assign_years(transactions, period)
    opening_balance = _extract_labelled_amount(all_words, "opening", "balance")
    closing_balance = _extract_labelled_amount(all_words, "closing", "balance")

    return {
        "period": period,
        "opening_balance": opening_balance,
        "closing_balance": closing_balance,
        "transactions": transactions,
    }


def parse_rbc_statement(pdf_path: str) -> dict:
    return _parse_doc(pymupdf.open(pdf_path))


def parse_rbc_statement_from_bytes(pdf_bytes: bytes) -> dict:
    return _parse_doc(pymupdf.open(stream=pdf_bytes, filetype="pdf"))


def parse_statement_from_bytes(pdf_bytes: bytes, source: str) -> dict:
    """Read a statement the way the source selected at upload says to read it."""
    if source == ACCOUNT_SOURCE:
        return parse_rbc_statement_from_bytes(pdf_bytes)
    if source == CREDIT_SOURCE:
        return parse_credit_statement_from_bytes(pdf_bytes)
    raise ValueError(f"Unknown statement source '{source}'.")


# helper functions
def _extract_period(words: list) -> Optional[str]:
    """Find "From <date> to <date>" in the word list."""
    texts = [w[4] for w in sorted(words, key=lambda w: (w[1], w[0]))]
    full_text = " ".join(texts)
    match = re.search(r"From\s+(.+?to\s+\w+\s+\d+,\s+\d{4})", full_text)
    return match.group(1) if match else None


def _find_header_row(words: list) -> tuple[list, float]:
    """Return the row containing 'Date' and 'Description' column headers."""
    rows = group_words_by_row(words)
    for row in rows:
        texts = [w[4].lower() for w in row]
        if "date" in texts and "description" in texts:
            y = row[0][1]
            return row, y
    raise ValueError(WRONG_SOURCE_MESSAGE)


def _find_opening_balance_y(words: list) -> Optional[float]:
    rows = group_words_by_row(words)
    for row in rows:
        texts = [w[4].lower() for w in row]
        if "opening" in texts and "balance" in texts:
            return row[0][1]
    return None


def _find_closing_balance_y(words: list, after_y: float) -> Optional[float]:
    rows = group_words_by_row(words)
    for row in rows:
        if row[0][1] <= after_y:
            continue
        texts = [w[4].lower() for w in row]
        if "closing" in texts and "balance" in texts:
            return row[0][1]
    return None


def _extract_merchant(description: str) -> str:
    parts = description.split(" - ")
    return parts[-1].strip() if len(parts) >= 2 else "Bank transaction"


_MONTH_NUM = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _assign_years(transactions: list, period: Optional[str]) -> list:
    """Append the correct year to each transaction date using the statement period."""
    if not period or not transactions:
        return transactions

    match = re.search(
        r"(\w+)\s+\d+,\s+(\d{4})\s+to\s+(\w+)\s+\d+,\s+(\d{4})", period
    )
    if not match:
        return transactions

    start_month_name, start_year, _, end_year = match.groups()
    start_year, end_year = int(start_year), int(end_year)
    start_month = _MONTH_NUM.get(start_month_name[:3].lower(), 1)

    updated = []
    for t in transactions:
        parts = t.date.split()
        month_abbr = parts[1].lower()[:3] if len(parts) >= 2 else ""
        month_num = _MONTH_NUM.get(month_abbr, 0)

        if start_year == end_year:
            year = start_year
        else:
            year = start_year if month_num >= start_month else end_year

        updated.append(Transaction(
            date=f"{t.date} {year}",
            description=t.description,
            withdrawal=t.withdrawal,
            deposit=t.deposit,
            balance=t.balance,
            merchant=t.merchant,
        ))

    return updated


def _extract_labelled_amount(words: list, *label_words: str) -> Optional[float]:
    """
    Find a row containing all label_words and return the rightmost numeric value on it.
    """
    rows = group_words_by_row(words)
    for row in rows:
        texts = [w[4].lower() for w in row]
        if all(lw in texts for lw in label_words):
            # Rightmost word that looks like a currency amount
            for word in reversed(row):
                amount = _parse_amount(word[4])
                if amount is not None:
                    return amount
    return None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

UNREADABLE_STATEMENT_EXIT_CODE = 3


def _as_json(result: dict) -> dict:
    """Serialise a parse result, carrying only the balances the statement reports."""
    output = {
        key: result[key]
        for key in ("period", "opening_balance", "closing_balance")
        if key in result
    }
    output["transactions"] = [asdict(t) for t in result["transactions"]]
    return output


def _print_report(result: dict) -> None:
    print(f"Period       : {result['period']}")
    for label, key in (("Opening bal", "opening_balance"), ("Closing bal", "closing_balance")):
        if result.get(key) is not None:
            print(f"{label}  : ${result[key]:,.2f}")
    print(f"Transactions : {len(result['transactions'])}")
    print()

    for t in result["transactions"]:
        w = f"-${t.withdrawal:>8.2f}" if t.withdrawal else " " * 10
        d = f"+${t.deposit:>8.2f}" if t.deposit else " " * 10
        b = f"  bal=${t.balance:,.2f}" if t.balance else ""
        print(f"  {t.date:<10}  {t.description:<40}  {w}  {d}{b}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse an RBC statement into JSON.")
    parser.add_argument("pdf", nargs="?", help="statement to parse; omit to read stdin")
    parser.add_argument(
        "--source",
        required=True,
        choices=[ACCOUNT_SOURCE, CREDIT_SOURCE],
        help="which statement format to read",
    )
    args = parser.parse_args()

    pdf_bytes = (
        open(args.pdf, "rb").read() if args.pdf else sys.stdin.buffer.read()
    )

    try:
        result = parse_statement_from_bytes(pdf_bytes, args.source)
    except ValueError as err:
        print(str(err), file=sys.stderr)
        sys.exit(UNREADABLE_STATEMENT_EXIT_CODE)

    if not args.pdf:
        json.dump(_as_json(result), sys.stdout)
        return

    _print_report(result)
    json_path = args.pdf.replace(".pdf", ".json")
    with open(json_path, "w") as f:
        json.dump(_as_json(result), f, indent=2)
    print(f"\nJSON written to {json_path}")


if __name__ == "__main__":
    main()
