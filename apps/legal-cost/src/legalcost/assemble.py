"""장표를 개별 PDF로 만들고 제출용 한 권으로 병합한다.

병합 순서는 실제 제출본과 같다:
갑지 → 집계표 → 항목월 → 내역서(상세) → 사진대지 → 증빙
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf
from reportlab.pdfgen import canvas as rl_canvas

from . import PAGE_SIZE
from .forms.cover import draw_cover
from .forms.detail import draw_detail
from .forms.monthly import draw_monthly
from .forms.photosheet import draw_photo_sheets
from .forms.summary import draw_summary
from .models import MonthInput, Site


@dataclass(frozen=True)
class SheetPdfs:
    cover: Path
    summary: Path
    monthly: Path
    detail: Path
    photos: Path | None


def _render(path: Path, draw) -> Path:
    """draw 가 마지막 페이지를 열어둔 채 끝내므로 여기서 showPage() 로 닫는다."""
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    draw(canvas)
    canvas.showPage()
    canvas.save()
    return path


def build_sheets(
    site: Site, month: MonthInput, out_dir: Path, font_body: str, font_title: str
) -> SheetPdfs:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{month.doc_key}_{month.year}{month.month:02d}"

    cover = _render(
        out_dir / f"{stem}_갑지.pdf",
        lambda c: draw_cover(c, site, month, font_body, font_title),
    )
    summary = _render(
        out_dir / f"{stem}_집계표.pdf",
        lambda c: draw_summary(c, site, month, font_body, font_title),
    )
    monthly = _render(
        out_dir / f"{stem}_항목월.pdf",
        lambda c: draw_monthly(c, month, font_body, font_title),
    )
    detail = _render(
        out_dir / f"{stem}_내역서.pdf",
        lambda c: draw_detail(c, month, font_body, font_title, site.company),
    )

    photos = None
    if month.photos:
        photos = _render(
            out_dir / f"{stem}_사진대지.pdf",
            lambda c: draw_photo_sheets(c, month.photos, font_body, font_title, month.doc_key),
        )
    return SheetPdfs(cover, summary, monthly, detail, photos)


def merge(paths: list[Path], out: Path) -> Path:
    merged = pikepdf.Pdf.new()
    for path in paths:
        with pikepdf.open(str(path)) as source:
            merged.pages.extend(source.pages)
    merged.save(str(out))
    merged.close()
    return Path(out)


def build_submission(
    site: Site, month: MonthInput, out_dir: Path, font_body: str, font_title: str
) -> Path:
    """제출용 병합본을 만든다. 개별 장표 PDF도 함께 남는다."""
    out_dir = Path(out_dir)
    sheets = build_sheets(site, month, out_dir, font_body, font_title)
    order: list[Path] = [sheets.cover, sheets.summary, sheets.monthly, sheets.detail]
    if sheets.photos is not None:
        order.append(sheets.photos)
    order.extend(
        Path(evidence.file_path)
        for evidence in month.evidences
        if Path(evidence.file_path).suffix.lower() == ".pdf"
        and Path(evidence.file_path).exists()
    )
    stem = f"{month.doc_key}_{month.year}{month.month:02d}"
    return merge(order, out_dir / f"{stem}_제출본.pdf")
