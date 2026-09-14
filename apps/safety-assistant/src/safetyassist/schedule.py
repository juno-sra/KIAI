"""의무를 날짜로 전개한다.

주기 의무의 기산점은 착공일이다. "2일에 1회 이상"처럼 상한이 있는 주기는
그 간격을 넘기면 위반이므로, 간격만큼 더한 날짜를 이행 기한으로 본다.
"""

from __future__ import annotations

from datetime import date, timedelta

from .applies import applies
from .models import Duty, Occurrence, Site

MAX_OCCURRENCES = 20000  # 폭주 방지


def add_months(base: date, months: int) -> date:
    """월 단위 가산. 말일은 해당 월의 마지막 날로 맞춘다."""
    total = base.month - 1 + months
    year = base.year + total // 12
    month = total % 12 + 1
    day = min(base.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def expand(duty: Duty, site: Site, window_start: date, window_end: date) -> list[Occurrence]:
    """한 의무를 기간 안의 이행 시점 목록으로 전개한다."""
    freq = duty.frequency
    if not freq.is_schedulable:
        return []
    if site.start_date is None:
        return []

    anchor = site.start_date
    horizon = min(window_end, site.end_date) if site.end_date else window_end

    dues: list[date] = []
    if freq.once_at_start:
        dues = [anchor]
    elif freq.every_days:
        current = anchor + timedelta(days=freq.every_days)
        while current <= horizon and len(dues) < MAX_OCCURRENCES:
            dues.append(current)
            current += timedelta(days=freq.every_days)
    elif freq.every_months:
        step = 1
        current = add_months(anchor, freq.every_months)
        while current <= horizon and len(dues) < MAX_OCCURRENCES:
            dues.append(current)
            step += 1
            current = add_months(anchor, freq.every_months * step)

    citation = duty.basis.citation()
    return [
        Occurrence(
            duty_id=duty.id,
            duty_name=duty.name,
            due=d,
            category=duty.category,
            delegation=duty.delegation,
            verified=duty.verified,
            citation=citation,
        )
        for d in dues
        if window_start <= d <= window_end
    ]


def build_calendar(
    duties: list[Duty], site: Site, window_start: date, window_end: date
) -> list[Occurrence]:
    """현장에 적용되는 의무 전체를 날짜순으로 전개한다."""
    if window_end < window_start:
        raise ValueError("조회 종료일이 시작일보다 앞선다")

    out: list[Occurrence] = []
    for duty in duties:
        if not applies(duty, site):
            continue
        out.extend(expand(duty, site, window_start, window_end))

    out.sort(key=lambda o: (o.due, o.duty_id))
    return out


def unscheduled(duties: list[Duty], site: Site) -> list[Duty]:
    """적용은 되지만 날짜로 전개할 수 없는 의무.

    사유 발생 시 이행하는 의무가 여기 들어간다. 캘린더에 없다고 해서
    없는 의무가 아니므로 별도로 보여줘야 한다.
    """
    return [d for d in duties if applies(d, site) and not d.frequency.is_schedulable]
