"""갑지(표지) 렌더러. 4종이 같은 인쇄 설정을 쓴다."""

from __future__ import annotations

from ..doctypes import DOC_TYPES
from ..models import MonthInput, Site
from .layout import Sheet
from .spec import SHEET_SPECS

CENTER_X = 268.0
TITLE_Y = 150.0
SUBTITLE_Y = 186.0
SITE_Y = 300.0
PERIOD_Y = 340.0
FOOTER_LABEL_X = 60.0
FOOTER_VALUE_X = 150.0
FOOTER_Y = 640.0
FOOTER_WIDTH = 420.0
FOOTER_HALF_HEIGHT = 24.0


def draw_cover(canvas, site: Site, month: MonthInput, font_body: str, font_title: str) -> None:
    """갑지 한 장을 그린다. showPage() 는 호출하지 않는다."""
    doc = DOC_TYPES[month.doc_key]
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "갑지")])
    try:
        sheet.center_text(CENTER_X, TITLE_Y, doc.title, font_title, 26)
        if doc.cover_subtitle:
            sheet.center_text(CENTER_X, SUBTITLE_Y, doc.cover_subtitle, font_title, 15)
        sheet.center_text(CENTER_X, SITE_Y, site.site_name, font_body, 15)
        sheet.center_text(
            CENTER_X, PERIOD_Y, f"{month.year}년 {month.month:02d}월 사용분", font_body, 13
        )
        sheet.rect(
            FOOTER_LABEL_X,
            FOOTER_Y - FOOTER_HALF_HEIGHT,
            FOOTER_WIDTH,
            FOOTER_HALF_HEIGHT * 2,
        )
        sheet.line(
            FOOTER_VALUE_X,
            FOOTER_Y - FOOTER_HALF_HEIGHT,
            FOOTER_VALUE_X,
            FOOTER_Y + FOOTER_HALF_HEIGHT,
        )
        sheet.center_text(
            (FOOTER_LABEL_X + FOOTER_VALUE_X) / 2, FOOTER_Y + 4, "시공사", font_body, 12
        )
        sheet.text(FOOTER_VALUE_X + 14, FOOTER_Y + 4, site.company, font_body, 12)
    finally:
        sheet.close()
