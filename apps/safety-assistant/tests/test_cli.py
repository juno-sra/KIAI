from pathlib import Path

from safetyassist.cli import main

SITE_YAML = """
site:
  name: 테스트 현장
  industry: 건설업
  role: 도급인
  contract_amount_krw: 26000000000
  start_date: 2025-09-16
  end_date: 2028-07-31
  exclusions:
    hazard_prevention_plan: true
"""


def _write_site(tmp_path: Path) -> Path:
    path = tmp_path / "site.yaml"
    path.write_text(SITE_YAML, encoding="utf-8")
    return path


def test_calendar_runs_and_marks_unverified(tmp_path, capsys, rules_dir):
    code = main(
        ["--site", str(_write_site(tmp_path)), "--rules", str(rules_dir),
         "calendar", "--from", "2025-09-16", "--to", "2025-10-31"]
    )
    out = capsys.readouterr().out
    assert code == 0
    assert "이행 건수" in out
    assert "[미검증]" in out
    assert "산업안전보건법" in out


def test_calendar_lists_event_driven_duties_separately(tmp_path, capsys, rules_dir):
    main(
        ["--site", str(_write_site(tmp_path)), "--rules", str(rules_dir),
         "calendar", "--from", "2025-09-16", "--to", "2025-10-31"]
    )
    out = capsys.readouterr().out
    assert "사유가 생기면" in out
    assert "산업재해조사표" in out


def test_duties_command(tmp_path, capsys, rules_dir):
    code = main(["--site", str(_write_site(tmp_path)), "--rules", str(rules_dir), "duties"])
    out = capsys.readouterr().out
    assert code == 0
    assert "작업장 순회점검" in out
    assert "근거 확인 불가" in out  # TBM, 월간보고
