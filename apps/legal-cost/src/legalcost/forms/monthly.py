"""항목별 사용내역(항목월) 렌더러.

좌표는 실제 제출본 PDF를 4배로 래스터화해 선 위치를 측정하고, 인쇄 배율과 여백을
되돌려 얻은 실측값이다.
"""

from __future__ import annotations

from ..calc import compute
from ..doctypes import DOC_TYPES
from ..models import MonthInput
from ..money import format_amount, format_percent
from .layout import Sheet
from .spec import SHEET_SPECS

# --- 실측 세로선 (시트 좌표계 x) ---
TABLE_LEFT = 21.8
COL_NAME_RIGHT = 143.9
COL_PREV = 223.6
COL_CURRENT = 302.9
COL_CUM = 382.3
COL_RATIO = 461.7
TABLE_RIGHT = 532.1

# --- 실측 가로선 (시트 좌표계 y) ---
TITLE_Y = 60.0
TABLE_TOP = 99.3
HEADER_ROW_HEIGHT = 34.0
SUBHEADER_ROW_HEIGHT = 34.3
ITEM_ROW_HEIGHT = 68.3
TOTAL_ROW_HEIGHT = 69.4


def draw_monthly(canvas, month: MonthInput, font_body: str, font_title: str) -> None:
    """항목별 사용내역 한 장을 그린다. showPage() 는 호출하지 않는다."""
    totals = compute(month)
    doc = DOC_TYPES[month.doc_key]
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "항목월")])
    try:
        _draw(sheet, month, doc, totals, font_body, font_title)
    finally:
        sheet.close()


SHADE = 0.92
OUTER_LEFT = 3.0
OUTER_TOP = 20.0


def _row(sheet, y: float, height: float, dividers: tuple[float, ...]) -> None:
    sheet.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, height)
    for x in dividers:
        sheet.line(x, y, x, y + height)


def _shade(sheet, x: float, y: float, w: float, h: float) -> None:
    sheet.canvas.saveState()
    sheet.canvas.setFillGray(SHADE)
    sheet.canvas.rect(x, y, w, h, stroke=0, fill=1)
    sheet.canvas.restoreState()


def _draw(sheet, month, doc, totals, font_body, font_title) -> None:
    period = doc.format_monthly_period(month.year, month.month)
    sheet.center_text(
        (TABLE_LEFT + TABLE_RIGHT) / 2, TITLE_Y, f"항 목 별 사 용 내 역 ({period})", font_title, 15
    )

    dividers = (COL_NAME_RIGHT, COL_PREV, COL_CURRENT, COL_CUM, COL_RATIO)
    y = TABLE_TOP

    # 머리행 2단: 위는 항목 / 사용내역(3칸 병합) / 총금액대비 / 비고
    sheet.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, HEADER_ROW_HEIGHT)
    for x in (COL_NAME_RIGHT, COL_CUM, COL_RATIO):
        sheet.line(x, y, x, y + HEADER_ROW_HEIGHT)
    baseline = y + HEADER_ROW_HEIGHT * 0.62
    sheet.center_text((TABLE_LEFT + COL_NAME_RIGHT) / 2, baseline, "항  목", font_title, 10)
    sheet.center_text(
        (COL_NAME_RIGHT + COL_CUM) / 2, baseline, "안전관리비 사용내역", font_title, 10
    )
    sheet.center_text(
        (COL_CUM + COL_RATIO) / 2, y + HEADER_ROW_HEIGHT * 0.40, "총금액대비", font_title, 8.5
    )
    sheet.center_text(
        (COL_CUM + COL_RATIO) / 2, y + HEADER_ROW_HEIGHT * 0.78, "누계사용율(%)", font_title, 8.5
    )
    sheet.center_text((COL_RATIO + TABLE_RIGHT) / 2, baseline, "비  고", font_title, 10)
    y += HEADER_ROW_HEIGHT

    # 아래 단: 전월누계 / 금월 / 항목별 총누계
    sheet.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, SUBHEADER_ROW_HEIGHT)
    for x in dividers:
        sheet.line(x, y, x, y + SUBHEADER_ROW_HEIGHT)
    baseline = y + SUBHEADER_ROW_HEIGHT * 0.62
    for left, right, label in (
        (COL_NAME_RIGHT, COL_PREV, "전월누계"),
        (COL_PREV, COL_CURRENT, "금  월"),
        (COL_CURRENT, COL_CUM, "항목별 총누계"),
    ):
        sheet.center_text((left + right) / 2, baseline, label, font_title, 9)
    y += SUBHEADER_ROW_HEIGHT

    # 항목 행. 서식이 정한 줄 수를 지키고, 항목이 적으면 빈 줄로 남긴다.
    name_width = COL_NAME_RIGHT - TABLE_LEFT - 12
    rows = list(totals.items)
    for index in range(doc.monthly_row_count):
        row = rows[index] if index < len(rows) else None
        _row(sheet, y, ITEM_ROW_HEIGHT, dividers)
        baseline = y + ITEM_ROW_HEIGHT * 0.5
        if row is not None:
            lines = sheet.wrap(row.name, font_title, 8.5, name_width)
            first = baseline - (len(lines) - 1) * 5.5
            sheet.wrapped_text(TABLE_LEFT + 6, first, row.name, font_title, 8.5, name_width, 11)
            sheet.right_text(COL_PREV - 6, baseline, format_amount(row.prev_cum), font_body, 9)
            sheet.right_text(COL_CURRENT - 6, baseline, format_amount(row.current), font_body, 9)
            sheet.right_text(COL_CUM - 6, baseline, format_amount(row.cum), font_body, 9)
            sheet.right_text(COL_RATIO - 6, baseline, format_percent(row.ratio), font_body, 9)
        y += ITEM_ROW_HEIGHT

    total = totals.total
    _shade(sheet, TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, TOTAL_ROW_HEIGHT)
    _row(sheet, y, TOTAL_ROW_HEIGHT, dividers)
    sheet.line(TABLE_LEFT, y, TABLE_RIGHT, y, 1.6)
    baseline = y + TOTAL_ROW_HEIGHT * 0.55
    sheet.center_text((TABLE_LEFT + COL_NAME_RIGHT) / 2, baseline, "합 계", font_title, 10)
    sheet.right_text(COL_PREV - 6, baseline, format_amount(total.prev_cum), font_body, 9)
    sheet.right_text(COL_CURRENT - 6, baseline, format_amount(total.current), font_body, 9)
    sheet.right_text(COL_CUM - 6, baseline, format_amount(total.cum), font_body, 9)
    sheet.right_text(COL_RATIO - 6, baseline, format_percent(total.ratio), font_body, 9)
    y += TOTAL_ROW_HEIGHT

    # 제목까지 감싸는 외곽 테두리
    sheet.rect(
        TABLE_LEFT - OUTER_LEFT,
        OUTER_TOP,
        TABLE_RIGHT - TABLE_LEFT + OUTER_LEFT * 2,
        y - OUTER_TOP + 10,
        1.6,
    )
