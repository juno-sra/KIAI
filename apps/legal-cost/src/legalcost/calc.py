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
    """항목별 전월누계·당월·누계·항목별대비와 합계를 계산한다."""
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

    total_prev = sum(item.prev_cum for item in items)
    total_current = sum(item.current for item in items)
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
