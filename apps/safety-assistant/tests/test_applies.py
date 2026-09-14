from dataclasses import replace
from datetime import date

import pytest

from safetyassist.applies import AppliesError, applies, unresolved
from safetyassist.models import Basis, Duty, Frequency, Site
from safetyassist.rules import load_rules


def _duty(duty_id="x", applies_when=None):
    return Duty(
        id=duty_id,
        name=duty_id,
        category="점검",
        basis=Basis(law="테스트"),
        frequency=Frequency(every_days=1),
        delegation="L2",
        applies_when=applies_when or {},
    )


def test_contractor_duties_apply_to_this_site(site, rules_dir):
    duties = {d.id: d for d in load_rules(rules_dir)}
    for duty_id in ("safety-council", "patrol-round", "joint-inspection"):
        assert applies(duties[duty_id], site), duty_id


def test_contractor_duties_do_not_apply_to_a_subcontractor(site, rules_dir):
    duties = {d.id: d for d in load_rules(rules_dir)}
    sub = replace(site, role="수급인")
    assert not applies(duties["patrol-round"], sub)


def test_committee_applies_at_12_billion_won(site, rules_dir):
    """산업안전보건위원회는 공사금액 120억원 이상이 대상이다."""
    duties = {d.id: d for d in load_rules(rules_dir)}
    committee = duties["ohs-committee"]

    assert applies(committee, replace(site, contract_amount_krw=12_000_000_000))
    assert not applies(committee, replace(site, contract_amount_krw=11_999_999_999))
    assert applies(committee, site)  # 260억


def test_amount_rule_is_withheld_when_amount_unknown(site, rules_dir):
    """공사금액을 모르면 적용도 제외도 하지 않고 보류한다."""
    duties = {d.id: d for d in load_rules(rules_dir)}
    unknown = replace(site, contract_amount_krw=None)

    assert not applies(duties["ohs-committee"], unknown)
    assert unresolved(duties["ohs-committee"], unknown) is not None
    assert unresolved(duties["ohs-committee"], site) is None


def test_unknown_condition_key_is_an_error():
    with pytest.raises(AppliesError):
        applies(_duty(applies_when={"weather": "맑음"}), Site(name="t", industry="건설업", role="도급인"))


def test_excluded_duty_is_dropped(site):
    """유해위험방지계획서 비대상 현장에 해당 의무를 올리지 않는다."""
    duty = _duty("hazard-prevention-plan-submit")
    assert not applies(duty, site)
    assert applies(duty, replace(site, exclusions={}))
