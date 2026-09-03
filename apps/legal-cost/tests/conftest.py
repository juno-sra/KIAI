import os
from datetime import date
from pathlib import Path

import pytest

from legalcost.forms.layout import register_fonts
from legalcost.models import Entry, Evidence, MonthInput, Site


@pytest.fixture(scope="session")
def fonts():
    """assets/fonts 의 글꼴을 등록한다.

    Pretendard 는 저장소에 들어 있으므로 어디서든 한글이 그려진다.
    맑은 고딕·HY헤드라인M 은 재배포할 수 없어 실행 환경에 있을 때만 쓰인다.
    """
    font_dir = Path(__file__).resolve().parents[1] / "assets" / "fonts"
    registered = register_fonts(font_dir)
    fallback = next(iter(registered), "Helvetica")
    body = "Pretendard-Regular" if "Pretendard-Regular" in registered else fallback
    title = "Pretendard-SemiBold" if "Pretendard-SemiBold" in registered else body
    return {"body": body, "title": title}


@pytest.fixture
def sample_site():
    return Site(
        company="케이아이건설㈜",
        site_name="안양 인덕원 주변 도시개발사업 부지조성공사",
        address="경기도 고양시 덕양구 으뜸로130, A동 1313호",
        ceo="김도식",
        client="경기주택도시공사",
        contract_amount=21344625000,
        period_start="2025.09.16",
        period_end="2028.07.31",
        author_title="안전 관리자",
        author_name="신  준  호",
        approver_title="안전보건총괄책임자",
        approver_name="이  선  규",
    )


@pytest.fixture
def sample_month():
    """2026년 8월 산업안전보건관리비. 값은 실제 제출본과 같다."""
    return MonthInput(
        doc_key="산안비",
        year=2026,
        month=8,
        progress_rate=0.0036,
        allocation=346016127,
        opening_balance={1: 48027810, 2: 1724000, 3: 2141000, 5: 2441000, 6: 3875200},
        entries=[
            Entry(
                item_no=1,
                company="케이아이건설㈜",
                date=date(2026, 8, 31),
                description="안전관리자 급여(8월분)",
                unit="식",
                quantity=1,
                unit_price=5416670,
                amount=5416670,
            )
        ],
        evidences=[Evidence(0, Path("payroll.pdf"), "급여대장")],
    )


@pytest.fixture
def fixtures_dir():
    """정답지 PDF 폴더. 환경변수가 없으면 None."""
    raw = os.environ.get("LEGALCOST_FIXTURES")
    if not raw:
        return None
    path = Path(raw)
    return path if path.exists() else None
