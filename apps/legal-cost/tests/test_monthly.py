import re

import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.monthly import draw_monthly


def _text(tmp_path, month, fonts):
    """PDF 텍스트를 뽑되 공백을 정규화한다.

    추출기가 연속 공백을 하나로 합치므로, 서식상 '금  월' 로 그린 글자도
    '금 월' 로 읽힌다. 글자 배치가 아니라 내용이 들어갔는지를 보는 검사다.
    """
    path = tmp_path / "monthly.pdf"
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw_monthly(canvas, month, fonts["body"], fonts["title"])
    canvas.showPage()
    canvas.save()
    raw = pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()
    return re.sub(r"\s+", " ", raw)


def test_monthly_title_and_column_headers(tmp_path, sample_month, fonts):
    text = _text(tmp_path, sample_month, fonts)
    assert "항 목 별 사 용 내 역 (26년08월)" in text
    assert "전월누계" in text
    assert "금 월" in text
    assert "항목별 총누계" in text
    assert "비 고" in text


def test_monthly_lists_every_item_and_total(tmp_path, sample_month, fonts):
    text = _text(tmp_path, sample_month, fonts)
    assert "1. 안전관리자 인건비 및 각종 업무수당 등" in text
    assert "9. 위험성 평가 등에 따른 소요비용 등" in text
    assert "합 계" in text


def test_monthly_amounts_match_calculation(tmp_path, sample_month, fonts):
    text = _text(tmp_path, sample_month, fonts)
    assert "48,027,810" in text  # 1번 전월누계
    assert "5,416,670" in text  # 1번 당월
    assert "53,444,480" in text  # 1번 누계
