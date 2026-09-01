import os
import pytest

from tests import make_credit_sample
from credit_parser import (
    _extract_merchant,
    _extract_period,
    _month_number,
    _parse_credit_amount,
    parse_credit_statement,
)

SAMPLE_PDF = os.path.join(os.path.dirname(__file__), "sample_credit_statement.pdf")
ACCOUNT_PDF = os.path.join(os.path.dirname(__file__), "sample_statement.pdf")


def word(text, x0, x1, y=0):
    """Build a mock PyMuPDF word tuple (x0, y0, x1, y1, text)."""
    return (x0, y, x1, y, text)


def words_from_text(text):
    return [word(t, i * 20, i * 20 + 15) for i, t in enumerate(text.split())]


# ---------------------------------------------------------------------------
# _parse_credit_amount
# ---------------------------------------------------------------------------

class TestParseCreditAmount:
    def test_plain_amount(self):
        assert _parse_credit_amount("5,64") == 5.64

    def test_thousands_separated_by_space(self):
        assert _parse_credit_amount("1 000,00") == 1000.0

    def test_non_breaking_space_separator(self):
        assert _parse_credit_amount("1 234,56") == 1234.56

    def test_non_numeric(self):
        assert _parse_credit_amount("abc") is None


# ---------------------------------------------------------------------------
# _month_number
# ---------------------------------------------------------------------------

class TestMonthNumber:
    def test_english_abbreviation(self):
        assert _month_number("JUL") == 7

    def test_french_abbreviation(self):
        assert _month_number("JUIL") == 7

    def test_june_is_not_confused_with_july(self):
        assert _month_number("JUIN") == 6
        assert _month_number("JUIL") == 7

    def test_accented_abbreviation(self):
        assert _month_number("AOÛ") == 8
        assert _month_number("AOÛT") == 8
        assert _month_number("DÉC") == 12

    def test_trailing_period_ignored(self):
        assert _month_number("SEPT.") == 9

    def test_unknown_token(self):
        assert _month_number("XYZ") is None


# ---------------------------------------------------------------------------
# _extract_merchant
# ---------------------------------------------------------------------------

class TestExtractMerchant:
    def test_strips_trailing_city_and_province(self):
        assert _extract_merchant("LAKESIDE GROCERS MONTREAL QC") == "LAKESIDE GROCERS"

    def test_strips_store_number(self):
        assert _extract_merchant("SUNRISE BAKERY #221 ORLEANS ON") == "SUNRISE BAKERY"

    def test_strips_glued_store_number_and_city(self):
        assert _extract_merchant("MAPLE MART SUPERCENTER#3065ORLEANS ON") == "MAPLE MART"

    def test_strips_state_and_multi_word_city_after_a_store_number(self):
        assert _extract_merchant("ATLAS BOOKS 51 NEW YORK NY") == "ATLAS BOOKS"

    def test_keeps_description_with_no_location(self):
        assert _extract_merchant("FRAIS ANNUELS") == "FRAIS ANNUELS"

    def test_keeps_payment_description_whole(self):
        assert (
            _extract_merchant("PAYMENT - THANK YOU / PAIEMENT - MERCI")
            == "PAYMENT - THANK YOU / PAIEMENT - MERCI"
        )

    def test_falls_back_to_the_description_when_trimming_empties_it(self):
        assert _extract_merchant("OTTAWA ON") == "OTTAWA ON"

    def test_blank_description(self):
        assert _extract_merchant("   ") == "Card transaction"


# ---------------------------------------------------------------------------
# _extract_period
# ---------------------------------------------------------------------------

class TestExtractPeriod:
    def test_year_on_the_end_date_only(self):
        words = words_from_text("Revelé du 21 JUIL au 18 AOÛT 2026")
        assert _extract_period(words) == "July 21, 2026 to August 18, 2026"

    def test_year_on_both_dates(self):
        words = words_from_text("Relevé du 31 DÉC 2024 au 20 JAN 2025")
        assert _extract_period(words) == "December 31, 2024 to January 20, 2025"

    def test_start_year_inferred_across_a_year_boundary(self):
        words = words_from_text("Revelé du 21 DÉC au 20 JAN 2025")
        assert _extract_period(words) == "December 21, 2024 to January 20, 2025"

    def test_no_period(self):
        assert _extract_period(words_from_text("Visa RBC ION")) is None


# ---------------------------------------------------------------------------
# Integration — parse_credit_statement
# ---------------------------------------------------------------------------

class TestParseCreditStatementIntegration:
    def setup_method(self):
        self.result = parse_credit_statement(SAMPLE_PDF)
        self.transactions = self.result["transactions"]

    def test_period(self):
        assert self.result["period"] == "July 21, 2026 to August 18, 2026"

    def test_no_opening_or_closing_balance_is_reported(self):
        assert "opening_balance" not in self.result
        assert "closing_balance" not in self.result

    def test_transaction_count(self):
        assert len(self.transactions) == 14

    def test_rows_are_read_from_every_page(self):
        dates = [t.date for t in self.transactions]
        assert dates[0] == "20 Jul 2026"
        assert dates[-1] == "18 Aug 2026"

    def test_dates_carry_the_year_from_the_statement_period(self):
        for t in self.transactions:
            parts = t.date.split()
            assert len(parts) == 3, f"Expected 'DD Mon YYYY', got '{t.date}'"
            assert parts[2] == "2026"

    def test_purchases_are_withdrawals(self):
        purchase = next(t for t in self.transactions if t.merchant == "SUNRISE BAKERY")
        assert purchase.withdrawal == pytest.approx(5.64)
        assert purchase.deposit is None

    def test_payments_are_deposits(self):
        payments = [
            t for t in self.transactions
            if t.description == "PAYMENT - THANK YOU / PAIEMENT - MERCI"
        ]
        assert [t.deposit for t in payments] == [pytest.approx(235.0), pytest.approx(1000.0)]
        assert all(t.withdrawal is None for t in payments)

    def test_refunds_are_deposits(self):
        refund = next(
            t for t in self.transactions
            if t.merchant == "HARBOURVIEW CINEMA" and t.deposit is not None
        )
        assert refund.deposit == pytest.approx(24.0)

    def test_no_transaction_carries_a_balance(self):
        assert all(t.balance is None for t in self.transactions)

    def test_no_transaction_has_both_amounts(self):
        for t in self.transactions:
            assert not (t.withdrawal is not None and t.deposit is not None)

    def test_totals_reconcile_with_the_statement_summary(self):
        purchases = sum(t.withdrawal for t in self.transactions if t.withdrawal)
        credits = sum(t.deposit for t in self.transactions if t.deposit)
        # 145,28 $ of purchases plus the 4,00 $ annual fee, against 1 259,00 $ of credits
        assert purchases == pytest.approx(149.28)
        assert credits == pytest.approx(1259.0)

    def test_merchants_are_extracted_from_the_activity_description(self):
        merchants = {t.merchant for t in self.transactions}
        assert "NORTHWIND COFFEE ROASTERS" in merchants
        assert "LAKESIDE GROCERS" in merchants
        assert "ATLAS BOOKS" in merchants

    def test_the_summary_column_beside_the_table_is_not_read_as_a_transaction(self):
        assert not any("Solde" in t.description for t in self.transactions)

    def test_the_reference_number_line_is_not_read_as_a_transaction(self):
        assert not any(t.description.startswith("74000") for t in self.transactions)


# ---------------------------------------------------------------------------
# Wrong source
# ---------------------------------------------------------------------------

class TestWrongSource:
    def test_an_account_statement_is_rejected(self):
        with pytest.raises(ValueError, match="credit card statement"):
            parse_credit_statement(ACCOUNT_PDF)


class TestMissingPeriod:
    def test_a_statement_with_no_period_is_rejected(self, tmp_path):
        # without the period there is no year to date the transactions with
        pdf = make_credit_sample.build(str(tmp_path / "no_period.pdf"), with_period=False)

        with pytest.raises(ValueError, match="does not state the period"):
            parse_credit_statement(pdf)
