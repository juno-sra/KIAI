from datetime import date
from pathlib import Path

from legalcost.models import Entry, Evidence, MonthInput, Photo, Site
from legalcost.validate import validate

SITE = Site(
    company="케이아이건설㈜",
    site_name="안양 인덕원 주변 도시개발사업 부지조성공사",
    address="경기도 고양시 덕양구 으뜸로130, A동 1313호",
    ceo="김도식",
    client="경기주택도시공사",
    contract_amount=21344625000,
    period_start="2025.09.16",
    period_end="2028.07.31",
)


def _entry(amount: int, quantity: float = 1, unit_price: int | None = None) -> Entry:
    return Entry(
        item_no=1,
        company="케이아이건설㈜",
        date=date(2026, 8, 31),
        description="안전관리자 급여(8월분)",
        unit="식",
        quantity=quantity,
        unit_price=amount if unit_price is None else unit_price,
        amount=amount,
    )


def _codes(findings):
    return [f.code for f in findings]


def test_allocation_exceeded_is_reported():
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0,
        allocation=5000000,
        entries=[_entry(6000000)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
    )
    assert "ALLOCATION_EXCEEDED" in _codes(validate(SITE, month))


def test_amount_mismatch_is_reported():
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0,
        allocation=5000000,
        entries=[_entry(amount=1000, quantity=3, unit_price=400)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
    )
    assert "AMOUNT_MISMATCH" in _codes(validate(SITE, month))


def test_matching_amount_is_not_reported():
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0,
        allocation=5000000,
        entries=[_entry(amount=1200, quantity=3, unit_price=400)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
    )
    assert "AMOUNT_MISMATCH" not in _codes(validate(SITE, month))


def test_empty_caption_is_reported():
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0,
        allocation=5000000,
        photos=[Photo(1, Path("p.jpg"), SITE.site_name, "", "안전난간", "2026-08-10")],
    )
    assert "CAPTION_EMPTY" in _codes(validate(SITE, month))


def test_caption_from_another_site_is_reported():
    """엑셀 파일에서 실제로 발견된 사고: 다른 현장 이름이 캡션에 남아 있었다."""
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0,
        allocation=5000000,
        photos=[
            Photo(
                1,
                Path("p.jpg"),
                "경기도 광주 쌍동1지구 공동주택 신축공사",
                "현장 내",
                "PVC코팅망(청색)",
                "2021-06-26",
            )
        ],
    )
    assert "CAPTION_SITE_MISMATCH" in _codes(validate(SITE, month))


def test_entry_without_evidence_is_reported():
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0,
        allocation=5000000,
        entries=[_entry(1000)],
    )
    assert "EVIDENCE_MISSING" in _codes(validate(SITE, month))


def test_clean_month_has_no_findings():
    month = MonthInput(
        doc_key="안전2",
        year=2026,
        month=8,
        progress_rate=0.0036,
        allocation=5000000,
        entries=[_entry(amount=1200, quantity=3, unit_price=400)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
        photos=[Photo(1, Path("p.jpg"), SITE.site_name, "현장 내", "안전난간", "2026-08-10")],
    )
    assert validate(SITE, month) == []
