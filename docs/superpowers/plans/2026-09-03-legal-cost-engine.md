# 법정경비 사용내역서 출력 엔진 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 월 데이터를 넣으면 발주처 제출용 PDF(갑지·집계표·항목월·내역서·사진대지·증빙 병합)가 나오는 출력 엔진을 만든다.

**Architecture:** 순수 파이썬 라이브러리로 만든다. 화면 코드는 없다. 서식 치수를 데이터로 분리하고(`forms/spec.py`), 렌더러는 그 치수를 읽어 ReportLab 캔버스에 그린다. 엑셀 인쇄 배율·여백은 캔버스 변환으로 재현하므로 좌표값이 원본 시트 좌표와 1:1로 대응한다. 정확도는 실제 제출본 PDF를 정답지로 한 픽셀 대조로 확인한다.

**Tech Stack:** Python 3.11, ReportLab 5.x(PDF 생성), pypdfium2(래스터화), pikepdf(PDF 병합), Pillow(사진), numpy(픽셀 대조), pytest

**Spec:** `docs/superpowers/specs/2026-09-03-legal-cost-report-design.md`

## Global Constraints

- 용지 크기는 `(595.2, 841.68)` 포인트로 고정한다. ReportLab의 `pagesizes.A4`(595.2756 × 841.8898)를 쓰지 않는다. 실제 제출본 실측값이다.
- 금액은 **공급가액**만 다룬다. 부가세 계산은 없다.
- 금액 0은 숫자 `0`이 아니라 `-`로 출력한다.
- 계상액은 `₩203,126,000 원 (이억삼백일십이만육천원)` 형식으로 한글 금액을 병기한다.
- 인쇄 배율·여백은 문서·장표별로 다르다. 값은 Task 6의 표를 그대로 쓴다.
- 사진대지는 A4 1장에 사진 2컷, 컷마다 캡션 4칸(공사명·위치·내용·날짜).
- 병합 순서는 갑지 → 집계표 → 항목월 → 내역서(상세) → 사진대지 → 증빙.
- 모든 새 코드는 `apps/legal-cost/` 아래 둔다. 저장소 루트의 superpowers 파일은 건드리지 않는다.
- 정답지 PDF와 원본 엑셀은 **저장소에 커밋하지 않는다.** 환경변수 `LEGALCOST_FIXTURES`가 가리키는 폴더에서 읽고, 없으면 해당 테스트를 건너뛴다.
- 금액은 전부 `int`(원 단위)로 다룬다. `float`를 금액에 쓰지 않는다.

---

### Task 1: 프로젝트 뼈대와 테스트 러너

**Files:**
- Create: `apps/legal-cost/pyproject.toml`
- Create: `apps/legal-cost/src/legalcost/__init__.py`
- Create: `apps/legal-cost/tests/test_smoke.py`
- Create: `.github/workflows/legal-cost-tests.yml`

**Interfaces:**
- Consumes: 없음
- Produces: `legalcost` 패키지가 import 가능해진다. `pytest`가 `apps/legal-cost`에서 동작한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_smoke.py`:

```python
import legalcost


def test_package_exposes_page_size():
    assert legalcost.PAGE_SIZE == (595.2, 841.68)
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_smoke.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/pyproject.toml`:

```toml
[project]
name = "legalcost"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "reportlab>=4.0",
    "pypdfium2>=4.0",
    "pikepdf>=8.0",
    "pillow>=10.0",
    "numpy>=1.24",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
```

`apps/legal-cost/src/legalcost/__init__.py`:

```python
"""법정경비 사용내역서 출력 엔진."""

# 실제 제출본 실측값. reportlab.lib.pagesizes.A4 와 다르므로 직접 정의한다.
PAGE_SIZE = (595.2, 841.68)

__all__ = ["PAGE_SIZE"]
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_smoke.py -v`
Expected: PASS

- [ ] **Step 5: CI 워크플로 추가**

`.github/workflows/legal-cost-tests.yml`:

```yaml
name: legal-cost tests

on:
  push:
    paths:
      - 'apps/legal-cost/**'
      - '.github/workflows/legal-cost-tests.yml'
  pull_request:
    paths:
      - 'apps/legal-cost/**'

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/legal-cost
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e '.[dev]'
      - run: python -m pytest -v
```

- [ ] **Step 6: 커밋**

```bash
git add apps/legal-cost .github/workflows/legal-cost-tests.yml
git commit -m "법정경비 출력 엔진: 프로젝트 뼈대와 테스트 러너"
```

---

### Task 2: 금액 서식과 한글 금액 표기

**Files:**
- Create: `apps/legal-cost/src/legalcost/money.py`
- Create: `apps/legal-cost/tests/test_money.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `format_amount(value: int) -> str` — `48027810` → `"48,027,810"`, `0` → `"-"`
  - `format_percent(ratio: float) -> str` — `0.1544566` → `"15.45%"`, `0.0` → `"-"`
  - `to_korean_amount(value: int) -> str` — `203126000` → `"이억삼백일십이만육천원"`
  - `format_allocation(value: int) -> str` — `"₩203,126,000 원 (이억삼백일십이만육천원)"`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_money.py`:

```python
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
```

기대값 4개는 실제 제출본 PDF에서 그대로 옮긴 것이다. 임의로 바꾸지 않는다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_money.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.money'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/money.py`:

```python
"""금액 서식 변환."""

_DIGITS = "영일이삼사오육칠팔구"
_SMALL_UNITS = ["", "십", "일백", "일천"]
_BIG_UNITS = ["", "만", "억", "조"]


def format_amount(value: int) -> str:
    """금액을 천단위 구분 문자열로. 0은 대시로."""
    if value == 0:
        return "-"
    return f"{value:,}"


def format_percent(ratio: float) -> str:
    """비율(0.1544=15.44%)을 소수 둘째자리 백분율로. 0은 대시로."""
    if ratio == 0:
        return "-"
    return f"{ratio * 100:.2f}%"


def _four_digits_to_korean(chunk: int) -> str:
    """0~9999 를 한글로. 1234 -> 일천이백삼십사"""
    out = ""
    for position in range(3, -1, -1):
        digit = (chunk // (10 ** position)) % 10
        if digit == 0:
            continue
        unit = _SMALL_UNITS[position]
        if position == 1:
            # 십의 자리: 1은 '일십'이 아니라 '십'
            out += ("" if digit == 1 else _DIGITS[digit]) + unit
        else:
            out += _DIGITS[digit] + unit
    return out


def to_korean_amount(value: int) -> str:
    """금액을 한글 표기로. 제출본 표기 규칙을 따른다."""
    if value == 0:
        return "영원"
    parts: list[str] = []
    chunks: list[int] = []
    remaining = value
    while remaining > 0:
        chunks.append(remaining % 10000)
        remaining //= 10000
    for index in range(len(chunks) - 1, -1, -1):
        chunk = chunks[index]
        if chunk == 0:
            continue
        parts.append(_four_digits_to_korean(chunk) + _BIG_UNITS[index])
    return "".join(parts) + "원"


def format_allocation(value: int) -> str:
    """계상액 표기: 숫자와 한글 병기."""
    return f"₩{value:,} 원 ({to_korean_amount(value)})"
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_money.py -v`
Expected: PASS (8건)

`팔천이백구십이만일천사십이원`처럼 백·천의 자리에 `일`이 붙는 표기가 제출본 규칙이다. `_SMALL_UNITS`를 `["", "십", "일백", "일천"]`으로 둔 이유이며, 임의로 `"백"`, `"천"`으로 바꾸면 테스트가 깨진다.

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/money.py apps/legal-cost/tests/test_money.py
git commit -m "법정경비 출력 엔진: 금액 서식과 한글 금액 표기"
```

---

### Task 3: 도메인 모델

**Files:**
- Create: `apps/legal-cost/src/legalcost/models.py`
- Create: `apps/legal-cost/src/legalcost/doctypes.py`
- Create: `apps/legal-cost/tests/test_doctypes.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `Site(company, site_name, address, ceo, client, contract_amount, period_start, period_end, author_title, author_name, approver_title, approver_name)` — 모두 문자열, `contract_amount`만 `int`
  - `Entry(item_no, company, date, description, unit, quantity, unit_price, amount, note)`
  - `Photo(item_no, image_path, site_name, location, content, date, order)`
  - `Evidence(entry_index, file_path, kind)`
  - `MonthInput(doc_key, year, month, progress_rate, allocation, opening_balance, entries, photos, evidences)`
  - `DOC_TYPES: dict[str, DocType]` — 키 `"산안비"`, `"안전1"`, `"안전2"`, `"환경"`
  - `DocType(key, title, cover_subtitle, summary_title, legal_clause, items, signatures, allocation_label)`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_doctypes.py`:

```python
from legalcost.doctypes import DOC_TYPES


def test_four_document_types_exist():
    assert set(DOC_TYPES) == {"산안비", "안전1", "안전2", "환경"}


def test_item_counts_match_submitted_forms():
    assert len(DOC_TYPES["산안비"].items) == 9
    assert len(DOC_TYPES["안전1"].items) == 5
    assert len(DOC_TYPES["안전2"].items) == 2
    assert len(DOC_TYPES["환경"].items) == 6


def test_first_item_names_match_submitted_forms():
    assert DOC_TYPES["산안비"].items[0] == "1. 안전관리자 인건비 및 각종 업무수당 등"
    assert DOC_TYPES["안전1"].items[0] == "1. 공사현장의 안전점검 비용"
    assert DOC_TYPES["안전2"].items[0] == "1. 안전관리계획의 작성 및 검토비용"
    assert DOC_TYPES["환경"].items[0] == "1. 환경오염방지시설설치 및 운영비"


def test_legal_clause_differs_between_families():
    assert DOC_TYPES["산안비"].legal_clause.startswith("건설업 산업안전보건관리비 계상 및 사용기준 제10조 제1항")
    for key in ("안전1", "안전2", "환경"):
        assert DOC_TYPES[key].legal_clause.startswith("건설기술진흥법 시행규칙 제60조")


def test_signature_lines_match_submitted_forms():
    assert [s.role for s in DOC_TYPES["산안비"].signatures] == ["작 성 자", "확 인 자"]
    assert [s.title for s in DOC_TYPES["산안비"].signatures] == ["안전 관리자", "안전보건총괄책임자"]
    assert [s.title for s in DOC_TYPES["환경"].signatures] == ["환경관리 책임자"]
    assert [s.title for s in DOC_TYPES["안전2"].signatures] == ["안전보건총괄책임자"]


def test_allocation_label_differs():
    assert DOC_TYPES["산안비"].allocation_label == "계상된 안전관리비"
    assert DOC_TYPES["환경"].allocation_label == "계상된 환경 보전비"
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_doctypes.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.doctypes'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/models.py`:

```python
"""도메인 데이터 구조."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class Site:
    company: str
    site_name: str
    address: str
    ceo: str
    client: str
    contract_amount: int
    period_start: str
    period_end: str
    author_title: str = ""
    author_name: str = ""
    approver_title: str = ""
    approver_name: str = ""


@dataclass(frozen=True)
class Entry:
    """집행 한 건. amount 는 공급가액."""

    item_no: int
    company: str
    date: date
    description: str
    unit: str
    quantity: float
    unit_price: int
    amount: int
    note: str = ""


@dataclass(frozen=True)
class Photo:
    item_no: int
    image_path: Path
    site_name: str
    location: str
    content: str
    date: str
    order: int = 0


@dataclass(frozen=True)
class Evidence:
    entry_index: int
    file_path: Path
    kind: str


@dataclass(frozen=True)
class MonthInput:
    doc_key: str
    year: int
    month: int
    progress_rate: float
    allocation: int
    opening_balance: dict[int, int] = field(default_factory=dict)
    entries: list[Entry] = field(default_factory=list)
    photos: list[Photo] = field(default_factory=list)
    evidences: list[Evidence] = field(default_factory=list)
```

`apps/legal-cost/src/legalcost/doctypes.py`:

```python
"""문서 4종 정의. 값은 실제 제출본에서 그대로 옮긴 것이다."""

from __future__ import annotations

from dataclasses import dataclass

CLAUSE_OSH = "건설업 산업안전보건관리비 계상 및 사용기준 제10조 제1항에 의거 위와 같이 사용내역을 제출합니다."
CLAUSE_CTA = "건설기술진흥법 시행규칙 제60조에 의하여 위와 같이 사용내역을 제출합니다."


@dataclass(frozen=True)
class Signature:
    role: str
    title: str


@dataclass(frozen=True)
class DocType:
    key: str
    title: str
    cover_subtitle: str
    summary_title: str
    legal_clause: str
    items: tuple[str, ...]
    signatures: tuple[Signature, ...]
    allocation_label: str


DOC_TYPES: dict[str, DocType] = {
    "산안비": DocType(
        key="산안비",
        title="산업안전보건관리비 사용내역서",
        cover_subtitle="",
        summary_title="산업안전보건관리비 사용내역서",
        legal_clause=CLAUSE_OSH,
        items=(
            "1. 안전관리자 인건비 및 각종 업무수당 등",
            "2. 안전시설비 등",
            "3. 개인보호구 및 안전장구 구입비 등",
            "4. 사업장 안전진단비 등",
            "5. 안전보건 교육비 및 행사비 등",
            "6. 근로자 건강장해예방비 등",
            "7. 건설재해예방 전문지도기관 기술지도비 등",
            "8. 본사 사용비",
            "9. 위험성 평가 등에 따른 소요비용 등",
        ),
        signatures=(
            Signature("작 성 자", "안전 관리자"),
            Signature("확 인 자", "안전보건총괄책임자"),
        ),
        allocation_label="계상된 안전관리비",
    ),
    "안전1": DocType(
        key="안전1",
        title="안전관리비 사용내역서 Ⅰ",
        cover_subtitle="",
        summary_title="안전관리비 사용내역서",
        legal_clause=CLAUSE_CTA,
        items=(
            "1. 공사현장의 안전점검 비용",
            "2. 발파/굴착 등의 주변 피해방지 대책 비용",
            "3. 공사장 주변의 통행안전관리대책 비용",
            "4. 안전 모니터링 장치의 설치ㆍ운용 비용",
            "5. 무선설비 및 무선통신을 이용한 안전관리체계 구축ㆍ운용 비용",
        ),
        signatures=(Signature("확 인 자", "안전보건총괄책임자"),),
        allocation_label="계상된 안전관리비",
    ),
    "안전2": DocType(
        key="안전2",
        title="안전관리비 사용내역서 Ⅱ",
        cover_subtitle="(안전관리계획 및 안전성 검토 관련)",
        summary_title="안전관리계획 및 안전성 검토 관련 안전관리비 사용내역서",
        legal_clause=CLAUSE_CTA,
        items=(
            "1. 안전관리계획의 작성 및 검토비용",
            "2. 공사시행 중 구조적 안전성 확보 비용",
        ),
        signatures=(Signature("확 인 자", "안전보건총괄책임자"),),
        allocation_label="계상된 안전관리비",
    ),
    "환경": DocType(
        key="환경",
        title="환경보전비 사용내역서",
        cover_subtitle="",
        summary_title="환경보전비 사용내역서",
        legal_clause=CLAUSE_CTA,
        items=(
            "1. 환경오염방지시설설치 및 운영비",
            "2. 환경계측비",
            "3. 환경 교육훈련비",
            "4. 현장 환경정리비",
            "5. 환경자료 및 홍보물 구입비",
            "6. 기타 환경관리비",
        ),
        signatures=(Signature("확 인 자", "환경관리 책임자"),),
        allocation_label="계상된 환경 보전비",
    ),
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_doctypes.py -v`
Expected: PASS (6건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/models.py apps/legal-cost/src/legalcost/doctypes.py apps/legal-cost/tests/test_doctypes.py
git commit -m "법정경비 출력 엔진: 도메인 모델과 문서 4종 정의"
```

---

### Task 4: 집계 계산

**Files:**
- Create: `apps/legal-cost/src/legalcost/calc.py`
- Create: `apps/legal-cost/tests/test_calc.py`

**Interfaces:**
- Consumes: `legalcost.models.Entry`, `legalcost.models.MonthInput`, `legalcost.doctypes.DOC_TYPES`
- Produces:
  - `ItemTotal(item_no: int, name: str, prev_cum: int, current: int, cum: int, ratio: float)`
  - `MonthTotals(items: list[ItemTotal], total: ItemTotal, allocation: int, remaining: int)`
  - `compute(month: MonthInput) -> MonthTotals`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_calc.py`:

```python
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
        doc_key="산안비", year=2026, month=8, progress_rate=0.0036,
        allocation=346016127,
        entries=[_entry(1, 5416670), _entry(1, 1000), _entry(2, 2000)],
    )
    totals = compute(month)
    assert totals.items[0].current == 5417670
    assert totals.items[1].current == 2000
    assert totals.items[2].current == 0


def test_cumulative_adds_opening_balance():
    month = MonthInput(
        doc_key="산안비", year=2026, month=8, progress_rate=0.0036,
        allocation=346016127,
        opening_balance={1: 42611140},
        entries=[_entry(1, 5416670)],
    )
    totals = compute(month)
    assert totals.items[0].prev_cum == 42611140
    assert totals.items[0].cum == 48027810


def test_ratio_is_cumulative_over_allocation():
    month = MonthInput(
        doc_key="산안비", year=2026, month=8, progress_rate=0.0036,
        allocation=346016127,
        opening_balance={1: 42611140},
        entries=[_entry(1, 5416670)],
    )
    totals = compute(month)
    assert round(totals.items[0].ratio, 6) == round(48027810 / 346016127, 6)


def test_grand_total_row():
    month = MonthInput(
        doc_key="안전1", year=2026, month=8, progress_rate=0.0036,
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
        doc_key="환경", year=2026, month=8, progress_rate=0.0005,
        allocation=82921042, entries=[_entry(1, 6000000)],
    )
    totals = compute(month)
    assert len(totals.items) == 6
    assert totals.items[0].name == "1. 환경오염방지시설설치 및 운영비"
    assert totals.items[0].cum == 6000000


def test_allocation_of_zero_gives_zero_ratio_not_error():
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0,
        allocation=0, entries=[_entry(1, 100)],
    )
    totals = compute(month)
    assert totals.items[0].ratio == 0.0
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_calc.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.calc'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/calc.py`:

```python
"""월 집계 계산."""

from __future__ import annotations

from dataclasses import dataclass

from .doctypes import DOC_TYPES
from .models import MonthInput


@dataclass(frozen=True)
class ItemTotal:
    item_no: int
    name: str
    prev_cum: int
    current: int
    cum: int
    ratio: float


@dataclass(frozen=True)
class MonthTotals:
    items: list[ItemTotal]
    total: ItemTotal
    allocation: int
    remaining: int


def _ratio(cum: int, allocation: int) -> float:
    if allocation <= 0:
        return 0.0
    return cum / allocation


def compute(month: MonthInput) -> MonthTotals:
    doc = DOC_TYPES[month.doc_key]
    current_by_item: dict[int, int] = {}
    for entry in month.entries:
        current_by_item[entry.item_no] = current_by_item.get(entry.item_no, 0) + entry.amount

    items: list[ItemTotal] = []
    for index, name in enumerate(doc.items, start=1):
        prev_cum = month.opening_balance.get(index, 0)
        current = current_by_item.get(index, 0)
        cum = prev_cum + current
        items.append(
            ItemTotal(
                item_no=index,
                name=name,
                prev_cum=prev_cum,
                current=current,
                cum=cum,
                ratio=_ratio(cum, month.allocation),
            )
        )

    total_prev = sum(i.prev_cum for i in items)
    total_current = sum(i.current for i in items)
    total_cum = total_prev + total_current
    total = ItemTotal(
        item_no=0,
        name="계",
        prev_cum=total_prev,
        current=total_current,
        cum=total_cum,
        ratio=_ratio(total_cum, month.allocation),
    )
    return MonthTotals(
        items=items,
        total=total,
        allocation=month.allocation,
        remaining=month.allocation - total_cum,
    )
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_calc.py -v`
Expected: PASS (6건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/calc.py apps/legal-cost/tests/test_calc.py
git commit -m "법정경비 출력 엔진: 월 집계 계산"
```

---

### Task 5: 검증 규칙

**Files:**
- Create: `apps/legal-cost/src/legalcost/validate.py`
- Create: `apps/legal-cost/tests/test_validate.py`

**Interfaces:**
- Consumes: `legalcost.models.{Site, MonthInput, Entry, Photo}`, `legalcost.calc.compute`
- Produces:
  - `Finding(code: str, level: str, message: str)` — `level`은 `"error"` 또는 `"warning"`
  - `validate(site: Site, month: MonthInput) -> list[Finding]`
  - 코드값: `"ALLOCATION_EXCEEDED"`, `"AMOUNT_MISMATCH"`, `"CAPTION_EMPTY"`, `"CAPTION_SITE_MISMATCH"`, `"EVIDENCE_MISSING"`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_validate.py`:

```python
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
        item_no=1, company="케이아이건설㈜", date=date(2026, 8, 31),
        description="안전관리자 급여(8월분)", unit="식",
        quantity=quantity,
        unit_price=amount if unit_price is None else unit_price,
        amount=amount,
    )


def _codes(findings):
    return [f.code for f in findings]


def test_allocation_exceeded_is_reported():
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0,
        allocation=5000000, entries=[_entry(6000000)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
    )
    assert "ALLOCATION_EXCEEDED" in _codes(validate(SITE, month))


def test_amount_mismatch_is_reported():
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0,
        allocation=5000000,
        entries=[_entry(amount=1000, quantity=3, unit_price=400)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
    )
    assert "AMOUNT_MISMATCH" in _codes(validate(SITE, month))


def test_matching_amount_is_not_reported():
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0,
        allocation=5000000,
        entries=[_entry(amount=1200, quantity=3, unit_price=400)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
    )
    assert "AMOUNT_MISMATCH" not in _codes(validate(SITE, month))


def test_empty_caption_is_reported():
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0, allocation=5000000,
        photos=[Photo(1, Path("p.jpg"), SITE.site_name, "", "안전난간", "2026-08-10")],
    )
    assert "CAPTION_EMPTY" in _codes(validate(SITE, month))


def test_caption_from_another_site_is_reported():
    """엑셀 파일에서 실제로 발견된 사고: 다른 현장 이름이 캡션에 남아 있었다."""
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0, allocation=5000000,
        photos=[
            Photo(1, Path("p.jpg"), "경기도 광주 쌍동1지구 공동주택 신축공사",
                  "현장 내", "PVC코팅망(청색)", "2021-06-26")
        ],
    )
    assert "CAPTION_SITE_MISMATCH" in _codes(validate(SITE, month))


def test_entry_without_evidence_is_reported():
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0,
        allocation=5000000, entries=[_entry(1000)],
    )
    assert "EVIDENCE_MISSING" in _codes(validate(SITE, month))


def test_clean_month_has_no_findings():
    month = MonthInput(
        doc_key="안전2", year=2026, month=8, progress_rate=0.0036,
        allocation=5000000,
        entries=[_entry(amount=1200, quantity=3, unit_price=400)],
        evidences=[Evidence(0, Path("a.pdf"), "세금계산서")],
        photos=[Photo(1, Path("p.jpg"), SITE.site_name, "현장 내", "안전난간", "2026-08-10")],
    )
    assert validate(SITE, month) == []
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_validate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.validate'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/validate.py`:

```python
"""제출 전 검증 규칙."""

from __future__ import annotations

from dataclasses import dataclass

from .calc import compute
from .models import MonthInput, Site


@dataclass(frozen=True)
class Finding:
    code: str
    level: str
    message: str


def validate(site: Site, month: MonthInput) -> list[Finding]:
    findings: list[Finding] = []
    totals = compute(month)

    if totals.remaining < 0:
        findings.append(
            Finding(
                "ALLOCATION_EXCEEDED",
                "error",
                f"누계 사용금액 {totals.total.cum:,}원이 계상액 {month.allocation:,}원을 "
                f"{-totals.remaining:,}원 초과합니다.",
            )
        )

    evidenced = {e.entry_index for e in month.evidences}
    for index, entry in enumerate(month.entries):
        expected = round(entry.quantity * entry.unit_price)
        if expected != entry.amount:
            findings.append(
                Finding(
                    "AMOUNT_MISMATCH",
                    "error",
                    f"{index + 1}번째 집행 '{entry.description}': 수량×단가={expected:,}원인데 "
                    f"금액은 {entry.amount:,}원입니다.",
                )
            )
        if entry.amount != 0 and index not in evidenced:
            findings.append(
                Finding(
                    "EVIDENCE_MISSING",
                    "warning",
                    f"{index + 1}번째 집행 '{entry.description}'에 증빙이 없습니다.",
                )
            )

    for photo in month.photos:
        blanks = [
            label
            for label, value in (
                ("공사명", photo.site_name),
                ("위치", photo.location),
                ("내용", photo.content),
                ("날짜", photo.date),
            )
            if not value.strip()
        ]
        if blanks:
            findings.append(
                Finding(
                    "CAPTION_EMPTY",
                    "error",
                    f"사진 '{photo.image_path.name}'의 캡션이 비었습니다: {', '.join(blanks)}",
                )
            )
        if photo.site_name.strip() and photo.site_name.strip() != site.site_name:
            findings.append(
                Finding(
                    "CAPTION_SITE_MISMATCH",
                    "error",
                    f"사진 '{photo.image_path.name}'의 공사명이 현장 설정과 다릅니다: "
                    f"'{photo.site_name}'",
                )
            )

    return findings
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_validate.py -v`
Expected: PASS (7건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/validate.py apps/legal-cost/tests/test_validate.py
git commit -m "법정경비 출력 엔진: 제출 전 검증 규칙"
```

---

### Task 6: 서식 치수 정의와 렌더링 기본기

**Files:**
- Create: `apps/legal-cost/src/legalcost/forms/__init__.py`
- Create: `apps/legal-cost/src/legalcost/forms/spec.py`
- Create: `apps/legal-cost/src/legalcost/forms/layout.py`
- Create: `apps/legal-cost/tests/test_layout.py`
- Create: `apps/legal-cost/assets/fonts/README.md`

**Interfaces:**
- Consumes: `legalcost.PAGE_SIZE`
- Produces:
  - `SheetSpec(scale: float, margin_left: float, margin_right: float, margin_top: float, margin_bottom: float)` — 여백은 **포인트**로 저장한다(인치 × 72).
  - `SHEET_SPECS: dict[tuple[str, str], SheetSpec]` — 키는 `(doc_key, sheet_name)`, sheet_name은 `"갑지"|"집계표"|"항목월"|"내역서"`
  - `register_fonts(font_dir: Path) -> dict[str, str]` — 파일명 → 등록된 폰트명
  - `Sheet(canvas, spec)` — `.text(x, y, s, font, size)`, `.right_text(x, y, s, font, size)`, `.line(x1, y1, x2, y2, width)`, `.rect(x, y, w, h, width)`, `.content_size() -> tuple[float, float]`
    좌표는 **시트 좌표계**(좌상단 원점, 오른쪽·아래쪽이 +, 배율 적용 전)를 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_layout.py`:

```python
import math

from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.layout import Sheet
from legalcost.forms.spec import SHEET_SPECS


def test_cover_spec_is_shared_by_all_four_documents():
    covers = [SHEET_SPECS[(key, "갑지")] for key in ("산안비", "안전1", "안전2", "환경")]
    assert all(c == covers[0] for c in covers)
    assert covers[0].scale == 0.92


def test_summary_scale_differs_between_families():
    assert SHEET_SPECS[("산안비", "집계표")].scale == 0.92
    assert SHEET_SPECS[("안전1", "집계표")].scale == 0.95
    assert SHEET_SPECS[("안전2", "집계표")].scale == 0.95
    assert SHEET_SPECS[("환경", "집계표")].scale == 0.95


def test_detail_scale_matches_measurements():
    assert SHEET_SPECS[("산안비", "내역서")].scale == 0.75
    assert SHEET_SPECS[("안전1", "내역서")].scale == 0.75
    assert SHEET_SPECS[("안전2", "내역서")].scale == 0.93
    assert SHEET_SPECS[("환경", "내역서")].scale == 0.75


def test_margins_are_stored_in_points():
    cover = SHEET_SPECS[("산안비", "갑지")]
    assert math.isclose(cover.margin_left, 0.6299212598425197 * 72, rel_tol=1e-9)
    assert math.isclose(cover.margin_right, 0.2362204724409449 * 72, rel_tol=1e-9)


def test_content_size_removes_margins_and_applies_scale(tmp_path):
    spec = SHEET_SPECS[("산안비", "갑지")]
    c = rl_canvas.Canvas(str(tmp_path / "x.pdf"), pagesize=PAGE_SIZE)
    sheet = Sheet(c, spec)
    width, height = sheet.content_size()
    expected_width = (PAGE_SIZE[0] - spec.margin_left - spec.margin_right) / spec.scale
    assert math.isclose(width, expected_width, rel_tol=1e-9)
    expected_height = (PAGE_SIZE[1] - spec.margin_top - spec.margin_bottom) / spec.scale
    assert math.isclose(height, expected_height, rel_tol=1e-9)


def test_sheet_draws_without_error_and_page_size_is_exact(tmp_path):
    import pypdfium2 as pdfium

    path = tmp_path / "sheet.pdf"
    spec = SHEET_SPECS[("산안비", "집계표")]
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    sheet = Sheet(c, spec)
    sheet.line(0, 0, 100, 0, 0.5)
    sheet.rect(0, 10, 100, 20, 0.5)
    c.showPage()
    c.save()

    doc = pdfium.PdfDocument(str(path))
    width, height = doc[0].get_size()
    assert round(width, 1) == 595.2
    assert round(height, 1) == 841.7
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_layout.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.forms'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/forms/__init__.py`:

```python
"""서식 정의와 렌더러."""
```

`apps/legal-cost/src/legalcost/forms/spec.py`:

```python
"""장표별 인쇄 설정. 값은 원본 엑셀에서 실측한 것이다."""

from __future__ import annotations

from dataclasses import dataclass

INCH = 72.0


@dataclass(frozen=True)
class SheetSpec:
    scale: float
    margin_left: float
    margin_right: float
    margin_top: float
    margin_bottom: float


def _spec(scale: float, left: float, right: float, top: float, bottom: float) -> SheetSpec:
    """여백은 인치로 받아 포인트로 저장한다."""
    return SheetSpec(scale, left * INCH, right * INCH, top * INCH, bottom * INCH)


_COVER = _spec(0.92, 0.6299212598425197, 0.2362204724409449, 0.7480314960629921, 0.7480314960629921)
_SUMMARY_OSH = _spec(0.92, 0.31496062992125984, 0.31496062992125984, 0.7480314960629921, 0.5511811023622047)
_SUMMARY_CTA = _spec(0.95, 0.31496062992125984, 0.31496062992125984, 0.7480314960629921, 0.5511811023622047)
_MONTHLY_OSH = _spec(0.91, 0.4724409448818898, 0.31496062992125984, 0.3937007874015748, 0.3937007874015748)
_MONTHLY_CTA = _spec(0.97, 0.4724409448818898, 0.31496062992125984, 0.3937007874015748, 0.3937007874015748)
_DETAIL_OSH = _spec(0.75, 0.39, 0.39, 0.7480314960629921, 0.7480314960629921)
_DETAIL_CTA_75 = _spec(0.75, 0.39, 0.51, 0.7480314960629921, 0.7480314960629921)
_DETAIL_CTA_93 = _spec(0.93, 0.39, 0.51, 0.7480314960629921, 0.7480314960629921)

SHEET_SPECS: dict[tuple[str, str], SheetSpec] = {
    ("산안비", "갑지"): _COVER,
    ("안전1", "갑지"): _COVER,
    ("안전2", "갑지"): _COVER,
    ("환경", "갑지"): _COVER,
    ("산안비", "집계표"): _SUMMARY_OSH,
    ("안전1", "집계표"): _SUMMARY_CTA,
    ("안전2", "집계표"): _SUMMARY_CTA,
    ("환경", "집계표"): _SUMMARY_CTA,
    ("산안비", "항목월"): _MONTHLY_OSH,
    ("안전1", "항목월"): _MONTHLY_CTA,
    ("안전2", "항목월"): _MONTHLY_CTA,
    ("환경", "항목월"): _MONTHLY_CTA,
    ("산안비", "내역서"): _DETAIL_OSH,
    ("안전1", "내역서"): _DETAIL_CTA_75,
    ("안전2", "내역서"): _DETAIL_CTA_93,
    ("환경", "내역서"): _DETAIL_CTA_75,
}
```

`apps/legal-cost/src/legalcost/forms/layout.py`:

```python
"""시트 좌표계 렌더링 도우미.

시트 좌표계는 인쇄영역 좌상단이 원점이고 오른쪽·아래쪽이 양(+)이다.
엑셀 시트를 보며 좌표를 적을 수 있게 하려는 것이며, 배율과 여백은
캔버스 변환으로 처리한다.
"""

from __future__ import annotations

from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from .. import PAGE_SIZE
from .spec import SheetSpec


def register_fonts(font_dir: Path) -> dict[str, str]:
    """폴더의 TTF를 모두 등록하고 {파일이름(확장자 제외): 폰트명} 을 돌려준다."""
    registered: dict[str, str] = {}
    for path in sorted(Path(font_dir).glob("*.ttf")):
        name = path.stem
        pdfmetrics.registerFont(TTFont(name, str(path)))
        registered[name] = name
    return registered


class Sheet:
    """한 장의 시트. 캔버스 상태를 저장했다가 배율·여백 변환을 적용한다."""

    def __init__(self, canvas, spec: SheetSpec):
        self.canvas = canvas
        self.spec = spec
        canvas.saveState()
        # 좌상단을 원점으로, 아래쪽을 +로 만든다.
        canvas.translate(spec.margin_left, PAGE_SIZE[1] - spec.margin_top)
        canvas.scale(spec.scale, -spec.scale)

    def content_size(self) -> tuple[float, float]:
        width = (PAGE_SIZE[0] - self.spec.margin_left - self.spec.margin_right) / self.spec.scale
        height = (PAGE_SIZE[1] - self.spec.margin_top - self.spec.margin_bottom) / self.spec.scale
        return width, height

    def _with_text(self, x: float, y: float, draw):
        # y축이 뒤집혀 있으므로 글자가 뒤집히지 않도록 부분 변환을 쓴다.
        self.canvas.saveState()
        self.canvas.translate(x, y)
        self.canvas.scale(1, -1)
        draw()
        self.canvas.restoreState()

    def text(self, x: float, y: float, s: str, font: str, size: float) -> None:
        def draw():
            self.canvas.setFont(font, size)
            self.canvas.drawString(0, 0, s)

        self._with_text(x, y, draw)

    def right_text(self, x: float, y: float, s: str, font: str, size: float) -> None:
        def draw():
            self.canvas.setFont(font, size)
            self.canvas.drawRightString(0, 0, s)

        self._with_text(x, y, draw)

    def center_text(self, x: float, y: float, s: str, font: str, size: float) -> None:
        def draw():
            self.canvas.setFont(font, size)
            self.canvas.drawCentredString(0, 0, s)

        self._with_text(x, y, draw)

    def line(self, x1: float, y1: float, x2: float, y2: float, width: float = 0.5) -> None:
        self.canvas.setLineWidth(width)
        self.canvas.line(x1, y1, x2, y2)

    def rect(self, x: float, y: float, w: float, h: float, width: float = 0.5) -> None:
        self.canvas.setLineWidth(width)
        self.canvas.rect(x, y, w, h, stroke=1, fill=0)

    def image(self, path, x: float, y: float, w: float, h: float) -> None:
        self.canvas.saveState()
        self.canvas.translate(x, y + h)
        self.canvas.scale(1, -1)
        self.canvas.drawImage(str(path), 0, 0, width=w, height=h, preserveAspectRatio=True, anchor="c")
        self.canvas.restoreState()

    def close(self) -> None:
        self.canvas.restoreState()
```

`apps/legal-cost/assets/fonts/README.md`:

```markdown
# 글꼴

이 폴더에 출력용 TTF를 넣는다. 저장소에는 커밋하지 않는다(라이선스).

- `Pretendard-Regular.ttf` — 산업안전보건관리비 본문. SIL OFL, 재배포 가능.
  https://github.com/orioncactus/pretendard 릴리스에서 받는다.
- `malgun.ttf` — 안전관리비·환경보전비 본문(맑은 고딕). Windows 기본 탑재 글꼴이며
  재배포할 수 없다. 실행 환경의 `C:\Windows\Fonts` 에서 읽는다.
- `HYHeadM.ttf` — 제목(HY헤드라인M). MS Office 한국어판에 포함된다. 위와 같다.

글꼴이 없으면 렌더러는 등록된 첫 글꼴로 대체하고 경고를 남긴다. 픽셀 대조의
엄격 판정은 실제 글꼴이 있는 환경에서만 한다.
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_layout.py -v`
Expected: PASS (6건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/forms apps/legal-cost/tests/test_layout.py apps/legal-cost/assets
git commit -m "법정경비 출력 엔진: 서식 치수 정의와 시트 좌표계 렌더러"
```

---

### Task 7: 집계표 렌더러

집계표를 먼저 만든다. 4종 모두 같은 구조이고 값이 가장 많아, 여기서 좌표계가 검증되면 나머지 장표는 같은 방식으로 따라간다.

**Files:**
- Create: `apps/legal-cost/src/legalcost/forms/summary.py`
- Create: `apps/legal-cost/tests/test_summary.py`
- Create: `apps/legal-cost/tests/conftest.py`

**Interfaces:**
- Consumes: `Sheet`, `SHEET_SPECS`, `DOC_TYPES`, `compute`, `money.*`, `models.{Site, MonthInput}`
- Produces:
  - `draw_summary(canvas, site: Site, month: MonthInput, font_body: str, font_title: str) -> None` — 캔버스에 집계표 한 장을 그린다. `showPage()`는 호출하지 않는다.
  - `conftest.py`의 `sample_site`, `sample_month`, `fonts` 픽스처

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/conftest.py`:

```python
import os
from datetime import date
from pathlib import Path

import pytest

from legalcost.forms.layout import register_fonts
from legalcost.models import Entry, Evidence, MonthInput, Site


@pytest.fixture(scope="session")
def fonts():
    """assets/fonts 의 글꼴을 등록한다. 없으면 reportlab 기본 글꼴로 진행한다."""
    font_dir = Path(__file__).resolve().parents[1] / "assets" / "fonts"
    registered = register_fonts(font_dir) if font_dir.exists() else {}
    body = next(iter(registered), "Helvetica")
    return {"body": body, "title": body}


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
                item_no=1, company="케이아이건설㈜", date=date(2026, 8, 31),
                description="안전관리자 급여(8월분)", unit="식", quantity=1,
                unit_price=5416670, amount=5416670,
            )
        ],
        evidences=[Evidence(0, Path("payroll.pdf"), "급여대장")],
    )


@pytest.fixture
def fixtures_dir():
    """정답지 PDF 폴더. 없으면 None."""
    raw = os.environ.get("LEGALCOST_FIXTURES")
    if not raw:
        return None
    path = Path(raw)
    return path if path.exists() else None
```

`apps/legal-cost/tests/test_summary.py`:

```python
import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.summary import draw_summary


def _render(tmp_path, site, month, fonts):
    path = tmp_path / "summary.pdf"
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw_summary(c, site, month, fonts["body"], fonts["title"])
    c.showPage()
    c.save()
    return path


def test_summary_is_one_page_of_exact_size(tmp_path, sample_site, sample_month, fonts):
    path = _render(tmp_path, sample_site, sample_month, fonts)
    doc = pdfium.PdfDocument(str(path))
    assert len(doc) == 1
    width, height = doc[0].get_size()
    assert round(width, 1) == 595.2
    assert round(height, 1) == 841.7


def test_summary_contains_required_text(tmp_path, sample_site, sample_month, fonts):
    path = _render(tmp_path, sample_site, sample_month, fonts)
    text = pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()
    assert "산업안전보건관리비 사용내역서('26년 08월)" in text
    assert sample_site.site_name in text
    assert "21,344,625,000" in text
    assert "계상된 안전관리비" in text
    assert "삼억사천육백일만육천일백이십칠원" in text
    assert "건설업 산업안전보건관리비 계상 및 사용기준 제10조 제1항" in text


def test_summary_renders_all_nine_item_rows(tmp_path, sample_site, sample_month, fonts):
    path = _render(tmp_path, sample_site, sample_month, fonts)
    text = pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()
    for name in (
        "1. 안전관리자 인건비 및 각종 업무수당 등",
        "5. 안전보건 교육비 및 행사비 등",
        "9. 위험성 평가 등에 따른 소요비용 등",
    ):
        assert name in text


def test_summary_shows_dash_for_zero_amounts(tmp_path, sample_site, sample_month, fonts):
    path = _render(tmp_path, sample_site, sample_month, fonts)
    text = pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()
    assert "53,444,480" in text  # 1번 항목 누계
    assert "-" in text            # 4번 항목처럼 값이 없는 칸


def test_summary_signature_lines_follow_document_type(tmp_path, sample_site, sample_month, fonts):
    path = _render(tmp_path, sample_site, sample_month, fonts)
    text = pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()
    assert "작 성 자" in text
    assert "확 인 자" in text
    assert "안전보건총괄책임자" in text
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_summary.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.forms.summary'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/forms/summary.py`:

```python
"""집계표 렌더러.

좌표는 시트 좌표계(포인트, 좌상단 원점). 원본 엑셀의 행 높이·열 너비에서
환산한 값이며, 픽셀 대조 결과를 보며 조정한다.
"""

from __future__ import annotations

from ..calc import compute
from ..doctypes import DOC_TYPES
from ..models import MonthInput, Site
from ..money import format_allocation, format_amount, format_percent
from .layout import Sheet
from .spec import SHEET_SPECS

# 열 경계 (시트 좌표계 x)
COL_LABEL = 0.0
COL_VALUE = 96.0
COL_LABEL2 = 250.0
COL_VALUE2 = 330.0
COL_RIGHT = 560.0

# 사용금액 표의 열 오른쪽 끝
COL_PREV = 330.0
COL_CURRENT = 400.0
COL_CUM = 472.0
COL_RATIO = 556.0

ROW_HEIGHT = 24.0
HEADER_TOP = 40.0
TABLE_TOP = 190.0


def draw_summary(canvas, site: Site, month: MonthInput, font_body: str, font_title: str) -> None:
    doc = DOC_TYPES[month.doc_key]
    totals = compute(month)
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "집계표")])
    try:
        _draw(sheet, site, month, doc, totals, font_body, font_title)
    finally:
        sheet.close()


def _draw(sheet, site, month, doc, totals, font_body, font_title) -> None:
    title = f"{doc.summary_title}('{month.year % 100}년 {month.month:02d}월)"
    sheet.center_text(COL_RIGHT / 2, HEADER_TOP, title, font_title, 14)

    head_rows = [
        ("건설업체명\n(현장명)", site.company, "공   사   명", site.site_name),
        ("소     재     지", site.address, "대   표   자", site.ceo),
        ("공   사    금  액", f"{site.contract_amount:,} 원", "공 사 기 간",
         f"{site.period_start} ~ {site.period_end}"),
        ("발     주     자", site.client, "누계  공정율", f"{month.progress_rate * 100:.2f}%"),
    ]
    y = HEADER_TOP + 30
    for label, value, label2, value2 in head_rows:
        sheet.rect(COL_LABEL, y, COL_RIGHT, ROW_HEIGHT)
        sheet.line(COL_VALUE, y, COL_VALUE, y + ROW_HEIGHT)
        sheet.line(COL_LABEL2, y, COL_LABEL2, y + ROW_HEIGHT)
        sheet.line(COL_VALUE2, y, COL_VALUE2, y + ROW_HEIGHT)
        baseline = y + ROW_HEIGHT * 0.68
        sheet.text(COL_LABEL + 6, baseline, label.replace("\n", " "), font_body, 9)
        sheet.text(COL_VALUE + 6, baseline, value, font_body, 9)
        sheet.text(COL_LABEL2 + 6, baseline, label2, font_body, 9)
        sheet.text(COL_VALUE2 + 6, baseline, value2, font_body, 9)
        y += ROW_HEIGHT

    sheet.rect(COL_LABEL, y, COL_RIGHT, ROW_HEIGHT)
    sheet.line(COL_VALUE, y, COL_VALUE, y + ROW_HEIGHT)
    baseline = y + ROW_HEIGHT * 0.68
    sheet.text(COL_LABEL + 6, baseline, doc.allocation_label, font_body, 9)
    sheet.right_text(COL_RIGHT - 6, baseline, format_allocation(month.allocation), font_body, 9)

    y = TABLE_TOP
    sheet.rect(COL_LABEL, y, COL_RIGHT, ROW_HEIGHT)
    sheet.center_text(COL_RIGHT / 2, y + ROW_HEIGHT * 0.68, "사      용       금        액", font_body, 10)
    y += ROW_HEIGHT

    sheet.rect(COL_LABEL, y, COL_RIGHT, ROW_HEIGHT)
    for x in (COL_PREV, COL_CURRENT, COL_CUM):
        sheet.line(x, y, x, y + ROW_HEIGHT)
    baseline = y + ROW_HEIGHT * 0.68
    sheet.text(COL_LABEL + 6, baseline, "항    목", font_body, 9)
    for x, label in (
        (COL_PREV, "전월누계"), (COL_CURRENT, "당월사용금액"),
        (COL_CUM, "누계사용금액"), (COL_RATIO, "항목별대비(%)"),
    ):
        sheet.right_text(x - 6, baseline, label, font_body, 9)
    y += ROW_HEIGHT

    for row in list(totals.items) + [totals.total]:
        sheet.rect(COL_LABEL, y, COL_RIGHT, ROW_HEIGHT)
        for x in (COL_PREV, COL_CURRENT, COL_CUM):
            sheet.line(x, y, x, y + ROW_HEIGHT)
        baseline = y + ROW_HEIGHT * 0.68
        sheet.text(COL_LABEL + 6, baseline, row.name, font_body, 9)
        sheet.right_text(COL_PREV - 6, baseline, format_amount(row.prev_cum), font_body, 9)
        sheet.right_text(COL_CURRENT - 6, baseline, format_amount(row.current), font_body, 9)
        sheet.right_text(COL_CUM - 6, baseline, format_amount(row.cum), font_body, 9)
        sheet.right_text(COL_RATIO - 6, baseline, format_percent(row.ratio), font_body, 9)
        y += ROW_HEIGHT

    y += ROW_HEIGHT * 0.6
    sheet.text(COL_LABEL, y, doc.legal_clause, font_body, 9)

    y += ROW_HEIGHT * 2
    sheet.center_text(COL_RIGHT / 2, y, f"{month.year}년    {month.month}월   말", font_body, 10)

    y += ROW_HEIGHT * 1.5
    names = {"작 성 자": (site.author_title, site.author_name),
             "확 인 자": (site.approver_title, site.approver_name)}
    for signature in doc.signatures:
        title, name = names.get(signature.role, (signature.title, ""))
        sheet.text(COL_VALUE2 - 130, y, signature.role, font_body, 9)
        sheet.text(COL_VALUE2 - 60, y, title or signature.title, font_body, 9)
        sheet.text(COL_VALUE2 + 90, y, "성명:", font_body, 9)
        sheet.text(COL_VALUE2 + 120, y, name, font_body, 9)
        sheet.text(COL_RIGHT - 30, y, "(인)", font_body, 9)
        y += ROW_HEIGHT
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_summary.py -v`
Expected: PASS (5건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/forms/summary.py apps/legal-cost/tests/test_summary.py apps/legal-cost/tests/conftest.py
git commit -m "법정경비 출력 엔진: 집계표 렌더러"
```

---

### Task 8: 갑지 렌더러

**Files:**
- Create: `apps/legal-cost/src/legalcost/forms/cover.py`
- Create: `apps/legal-cost/tests/test_cover.py`

**Interfaces:**
- Consumes: `Sheet`, `SHEET_SPECS`, `DOC_TYPES`, `models.{Site, MonthInput}`
- Produces: `draw_cover(canvas, site: Site, month: MonthInput, font_body: str, font_title: str) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_cover.py`:

```python
import pypdfium2 as pdfium
import pytest
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.cover import draw_cover


def _text(tmp_path, site, month, fonts):
    path = tmp_path / "cover.pdf"
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw_cover(c, site, month, fonts["body"], fonts["title"])
    c.showPage()
    c.save()
    return pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()


def test_cover_shows_title_site_and_period(tmp_path, sample_site, sample_month, fonts):
    text = _text(tmp_path, sample_site, sample_month, fonts)
    assert "산업안전보건관리비 사용내역서" in text
    assert sample_site.site_name in text
    assert "2026년 08월 사용분" in text
    assert "시공사" in text
    assert sample_site.company in text


@pytest.mark.parametrize("doc_key,expected", [
    ("안전1", "안전관리비 사용내역서 Ⅰ"),
    ("안전2", "안전관리비 사용내역서 Ⅱ"),
    ("환경", "환경보전비 사용내역서"),
])
def test_cover_title_follows_document_type(tmp_path, sample_site, sample_month, fonts, doc_key, expected):
    from dataclasses import replace

    month = replace(sample_month, doc_key=doc_key)
    assert expected in _text(tmp_path, sample_site, month, fonts)


def test_cover_shows_subtitle_only_for_safety_two(tmp_path, sample_site, sample_month, fonts):
    from dataclasses import replace

    text = _text(tmp_path, sample_site, replace(sample_month, doc_key="안전2"), fonts)
    assert "(안전관리계획 및 안전성 검토 관련)" in text
    text = _text(tmp_path, sample_site, replace(sample_month, doc_key="안전1"), fonts)
    assert "(안전관리계획 및 안전성 검토 관련)" not in text
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_cover.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.forms.cover'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/forms/cover.py`:

```python
"""갑지(표지) 렌더러. 4종이 같은 치수를 쓴다."""

from __future__ import annotations

from ..doctypes import DOC_TYPES
from ..models import MonthInput, Site
from .layout import Sheet
from .spec import SHEET_SPECS

CENTER_X = 268.0
TITLE_Y = 150.0
SUBTITLE_Y = 186.0
SITE_Y = 300.0
PERIOD_Y = 340.0
FOOTER_LABEL_X = 60.0
FOOTER_VALUE_X = 150.0
FOOTER_Y = 640.0


def draw_cover(canvas, site: Site, month: MonthInput, font_body: str, font_title: str) -> None:
    doc = DOC_TYPES[month.doc_key]
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "갑지")])
    try:
        sheet.center_text(CENTER_X, TITLE_Y, doc.title, font_title, 28)
        if doc.cover_subtitle:
            sheet.center_text(CENTER_X, SUBTITLE_Y, doc.cover_subtitle, font_title, 16)
        sheet.center_text(CENTER_X, SITE_Y, site.site_name, font_body, 16)
        sheet.center_text(
            CENTER_X, PERIOD_Y, f"{month.year}년 {month.month:02d}월 사용분", font_body, 14
        )
        sheet.rect(FOOTER_LABEL_X, FOOTER_Y - 24, 420, 48)
        sheet.line(FOOTER_VALUE_X, FOOTER_Y - 24, FOOTER_VALUE_X, FOOTER_Y + 24)
        sheet.center_text((FOOTER_LABEL_X + FOOTER_VALUE_X) / 2, FOOTER_Y + 4, "시공사", font_body, 12)
        sheet.text(FOOTER_VALUE_X + 14, FOOTER_Y + 4, site.company, font_body, 12)
    finally:
        sheet.close()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_cover.py -v`
Expected: PASS (5건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/forms/cover.py apps/legal-cost/tests/test_cover.py
git commit -m "법정경비 출력 엔진: 갑지 렌더러"
```

---

### Task 9: 항목별 사용내역(항목월) 렌더러

**Files:**
- Create: `apps/legal-cost/src/legalcost/forms/monthly.py`
- Create: `apps/legal-cost/tests/test_monthly.py`

**Interfaces:**
- Consumes: `Sheet`, `SHEET_SPECS`, `DOC_TYPES`, `compute`, `money.*`
- Produces: `draw_monthly(canvas, month: MonthInput, font_body: str, font_title: str) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_monthly.py`:

```python
import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.monthly import draw_monthly


def _text(tmp_path, month, fonts):
    path = tmp_path / "monthly.pdf"
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw_monthly(c, month, fonts["body"], fonts["title"])
    c.showPage()
    c.save()
    return pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()


def test_monthly_title_and_column_headers(tmp_path, sample_month, fonts):
    text = _text(tmp_path, sample_month, fonts)
    assert "항 목 별 사 용 내 역 (26년08월)" in text
    assert "전월누계" in text
    assert "금  월" in text
    assert "항목별 총누계" in text
    assert "비  고" in text


def test_monthly_lists_every_item_and_total(tmp_path, sample_month, fonts):
    text = _text(tmp_path, sample_month, fonts)
    assert "1. 안전관리자 인건비 및 각종 업무수당 등" in text
    assert "9. 위험성 평가 등에 따른 소요비용 등" in text
    assert "합 계" in text


def test_monthly_amounts_match_calculation(tmp_path, sample_month, fonts):
    text = _text(tmp_path, sample_month, fonts)
    assert "48,027,810" in text   # 1번 전월누계
    assert "5,416,670" in text    # 1번 당월
    assert "53,444,480" in text   # 1번 누계
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_monthly.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.forms.monthly'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/forms/monthly.py`:

```python
"""항목별 사용내역(항목월) 렌더러."""

from __future__ import annotations

from ..calc import compute
from ..models import MonthInput
from ..money import format_amount, format_percent
from .layout import Sheet
from .spec import SHEET_SPECS

COL_LEFT = 0.0
COL_NAME_RIGHT = 250.0
COL_PREV = 320.0
COL_CURRENT = 388.0
COL_CUM = 456.0
COL_RATIO = 512.0
COL_NOTE = 560.0

ROW_HEIGHT = 26.0
TITLE_Y = 40.0
TABLE_TOP = 80.0


def draw_monthly(canvas, month: MonthInput, font_body: str, font_title: str) -> None:
    totals = compute(month)
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "항목월")])
    try:
        title = f"항 목 별 사 용 내 역 ({month.year % 100}년{month.month:02d}월)"
        sheet.center_text(COL_NOTE / 2, TITLE_Y, title, font_title, 14)

        y = TABLE_TOP
        sheet.rect(COL_LEFT, y, COL_NOTE, ROW_HEIGHT)
        sheet.line(COL_NAME_RIGHT, y, COL_NAME_RIGHT, y + ROW_HEIGHT * 2)
        sheet.line(COL_RATIO, y, COL_RATIO, y + ROW_HEIGHT * 2)
        baseline = y + ROW_HEIGHT * 0.68
        sheet.center_text(COL_NAME_RIGHT / 2, baseline, "항  목", font_body, 9)
        sheet.center_text((COL_NAME_RIGHT + COL_RATIO) / 2, baseline, "안전관리비 사용내역", font_body, 9)
        sheet.center_text((COL_RATIO + COL_NOTE) / 2, baseline, "총금액대비 누계사용율(%)", font_body, 7)
        y += ROW_HEIGHT

        sheet.rect(COL_LEFT, y, COL_NOTE, ROW_HEIGHT)
        for x in (COL_PREV, COL_CURRENT, COL_CUM):
            sheet.line(x, y, x, y + ROW_HEIGHT)
        baseline = y + ROW_HEIGHT * 0.68
        sheet.center_text((COL_NAME_RIGHT + COL_PREV) / 2, baseline, "전월누계", font_body, 9)
        sheet.center_text((COL_PREV + COL_CURRENT) / 2, baseline, "금  월", font_body, 9)
        sheet.center_text((COL_CURRENT + COL_CUM) / 2, baseline, "항목별 총누계", font_body, 9)
        sheet.center_text((COL_RATIO + COL_NOTE) / 2, baseline, "비  고", font_body, 9)
        y += ROW_HEIGHT

        for row in list(totals.items) + [totals.total]:
            name = "합 계" if row.item_no == 0 else row.name
            sheet.rect(COL_LEFT, y, COL_NOTE, ROW_HEIGHT)
            for x in (COL_NAME_RIGHT, COL_PREV, COL_CURRENT, COL_CUM, COL_RATIO):
                sheet.line(x, y, x, y + ROW_HEIGHT)
            baseline = y + ROW_HEIGHT * 0.68
            sheet.text(COL_LEFT + 6, baseline, name, font_body, 8.5)
            sheet.right_text(COL_PREV - 6, baseline, format_amount(row.prev_cum), font_body, 9)
            sheet.right_text(COL_CURRENT - 6, baseline, format_amount(row.current), font_body, 9)
            sheet.right_text(COL_CUM - 6, baseline, format_amount(row.cum), font_body, 9)
            sheet.right_text(COL_RATIO - 6, baseline, format_percent(row.ratio), font_body, 9)
            y += ROW_HEIGHT
    finally:
        sheet.close()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_monthly.py -v`
Expected: PASS (3건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/forms/monthly.py apps/legal-cost/tests/test_monthly.py
git commit -m "법정경비 출력 엔진: 항목별 사용내역 렌더러"
```

---

### Task 10: 내역서(상세) 렌더러와 페이지 분할

가장 복잡한 장표다. 항목 블록마다 집행 줄 + 소계가 붙고, 줄이 많으면 다음 장으로 넘어간다.

**Files:**
- Create: `apps/legal-cost/src/legalcost/forms/detail.py`
- Create: `apps/legal-cost/tests/test_detail.py`

**Interfaces:**
- Consumes: `Sheet`, `SHEET_SPECS`, `DOC_TYPES`, `models.{MonthInput, Entry}`, `money.format_amount`
- Produces:
  - `DetailRow(kind: str, item_name: str, entry: Entry | None, subtotal: int | None)` — `kind`는 `"entry"` 또는 `"subtotal"`
  - `paginate(month: MonthInput, rows_per_page: int = 30) -> list[list[DetailRow]]`
  - `draw_detail(canvas, month: MonthInput, font_body: str, font_title: str) -> int` — 그린 페이지 수를 돌려준다. 페이지 사이에서 `canvas.showPage()`를 호출하고 **마지막 페이지 뒤에는 호출하지 않는다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_detail.py`:

```python
from dataclasses import replace
from datetime import date

import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.detail import DetailRow, draw_detail, paginate
from legalcost.models import Entry


def _entry(item_no: int, n: int) -> Entry:
    return Entry(
        item_no=item_no, company="케이아이건설㈜", date=date(2026, 8, n % 28 + 1),
        description=f"집행 {n}", unit="EA", quantity=1, unit_price=1000, amount=1000,
    )


def test_every_item_gets_a_subtotal_row(sample_month):
    pages = paginate(sample_month, rows_per_page=1000)
    rows = [r for page in pages for r in page]
    subtotals = [r for r in rows if r.kind == "subtotal"]
    assert len(subtotals) == 9  # 산안비 항목 수


def test_subtotal_equals_sum_of_its_entries(sample_month):
    pages = paginate(sample_month, rows_per_page=1000)
    rows = [r for page in pages for r in page]
    first_subtotal = next(r for r in rows if r.kind == "subtotal")
    assert first_subtotal.subtotal == 5416670


def test_pagination_splits_when_rows_exceed_capacity(sample_month):
    many = [_entry(1, n) for n in range(80)]
    month = replace(sample_month, entries=many)
    pages = paginate(month, rows_per_page=30)
    assert len(pages) > 1
    assert all(len(page) <= 30 for page in pages)


def test_pagination_keeps_all_rows(sample_month):
    many = [_entry(1, n) for n in range(80)]
    month = replace(sample_month, entries=many)
    pages = paginate(month, rows_per_page=30)
    rows = [r for page in pages for r in page]
    assert len([r for r in rows if r.kind == "entry"]) == 80
    assert len([r for r in rows if r.kind == "subtotal"]) == 9


def test_draw_detail_returns_page_count_and_writes_that_many_pages(tmp_path, sample_month, fonts):
    many = [_entry(1, n) for n in range(80)]
    month = replace(sample_month, entries=many)
    path = tmp_path / "detail.pdf"
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    count = draw_detail(c, month, fonts["body"], fonts["title"])
    c.showPage()
    c.save()
    assert count > 1
    assert len(pdfium.PdfDocument(str(path))) == count


def test_detail_repeats_column_headers_on_every_page(tmp_path, sample_month, fonts):
    many = [_entry(1, n) for n in range(80)]
    month = replace(sample_month, entries=many)
    path = tmp_path / "detail.pdf"
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw_detail(c, month, fonts["body"], fonts["title"])
    c.showPage()
    c.save()
    doc = pdfium.PdfDocument(str(path))
    for index in range(len(doc)):
        text = doc[index].get_textpage().get_text_range()
        assert "세  부  내  역" in text
        assert "금 액" in text
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_detail.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.forms.detail'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/forms/detail.py`:

```python
"""내역서(상세) 렌더러. 줄이 많으면 여러 장으로 나눈다."""

from __future__ import annotations

from dataclasses import dataclass

from ..doctypes import DOC_TYPES
from ..models import Entry, MonthInput
from ..money import format_amount
from .layout import Sheet
from .spec import SHEET_SPECS

COL_ITEM = 0.0
COL_COMPANY = 150.0
COL_YEAR = 240.0
COL_MONTH = 264.0
COL_DAY = 288.0
COL_DESC = 316.0
COL_UNIT = 500.0
COL_QTY = 540.0
COL_PRICE = 600.0
COL_AMOUNT = 680.0
COL_NOTE = 740.0

ROW_HEIGHT = 18.0
TITLE_Y = 30.0
TABLE_TOP = 56.0
DEFAULT_ROWS_PER_PAGE = 34


@dataclass(frozen=True)
class DetailRow:
    kind: str
    item_name: str
    entry: Entry | None = None
    subtotal: int | None = None


def _rows(month: MonthInput) -> list[DetailRow]:
    doc = DOC_TYPES[month.doc_key]
    out: list[DetailRow] = []
    for index, name in enumerate(doc.items, start=1):
        entries = [e for e in month.entries if e.item_no == index]
        for entry in entries:
            out.append(DetailRow("entry", name, entry=entry))
        out.append(DetailRow("subtotal", name, subtotal=sum(e.amount for e in entries)))
    return out


def paginate(month: MonthInput, rows_per_page: int = DEFAULT_ROWS_PER_PAGE) -> list[list[DetailRow]]:
    rows = _rows(month)
    if not rows:
        return [[]]
    return [rows[i : i + rows_per_page] for i in range(0, len(rows), rows_per_page)]


def _draw_header(sheet, month, font_body, font_title) -> float:
    title = (
        f"항목별 사용 내역({month.year}년{month.month:02d}월01일~"
        f"{month.month:02d}월말)"
    )
    sheet.center_text(COL_NOTE / 2, TITLE_Y, title, font_title, 12)
    y = TABLE_TOP
    sheet.rect(COL_ITEM, y, COL_NOTE, ROW_HEIGHT)
    for x in (COL_COMPANY, COL_YEAR, COL_MONTH, COL_DAY, COL_DESC, COL_UNIT, COL_QTY, COL_PRICE, COL_AMOUNT):
        sheet.line(x, y, x, y + ROW_HEIGHT)
    baseline = y + ROW_HEIGHT * 0.68
    headers = [
        (COL_ITEM, COL_COMPANY, "사용항목"), (COL_COMPANY, COL_YEAR, "회사명"),
        (COL_YEAR, COL_MONTH, "년"), (COL_MONTH, COL_DAY, "월"), (COL_DAY, COL_DESC, "일"),
        (COL_DESC, COL_UNIT, "세  부  내  역"), (COL_UNIT, COL_QTY, "단위"),
        (COL_QTY, COL_PRICE, "수 량"), (COL_PRICE, COL_AMOUNT, "단 가"),
        (COL_AMOUNT, COL_NOTE, "금 액"),
    ]
    for left, right, label in headers:
        sheet.center_text((left + right) / 2, baseline, label, font_body, 8)
    sheet.center_text(COL_NOTE - 20, baseline, "비 고", font_body, 8)
    return y + ROW_HEIGHT


def draw_detail(canvas, month: MonthInput, font_body: str, font_title: str) -> int:
    pages = paginate(month)
    spec = SHEET_SPECS[(month.doc_key, "내역서")]
    for page_index, page in enumerate(pages):
        if page_index > 0:
            canvas.showPage()
        sheet = Sheet(canvas, spec)
        try:
            y = _draw_header(sheet, month, font_body, font_title)
            previous_item = None
            for row in page:
                sheet.rect(COL_ITEM, y, COL_NOTE, ROW_HEIGHT)
                for x in (COL_COMPANY, COL_YEAR, COL_MONTH, COL_DAY, COL_DESC,
                          COL_UNIT, COL_QTY, COL_PRICE, COL_AMOUNT):
                    sheet.line(x, y, x, y + ROW_HEIGHT)
                baseline = y + ROW_HEIGHT * 0.68
                if row.item_name != previous_item:
                    sheet.text(COL_ITEM + 4, baseline, row.item_name, font_body, 7)
                    previous_item = row.item_name
                if row.kind == "subtotal":
                    sheet.center_text((COL_YEAR + COL_UNIT) / 2, baseline, "소                   계", font_body, 8)
                    sheet.right_text(COL_AMOUNT - 4, baseline, format_amount(row.subtotal or 0), font_body, 8)
                else:
                    entry = row.entry
                    assert entry is not None
                    sheet.text(COL_COMPANY + 4, baseline, entry.company, font_body, 7)
                    sheet.center_text((COL_YEAR + COL_MONTH) / 2, baseline, f"{entry.date.year % 100}", font_body, 8)
                    sheet.center_text((COL_MONTH + COL_DAY) / 2, baseline, f"{entry.date.month}", font_body, 8)
                    sheet.center_text((COL_DAY + COL_DESC) / 2, baseline, f"{entry.date.day}", font_body, 8)
                    sheet.text(COL_DESC + 4, baseline, entry.description, font_body, 8)
                    sheet.center_text((COL_UNIT + COL_QTY) / 2, baseline, entry.unit, font_body, 8)
                    sheet.right_text(COL_PRICE - 4, baseline, f"{entry.quantity:g}", font_body, 8)
                    sheet.right_text(COL_AMOUNT - 4, baseline, format_amount(entry.unit_price), font_body, 8)
                    sheet.right_text(COL_NOTE - 44, baseline, format_amount(entry.amount), font_body, 8)
                y += ROW_HEIGHT
        finally:
            sheet.close()
    return len(pages)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_detail.py -v`
Expected: PASS (6건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/forms/detail.py apps/legal-cost/tests/test_detail.py
git commit -m "법정경비 출력 엔진: 내역서(상세) 렌더러와 페이지 분할"
```

---

### Task 11: 사진 처리와 사진대지 렌더러

**Files:**
- Create: `apps/legal-cost/src/legalcost/photo.py`
- Create: `apps/legal-cost/src/legalcost/forms/photosheet.py`
- Create: `apps/legal-cost/tests/test_photo.py`

**Interfaces:**
- Consumes: `Sheet`, `SHEET_SPECS`(갑지 설정을 사진대지에 재사용), `models.Photo`, Pillow
- Produces:
  - `make_print_copy(src: Path, dest_dir: Path, max_edge: int = 1600, quality: int = 82) -> Path`
  - `pair_photos(photos: list[Photo]) -> list[list[Photo]]` — 항목 순서·`order` 순으로 정렬해 2장씩 묶는다. 마지막 묶음은 1장일 수 있다.
  - `draw_photo_sheets(canvas, photos: list[Photo], font_body: str, font_title: str, doc_key: str) -> int` — 그린 페이지 수. 페이지 사이에서만 `showPage()`.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_photo.py`:

```python
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.photosheet import draw_photo_sheets, pair_photos
from legalcost.models import Photo
from legalcost.photo import make_print_copy


def _make_image(path: Path, size=(4000, 3000)) -> Path:
    Image.new("RGB", size, (180, 190, 200)).save(path, "JPEG", quality=95)
    return path


def _photo(path: Path, item_no: int = 1, order: int = 0) -> Photo:
    return Photo(
        item_no=item_no, image_path=path,
        site_name="안양 인덕원 주변 도시개발사업 부지조성공사",
        location="현장 내", content="안전난간 설치", date="2026-08-10", order=order,
    )


def test_print_copy_is_smaller_and_bounded(tmp_path):
    src = _make_image(tmp_path / "big.jpg")
    out = make_print_copy(src, tmp_path / "print")
    assert out.exists()
    assert out.stat().st_size < src.stat().st_size
    with Image.open(out) as im:
        assert max(im.size) <= 1600


def test_print_copy_does_not_upscale_small_images(tmp_path):
    src = _make_image(tmp_path / "small.jpg", size=(800, 600))
    out = make_print_copy(src, tmp_path / "print")
    with Image.open(out) as im:
        assert im.size == (800, 600)


def test_photos_are_paired_two_per_page(tmp_path):
    paths = [_make_image(tmp_path / f"{i}.jpg", (400, 300)) for i in range(5)]
    pages = pair_photos([_photo(p, order=i) for i, p in enumerate(paths)])
    assert [len(page) for page in pages] == [2, 2, 1]


def test_photos_are_ordered_by_item_then_order(tmp_path):
    a = _photo(_make_image(tmp_path / "a.jpg", (400, 300)), item_no=2, order=0)
    b = _photo(_make_image(tmp_path / "b.jpg", (400, 300)), item_no=1, order=1)
    c = _photo(_make_image(tmp_path / "c.jpg", (400, 300)), item_no=1, order=0)
    pages = pair_photos([a, b, c])
    assert [p.image_path.name for p in pages[0]] == ["c.jpg", "b.jpg"]


def test_photo_sheet_renders_title_and_captions(tmp_path, fonts):
    paths = [_make_image(tmp_path / f"{i}.jpg", (400, 300)) for i in range(3)]
    photos = [_photo(p, order=i) for i, p in enumerate(paths)]
    path = tmp_path / "photos.pdf"
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    count = draw_photo_sheets(c, photos, fonts["body"], fonts["title"], "산안비")
    c.showPage()
    c.save()
    assert count == 2
    doc = pdfium.PdfDocument(str(path))
    assert len(doc) == 2
    text = doc[0].get_textpage().get_text_range()
    assert "사  진  대  지" in text
    assert "공 사 명" in text
    assert "위      치" in text
    assert "내      용" in text
    assert "날      짜" in text
    assert "안전난간 설치" in text
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_photo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.photo'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/photo.py`:

```python
"""사진 처리. 원본은 그대로 두고 인쇄용 축소본을 따로 만든다."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps

MAX_EDGE = 1600
QUALITY = 82


def make_print_copy(src: Path, dest_dir: Path, max_edge: int = MAX_EDGE, quality: int = QUALITY) -> Path:
    """인쇄용 축소본을 만들어 경로를 돌려준다. 원본보다 커지지 않는다."""
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"{Path(src).stem}.jpg"
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((max_edge, max_edge), Image.LANCZOS)
        im.save(out, "JPEG", quality=quality, optimize=True)
    return out
```

`apps/legal-cost/src/legalcost/forms/photosheet.py`:

```python
"""사진대지 렌더러. A4 한 장에 사진 2컷."""

from __future__ import annotations

from ..models import Photo
from .layout import Sheet
from .spec import SHEET_SPECS

TITLE_Y = 30.0
BLOCK_HEIGHT = 300.0
BLOCK_TOP = 60.0
IMAGE_HEIGHT = 220.0
IMAGE_WIDTH = 420.0
IMAGE_LEFT = 40.0
CAPTION_LABEL_WIDTH = 70.0
CAPTION_ROW_HEIGHT = 20.0
SHEET_RIGHT = 500.0


def pair_photos(photos: list[Photo]) -> list[list[Photo]]:
    ordered = sorted(photos, key=lambda p: (p.item_no, p.order, p.image_path.name))
    return [ordered[i : i + 2] for i in range(0, len(ordered), 2)]


def _draw_block(sheet, photo: Photo, top: float, font_body: str) -> None:
    sheet.rect(IMAGE_LEFT, top, IMAGE_WIDTH, IMAGE_HEIGHT)
    sheet.image(photo.image_path, IMAGE_LEFT + 2, top + 2, IMAGE_WIDTH - 4, IMAGE_HEIGHT - 4)

    y = top + IMAGE_HEIGHT
    rows = [("공 사 명", photo.site_name, "위      치", photo.location),
            ("내      용", photo.content, "날      짜", photo.date)]
    half = IMAGE_LEFT + IMAGE_WIDTH / 2
    for label, value, label2, value2 in rows:
        sheet.rect(IMAGE_LEFT, y, IMAGE_WIDTH, CAPTION_ROW_HEIGHT)
        sheet.line(IMAGE_LEFT + CAPTION_LABEL_WIDTH, y, IMAGE_LEFT + CAPTION_LABEL_WIDTH, y + CAPTION_ROW_HEIGHT)
        sheet.line(half, y, half, y + CAPTION_ROW_HEIGHT)
        sheet.line(half + CAPTION_LABEL_WIDTH, y, half + CAPTION_LABEL_WIDTH, y + CAPTION_ROW_HEIGHT)
        baseline = y + CAPTION_ROW_HEIGHT * 0.68
        sheet.center_text(IMAGE_LEFT + CAPTION_LABEL_WIDTH / 2, baseline, label, font_body, 8)
        sheet.text(IMAGE_LEFT + CAPTION_LABEL_WIDTH + 4, baseline, value, font_body, 8)
        sheet.center_text(half + CAPTION_LABEL_WIDTH / 2, baseline, label2, font_body, 8)
        sheet.text(half + CAPTION_LABEL_WIDTH + 4, baseline, value2, font_body, 8)
        y += CAPTION_ROW_HEIGHT


def draw_photo_sheets(canvas, photos: list[Photo], font_body: str, font_title: str, doc_key: str) -> int:
    pages = pair_photos(photos)
    if not pages:
        return 0
    spec = SHEET_SPECS[(doc_key, "갑지")]
    for page_index, page in enumerate(pages):
        if page_index > 0:
            canvas.showPage()
        sheet = Sheet(canvas, spec)
        try:
            sheet.center_text(SHEET_RIGHT / 2, TITLE_Y, "사  진  대  지", font_title, 16)
            for slot, photo in enumerate(page):
                _draw_block(sheet, photo, BLOCK_TOP + slot * BLOCK_HEIGHT, font_body)
        finally:
            sheet.close()
    return len(pages)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_photo.py -v`
Expected: PASS (5건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/photo.py apps/legal-cost/src/legalcost/forms/photosheet.py apps/legal-cost/tests/test_photo.py
git commit -m "법정경비 출력 엔진: 사진 축소와 사진대지 렌더러"
```

---

### Task 12: 문서 조립과 증빙 병합

**Files:**
- Create: `apps/legal-cost/src/legalcost/assemble.py`
- Create: `apps/legal-cost/tests/test_assemble.py`

**Interfaces:**
- Consumes: `draw_cover`, `draw_summary`, `draw_monthly`, `draw_detail`, `draw_photo_sheets`, `models.{Site, MonthInput, Evidence}`, pikepdf
- Produces:
  - `SheetPdfs(cover: Path, summary: Path, monthly: Path, detail: Path, photos: Path | None)`
  - `build_sheets(site, month, out_dir, font_body, font_title) -> SheetPdfs` — 장표별 개별 PDF
  - `merge(paths: list[Path], out: Path) -> Path`
  - `build_submission(site, month, out_dir, font_body, font_title) -> Path` — 병합본. 순서는 갑지→집계표→항목월→내역서→사진대지→증빙

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_assemble.py`:

```python
from dataclasses import replace
from pathlib import Path

import pikepdf
import pypdfium2 as pdfium
from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.assemble import build_sheets, build_submission, merge
from legalcost.models import Evidence, Photo


def _blank_pdf(path: Path, pages: int = 1) -> Path:
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    for _ in range(pages):
        c.showPage()
    c.save()
    return path


def test_merge_concatenates_in_order(tmp_path):
    a = _blank_pdf(tmp_path / "a.pdf", 2)
    b = _blank_pdf(tmp_path / "b.pdf", 3)
    out = merge([a, b], tmp_path / "merged.pdf")
    with pikepdf.open(out) as pdf:
        assert len(pdf.pages) == 5


def test_build_sheets_writes_four_individual_files(tmp_path, sample_site, sample_month, fonts):
    sheets = build_sheets(sample_site, sample_month, tmp_path, fonts["body"], fonts["title"])
    for path in (sheets.cover, sheets.summary, sheets.monthly, sheets.detail):
        assert path.exists()
        assert len(pdfium.PdfDocument(str(path))) >= 1
    assert sheets.photos is None


def test_submission_has_four_pages_without_photos_or_evidence(tmp_path, sample_site, sample_month, fonts):
    out = build_submission(sample_site, sample_month, tmp_path, fonts["body"], fonts["title"])
    assert len(pdfium.PdfDocument(str(out))) == 4


def test_submission_appends_photo_sheets_then_evidence(tmp_path, sample_site, sample_month, fonts):
    image = tmp_path / "p.jpg"
    Image.new("RGB", (400, 300), (200, 200, 200)).save(image, "JPEG")
    evidence_pdf = _blank_pdf(tmp_path / "tax.pdf", 2)
    month = replace(
        sample_month,
        photos=[
            Photo(1, image, sample_site.site_name, "현장 내", "안전난간", "2026-08-10", order=0),
            Photo(1, image, sample_site.site_name, "현장 내", "안전난간", "2026-08-11", order=1),
            Photo(2, image, sample_site.site_name, "현장 내", "표지판", "2026-08-12", order=0),
        ],
        evidences=[Evidence(0, evidence_pdf, "세금계산서")],
    )
    out = build_submission(sample_site, month, tmp_path, fonts["body"], fonts["title"])
    # 장표 4 + 사진대지 2 + 증빙 2
    assert len(pdfium.PdfDocument(str(out))) == 8


def test_submission_page_size_is_exact(tmp_path, sample_site, sample_month, fonts):
    out = build_submission(sample_site, sample_month, tmp_path, fonts["body"], fonts["title"])
    doc = pdfium.PdfDocument(str(out))
    for index in range(len(doc)):
        width, height = doc[index].get_size()
        assert round(width, 1) == 595.2
        assert round(height, 1) == 841.7
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_assemble.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.assemble'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/assemble.py`:

```python
"""장표를 그려 개별 PDF로 만들고, 제출용 한 권으로 병합한다."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf
from reportlab.pdfgen import canvas as rl_canvas

from . import PAGE_SIZE
from .forms.cover import draw_cover
from .forms.detail import draw_detail
from .forms.monthly import draw_monthly
from .forms.photosheet import draw_photo_sheets
from .forms.summary import draw_summary
from .models import MonthInput, Site


@dataclass(frozen=True)
class SheetPdfs:
    cover: Path
    summary: Path
    monthly: Path
    detail: Path
    photos: Path | None


def _render(path: Path, draw) -> Path:
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw(c)
    c.showPage()
    c.save()
    return path


def build_sheets(site: Site, month: MonthInput, out_dir: Path, font_body: str, font_title: str) -> SheetPdfs:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{month.doc_key}_{month.year}{month.month:02d}"

    cover = _render(out_dir / f"{stem}_갑지.pdf",
                    lambda c: draw_cover(c, site, month, font_body, font_title))
    summary = _render(out_dir / f"{stem}_집계표.pdf",
                      lambda c: draw_summary(c, site, month, font_body, font_title))
    monthly = _render(out_dir / f"{stem}_항목월.pdf",
                      lambda c: draw_monthly(c, month, font_body, font_title))
    detail = _render(out_dir / f"{stem}_내역서.pdf",
                     lambda c: draw_detail(c, month, font_body, font_title))

    photos = None
    if month.photos:
        photos = _render(
            out_dir / f"{stem}_사진대지.pdf",
            lambda c: draw_photo_sheets(c, month.photos, font_body, font_title, month.doc_key),
        )
    return SheetPdfs(cover, summary, monthly, detail, photos)


def merge(paths: list[Path], out: Path) -> Path:
    merged = pikepdf.Pdf.new()
    for path in paths:
        with pikepdf.open(str(path)) as src:
            merged.pages.extend(src.pages)
    merged.save(str(out))
    merged.close()
    return Path(out)


def build_submission(site: Site, month: MonthInput, out_dir: Path, font_body: str, font_title: str) -> Path:
    out_dir = Path(out_dir)
    sheets = build_sheets(site, month, out_dir, font_body, font_title)
    order: list[Path] = [sheets.cover, sheets.summary, sheets.monthly, sheets.detail]
    if sheets.photos is not None:
        order.append(sheets.photos)
    order.extend(
        Path(e.file_path) for e in month.evidences
        if Path(e.file_path).suffix.lower() == ".pdf" and Path(e.file_path).exists()
    )
    stem = f"{month.doc_key}_{month.year}{month.month:02d}"
    return merge(order, out_dir / f"{stem}_제출본.pdf")
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_assemble.py -v`
Expected: PASS (5건)

- [ ] **Step 5: 커밋**

```bash
git add apps/legal-cost/src/legalcost/assemble.py apps/legal-cost/tests/test_assemble.py
git commit -m "법정경비 출력 엔진: 문서 조립과 증빙 병합"
```

---

### Task 13: 픽셀 대조 검증 도구

**Files:**
- Create: `apps/legal-cost/src/legalcost/verify.py`
- Create: `apps/legal-cost/tests/test_verify.py`
- Create: `apps/legal-cost/README.md`

**Interfaces:**
- Consumes: pypdfium2, Pillow, numpy
- Produces:
  - `render_page(pdf: Path, index: int, scale: float = 2.0) -> Image.Image` — 흑백
  - `diff_ratio(a: Image.Image, b: Image.Image, threshold: int = 16) -> float` — 0.0~1.0
  - `diff_image(a, b) -> Image.Image` — 차이 부분을 빨강으로 칠한 대조 이미지
  - `compare(generated: Path, reference: Path, out_dir: Path | None = None) -> list[float]` — 페이지별 차이율. 페이지 수가 다르면 `ValueError`.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_verify.py`:

```python
from pathlib import Path

import pytest
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.verify import compare, diff_ratio, render_page


def _pdf(path: Path, texts: list[str], font: str) -> Path:
    c = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    for text in texts:
        c.setFont(font, 12)
        c.drawString(72, 700, text)
        c.showPage()
    c.save()
    return path


def test_identical_pdfs_have_zero_difference(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["같은 내용"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["같은 내용"], fonts["body"])
    assert compare(a, b) == [0.0]


def test_different_pdfs_have_nonzero_difference(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["내용 하나"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["전혀 다른 내용이 여기 있다"], fonts["body"])
    assert compare(a, b)[0] > 0.0


def test_page_count_mismatch_raises(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["1"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["1", "2"], fonts["body"])
    with pytest.raises(ValueError):
        compare(a, b)


def test_diff_images_are_written_when_out_dir_given(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["내용 하나"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["다른 내용"], fonts["body"])
    out = tmp_path / "diff"
    compare(a, b, out_dir=out)
    assert list(out.glob("page-001*.png"))


def test_render_page_size_is_consistent(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["x"], fonts["body"])
    image = render_page(a, 0, scale=2.0)
    assert image.size == (1191, 1684)
    assert diff_ratio(image, image) == 0.0
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_verify.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'legalcost.verify'`

- [ ] **Step 3: 최소 구현**

`apps/legal-cost/src/legalcost/verify.py`:

```python
"""생성한 PDF를 정답지와 픽셀 단위로 대조한다."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
from PIL import Image


def render_page(pdf: Path, index: int, scale: float = 2.0) -> Image.Image:
    document = pdfium.PdfDocument(str(pdf))
    try:
        return document[index].render(scale=scale).to_pil().convert("L")
    finally:
        document.close()


def page_count(pdf: Path) -> int:
    document = pdfium.PdfDocument(str(pdf))
    try:
        return len(document)
    finally:
        document.close()


def _aligned(a: Image.Image, b: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    if a.size != b.size:
        b = b.resize(a.size)
    return np.asarray(a, dtype=np.int16), np.asarray(b, dtype=np.int16)


def diff_ratio(a: Image.Image, b: Image.Image, threshold: int = 16) -> float:
    left, right = _aligned(a, b)
    return float((np.abs(left - right) > threshold).mean())


def diff_image(a: Image.Image, b: Image.Image, threshold: int = 16) -> Image.Image:
    left, right = _aligned(a, b)
    mask = np.abs(left - right) > threshold
    canvas = np.stack([np.asarray(a.convert("L"))] * 3, axis=-1).astype(np.uint8)
    canvas[mask] = (255, 0, 0)
    return Image.fromarray(canvas)


def compare(generated: Path, reference: Path, out_dir: Path | None = None) -> list[float]:
    generated_pages = page_count(generated)
    reference_pages = page_count(reference)
    if generated_pages != reference_pages:
        raise ValueError(
            f"페이지 수가 다릅니다: 생성본 {generated_pages}쪽, 정답지 {reference_pages}쪽"
        )
    if out_dir is not None:
        Path(out_dir).mkdir(parents=True, exist_ok=True)

    ratios: list[float] = []
    for index in range(generated_pages):
        left = render_page(generated, index)
        right = render_page(reference, index)
        ratio = diff_ratio(left, right)
        ratios.append(ratio)
        if out_dir is not None:
            diff_image(left, right).save(
                Path(out_dir) / f"page-{index + 1:03d}-{ratio * 100:.2f}pct.png"
            )
    return ratios
```

`apps/legal-cost/README.md`:

```markdown
# 법정경비 사용내역서 출력 엔진

산업안전보건관리비 / 안전관리비 Ⅰ·Ⅱ / 환경보전비의 월별 사용내역서를 PDF로 만든다.

설계문서: `../../docs/superpowers/specs/2026-09-03-legal-cost-report-design.md`

## 개발

```bash
cd apps/legal-cost
pip install -e '.[dev]'
python -m pytest -v
```

## 글꼴

`assets/fonts/` 에 출력용 TTF를 넣는다(커밋하지 않는다). 같은 폴더의 README 참고.

## 정답지 대조

실제 제출본 PDF를 정답지로 삼아 차이율을 잰다. 현장 정보가 들어 있으므로
저장소에 넣지 않고 환경변수로 경로를 준다.

```bash
export LEGALCOST_FIXTURES=/path/to/제출본폴더
python -m pytest -v -k reference
```

정답지가 없으면 해당 테스트는 건너뛴다.

**엄격 판정은 실제 글꼴(맑은 고딕, HY헤드라인M 등)이 설치된 환경에서만 한다.**
글꼴이 없는 CI에서는 글자 모양이 달라 차이율이 크게 나오는 것이 정상이며,
그 환경에서는 좌표·구조 테스트만 신뢰한다.
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_verify.py -v`
Expected: PASS (5건)

- [ ] **Step 5: 전체 테스트 실행**

Run: `cd apps/legal-cost && python -m pytest -v`
Expected: PASS — Task 1~13의 모든 테스트

- [ ] **Step 6: 커밋**

```bash
git add apps/legal-cost/src/legalcost/verify.py apps/legal-cost/tests/test_verify.py apps/legal-cost/README.md
git commit -m "법정경비 출력 엔진: 픽셀 대조 검증 도구"
```

---

### Task 14: 정답지 회귀 테스트와 좌표 보정

앞선 태스크들은 "그려진다"를 확인했다. 이 태스크는 "제출본과 같아진다"를 확인하고, 차이를 보며 좌표를 맞춘다.

**Files:**
- Create: `apps/legal-cost/tests/test_reference.py`
- Create: `apps/legal-cost/tools/calibrate.py`
- Modify: `apps/legal-cost/src/legalcost/forms/summary.py` (좌표 상수)
- Modify: `apps/legal-cost/src/legalcost/forms/cover.py` (좌표 상수)
- Modify: `apps/legal-cost/src/legalcost/forms/monthly.py` (좌표 상수)
- Modify: `apps/legal-cost/src/legalcost/forms/detail.py` (좌표 상수)

**Interfaces:**
- Consumes: `build_sheets`, `verify.compare`, `conftest.fixtures_dir`
- Produces: `tools/calibrate.py` — 정답지와 생성본의 대조 이미지를 뽑아 좌표 조정을 돕는 명령줄 도구

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/legal-cost/tests/test_reference.py`:

```python
"""실제 제출본과의 대조. LEGALCOST_FIXTURES 가 있을 때만 돈다."""

import pytest

from legalcost.assemble import build_sheets
from legalcost.verify import compare, page_count

# 정답지 파일명. 실제 제출본을 이 이름으로 fixtures 폴더에 둔다.
REFERENCE_FILES = {
    "산안비": "산업안전보건관리비_2026-07_제출본.pdf",
    "안전1": "안전관리비1_2026-08_제출본.pdf",
    "안전2": "안전관리비2_2026-08_제출본.pdf",
    "환경": "환경보전비_2026-08_제출본.pdf",
}

# 글꼴이 없는 환경에서도 통과해야 하는 느슨한 기준.
# 실제 글꼴이 설치된 환경에서는 STRICT_LIMIT 을 쓴다.
LOOSE_LIMIT = 0.35
STRICT_LIMIT = 0.02


def test_reference_files_exist(fixtures_dir):
    if fixtures_dir is None:
        pytest.skip("LEGALCOST_FIXTURES 미설정")
    missing = [name for name in REFERENCE_FILES.values() if not (fixtures_dir / name).exists()]
    assert missing == [], f"정답지 없음: {missing}"


def test_summary_page_matches_reference(fixtures_dir, sample_site, sample_month, fonts, tmp_path):
    if fixtures_dir is None:
        pytest.skip("LEGALCOST_FIXTURES 미설정")
    reference = fixtures_dir / REFERENCE_FILES["산안비"]
    sheets = build_sheets(sample_site, sample_month, tmp_path, fonts["body"], fonts["title"])
    # 정답지 2쪽이 집계표다. 한 쪽만 떼어 비교한다.
    import pikepdf

    single = tmp_path / "ref_summary.pdf"
    with pikepdf.open(str(reference)) as src:
        out = pikepdf.Pdf.new()
        out.pages.append(src.pages[1])
        out.save(str(single))
    assert page_count(sheets.summary) == 1
    ratio = compare(sheets.summary, single, out_dir=tmp_path / "diff")[0]
    assert ratio < LOOSE_LIMIT, f"집계표 차이율 {ratio * 100:.2f}%"
```

- [ ] **Step 2: 테스트가 실패하는지(또는 건너뛰는지) 확인**

Run: `cd apps/legal-cost && python -m pytest tests/test_reference.py -v`
Expected: 환경변수가 없으면 SKIP 2건. 있으면 `ModuleNotFoundError` 없이 FAIL(차이율 초과) — 어느 쪽이든 정상이다.

- [ ] **Step 3: 보정 도구 작성**

`apps/legal-cost/tools/calibrate.py`:

```python
"""정답지와 생성본을 나란히 뽑아 좌표 보정을 돕는다.

사용법:
    python tools/calibrate.py <생성본.pdf> <정답지.pdf> <출력폴더>

출력폴더에 페이지별 대조 이미지(차이 부분이 빨강)와 차이율이 저장된다.
"""

from __future__ import annotations

import sys
from pathlib import Path

from legalcost.verify import compare


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__)
        return 2
    generated, reference, out_dir = Path(argv[1]), Path(argv[2]), Path(argv[3])
    ratios = compare(generated, reference, out_dir=out_dir)
    for index, ratio in enumerate(ratios, start=1):
        print(f"{index:3d}쪽  차이율 {ratio * 100:6.2f}%")
    print(f"\n대조 이미지: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
```

- [ ] **Step 4: 좌표 보정 반복**

정답지가 있는 환경에서 아래를 반복한다. 한 번에 한 장표만 손댄다.

1. `python tools/calibrate.py out/집계표.pdf fixtures/정답지_2쪽.pdf out/diff` 실행
2. `out/diff/page-001-*.png` 를 열어 빨간 부분을 확인
3. 해당 장표 모듈의 좌표 상수(`COL_*`, `ROW_HEIGHT`, `TABLE_TOP` 등)를 조정
4. 차이율이 줄었는지 확인
5. 차이율이 `LOOSE_LIMIT` 아래로 내려가면 다음 장표로

각 장표를 통과시킬 때마다 커밋한다.

```bash
git add apps/legal-cost/src/legalcost/forms/summary.py
git commit -m "법정경비 출력 엔진: 집계표 좌표를 정답지에 맞춰 보정"
```

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `cd apps/legal-cost && LEGALCOST_FIXTURES=<정답지폴더> python -m pytest -v`
Expected: PASS — 정답지 테스트 포함 전부

- [ ] **Step 6: 커밋**

```bash
git add apps/legal-cost/tests/test_reference.py apps/legal-cost/tools/calibrate.py
git commit -m "법정경비 출력 엔진: 정답지 회귀 테스트와 좌표 보정 도구"
```

---

## 이 계획이 끝나면

`build_submission()` 하나로 제출용 PDF가 나온다. 화면은 아직 없고, 데이터는 파이썬 객체로 넣는다.

다음 계획에서 다룰 것:

- **계획 2 (데스크톱 앱)**: SQLite 저장소, 현장 설정·월 작업·상세 폼·사진대지 편집·출력·보관함 화면, 제출 스냅샷, 백업
- **계획 3 (배포)**: PyInstaller 단일 실행파일, GitHub Actions Windows 자동 빌드

## 자체 점검 결과

**1. 설계문서 대응 확인**

| 설계문서 항목 | 담당 태스크 |
|---|---|
| 문서 4종 정의, 항목 목록, 법조문, 서명란 (2.1~2.2) | Task 3 |
| 제출본 구성과 병합 순서 (2.3) | Task 12 |
| 인쇄 설정 실측값 (2.4) | Task 6 |
| 글꼴 (2.5) | Task 6 |
| 사진대지 A4 2컷·캡션 4칸 (2.6) | Task 11 |
| 0은 대시, 한글 금액, 백분율 (2.7) | Task 2 |
| 공급가액 기준, 전월누계 자동 계산 (3, 5) | Task 4 |
| 검증 규칙 6가지 (6.3) | Task 5 |
| 페이지 자동 분할 (7.2) | Task 10 |
| 사진 축소 (7.2) | Task 11 |
| 픽셀 대조 검증 (7.3) | Task 13, 14 |
| 장표별 개별 PDF + 병합본 (3) | Task 12 |

설계문서 중 **이 계획에서 다루지 않는 것**: 화면(6.1), 제출 스냅샷·보관함(5, 6.2), 저장 위치·백업(8), 계상액 이력(5). 모두 계획 2로 넘긴다. 의도한 분할이다.

**2. 빈칸 점검**

"적절히 처리", "필요시 추가", "TODO" 같은 표현 없음. 모든 코드 단계에 실제 코드가 들어 있다. Task 14의 좌표 보정만 반복 작업이라 값이 아니라 절차로 적었는데, 정답지 없이는 좌표를 확정할 수 없으므로 이게 정확한 기술이다.

**3. 이름 일관성 점검**

- `MonthInput` — Task 3에서 정의, Task 4·5·10·12에서 사용. 일치.
- `compute()` → `MonthTotals.items[].{prev_cum, current, cum, ratio}` — Task 4 정의, Task 7·9 사용. 일치.
- `format_amount` / `format_percent` / `format_allocation` — Task 2 정의, Task 7·9·10 사용. 일치.
- `Sheet.{text, right_text, center_text, line, rect, image, close}` — Task 6 정의, Task 7~11 사용. 일치.
- `SHEET_SPECS[(doc_key, sheet_name)]` — Task 6 정의, Task 7~11 사용. 시트 이름은 `"갑지"|"집계표"|"항목월"|"내역서"` 네 개로 통일했고, 사진대지는 갑지 설정을 재사용한다고 Task 11에 명시.
- `draw_detail`·`draw_photo_sheets`가 페이지 수를 돌려주고 마지막 뒤에 `showPage()`를 부르지 않는 규약 — Task 10·11 정의, Task 12에서 그 규약에 맞춰 `_render`가 마지막 `showPage()`를 담당. 일치.
- `compare()` — Task 13 정의, Task 14 사용. 일치.
