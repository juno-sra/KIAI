import re
from dataclasses import replace

import pypdfium2 as pdfium
import pytest
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.cover import draw_cover


def _text(tmp_path, site, month, fonts):
    path = tmp_path / "cover.pdf"
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw_cover(canvas, site, month, fonts["body"], fonts["title"])
    canvas.showPage()
    canvas.save()
    raw = pdfium.PdfDocument(str(path))[0].get_textpage().get_text_range()
    return re.sub(r"\s+", " ", raw)


def test_cover_shows_title_site_and_period(tmp_path, sample_site, sample_month, fonts):
    text = _text(tmp_path, sample_site, sample_month, fonts)
    assert "산업안전보건관리비 사용내역서" in text
    assert sample_site.site_name in text
    assert "2026년 8월 사용분" in text
    # 시공사 칸은 글자를 세로로 쌓아 그린다
    assert "시 공 사" in text
    assert sample_site.company in text


@pytest.mark.parametrize(
    "doc_key,expected",
    [
        ("안전1", "안전관리비 사용내역서 Ⅰ"),
        ("안전2", "안전관리비 사용내역서 Ⅱ"),
        ("환경", "환경보전비 사용내역서"),
    ],
)
def test_cover_title_follows_document_type(
    tmp_path, sample_site, sample_month, fonts, doc_key, expected
):
    month = replace(sample_month, doc_key=doc_key)
    assert expected in _text(tmp_path, sample_site, month, fonts)


def test_cover_shows_subtitle_only_for_safety_two(tmp_path, sample_site, sample_month, fonts):
    text = _text(tmp_path, sample_site, replace(sample_month, doc_key="안전2"), fonts)
    assert "(안전관리계획 및 안전성 검토 관련)" in text
    text = _text(tmp_path, sample_site, replace(sample_month, doc_key="안전1"), fonts)
    assert "(안전관리계획 및 안전성 검토 관련)" not in text
