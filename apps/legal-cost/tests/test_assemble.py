from dataclasses import replace
from pathlib import Path

import pikepdf
import pypdfium2 as pdfium
from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.assemble import build_sheets, build_submission, merge
from legalcost.models import Evidence, Photo


def _blank_pdf(path: Path, pages: int = 1) -> Path:
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    for _ in range(pages):
        canvas.showPage()
    canvas.save()
    return path


def test_merge_concatenates_in_order(tmp_path):
    a = _blank_pdf(tmp_path / "a.pdf", 2)
    b = _blank_pdf(tmp_path / "b.pdf", 3)
    out = merge([a, b], tmp_path / "merged.pdf")
    with pikepdf.open(str(out)) as pdf:
        assert len(pdf.pages) == 5


def test_build_sheets_writes_four_individual_files(tmp_path, sample_site, sample_month, fonts):
    sheets = build_sheets(sample_site, sample_month, tmp_path, fonts["body"], fonts["title"])
    for path in (sheets.cover, sheets.summary, sheets.monthly, sheets.detail):
        assert path.exists()
        assert len(pdfium.PdfDocument(str(path))) >= 1
    assert sheets.photos is None


def test_submission_has_four_pages_without_photos_or_evidence(
    tmp_path, sample_site, sample_month, fonts
):
    out = build_submission(sample_site, sample_month, tmp_path, fonts["body"], fonts["title"])
    assert len(pdfium.PdfDocument(str(out))) == 4


def test_submission_appends_photo_sheets_then_evidence(
    tmp_path, sample_site, sample_month, fonts
):
    image = tmp_path / "p.jpg"
    Image.new("RGB", (400, 300), (200, 200, 200)).save(image, "JPEG")
    evidence_pdf = _blank_pdf(tmp_path / "tax.pdf", 2)
    month = replace(
        sample_month,
        photos=[
            Photo(1, image, sample_site.site_name, "현장 내", "안전난간", "2026-08-10", order=0),
            Photo(1, image, sample_site.site_name, "현장 내", "안전난간", "2026-08-11", order=1),
            Photo(2, image, sample_site.site_name, "현장 내", "표지판", "2026-08-12", order=0),
        ],
        evidences=[Evidence(0, evidence_pdf, "세금계산서")],
    )
    out = build_submission(sample_site, month, tmp_path, fonts["body"], fonts["title"])
    # 장표 4 + 사진대지 2 + 증빙 2
    assert len(pdfium.PdfDocument(str(out))) == 8


def test_submission_page_size_is_exact(tmp_path, sample_site, sample_month, fonts):
    out = build_submission(sample_site, sample_month, tmp_path, fonts["body"], fonts["title"])
    document = pdfium.PdfDocument(str(out))
    for index in range(len(document)):
        width, height = document[index].get_size()
        assert round(width, 1) == 595.2
        assert round(height, 1) == 841.7


def test_non_pdf_evidence_is_skipped_in_merge(tmp_path, sample_site, sample_month, fonts):
    image = tmp_path / "receipt.jpg"
    Image.new("RGB", (100, 100), (255, 255, 255)).save(image, "JPEG")
    month = replace(sample_month, evidences=[Evidence(0, image, "영수증")])
    out = build_submission(sample_site, month, tmp_path, fonts["body"], fonts["title"])
    assert len(pdfium.PdfDocument(str(out))) == 4
