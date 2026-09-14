from safetyassist.models import Basis
from safetyassist.rules import load_rules


def test_all_rules_load(rules_dir):
    duties = load_rules(rules_dir)
    assert len(duties) >= 20


def test_every_duty_has_a_basis_or_says_it_cannot_be_confirmed(rules_dir):
    """근거 없이 슬쩍 넘어간 항목이 없어야 한다."""
    for duty in load_rules(rules_dir):
        assert duty.basis.law, f"{duty.id}: basis.law 없음"


def test_rules_without_legal_basis_are_marked_explicitly(rules_dir):
    duties = {d.id: d for d in load_rules(rules_dir)}
    assert duties["tbm"].basis.law == Basis.NO_BASIS
    assert duties["monthly-safety-report"].basis.law == Basis.NO_BASIS
    assert not duties["tbm"].basis.has_legal_basis


def test_initial_rules_are_all_unverified(rules_dir):
    """원문 대조 전이므로 verified 가 켜진 항목이 있으면 안 된다."""
    for duty in load_rules(rules_dir):
        assert duty.verified is False, f"{duty.id}: 대조 없이 verified=true"


def test_citation_joins_all_sources(rules_dir):
    duties = {d.id: d for d in load_rules(rules_dir)}
    citation = duties["patrol-round"].basis.citation()
    assert "제64조제1항제4호" in citation
    assert "시행규칙 제80조" in citation


def test_no_duplicate_ids(rules_dir):
    ids = [d.id for d in load_rules(rules_dir)]
    assert len(ids) == len(set(ids))
