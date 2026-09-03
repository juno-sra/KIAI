"""집계표 렌더러.

좌표는 시트 좌표계(포인트, 좌상단 원점)다. 실제 제출본 PDF를 4배로 래스터화해
표의 가로·세로 선 위치를 측정하고, 인쇄 배율과 여백을 되돌려 얻은 값이다.
눈대중이 아니라 실측값이므로 임의로 바꾸지 않는다.

서식의 특징:
- 항목 행은 문서 종류와 무관하게 항상 9줄이다. 항목이 적으면 빈 줄로 남긴다.
- 제목·법조문·서명란이 모두 표의 외곽선 안에 들어간다.
- 누계사용금액 열과 누계 공정율 칸에 회색 음영이 깔린다.
"""

from __future__ import annotations

import calendar

from ..calc import compute
from ..doctypes import DOC_TYPES
from ..models import MonthInput, Site
from ..money import format_allocation, format_amount, format_percent
from .layout import Sheet
from .spec import SHEET_SPECS

# --- 실측 세로선 (시트 좌표계 x) ---
TABLE_LEFT = 18.1
TABLE_RIGHT = 559.2

COL_HEAD_LABEL = 119.4
COL_HEAD_VALUE = 241.7
COL_HEAD_LABEL2 = 319.0

COL_NAME_RIGHT = 241.7
COL_PREV = 319.0
COL_CURRENT = 396.3
COL_CUM = 481.9
COL_RATIO = TABLE_RIGHT

# --- 실측 가로선 (시트 좌표계 y) ---
TABLE_TOP = 8.4
TITLE_HEIGHT = 46.1
HEAD_ROW_HEIGHTS = (57.1, 45.5, 34.2, 34.2)
ALLOCATION_HEIGHT = 34.3
GAP_HEIGHT = 16.9
BAND_HEIGHT = 34.2
COLUMN_HEADER_HEIGHT = 34.2
ITEM_ROW_HEIGHT = 25.52
TOTAL_ROW_HEIGHT = 31.5
TAIL_HEIGHT = 171.4

# 항목이 몇 개든 표는 9줄을 유지한다.
ITEM_ROW_COUNT = 9

SHADE_LIGHT = 0.93
SHADE_DARK = 0.78


def draw_summary(canvas, site: Site, month: MonthInput, font_body: str, font_title: str) -> None:
    """집계표 한 장을 그린다. showPage() 는 호출하지 않는다."""
    doc = DOC_TYPES[month.doc_key]
    totals = compute(month)
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "집계표")])
    try:
        _draw(sheet, site, month, doc, totals, font_body, font_title)
    finally:
        sheet.close()


def _shade(sheet, x: float, y: float, w: float, h: float, gray: float) -> None:
    sheet.canvas.saveState()
    sheet.canvas.setFillGray(gray)
    sheet.canvas.rect(x, y, w, h, stroke=0, fill=1)
    sheet.canvas.restoreState()


def _row(sheet, y: float, height: float, dividers: tuple[float, ...]) -> None:
    sheet.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, height)
    for x in dividers:
        sheet.line(x, y, x, y + height)


def _draw(sheet, site, month, doc, totals, font_body, font_title) -> None:
    y = TABLE_TOP

    # 제목
    sheet.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, TITLE_HEIGHT)
    title = f"{doc.summary_title}({doc.format_summary_period(month.year, month.month)})"
    sheet.center_text(
        (TABLE_LEFT + TABLE_RIGHT) / 2, y + TITLE_HEIGHT * 0.66, title, font_title, 15
    )
    y += TITLE_HEIGHT

    # 머리표 4줄
    head_dividers = (COL_HEAD_LABEL, COL_HEAD_VALUE, COL_HEAD_LABEL2)
    head_rows = [
        ("건설업체명\n(현장명)", site.company, "공  사  명", site.site_name),
        ("소     재     지", site.address, "대  표  자", site.ceo),
        (
            "공  사  금  액",
            f"{site.contract_amount:,} 원",
            "공 사 기 간",
            f"{site.period_start} ~ {site.period_end}",
        ),
        ("발     주     자", site.client, "누계 공정율", f"{month.progress_rate * 100:.2f}%"),
    ]
    for height, (label, value, label2, value2) in zip(HEAD_ROW_HEIGHTS, head_rows):
        if label2 == "누계 공정율":
            _shade(sheet, COL_HEAD_LABEL2, y, TABLE_RIGHT - COL_HEAD_LABEL2, height, SHADE_DARK)
        _row(sheet, y, height, head_dividers)
        lines = label.split("\n")
        label_x = (TABLE_LEFT + COL_HEAD_LABEL) / 2
        if len(lines) == 1:
            sheet.center_text(label_x, y + height * 0.62, label, font_body, 9)
        else:
            sheet.center_text(label_x, y + height * 0.42, lines[0], font_body, 9)
            sheet.center_text(label_x, y + height * 0.72, lines[1], font_body, 9)
        sheet.center_text(
            (COL_HEAD_LABEL + COL_HEAD_VALUE) / 2, y + height * 0.62, value, font_body, 8.5
        )
        sheet.center_text(
            (COL_HEAD_VALUE + COL_HEAD_LABEL2) / 2, y + height * 0.62, label2, font_body, 9
        )
        sheet.center_text(
            (COL_HEAD_LABEL2 + TABLE_RIGHT) / 2, y + height * 0.62, value2, font_body, 8.5
        )
        y += height

    # 계상액
    _row(sheet, y, ALLOCATION_HEIGHT, (COL_HEAD_LABEL,))
    sheet.center_text(
        (TABLE_LEFT + COL_HEAD_LABEL) / 2,
        y + ALLOCATION_HEIGHT * 0.62,
        doc.allocation_label,
        font_body,
        9,
    )
    sheet.center_text(
        (COL_HEAD_LABEL + TABLE_RIGHT) / 2,
        y + ALLOCATION_HEIGHT * 0.62,
        format_allocation(month.allocation),
        font_body,
        9.5,
    )
    y += ALLOCATION_HEIGHT + GAP_HEIGHT

    # 사용금액 띠
    sheet.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, BAND_HEIGHT)
    sheet.center_text(
        (TABLE_LEFT + TABLE_RIGHT) / 2,
        y + BAND_HEIGHT * 0.66,
        "사      용      금      액",
        font_title,
        14,
    )
    y += BAND_HEIGHT

    # 열 머리
    amount_dividers = (COL_NAME_RIGHT, COL_PREV, COL_CURRENT, COL_CUM)
    _shade(sheet, COL_CURRENT, y, COL_CUM - COL_CURRENT, COLUMN_HEADER_HEIGHT, SHADE_LIGHT)
    _row(sheet, y, COLUMN_HEADER_HEIGHT, amount_dividers)
    baseline = y + COLUMN_HEADER_HEIGHT * 0.64
    sheet.center_text((TABLE_LEFT + COL_NAME_RIGHT) / 2, baseline, "항      목", font_title, 9.5)
    for left, right, label in (
        (COL_NAME_RIGHT, COL_PREV, "전월누계"),
        (COL_PREV, COL_CURRENT, "당월사용금액"),
        (COL_CURRENT, COL_CUM, "누계사용금액"),
        (COL_CUM, COL_RATIO, "항목별대비(%)"),
    ):
        sheet.center_text((left + right) / 2, baseline, label, font_title, 9)
    y += COLUMN_HEADER_HEIGHT

    # 항목 행 (항상 9줄, 부족하면 빈 줄)
    rows = list(totals.items)
    for index in range(ITEM_ROW_COUNT):
        row = rows[index] if index < len(rows) else None
        _shade(sheet, COL_CURRENT, y, COL_CUM - COL_CURRENT, ITEM_ROW_HEIGHT, SHADE_LIGHT)
        _row(sheet, y, ITEM_ROW_HEIGHT, amount_dividers)
        baseline = y + ITEM_ROW_HEIGHT * 0.66
        if row is not None:
            name_width = COL_NAME_RIGHT - TABLE_LEFT - 10
            lines = sheet.wrap(row.name, font_title, 7.5, name_width)
            first = baseline - (len(lines) - 1) * 4.5
            sheet.wrapped_text(TABLE_LEFT + 5, first, row.name, font_title, 7.5, name_width, 9)
            sheet.right_text(COL_PREV - 5, baseline, format_amount(row.prev_cum), font_body, 8.5)
            sheet.right_text(COL_CURRENT - 5, baseline, format_amount(row.current), font_body, 8.5)
            sheet.right_text(COL_CUM - 5, baseline, format_amount(row.cum), font_body, 8.5)
            sheet.right_text(COL_RATIO - 5, baseline, format_percent(row.ratio), font_body, 8.5)
        else:
            sheet.right_text(COL_CURRENT - 5, baseline, "-", font_body, 8.5)
            sheet.right_text(COL_CUM - 5, baseline, "-", font_body, 8.5)
        y += ITEM_ROW_HEIGHT

    # 계
    _shade(sheet, COL_CURRENT, y, COL_CUM - COL_CURRENT, TOTAL_ROW_HEIGHT, SHADE_LIGHT)
    _row(sheet, y, TOTAL_ROW_HEIGHT, amount_dividers)
    baseline = y + TOTAL_ROW_HEIGHT * 0.64
    total = totals.total
    sheet.center_text((TABLE_LEFT + COL_NAME_RIGHT) / 2, baseline, "계", font_title, 9)
    sheet.right_text(COL_PREV - 5, baseline, format_amount(total.prev_cum), font_body, 8.5)
    sheet.right_text(COL_CURRENT - 5, baseline, format_amount(total.current), font_body, 8.5)
    sheet.right_text(COL_CUM - 5, baseline, format_amount(total.cum), font_body, 8.5)
    sheet.right_text(COL_RATIO - 5, baseline, format_percent(total.ratio), font_body, 8.5)
    y += TOTAL_ROW_HEIGHT

    # 법조문·날짜·서명란이 한 칸 안에 들어간다
    sheet.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, TAIL_HEIGHT)
    sheet.center_text(
        (TABLE_LEFT + TABLE_RIGHT) / 2, y + 22, doc.legal_clause, font_body, 9.5
    )

    last_day = calendar.monthrange(month.year, month.month)[1]
    sheet.center_text(
        (TABLE_LEFT + TABLE_RIGHT) / 2 + 45,
        y + 88,
        f"{month.year}년    {month.month}월   {last_day}일",
        font_body,
        10,
    )

    names = {
        "작 성 자": (site.author_title, site.author_name),
        "확 인 자": (site.approver_title, site.approver_name),
    }
    signature_y = y + TAIL_HEIGHT - 22 - (len(doc.signatures) - 1) * 24
    for signature in doc.signatures:
        title, name = names.get(signature.role, (signature.title, ""))
        sheet.text(228, signature_y, signature.role, font_title, 9.5)
        sheet.text(300, signature_y, title or signature.title, font_title, 9.5)
        sheet.text(432, signature_y, "성명:", font_title, 9.5)
        sheet.text(468, signature_y, name, font_title, 9.5)
        sheet.text(538, signature_y, "(인)", font_body, 6.5)
        signature_y += 24
