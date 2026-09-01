import os
import pytest

from pdf_parser import (
    Transaction,
    StatementColumns,
    _parse_amount,
    _extract_amount,
    group_words_by_row as _group_words_by_row,
    _detect_columns,
    _assign_word_to_column,
    _extract_period,
    _extract_merchant,
    _assign_years,
    _parse_transaction_rows,
    parse_rbc_statement,
)

SAMPLE_PDF = os.path.join(os.path.dirname(__file__), "sample_statement.pdf")


def word(text, x0, x1, y=0):
    """Build a mock PyMuPDF word tuple (x0, y0, x1, y1, text)."""
    return (x0, y, x1, y, text)


# Fixed column layout used across multiple tests
COLS = StatementColumns(
    date_end=100,
    description_end=300,
    withdrawals_end=450,
    deposits_end=550,
)


# ---------------------------------------------------------------------------
# _parse_amount
# ---------------------------------------------------------------------------

class TestParseAmount:
    def test_plain_number(self):
        assert _parse_amount("1234.56") == 1234.56

    def test_commas(self):
        assert _parse_amount("1,234.56") == 1234.56

    def test_dollar_sign_and_commas(self):
        assert _parse_amount("$1,234.56") == 1234.56

    def test_non_numeric(self):
        assert _parse_amount("abc") is None

    def test_empty_string(self):
        assert _parse_amount("") is None


# ---------------------------------------------------------------------------
# _extract_amount
# ---------------------------------------------------------------------------

class TestExtractAmount:
    def test_returns_first_parseable(self):
        assert _extract_amount(["abc", "12.34", "56.78"]) == 12.34

    def test_all_non_numeric(self):
        assert _extract_amount(["abc", "xyz"]) is None

    def test_empty_list(self):
        assert _extract_amount([]) is None


# ---------------------------------------------------------------------------
# _group_words_by_row
# ---------------------------------------------------------------------------

class TestGroupWordsByRow:
    def test_empty_input(self):
        assert _group_words_by_row([]) == []

    def test_single_row(self):
        words = [word("hello", 10, 50, y=10), word("world", 60, 100, y=10)]
        rows = _group_words_by_row(words)
        assert len(rows) == 1
        assert [w[4] for w in rows[0]] == ["hello", "world"]

    def test_two_separate_rows(self):
        words = [
            word("top", 10, 50, y=10),
            word("bottom", 10, 80, y=50),
        ]
        rows = _group_words_by_row(words)
        assert len(rows) == 2
        assert rows[0][0][4] == "top"
        assert rows[1][0][4] == "bottom"

    def test_sorted_by_x_within_row(self):
        words = [word("b", 60, 100, y=10), word("a", 10, 50, y=10)]
        rows = _group_words_by_row(words)
        assert [w[4] for w in rows[0]] == ["a", "b"]

    def test_y_tolerance_groups_close_words(self):
        words = [word("a", 10, 50, y=10), word("b", 60, 100, y=11.5)]
        rows = _group_words_by_row(words, y_tolerance=2.0)
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# _detect_columns
# ---------------------------------------------------------------------------

class TestDetectColumns:
    def _header_row(self):
        return [
            word("Date",        50,  150),   # center 100
            word("Description", 200, 400),   # center 300
            word("Withdrawals", 450, 650),   # center 550
            word("Deposits",    700, 900),   # center 800
            word("Balance",     950, 1050),  # center 1000
        ]

    def test_correct_midpoints(self):
        cols = _detect_columns(self._header_row())
        assert cols.date_end == pytest.approx((100 + 300) / 2)
        assert cols.description_end == pytest.approx((300 + 550) / 2)
        assert cols.withdrawals_end == pytest.approx((550 + 800) / 2)
        assert cols.deposits_end == pytest.approx((800 + 1000) / 2)

    def test_missing_header_raises(self):
        incomplete = [word("Date", 50, 150), word("Description", 200, 400)]
        with pytest.raises(ValueError, match="RBC account statement"):
            _detect_columns(incomplete)


# ---------------------------------------------------------------------------
# _assign_word_to_column
# ---------------------------------------------------------------------------

class TestAssignWordToColumn:
    def test_date(self):
        assert _assign_word_to_column(50, COLS) == "date"

    def test_description(self):
        assert _assign_word_to_column(200, COLS) == "description"

    def test_withdrawal(self):
        assert _assign_word_to_column(375, COLS) == "withdrawal"

    def test_deposit(self):
        assert _assign_word_to_column(500, COLS) == "deposit"

    def test_balance(self):
        assert _assign_word_to_column(600, COLS) == "balance"


# ---------------------------------------------------------------------------
# _extract_merchant
# ---------------------------------------------------------------------------

class TestExtractMerchant:
    def test_interac_with_merchant(self):
        assert _extract_merchant("Interac purchase - 1361 - Nasr Foods") == "Nasr Foods"

    def test_interac_compact_separator(self):
        assert _extract_merchant("Interac purchase -1361 - The Bay") == "The Bay"

    def test_no_separator_returns_bank_transaction(self):
        assert _extract_merchant("ATM withdrawal") == "Bank transaction"

    def test_transfer_returns_bank_transaction(self):
        assert _extract_merchant("Transfer") == "Bank transaction"

    def test_strips_whitespace(self):
        assert _extract_merchant("Interac purchase - 1361 -  Highland ") == "Highland"


# ---------------------------------------------------------------------------
# _extract_period
# ---------------------------------------------------------------------------

class TestExtractPeriod:
    def _words_from_text(self, text: str):
        """Turn a plain string into a list of mock word tuples."""
        return [word(t, i * 20, i * 20 + 15, y=0) for i, t in enumerate(text.split())]

    def test_valid_period(self):
        words = self._words_from_text("From March 12, 2004 to April 12, 2004")
        result = _extract_period(words)
        assert result == "March 12, 2004 to April 12, 2004"

    def test_no_period(self):
        words = self._words_from_text("Account Number 12345")
        assert _extract_period(words) is None


# ---------------------------------------------------------------------------
# _assign_years
# ---------------------------------------------------------------------------

class TestAssignYears:
    def test_same_year(self):
        period = "March 12, 2004 to April 12, 2004"
        txns = [
            Transaction("15 Mar", "Transfer", None, 85.0, None),
            Transaction("20 Apr", "Purchase", 50.0, None, None),
        ]
        result = _assign_years(txns, period)
        assert result[0].date == "15 Mar 2004"
        assert result[1].date == "20 Apr 2004"

    def test_cross_year_december_to_january(self):
        """Dec transactions get the start year; Jan transactions get the end year."""
        period = "December 15, 2023 to January 15, 2024"
        txns = [
            Transaction("20 Dec", "Purchase", 50.0, None, None),
            Transaction("5 Jan", "Deposit", None, 100.0, None),
        ]
        result = _assign_years(txns, period)
        assert result[0].date == "20 Dec 2023"
        assert result[1].date == "5 Jan 2024"

    def test_none_period_returns_unchanged(self):
        txns = [Transaction("15 Mar", "Transfer", None, 85.0, None)]
        result = _assign_years(txns, None)
        assert result[0].date == "15 Mar"

    def test_empty_transactions(self):
        assert _assign_years([], "March 12, 2004 to April 12, 2004") == []


# ---------------------------------------------------------------------------
# _parse_transaction_rows
# ---------------------------------------------------------------------------

class TestParseTransactionRows:
    def _date_row(self, day, month, desc, amount, col):
        """Single-row transaction: date + description + one amount column."""
        x_amount = 400 if col == "withdrawal" else 500
        return [
            word(day,    10,  90,  y=0),
            word(month,  91,  99,  y=0),
            word(desc,  150, 250,  y=0),
            word(amount, x_amount - 10, x_amount + 10, y=0),
        ]

    def test_single_transaction(self):
        rows = [self._date_row("15", "Mar", "Transfer", "85.00", "deposit")]
        txns = _parse_transaction_rows(rows, COLS)
        assert len(txns) == 1
        assert txns[0].deposit == 85.0
        assert txns[0].withdrawal is None
        assert "Transfer" in txns[0].description

    def test_description_continuation_row(self):
        """A row with no date and no amount appends text to the current transaction."""
        date_row = self._date_row("15", "Mar", "Long", "85.00", "deposit")
        cont_row = [word("Description", 150, 250, y=10)]
        txns = _parse_transaction_rows([date_row, cont_row], COLS)
        assert len(txns) == 1
        assert "Long" in txns[0].description
        assert "Description" in txns[0].description

    def test_two_transactions_different_dates(self):
        row1 = self._date_row("15", "Mar", "Transfer", "85.00", "deposit")
        row2 = [
            word("17",      10,  90,  y=20),
            word("Mar",     91,  99,  y=20),
            word("Cheque", 150, 250,  y=20),
            word("40.00",  390, 410,  y=20),
        ]
        txns = _parse_transaction_rows([row1, row2], COLS)
        assert len(txns) == 2


# ---------------------------------------------------------------------------
# Integration — parse_rbc_statement (requires sample_statement.pdf)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not os.path.exists(SAMPLE_PDF),
    reason="sample_statement.pdf not present",
)
class TestParseRbcStatementIntegration:
    def setup_method(self):
        self.result = parse_rbc_statement(SAMPLE_PDF)

    def test_period(self):
        assert self.result["period"] == "March 12, 2004 to April 12, 2004"

    def test_opening_balance(self):
        assert self.result["opening_balance"] == pytest.approx(4247.14)

    def test_closing_balance(self):
        assert self.result["closing_balance"] == pytest.approx(3664.79)

    def test_transaction_count(self):
        assert len(self.result["transactions"]) == 11

    def test_dates_include_year(self):
        for t in self.result["transactions"]:
            parts = t.date.split()
            assert len(parts) == 3, f"Expected 'DD Mon YYYY', got '{t.date}'"
            assert parts[2] == "2004"

    def test_no_transaction_has_both_amounts(self):
        for t in self.result["transactions"]:
            assert not (t.withdrawal is not None and t.deposit is not None), (
                f"Transaction '{t.description}' has both withdrawal and deposit set"
            )

    def test_merchant_extracted_for_interac_purchases(self):
        merchants = {t.merchant for t in self.result["transactions"] if t.merchant}
        assert "Nasr Foods" in merchants
        assert "The Bay" in merchants
        assert "Highland" in merchants

    def test_non_interac_transactions_have_bank_transaction_merchant(self):
        bank_txns = [t for t in self.result["transactions"] if t.merchant == "Bank transaction"]
        descriptions = {t.description for t in bank_txns}
        assert "ATM withdrawal" in descriptions
        assert "Transfer" in descriptions
