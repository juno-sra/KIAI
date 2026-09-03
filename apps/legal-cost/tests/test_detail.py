import re
from dataclasses import replace
from datetime import date

import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.detail import draw_detail, paginate
from legalcost.models import Entry


def _entry(item_no: int, n: int) -> Entry:
    return Entry(
        item_no=item_no,
        company="케이아이건설㈜",
        date=date(2026, 8, n % 28 + 1),
        description=f"집행 {n}",
        unit="EA",
        quantity=1,
        unit_price=1000,
        amount=1000,
    )


def _render(tmp_path, month, fonts):
    path = tmp_path / "detail.pdf"
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    count = draw_detail(canvas, month, fonts["body"], fonts["title"])
    canvas.showPage()
    canvas.save()
    return path, count


def test_every_item_gets_a_subtotal_row(sample_month):
    rows = [row for page in paginate(sample_month, rows_per_page_override=1000) for row in page]
    assert len([r for r in rows if r.kind == "subtotal"]) == 9


def test_subtotal_equals_sum_of_its_entries(sample_month):
    rows = [row for page in paginate(sample_month, rows_per_page_override=1000) for row in page]
    first_subtotal = next(r for r in rows if r.kind == "subtotal")
    assert first_subtotal.subtotal == 5416670


def test_pagination_splits_when_rows_exceed_capacity(sample_month):
    month = replace(sample_month, entries=[_entry(1, n) for n in range(80)])
    pages = paginate(month, rows_per_page_override=30)
    assert len(pages) > 1
    assert all(len(page) <= 30 for page in pages)


def test_pagination_keeps_all_rows(sample_month):
    month = replace(sample_month, entries=[_entry(1, n) for n in range(80)])
    rows = [row for page in paginate(month, rows_per_page_override=30) for row in page]
    assert len([r for r in rows if r.kind == "entry"]) == 80
    assert len([r for r in rows if r.kind == "subtotal"]) == 9


def test_draw_detail_returns_page_count_matching_pdf(tmp_path, sample_month, fonts):
    month = replace(sample_month, entries=[_entry(1, n) for n in range(80)])
    path, count = _render(tmp_path, month, fonts)
    assert count > 1
    assert len(pdfium.PdfDocument(str(path))) == count


def test_detail_repeats_column_headers_on_every_page(tmp_path, sample_month, fonts):
    month = replace(sample_month, entries=[_entry(1, n) for n in range(80)])
    path, _ = _render(tmp_path, month, fonts)
    document = pdfium.PdfDocument(str(path))
    for index in range(len(document)):
        text = re.sub(r"\s+", " ", document[index].get_textpage().get_text_range())
        assert "세 부 내 역" in text
        assert "금 액" in text
