"""site.yaml 을 읽어 Site 로 만든다."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import yaml

from .models import Site


class SiteError(ValueError):
    """현장 설정이 잘못되었을 때."""


def load_site(path: Path) -> Site:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    site_raw = raw.get("site")
    if not site_raw:
        raise SiteError(f"{path.name}: 'site' 항목이 없다")

    for key in ("name", "industry", "role"):
        if not site_raw.get(key):
            raise SiteError(f"{path.name}: site.{key} 가 비어 있다")

    start = _as_date(site_raw.get("start_date"), "start_date", path)
    end = _as_date(site_raw.get("end_date"), "end_date", path)
    if start and end and end < start:
        raise SiteError(f"{path.name}: 준공예정일이 착공일보다 앞선다")

    return Site(
        name=site_raw["name"],
        industry=site_raw["industry"],
        role=site_raw["role"],
        contract_amount_krw=site_raw.get("contract_amount_krw"),
        start_date=start,
        end_date=end,
        appointments=site_raw.get("appointments") or {},
        exclusions=site_raw.get("exclusions") or {},
        privacy=site_raw.get("privacy") or {},
        paths=raw.get("paths") or {},
    )


def _as_date(value, field: str, path: Path) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise SiteError(f"{path.name}: site.{field} 날짜 형식 오류 - {value}") from exc
