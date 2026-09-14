"""rules/*.yaml 을 읽어 Duty 로 만든다."""

from __future__ import annotations

from pathlib import Path

import yaml

from .models import Basis, Deadline, Duty, Frequency

DELEGATION_LEVELS = {"L0", "L1", "L2", "L3"}


class RuleError(ValueError):
    """규칙 파일이 스키마를 위반했을 때."""


def default_rules_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "rules"


def load_rules(rules_dir: Path | None = None) -> list[Duty]:
    """규칙 디렉터리의 모든 YAML 을 읽는다.

    규칙 파일이 잘못되면 캘린더 전체가 틀어지므로, 조용히 넘기지 않고
    RuleError 를 던진다.
    """
    rules_dir = rules_dir or default_rules_dir()
    duties: list[Duty] = []
    seen: set[str] = set()

    for path in sorted(rules_dir.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        if raw is None:
            continue
        if not isinstance(raw, list):
            raise RuleError(f"{path.name}: 최상위는 목록이어야 한다")
        for item in raw:
            duty = _parse_duty(item, path.name)
            if duty.id in seen:
                raise RuleError(f"{path.name}: 규칙 id 중복 - {duty.id}")
            seen.add(duty.id)
            duties.append(duty)

    return duties


def _parse_duty(item: dict, source: str) -> Duty:
    for key in ("id", "name", "category", "basis", "frequency", "delegation"):
        if key not in item:
            raise RuleError(f"{source}: '{key}' 누락 - {item.get('id', '?')}")

    delegation = item["delegation"]
    if delegation not in DELEGATION_LEVELS:
        raise RuleError(f"{source}: 잘못된 위임 수준 '{delegation}' - {item['id']}")

    basis_raw = item["basis"] or {}
    basis = Basis(
        law=basis_raw.get("law"),
        decree=basis_raw.get("decree"),
        rule=basis_raw.get("rule"),
        notice=basis_raw.get("notice"),
        note=basis_raw.get("note"),
    )

    freq_raw = item["frequency"] or {}
    frequency = Frequency(
        every_days=freq_raw.get("every_days"),
        every_months=freq_raw.get("every_months"),
        once_at_start=bool(freq_raw.get("once_at_start")),
        event_driven=bool(freq_raw.get("event_driven")),
        continuous=bool(freq_raw.get("continuous")),
        linked_to=freq_raw.get("linked_to"),
        text=freq_raw.get("text", ""),
    )

    deadline = None
    if item.get("deadline"):
        d = item["deadline"]
        deadline = Deadline(
            from_event_months=d.get("from_event_months"),
            from_event_days=d.get("from_event_days"),
            text=d.get("text", ""),
        )

    return Duty(
        id=item["id"],
        name=item["name"],
        category=item["category"],
        basis=basis,
        frequency=frequency,
        delegation=delegation,
        verified=bool(item.get("verified", False)),
        applies_when=item.get("applies_when") or {},
        deadline=deadline,
        output=item.get("output") or {},
        retention_years=item.get("retention_years"),
    )
