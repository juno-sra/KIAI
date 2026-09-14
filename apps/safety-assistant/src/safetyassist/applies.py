"""의무가 이 현장에 적용되는지 판정한다."""

from __future__ import annotations

from .models import Duty, Site

# applies_when 의 키와 site 설정의 대응.
_SUPPORTED_KEYS = {"role", "industry", "contract_amount_krw_min"}

# 규칙 id 앞부분과 site.exclusions 키의 대응.
# 해당 현장이 비대상인 의무를 캘린더에 올리면 하지 않아도 될 일을 만든다.
_EXCLUSION_PREFIXES = {
    "hazard_prevention_plan": "hazard-prevention-plan",
}


class AppliesError(ValueError):
    """규칙이 알 수 없는 적용 조건을 쓸 때."""


def applies(duty: Duty, site: Site) -> bool:
    if _is_excluded(duty, site):
        return False

    for key, expected in duty.applies_when.items():
        if key not in _SUPPORTED_KEYS:
            raise AppliesError(f"{duty.id}: 알 수 없는 적용 조건 '{key}'")

        if key == "role" and site.role != expected:
            return False
        if key == "industry" and site.industry != expected:
            return False
        if key == "contract_amount_krw_min":
            # 공사금액을 모르면 금액 기준 의무는 판정하지 않는다.
            # 임의로 적용하거나 제외하면 둘 다 틀릴 수 있다.
            if site.contract_amount_krw is None:
                return False
            if site.contract_amount_krw < expected:
                return False

    return True


def unresolved(duty: Duty, site: Site) -> str | None:
    """판정을 보류한 이유. 없으면 None."""
    if "contract_amount_krw_min" in duty.applies_when and site.contract_amount_krw is None:
        return "공사금액 미입력으로 적용 여부 판정 보류"
    return None


def _is_excluded(duty: Duty, site: Site) -> bool:
    for flag, prefix in _EXCLUSION_PREFIXES.items():
        if site.exclusions.get(flag) and duty.id.startswith(prefix):
            return True
    return False
