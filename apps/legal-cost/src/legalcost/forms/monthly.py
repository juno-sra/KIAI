"""항목별 사용내역(항목월) 렌더러."""

from __future__ import annotations

from ..calc import compute
from ..doctypes import DOC_TYPES
from ..models import MonthInput
from ..money import format_amount, format_percent
from .layout import Sheet
from .spec import SHEET_SPECS

COL_LEFT = 0.0
COL_NAME_RIGHT = 250.0
COL_PREV = 320.0
COL_CURRENT = 388.0
COL_CUM = 456.0
COL_RATIO = 512.0
COL_NOTE = 560.0

ROW_HEIGHT = 26.0
TITLE_Y = 40.0
TABLE_TOP = 80.0


def draw_monthly(canvas, month: MonthInput, font_body: str, font_title: str) -> None:
    """항목별 사용내역 한 장을 그린다. showPage() 는 호출하지 않는다."""
    totals = compute(month)
    doc = DOC_TYPES[month.doc_key]
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "항목월")])
    try:
        period = doc.format_monthly_period(month.year, month.month)
        title = f"항 목 별 사 용 내 역 ({period})"
        sheet.center_text(COL_NOTE / 2, TITLE_Y, title, font_title, 14)

        y = TABLE_TOP
        sheet.rect(COL_LEFT, y, COL_NOTE, ROW_HEIGHT)
        sheet.line(COL_NAME_RIGHT, y, COL_NAME_RIGHT, y + ROW_HEIGHT * 2)
        sheet.line(COL_RATIO, y, COL_RATIO, y + ROW_HEIGHT * 2)
        baseline = y + ROW_HEIGHT * 0.64
        sheet.center_text(COL_NAME_RIGHT / 2, baseline, "항  목", font_body, 9)
        sheet.center_text(
            (COL_NAME_RIGHT + COL_RATIO) / 2, baseline, "안전관리비 사용내역", font_body, 9
        )
        sheet.center_text(
            (COL_RATIO + COL_NOTE) / 2, baseline, "총금액대비", font_body, 7
        )
        sheet.center_text(
            (COL_RATIO + COL_NOTE) / 2, baseline + 9, "누계사용율(%)", font_body, 7
        )
        y += ROW_HEIGHT

        sheet.rect(COL_LEFT, y, COL_NOTE, ROW_HEIGHT)
        for x in (COL_PREV, COL_CURRENT, COL_CUM):
            sheet.line(x, y, x, y + ROW_HEIGHT)
        baseline = y + ROW_HEIGHT * 0.68
        sheet.center_text((COL_NAME_RIGHT + COL_PREV) / 2, baseline, "전월누계", font_body, 9)
        sheet.center_text((COL_PREV + COL_CURRENT) / 2, baseline, "금  월", font_body, 9)
        sheet.center_text((COL_CURRENT + COL_CUM) / 2, baseline, "항목별 총누계", font_body, 9)
        sheet.center_text((COL_RATIO + COL_NOTE) / 2, baseline, "비  고", font_body, 9)
        y += ROW_HEIGHT

        for row in list(totals.items) + [totals.total]:
            name = "합 계" if row.item_no == 0 else row.name
            sheet.rect(COL_LEFT, y, COL_NOTE, ROW_HEIGHT)
            for x in (COL_NAME_RIGHT, COL_PREV, COL_CURRENT, COL_CUM, COL_RATIO):
                sheet.line(x, y, x, y + ROW_HEIGHT)
            baseline = y + ROW_HEIGHT * 0.68
            sheet.text(COL_LEFT + 6, baseline, name, font_body, 8)
            sheet.right_text(COL_PREV - 6, baseline, format_amount(row.prev_cum), font_body, 8)
            sheet.right_text(COL_CURRENT - 6, baseline, format_amount(row.current), font_body, 8)
            sheet.right_text(COL_CUM - 6, baseline, format_amount(row.cum), font_body, 8)
            sheet.right_text(COL_RATIO - 6, baseline, format_percent(row.ratio), font_body, 8)
            y += ROW_HEIGHT
    finally:
        sheet.close()
