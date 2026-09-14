"""규칙과 현장 설정의 자료구조."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class Basis:
    """법적 근거.

    law 가 "근거 확인 불가"이면 법령상 직접 근거가 없는 항목이다.
    verified 는 원문 대조 여부이며, 근거 부재와는 다른 상태다.
    """

    law: str | None = None
    decree: str | None = None       # 시행령
    rule: str | None = None         # 시행규칙
    notice: str | None = None       # 고시
    note: str | None = None

    NO_BASIS = "근거 확인 불가"

    @property
    def has_legal_basis(self) -> bool:
        return bool(self.law) and self.law != self.NO_BASIS

    def citation(self) -> str:
        """산출물에 넣을 근거 문자열."""
        if not self.has_legal_basis:
            return self.NO_BASIS
        parts = [p for p in (self.law, self.decree, self.rule, self.notice) if p]
        return ", ".join(parts)


@dataclass(frozen=True)
class Frequency:
    """주기. 하나의 방식만 설정된다."""

    every_days: int | None = None
    every_months: int | None = None
    once_at_start: bool = False
    event_driven: bool = False
    continuous: bool = False
    linked_to: str | None = None
    text: str = ""

    @property
    def is_schedulable(self) -> bool:
        """캘린더에 날짜로 전개할 수 있는지.

        사유 발생 시 이행하는 의무와 상시 의무는 날짜를 미리 찍을 수 없다.
        추정 날짜를 만들어내면 실제 기한과 어긋나므로 전개하지 않는다.
        """
        return bool(self.every_days or self.every_months or self.once_at_start)


@dataclass(frozen=True)
class Deadline:
    """사유 발생일로부터의 기한."""

    from_event_months: int | None = None
    from_event_days: int | None = None
    text: str = ""


@dataclass(frozen=True)
class Duty:
    """하나의 법정 의무."""

    id: str
    name: str
    category: str
    basis: Basis
    frequency: Frequency
    delegation: str
    verified: bool = False
    applies_when: dict = field(default_factory=dict)
    deadline: Deadline | None = None
    output: dict = field(default_factory=dict)
    retention_years: int | None = None


@dataclass(frozen=True)
class Site:
    """현장 설정."""

    name: str
    industry: str
    role: str
    contract_amount_krw: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    appointments: dict = field(default_factory=dict)
    exclusions: dict = field(default_factory=dict)
    privacy: dict = field(default_factory=dict)
    paths: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Occurrence:
    """의무의 1회 이행 시점."""

    duty_id: str
    duty_name: str
    due: date
    category: str
    delegation: str
    verified: bool
    citation: str
