from datetime import date

import pytest

from safetyassist.models import Basis, Duty, Frequency, Site
from safetyassist.rules import load_rules
from safetyassist.schedule import add_months, build_calendar, expand, unscheduled


def _duty(duty_id="x", **freq):
    return Duty(
        id=duty_id,
        name=duty_id,
        category="점검",
        basis=Basis(law="테스트"),
        frequency=Frequency(**freq),
        delegation="L2",
    )


def test_add_months_clamps_to_month_end():
    assert add_months(date(2025, 1, 31), 1) == date(2025, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2025, 10, 31), 2) == date(2025, 12, 31)


def test_add_months_crosses_year():
    assert add_months(date(2025, 11, 16), 3) == date(2026, 2, 16)


def test_daily_cycle_starts_one_interval_after_groundbreaking(site):
    """착공일 당일이 아니라 주기만큼 지난 날이 첫 기한이다."""
    duty = _duty("patrol", every_days=2, text="2일에 1회 이상")
    occ = expand(duty, site, date(2025, 9, 16), date(2025, 9, 30))
    assert occ[0].due == date(2025, 9, 18)
    assert occ[1].due == date(2025, 9, 20)


def test_monthly_cycle_anchors_on_groundbreaking_day(site):
    duty = _duty("council", every_months=1, text="매월 1회 이상")
    occ = expand(duty, site, date(2025, 9, 16), date(2026, 1, 31))
    assert [o.due for o in occ] == [
        date(2025, 10, 16),
        date(2025, 11, 16),
        date(2025, 12, 16),
        date(2026, 1, 16),
    ]


def test_monthly_cycle_does_not_drift(site):
    """매번 이전 기한에 더하면 말일 보정이 누적돼 날짜가 밀린다."""
    s = Site(name="t", industry="건설업", role="도급인", start_date=date(2025, 1, 31))
    duty = _duty("m", every_months=1)
    occ = expand(duty, s, date(2025, 1, 1), date(2025, 5, 31))
    assert [o.due for o in occ] == [
        date(2025, 2, 28),
        date(2025, 3, 31),
        date(2025, 4, 30),
        date(2025, 5, 31),
    ]


def test_schedule_stops_at_completion_date(site):
    duty = _duty("q", every_months=3)
    occ = expand(duty, site, date(2025, 9, 16), date(2030, 12, 31))
    assert occ[-1].due <= site.end_date


def test_event_driven_duties_are_not_given_fake_dates(site):
    duty = _duty("accident", event_driven=True, text="재해 발생 시")
    assert expand(duty, site, date(2025, 9, 16), date(2028, 7, 31)) == []


def test_continuous_duties_are_not_scheduled(site):
    duty = _duty("retention", continuous=True)
    assert expand(duty, site, date(2025, 9, 16), date(2028, 7, 31)) == []


def test_once_at_start(site):
    duty = _duty("initial", once_at_start=True)
    occ = expand(duty, site, date(2025, 9, 1), date(2025, 12, 31))
    assert [o.due for o in occ] == [date(2025, 9, 16)]


def test_no_start_date_means_no_schedule():
    s = Site(name="t", industry="건설업", role="도급인")
    assert expand(_duty("x", every_days=2), s, date(2025, 1, 1), date(2025, 2, 1)) == []


def test_build_calendar_is_sorted(site, rules_dir):
    occ = build_calendar(load_rules(rules_dir), site, date(2025, 9, 16), date(2025, 12, 31))
    assert occ == sorted(occ, key=lambda o: (o.due, o.duty_id))


def test_build_calendar_rejects_inverted_window(site, rules_dir):
    with pytest.raises(ValueError):
        build_calendar(load_rules(rules_dir), site, date(2026, 1, 1), date(2025, 1, 1))


def test_unscheduled_duties_are_surfaced(site, rules_dir):
    pending = {d.id for d in unscheduled(load_rules(rules_dir), site)}
    assert "accident-investigation-report" in pending
    assert "education-on-hire" in pending
