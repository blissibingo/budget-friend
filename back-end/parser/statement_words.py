from dataclasses import dataclass
from typing import Optional


@dataclass
class Transaction:
    date: str
    description: str
    withdrawal: Optional[float]
    deposit: Optional[float]
    balance: Optional[float]
    merchant: str = "Bank transaction"


def group_words_by_row(words: list, y_tolerance: float = 2.0) -> list[list]:
    """Group words into rows based on proximity of their y-coordinates."""
    if not words:
        return []

    sorted_words = sorted(words, key=lambda w: (w[1], w[0]))
    rows = []
    current_row = [sorted_words[0]]

    for word in sorted_words[1:]:
        if abs(word[1] - current_row[0][1]) <= y_tolerance:
            current_row.append(word)
        else:
            rows.append(sorted(current_row, key=lambda w: w[0]))
            current_row = [word]
    rows.append(sorted(current_row, key=lambda w: w[0]))

    return rows
