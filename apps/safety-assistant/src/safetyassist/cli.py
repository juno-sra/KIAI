"""명령줄 진입점."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from .applies import applies, unresolved
from .rules import load_rules
from .schedule import build_calendar, unscheduled
from .site import load_site

_UNVERIFIED_MARK = "[미검증]"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="safetyassist", description="안전관리 법정 의무 캘린더")
    parser.add_argument("--site", type=Path, required=True, help="현장 설정 파일(site.yaml)")
    parser.add_argument("--rules", type=Path, default=None, help="규칙 디렉터리")
    sub = parser.add_subparsers(dest="command", required=True)

    cal = sub.add_parser("calendar", help="기간 내 이행 기한 목록")
    cal.add_argument("--from", dest="start", required=True, help="조회 시작일 (YYYY-MM-DD)")
    cal.add_argument("--to", dest="end", required=True, help="조회 종료일 (YYYY-MM-DD)")

    sub.add_parser("duties", help="이 현장에 적용되는 의무 목록")

    args = parser.parse_args(argv)

    duties = load_rules(args.rules)
    site = load_site(args.site)

    if args.command == "calendar":
        return _cmd_calendar(duties, site, date.fromisoformat(args.start), date.fromisoformat(args.end))
    return _cmd_duties(duties, site)


def _cmd_calendar(duties, site, start: date, end: date) -> int:
    occurrences = build_calendar(duties, site, start, end)

    print(f"현장: {site.name}")
    print(f"조회기간: {start} ~ {end}")
    print(f"이행 건수: {len(occurrences)}건")
    print()

    for occ in occurrences:
        mark = "" if occ.verified else f" {_UNVERIFIED_MARK}"
        print(f"{occ.due}  [{occ.category}] {occ.duty_name}{mark}")
        print(f"            근거: {occ.citation}")

    pending = unscheduled(duties, site)
    if pending:
        print()
        print("아래는 날짜로 전개할 수 없는 의무다. 사유가 생기면 이행해야 한다.")
        for duty in pending:
            mark = "" if duty.verified else f" {_UNVERIFIED_MARK}"
            print(f"  - [{duty.category}] {duty.name} ({duty.frequency.text}){mark}")

    _print_footer(duties, site)
    return 0


def _cmd_duties(duties, site) -> int:
    print(f"현장: {site.name}")
    print()
    for duty in duties:
        if not applies(duty, site):
            reason = unresolved(duty, site)
            if reason:
                print(f"  ? [{duty.category}] {duty.name} - {reason}")
            continue
        mark = "" if duty.verified else f" {_UNVERIFIED_MARK}"
        print(f"  {duty.delegation} [{duty.category}] {duty.name} - {duty.frequency.text}{mark}")
        print(f"        근거: {duty.basis.citation()}")

    _print_footer(duties, site)
    return 0


def _print_footer(duties, site) -> None:
    unverified = [d for d in duties if applies(d, site) and not d.verified]
    if unverified:
        print()
        print(
            f"{_UNVERIFIED_MARK} 표시 {len(unverified)}건은 법령 원문 대조를 거치지 않았다. "
            "제출 전 반드시 원문을 확인할 것."
        )
