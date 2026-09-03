from datetime import date

from legalcost.calc import compute
from legalcost.models import Entry, MonthInput


def _entry(item_no: int, amount: int) -> Entry:
    return Entry(
        item_no=item_no,
        company="케이아이건설㈜",
        date=date(2026, 8, 31),
        description="테스트",
        unit="식",
        quantity=1,
        unit_price=amount,
        amount=amount,
    )


def test_current_month_sums_entries_per_item():
    month = MonthInput(
        doc_key="산안비",
        year=2026,
        month=8,
        progress_rate=0.0036,
        allocation=346016127,
        entries=[_entry(1, 5416670), _entry(1, 1000), _entry(2, 2000)],
    )
    totals = compute(month)
    assert totals.items[0].current == 5417670
    assert totals.items[1].current == 2000
    assert totals.items[2].current == 0


def test_cumulative_adds_opening_balance():
    month = MonthInput(
        doc_key="산안비",
        year=2026,
        month=8,
        progress_rate=0.0036,
        allocation=346016127,
        opening_balance={1: 42611140},
        entries=[_entry(1, 5416670)],
    )
    totals = compute(month)
    assert totals.items[0].prev_cum == 42611140
    assert totals.items[0].cum == 48027810


def test_ratio_is_cumulative_over_allocation():
    month = MonthInput(
        doc_key="산안비",
        year=2026,
        month=8,
        progress_rate=0.0036,
        allocation=346016127,
        opening_balance={1: 42611140},
        entries=[_entry(1, 5416670)],
    )
    totals = compute(month)
    assert round(totals.items[0].ratio, 6) == round(48027810 / 346016127, 6)


def test_grand_total_row():
    month = MonthInput(
        doc_key="안전1",
        year=2026,
        month=8,
        progress_rate=0.0036,
        allocation=203126000,
        opening_balance={3: 300000},
        entries=[],
    )
    totals = compute(month)
    assert totals.total.prev_cum == 300000
    assert totals.total.current == 0
    assert totals.total.cum == 300000
    assert totals.remaining == 203126000 - 300000


def test_item_rows_cover_every_document_item():
    month = MonthInput(
        doc_key="환경",
        year=2026,
        month=8,
        progress_rate=0.0005,
        allocation=82921042,
        entries=[_entry(1, 6000000)],
    )
    totals = compute(month)
    assert len(totals.items) == 6
    assert totals.items[0].name == "1. 환경오염방지시설설치 및 운영비"
    assert totals.items[0].cum == 6000000


def test_allocation_of_zero_gives_zero_ratio_not_error():
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0,
        allocation=0,
        entries=[_entry(1, 100)],
    )
    totals = compute(month)
    assert totals.items[0].ratio == 0.0
