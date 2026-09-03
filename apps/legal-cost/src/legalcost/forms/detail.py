"""내역서(상세) 렌더러.

집행 줄이 많으면 여러 장으로 나눈다. 원본 엑셀은 항목마다 고정 줄 수를 두고
넘치면 손으로 배율을 줄이는 방식이었는데, 여기서는 줄 수 제한 없이 다음 장으로
넘기고 머리행을 반복한다.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..doctypes import DOC_TYPES
from ..models import Entry, MonthInput
from ..money import format_amount
from .layout import Sheet
from .spec import SHEET_SPECS

# 열 경계 (시트 좌표계 x). 배율 75% 기준으로 A4 폭 안에 들어간다.
COL_ITEM = 0.0
COL_COMPANY = 150.0
COL_YEAR = 240.0
COL_MONTH = 264.0
COL_DAY = 288.0
COL_DESC = 316.0
COL_UNIT = 500.0
COL_QTY = 540.0
COL_PRICE = 600.0
COL_AMOUNT = 680.0
COL_NOTE = 740.0

ROW_HEIGHT = 18.0
TITLE_Y = 30.0
TABLE_TOP = 56.0
DEFAULT_ROWS_PER_PAGE = 34


@dataclass(frozen=True)
class DetailRow:
    kind: str
    item_name: str
    entry: Entry | None = None
    subtotal: int | None = None


def _rows(month: MonthInput) -> list[DetailRow]:
    doc = DOC_TYPES[month.doc_key]
    out: list[DetailRow] = []
    for index, name in enumerate(doc.items, start=1):
        entries = [entry for entry in month.entries if entry.item_no == index]
        for entry in entries:
            out.append(DetailRow("entry", name, entry=entry))
        out.append(DetailRow("subtotal", name, subtotal=sum(e.amount for e in entries)))
    return out


def paginate(month: MonthInput, rows_per_page: int = DEFAULT_ROWS_PER_PAGE) -> list[list[DetailRow]]:
    rows = _rows(month)
    if not rows:
        return [[]]
    return [rows[i : i + rows_per_page] for i in range(0, len(rows), rows_per_page)]


def _draw_header(sheet, month, font_body, font_title) -> float:
    title = f"항목별 사용 내역({month.year}년{month.month:02d}월)"
    sheet.center_text(COL_NOTE / 2, TITLE_Y, title, font_title, 12)
    y = TABLE_TOP
    sheet.rect(COL_ITEM, y, COL_NOTE, ROW_HEIGHT)
    for x in (
        COL_COMPANY,
        COL_YEAR,
        COL_MONTH,
        COL_DAY,
        COL_DESC,
        COL_UNIT,
        COL_QTY,
        COL_PRICE,
        COL_AMOUNT,
    ):
        sheet.line(x, y, x, y + ROW_HEIGHT)
    baseline = y + ROW_HEIGHT * 0.68
    headers = [
        (COL_ITEM, COL_COMPANY, "사용항목"),
        (COL_COMPANY, COL_YEAR, "회사명"),
        (COL_YEAR, COL_MONTH, "년"),
        (COL_MONTH, COL_DAY, "월"),
        (COL_DAY, COL_DESC, "일"),
        (COL_DESC, COL_UNIT, "세  부  내  역"),
        (COL_UNIT, COL_QTY, "단위"),
        (COL_QTY, COL_PRICE, "수 량"),
        (COL_PRICE, COL_AMOUNT, "단 가"),
        (COL_AMOUNT, COL_NOTE, "금 액"),
    ]
    for left, right, label in headers:
        sheet.center_text((left + right) / 2, baseline, label, font_body, 8)
    return y + ROW_HEIGHT


def draw_detail(canvas, month: MonthInput, font_body: str, font_title: str) -> int:
    """내역서를 그리고 페이지 수를 돌려준다.

    페이지 사이에서만 showPage() 를 부르고 마지막 페이지 뒤에는 부르지 않는다.
    호출한 쪽이 마지막 showPage() 를 책임진다.
    """
    pages = paginate(month)
    spec = SHEET_SPECS[(month.doc_key, "내역서")]
    for page_index, page in enumerate(pages):
        if page_index > 0:
            canvas.showPage()
        sheet = Sheet(canvas, spec)
        try:
            y = _draw_header(sheet, month, font_body, font_title)
            previous_item = None
            for row in page:
                sheet.rect(COL_ITEM, y, COL_NOTE, ROW_HEIGHT)
                for x in (
                    COL_COMPANY,
                    COL_YEAR,
                    COL_MONTH,
                    COL_DAY,
                    COL_DESC,
                    COL_UNIT,
                    COL_QTY,
                    COL_PRICE,
                    COL_AMOUNT,
                ):
                    sheet.line(x, y, x, y + ROW_HEIGHT)
                baseline = y + ROW_HEIGHT * 0.68
                if row.item_name != previous_item:
                    sheet.text(COL_ITEM + 4, baseline, row.item_name, font_body, 6.5)
                    previous_item = row.item_name
                if row.kind == "subtotal":
                    sheet.center_text(
                        (COL_YEAR + COL_UNIT) / 2, baseline, "소                   계", font_body, 8
                    )
                    sheet.right_text(
                        COL_NOTE - 4, baseline, format_amount(row.subtotal or 0), font_body, 8
                    )
                else:
                    entry = row.entry
                    assert entry is not None
                    sheet.text(COL_COMPANY + 4, baseline, entry.company, font_body, 7)
                    sheet.center_text(
                        (COL_YEAR + COL_MONTH) / 2, baseline, f"{entry.date.year % 100}", font_body, 8
                    )
                    sheet.center_text(
                        (COL_MONTH + COL_DAY) / 2, baseline, f"{entry.date.month}", font_body, 8
                    )
                    sheet.center_text(
                        (COL_DAY + COL_DESC) / 2, baseline, f"{entry.date.day}", font_body, 8
                    )
                    sheet.text(COL_DESC + 4, baseline, entry.description, font_body, 8)
                    sheet.center_text((COL_UNIT + COL_QTY) / 2, baseline, entry.unit, font_body, 8)
                    sheet.right_text(COL_PRICE - 4, baseline, f"{entry.quantity:g}", font_body, 8)
                    sheet.right_text(
                        COL_AMOUNT - 4, baseline, format_amount(entry.unit_price), font_body, 8
                    )
                    sheet.right_text(
                        COL_NOTE - 4, baseline, format_amount(entry.amount), font_body, 8
                    )
                y += ROW_HEIGHT
        finally:
            sheet.close()
    return len(pages)
