import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.summary import draw_summary


def _render(tmp_path, site, month, fonts):
    path = tmp_path / "summary.pdf"
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw_summary(canvas, site, month, fonts["body"], fonts["title"])
    canvas.showPage()
    canvas.save()
    return path


def _text(path):
    return pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()


def test_summary_is_one_page_of_exact_size(tmp_path, sample_site, sample_month, fonts):
    path = _render(tmp_path, sample_site, sample_month, fonts)
    document = pdfium.PdfDocument(str(path))
    assert len(document) == 1
    width, height = document[0].get_size()
    assert round(width, 1) == 595.2
    assert round(height, 1) == 841.7


def test_summary_contains_required_text(tmp_path, sample_site, sample_month, fonts):
    text = _text(_render(tmp_path, sample_site, sample_month, fonts))
    assert "산업안전보건관리비 사용내역서('26년 08월)" in text
    assert sample_site.site_name in text
    assert "21,344,625,000" in text
    assert "계상된 안전관리비" in text
    assert "삼억사천육백일만육천일백이십칠원" in text
    assert "건설업 산업안전보건관리비 계상 및 사용기준 제10조 제1항" in text


def test_summary_renders_all_nine_item_rows(tmp_path, sample_site, sample_month, fonts):
    text = _text(_render(tmp_path, sample_site, sample_month, fonts))
    for name in (
        "1. 안전관리자 인건비 및 각종 업무수당 등",
        "5. 안전보건 교육비 및 행사비 등",
        "9. 위험성 평가 등에 따른 소요비용 등",
    ):
        assert name in text


def test_summary_shows_amounts_and_dash_for_zero(tmp_path, sample_site, sample_month, fonts):
    text = _text(_render(tmp_path, sample_site, sample_month, fonts))
    assert "53,444,480" in text  # 1번 항목 누계
    assert "-" in text  # 4번 항목처럼 값이 없는 칸


def test_summary_signature_lines_follow_document_type(
    tmp_path, sample_site, sample_month, fonts
):
    text = _text(_render(tmp_path, sample_site, sample_month, fonts))
    assert "작 성 자" in text
    assert "확 인 자" in text
    assert "안전보건총괄책임자" in text
