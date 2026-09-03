"""도메인 데이터 구조."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class Site:
    """현장 정보. 4종 문서가 공유한다."""

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
    # 갑지의 시공사 칸은 집계표와 다르게 적는다. 예: "케이아이건설㈜외 1개사"
    cover_company: str = ""
    # 갑지 상단 발주처 배너 이미지. 없으면 그리지 않는다.
    banner_path: Path | None = None

    def cover_company_name(self) -> str:
        return self.cover_company or self.company


@dataclass(frozen=True)
class Entry:
    """집행 한 건. amount 는 공급가액(부가세 제외)."""

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
    """한 문서 한 달치 입력."""

    doc_key: str
    year: int
    month: int
    progress_rate: float
    allocation: int
    opening_balance: dict[int, int] = field(default_factory=dict)
    entries: list[Entry] = field(default_factory=list)
    photos: list[Photo] = field(default_factory=list)
    evidences: list[Evidence] = field(default_factory=list)
