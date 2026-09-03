import math

import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.layout import Sheet
from legalcost.forms.spec import SHEET_SPECS


def test_cover_spec_is_shared_by_all_four_documents():
    covers = [SHEET_SPECS[(key, "갑지")] for key in ("산안비", "안전1", "안전2", "환경")]
    assert all(cover == covers[0] for cover in covers)
    assert covers[0].scale == 0.92


def test_summary_scale_differs_between_families():
    assert SHEET_SPECS[("산안비", "집계표")].scale == 0.92
    assert SHEET_SPECS[("안전1", "집계표")].scale == 0.95
    assert SHEET_SPECS[("안전2", "집계표")].scale == 0.95
    assert SHEET_SPECS[("환경", "집계표")].scale == 0.95


def test_detail_scale_matches_measurements():
    assert SHEET_SPECS[("산안비", "내역서")].scale == 0.75
    assert SHEET_SPECS[("안전1", "내역서")].scale == 0.75
    assert SHEET_SPECS[("안전2", "내역서")].scale == 0.93
    assert SHEET_SPECS[("환경", "내역서")].scale == 0.75


def test_margins_are_stored_in_points():
    cover = SHEET_SPECS[("산안비", "갑지")]
    assert math.isclose(cover.margin_left, 0.6299212598425197 * 72, rel_tol=1e-9)
    assert math.isclose(cover.margin_right, 0.2362204724409449 * 72, rel_tol=1e-9)


def test_content_size_removes_margins_and_applies_scale(tmp_path):
    spec = SHEET_SPECS[("산안비", "갑지")]
    canvas = rl_canvas.Canvas(str(tmp_path / "x.pdf"), pagesize=PAGE_SIZE)
    sheet = Sheet(canvas, spec)
    width, height = sheet.content_size()
    expected_width = (PAGE_SIZE[0] - spec.margin_left - spec.margin_right) / spec.scale
    assert math.isclose(width, expected_width, rel_tol=1e-9)
    expected_height = (PAGE_SIZE[1] - spec.margin_top - spec.margin_bottom) / spec.scale
    assert math.isclose(height, expected_height, rel_tol=1e-9)


def test_sheet_draws_without_error_and_page_size_is_exact(tmp_path):
    path = tmp_path / "sheet.pdf"
    spec = SHEET_SPECS[("산안비", "집계표")]
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    sheet = Sheet(canvas, spec)
    sheet.line(0, 0, 100, 0, 0.5)
    sheet.rect(0, 10, 100, 20, 0.5)
    sheet.close()
    canvas.showPage()
    canvas.save()

    document = pdfium.PdfDocument(str(path))
    width, height = document[0].get_size()
    assert round(width, 1) == 595.2
    assert round(height, 1) == 841.7
