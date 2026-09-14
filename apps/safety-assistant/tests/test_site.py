import pytest

from safetyassist.site import SiteError, load_site


def _write(tmp_path, text):
    p = tmp_path / "site.yaml"
    p.write_text(text, encoding="utf-8")
    return p


def test_loads_minimal_site(tmp_path):
    site = load_site(_write(tmp_path, "site:\n  name: A\n  industry: 건설업\n  role: 도급인\n"))
    assert site.name == "A"
    assert site.start_date is None


def test_missing_site_block(tmp_path):
    with pytest.raises(SiteError):
        load_site(_write(tmp_path, "paths: {}\n"))


def test_missing_required_field(tmp_path):
    with pytest.raises(SiteError):
        load_site(_write(tmp_path, "site:\n  name: A\n  industry: 건설업\n"))


def test_completion_before_start_is_rejected(tmp_path):
    text = "site:\n  name: A\n  industry: 건설업\n  role: 도급인\n  start_date: 2026-01-01\n  end_date: 2025-01-01\n"
    with pytest.raises(SiteError):
        load_site(_write(tmp_path, text))


def test_bad_date_format(tmp_path):
    text = "site:\n  name: A\n  industry: 건설업\n  role: 도급인\n  start_date: '2025년 9월'\n"
    with pytest.raises(SiteError):
        load_site(_write(tmp_path, text))
