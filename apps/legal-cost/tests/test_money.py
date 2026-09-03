import pytest

from legalcost.money import (
    format_allocation,
    format_amount,
    format_percent,
    to_korean_amount,
)


def test_format_amount_uses_thousands_separator():
    assert format_amount(48027810) == "48,027,810"


def test_format_amount_renders_zero_as_dash():
    assert format_amount(0) == "-"


def test_format_percent_two_decimals():
    assert format_percent(0.15445661583282216) == "15.45%"


def test_format_percent_renders_zero_as_dash():
    assert format_percent(0.0) == "-"


@pytest.mark.parametrize(
    "value,expected",
    [
        (203126000, "이억삼백일십이만육천원"),
        (5000000, "오백만원"),
        (82921042, "팔천이백구십이만일천사십이원"),
        (346016127, "삼억사천육백일만육천일백이십칠원"),
    ],
)
def test_to_korean_amount(value, expected):
    assert to_korean_amount(value) == expected


def test_format_allocation_combines_both():
    assert format_allocation(203126000) == "₩203,126,000 원 (이억삼백일십이만육천원)"
