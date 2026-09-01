"""
Reads an RBC credit card statement: two dates, a description, one amount.
"""

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

import pymupdf

from statement_words import Transaction, group_words_by_row

WRONG_SOURCE_MESSAGE = (
    "This PDF does not look like an RBC credit card statement — no transaction "
    "table was found. Check the source selected at upload."
)

MISSING_PERIOD_MESSAGE = (
    "This credit card statement does not state the period it covers, so its "
    "transaction dates cannot be given a year."
)

# a transaction line: two dates, a description, then the amount, credits in parentheses
_ROW = re.compile(
    r"^(\d{1,2}) ([^\W\d_]{3,5})\.? \d{1,2} [^\W\d_]{3,5}\.? "
    r"(.+?) (\(?)((?:\d[\d\s]*),\d{2}) \$\)?$"
)

# "Revelé du 21 JUIL au 18 AOÛT 2026", with the start year often left off
_PERIOD = re.compile(
    r"Re[lv]e[lv]é du (\d{1,2}) ([^\W\d_]{3,5})\.?(?: (\d{4}))? "
    r"au (\d{1,2}) ([^\W\d_]{3,5})\.? (\d{4})"
)

# each month in order, as (English name, English abbreviation, tokens a statement prints)
_MONTHS = [
    ("January", "Jan", ("JAN", "JANV")),
    ("February", "Feb", ("FEB", "FEV", "FEVR")),
    ("March", "Mar", ("MAR", "MARS")),
    ("April", "Apr", ("APR", "AVR")),
    ("May", "May", ("MAY", "MAI")),
    ("June", "Jun", ("JUN", "JUIN")),
    ("July", "Jul", ("JUL", "JUIL")),
    ("August", "Aug", ("AUG", "AOU", "AOUT")),
    ("September", "Sep", ("SEP", "SEPT")),
    ("October", "Oct", ("OCT",)),
    ("November", "Nov", ("NOV",)),
    ("December", "Dec", ("DEC",)),
]

_MONTH_NUMBERS = {
    token: number
    for number, (_, _, tokens) in enumerate(_MONTHS, start=1)
    for token in tokens
}

# the last token of a description that carries a trailing location
_LOCATION_CODES = {
    "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
    "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA",
    "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS",
    "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA",
    "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
}


@dataclass
class StatementPeriod:
    start_day: int
    start_month: int
    start_year: int
    end_day: int
    end_month: int
    end_year: int


@dataclass
class CreditRow:
    """One transaction line, before its month is resolved to a year."""
    day: int
    month: int
    description: str
    amount: float
    is_credit: bool


def _strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _month_number(token: str) -> Optional[int]:
    """Map an English or French month abbreviation to 1-12."""
    key = _strip_accents(token).upper().rstrip(".")
    return _MONTH_NUMBERS.get(key)


def _parse_credit_amount(text: str) -> Optional[float]:
    """Read "1 000,00" — space thousands separator, comma decimal — as a float."""
    cleaned = re.sub(r"\s", "", text).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_merchant(description: str) -> str:
    """
    Drop the trailing city and province or state, then everything from the first
    token carrying a digit.
    """
    tokens = description.split()
    if not tokens:
        return "Card transaction"

    if len(tokens) > 2 and tokens[-1].upper() in _LOCATION_CODES:
        tokens = tokens[:-2]

    for index, token in enumerate(tokens):
        if any(c.isdigit() for c in token):
            tokens = tokens[:index]
            break

    merchant = " ".join(tokens).rstrip("#").strip()
    return merchant or description.strip()


def _extract_statement_period(words: list) -> Optional[StatementPeriod]:
    """Read the "Relevé du … au …" line, dating the start from the end when it has no year."""
    texts = [w[4] for w in sorted(words, key=lambda w: (w[1], w[0]))]
    match = _PERIOD.search(" ".join(texts))
    if not match:
        return None

    start_day, start_month_token, start_year, end_day, end_month_token, end_year = match.groups()
    start_month = _month_number(start_month_token)
    end_month = _month_number(end_month_token)
    if start_month is None or end_month is None:
        return None

    end_year = int(end_year)
    if start_year:
        start_year = int(start_year)
    else:
        start_year = end_year - 1 if start_month > end_month else end_year

    return StatementPeriod(
        start_day=int(start_day),
        start_month=start_month,
        start_year=start_year,
        end_day=int(end_day),
        end_month=end_month,
        end_year=end_year,
    )


def _format_period(period: StatementPeriod) -> str:
    """Write the period as "July 21, 2026 to August 18, 2026"."""
    start_name = _MONTHS[period.start_month - 1][0]
    end_name = _MONTHS[period.end_month - 1][0]
    return (
        f"{start_name} {period.start_day}, {period.start_year} to "
        f"{end_name} {period.end_day}, {period.end_year}"
    )


def _extract_period(words: list) -> Optional[str]:
    period = _extract_statement_period(words)
    return _format_period(period) if period else None


def _year_for_month(period: StatementPeriod, month: int) -> int:
    """Place a transaction month in whichever of the period's years it falls in."""
    if period.start_year == period.end_year:
        return period.start_year
    return period.start_year if month >= period.start_month else period.end_year


def _find_table_bounds(page_words: list) -> Optional[tuple[float, float, float]]:
    """
    Locate the transaction table on one page, returning the x-range of its columns
    and the y below which its rows begin.
    """
    amount_header = None
    for row in group_words_by_row(page_words):
        texts = [w[4] for w in row]
        if "MONTANT" in texts and "($)" in texts:
            amount_header = next(w for w in row if w[4] == "($)")
            break

    if amount_header is None:
        return None

    header_y, right = amount_header[1], amount_header[2]
    header_band = [w for w in page_words if header_y - 10 <= w[1] <= header_y + 10]
    date_headers = [w for w in header_band if w[4] == "DATE"]
    if not date_headers:
        return None

    left = min(w[0] for w in date_headers)
    bottom = max(
        w[3] for w in header_band if left - 3 <= w[0] and w[2] <= right + 3
    )
    return left, right, bottom


def _parse_page(page) -> list[CreditRow]:
    """Read one page's transaction rows."""
    page_words = page.get_text("words")
    bounds = _find_table_bounds(page_words)
    if bounds is None:
        return []

    left, right, bottom = bounds
    body = [
        w for w in page_words
        if w[1] >= bottom and w[0] >= left - 3 and w[2] <= right + 3
    ]

    rows = []
    for row in group_words_by_row(body):
        match = _ROW.match(" ".join(w[4] for w in row))
        if not match:
            continue

        day, month_token, description, open_paren, amount_text = match.groups()
        month = _month_number(month_token)
        amount = _parse_credit_amount(amount_text)
        if month is None or amount is None:
            continue

        rows.append(CreditRow(
            day=int(day),
            month=month,
            description=description.strip(),
            amount=amount,
            is_credit=open_paren == "(",
        ))

    return rows


def _parse_doc(doc) -> dict:
    period = None
    rows = []

    for page in doc:
        if period is None:
            period = _extract_statement_period(page.get_text("words"))
        rows.extend(_parse_page(page))

    doc.close()

    if not rows:
        raise ValueError(WRONG_SOURCE_MESSAGE)
    if period is None:
        raise ValueError(MISSING_PERIOD_MESSAGE)

    transactions = []
    for row in rows:
        year = _year_for_month(period, row.month)
        abbreviation = _MONTHS[row.month - 1][1]
        transactions.append(Transaction(
            date=f"{row.day:02d} {abbreviation} {year}",
            description=row.description,
            # credits become deposits, charges withdrawals
            withdrawal=None if row.is_credit else row.amount,
            deposit=row.amount if row.is_credit else None,
            balance=None,
            merchant=_extract_merchant(row.description),
        ))

    return {"period": _format_period(period), "transactions": transactions}


def parse_credit_statement(pdf_path: str) -> dict:
    return _parse_doc(pymupdf.open(pdf_path))


def parse_credit_statement_from_bytes(pdf_bytes: bytes) -> dict:
    return _parse_doc(pymupdf.open(stream=pdf_bytes, filetype="pdf"))
