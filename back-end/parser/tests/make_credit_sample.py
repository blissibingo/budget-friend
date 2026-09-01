"""
Generates sample_credit_statement.pdf, the fixture the credit parser tests read.
Reproduces the layout of an RBC credit card statement with invented data.
"""

import os

import pymupdf

OUT = os.path.join(os.path.dirname(__file__), "sample_credit_statement.pdf")

PAGE_WIDTH, PAGE_HEIGHT = 612, 792

# x-positions of the four transaction table columns
X_TRANSACTION_DATE = 58.7
X_POSTING_DATE = 95.2
X_DESCRIPTION = 127.6
X_AMOUNT_RIGHT = 344.7

# x-positions of the summary boxes printed beside the table
X_SIDEBAR_LABEL = 390.7
X_SIDEBAR_AMOUNT_RIGHT = 589.3

FONT = "helv"
FONT_SIZE = 7.5
ROW_HEIGHT = 18.4
DESCRIPTION_LINE_HEIGHT = 10

PERIOD = "Revelé du 21 JUIL au 18 AOÛT 2026"

# (transaction date, posting date, description, reference, amount, is_credit)
TRANSACTIONS = [
    ("20 JUL", "21 JUL", "SUNRISE BAKERY #221 ORLEANS ON", "74000000000000000000001", "5,64", False),
    ("21 JUL", "22 JUL", "RIVERSIDE TRANSIT/TAP4821 TORONTO ON", "74000000000000000000002", "18,00", False),
    ("24 JUL", "27 JUL", "NORTHWIND COFFEE ROASTERS OTTAWA ON", "74000000000000000000003", "3,30", False),
    ("25 JUL", "27 JUL", "PAYMENT - THANK YOU / PAIEMENT - MERCI", "74000000000000000000004", "235,00", True),
    ("25 JUL", "27 JUL", "PAYMENT - THANK YOU / PAIEMENT - MERCI", "74000000000000000000005", "1 000,00", True),
    ("26 JUL", "27 JUL", "HARBOURVIEW CINEMA TORONTO ON", "74000000000000000000006", "17,80", False),
    ("28 JUL", "30 JUL", "MAPLE FUEL BAR #10 ROCKLAND ON", "74000000000000000000007", "29,47", False),
    ("31 JUL", "03 AOÛ", "LAKESIDE GROCERS MONTREAL QC", "74000000000000000000008", "6,00", False),
    ("02 AOÛ", "04 AOÛ", "ATLAS BOOKS 51 NEW YORK NY", "74000000000000000000009", "42,10", False),
    ("05 AOÛ", "06 AOÛ", "STARFIELD AUDIO STOCKHOLM", "74000000000000000000010", "7,22", False),
    ("09 AOÛ", "11 AOÛ", "NORTHWIND COFFEE ROASTERS OTTAWA ON", "74000000000000000000011", "3,30", False),
    ("12 AOÛ", "13 AOÛ", "SUNRISE BAKERY #221 ORLEANS ON", "74000000000000000000012", "12,45", False),
    ("14 AOÛ", "15 AOÛ", "HARBOURVIEW CINEMA TORONTO ON", "74000000000000000000013", "24,00", True),
    ("18 AOÛ", "18 AOÛ", "FRAIS ANNUELS", "74000000000000000000014", "4,00", False),
]

ROWS_ON_FIRST_PAGE = 8


def _write(page, text, x, y, size=FONT_SIZE):
    page.insert_text((x, y), text, fontname=FONT, fontsize=size)


def _write_right(page, text, right_x, y, size=FONT_SIZE):
    width = pymupdf.get_text_length(text, fontname=FONT, fontsize=size)
    page.insert_text((right_x - width, y), text, fontname=FONT, fontsize=size)


def _write_statement_header(page, with_period=True):
    _write(page, "Visa‡ RBC® ION+MC", 59.5, 90)
    _write(page, "SAMPLE CARDHOLDER  4510 15** **** 0000", 59.5, 106)
    if with_period:
        _write(page, PERIOD, 59.5, 118)


def _write_sidebar(page):
    """The account summary box that sits to the right of the transaction table."""
    lines = [
        ("Solde de compte précédent", "2 390,33 $"),
        ("Paiements et crédits", "(1 259,00 $)"),
        ("Achats et débits", "145,28 $"),
        ("Avances de fonds", "0,00 $"),
        ("Intérêts", "0,00 $"),
        ("Frais", "4,00 $"),
        ("Solde de compte total", "1 280,61 $"),
    ]
    y = 210
    for label, amount in lines:
        _write(page, label, X_SIDEBAR_LABEL, y)
        _write_right(page, amount, X_SIDEBAR_AMOUNT_RIGHT, y)
        y += 12


def _write_table_header(page, y):
    """The four column headings, with the two date headings stacked over two lines."""
    _write(page, "DATE DE", X_TRANSACTION_DATE, y)
    _write(page, "L'OPÉRATION", X_TRANSACTION_DATE, y + 6.2)
    _write(page, "DATE", X_POSTING_DATE, y + 0.2)
    _write(page, "D'INSCRIPTION", X_POSTING_DATE, y + 6.2)
    _write(page, "DESCRIPTION DE L'OPÉRATION", 169.0, y + 3.2)
    _write(page, "MONTANT", 314.4, y + 3.2)
    _write(page, "($)", 342.0, y + 3.2)
    return y + 12.2


def _write_transaction(page, y, row):
    transaction_date, posting_date, description, reference, amount, is_credit = row
    _write(page, transaction_date, X_TRANSACTION_DATE, y)
    _write(page, posting_date, X_POSTING_DATE, y)
    _write(page, description, X_DESCRIPTION, y)
    _write(page, reference, X_DESCRIPTION, y + DESCRIPTION_LINE_HEIGHT)
    _write_right(
        page,
        f"({amount} $)" if is_credit else f"{amount} $",
        X_AMOUNT_RIGHT,
        y,
    )


def build(out=OUT, with_period=True) -> str:
    doc = pymupdf.open()
    pages = [
        TRANSACTIONS[:ROWS_ON_FIRST_PAGE],
        TRANSACTIONS[ROWS_ON_FIRST_PAGE:],
    ]

    for index, rows in enumerate(pages):
        page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        _write_statement_header(page, with_period)
        if index == 0:
            _write_sidebar(page)
        _write(page, "SAMPLE CARDHOLDER", 167.3, 180)
        _write(page, "4510 15** **** 0000 - TITULAIRE PRINCIPAL", 95.3, 189)

        y = _write_table_header(page, 194.5)
        for row in rows:
            y += ROW_HEIGHT
            _write_transaction(page, y, row)

        if index == len(pages) - 1:
            _write(page, "SOLDE DE COMPTE TOTAL", X_DESCRIPTION, y + 30)
            _write_right(page, "1 280,61 $", X_AMOUNT_RIGHT, y + 30)

        _write(page, f"{index + 1} DE {len(pages)}", 300, 760)

    doc.save(out)
    doc.close()
    return out


if __name__ == "__main__":
    print(f"Wrote {build()}")
