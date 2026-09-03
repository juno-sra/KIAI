"""내역서(상세) 렌더러.

좌표는 실제 제출본 PDF에서 측정한 실측값이다.

원본 서식은 항목마다 고정 줄 수를 두고, 넘치면 사람이 배율을 줄여 맞췄다.
여기서는 그 고정 줄 수를 최소값으로 지키되, 집행이 더 많으면 줄을 늘리고
다음 장으로 넘긴다. 머리행은 장마다 반복한다.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..doctypes import DOC_TYPES
from ..models import Entry, MonthInput
from ..money import format_amount
from .layout import Sheet
from .spec import SHEET_SPECS

# --- 실측 세로선 (시트 좌표계 x) ---
COL_ITEM = 26.2
COL_COMPANY = 119.6
COL_YEAR = 163.9
COL_MONTH = 193.6
COL_DAY = 223.2
COL_DESC = 252.9
COL_UNIT = 422.9
COL_QTY = 449.6
COL_PRICE = 482.6
COL_AMOUNT = 550.2
COL_NOTE = 617.6
TABLE_RIGHT = 679.2

# --- 실측 가로선 (시트 좌표계 y) ---
TITLE_Y = 32.0
TABLE_TOP = 52.5
HEADER_HEIGHT = 25.7

# 줄 높이는 문서마다 다르다(DocType.detail_row_height). 한 장에 몇 줄이 들어가는지는
# 인쇄영역 높이에서 계산한다.
BOTTOM_PADDING = 12.0

COLUMN_DIVIDERS = (
    COL_COMPANY,
    COL_YEAR,
    COL_MONTH,
    COL_DAY,
    COL_DESC,
    COL_UNIT,
    COL_QTY,
    COL_PRICE,
    COL_AMOUNT,
    COL_NOTE,
)


@dataclass(frozen=True)
class DetailRow:
    kind: str  # "entry" | "blank" | "subtotal"
    item_name: str
    entry: Entry | None = None
    subtotal: int | None = None


def _rows(month: MonthInput) -> list[DetailRow]:
    doc = DOC_TYPES[month.doc_key]
    out: list[DetailRow] = []
    grand = 0
    for index, name in enumerate(doc.items, start=1):
        entries = [entry for entry in month.entries if entry.item_no == index]
        for entry in entries:
            out.append(DetailRow("entry", name, entry=entry))
        minimum = doc.detail_min_rows[index - 1] if index <= len(doc.detail_min_rows) else 0
        for _ in range(max(0, minimum - len(entries))):
            out.append(DetailRow("blank", name))
        subtotal = sum(entry.amount for entry in entries)
        grand += subtotal
        out.append(DetailRow("subtotal", name, subtotal=subtotal))
    out.append(DetailRow("grandtotal", "", subtotal=grand))
    return out


def rows_per_page(doc_key: str) -> int:
    """인쇄영역 높이에서 한 장에 들어가는 줄 수를 계산한다."""
    from .. import PAGE_SIZE

    spec = SHEET_SPECS[(doc_key, "내역서")]
    content_height = (PAGE_SIZE[1] - spec.margin_top - spec.margin_bottom) / spec.scale
    usable = content_height - TABLE_TOP - HEADER_HEIGHT - BOTTOM_PADDING
    return max(1, int(usable // DOC_TYPES[doc_key].detail_row_height))


def paginate(month: MonthInput, rows_per_page_override: int | None = None) -> list[list[DetailRow]]:
    rows = _rows(month)
    if not rows:
        return [[]]
    per_page = rows_per_page_override or rows_per_page(month.doc_key)
    return [rows[i : i + per_page] for i in range(0, len(rows), per_page)]


SHADE = 0.93


def _shade(sheet, x: float, y: float, w: float, h: float) -> None:
    sheet.canvas.saveState()
    sheet.canvas.setFillGray(SHADE)
    sheet.canvas.rect(x, y, w, h, stroke=0, fill=1)
    sheet.canvas.restoreState()


def _block_starts(page: list[DetailRow]) -> dict[int, int]:
    """이 장에서 항목명 칸을 세로 병합할 구간의 {시작 위치: 줄 수}."""
    starts: dict[int, int] = {}
    position = 0
    while position < len(page):
        row = page[position]
        if row.kind not in ("entry", "blank"):
            position += 1
            continue
        end = position
        while (
            end < len(page)
            and page[end].kind in ("entry", "blank")
            and page[end].item_name == row.item_name
        ):
            end += 1
        starts[position] = end - position
        position = end
    return starts


def _draw_block_label(
    sheet, row: DetailRow, company: str, top: float, height: float, font_body, font_title
):
    """세로 병합된 항목명·회사명 칸의 내용을 블록 중앙에 그린다."""
    name_width = COL_COMPANY - COL_ITEM - 8
    lines = sheet.wrap(row.item_name, font_title, 7.5, name_width)
    first = top + height / 2 - (len(lines) - 1) * 4.5
    sheet.wrapped_text(COL_ITEM + 4, first, row.item_name, font_title, 7.5, name_width, 9)

    if company:
        company_width = COL_YEAR - COL_COMPANY - 6
        company_lines = sheet.wrap(company, font_body, 7, company_width)
        first = top + height / 2 - (len(company_lines) - 1) * 4.0
        sheet.wrapped_text(COL_COMPANY + 3, first, company, font_body, 7, company_width, 8)


def _draw_header(sheet, month, font_body, font_title) -> float:
    title = f"항목별 사용 내역({month.year}년{month.month:02d}월)"
    sheet.center_text((COL_ITEM + TABLE_RIGHT) / 2, TITLE_Y, title, font_title, 13)
    y = TABLE_TOP
    sheet.rect(COL_ITEM, y, TABLE_RIGHT - COL_ITEM, HEADER_HEIGHT)
    for x in COLUMN_DIVIDERS:
        sheet.line(x, y, x, y + HEADER_HEIGHT)
    baseline = y + HEADER_HEIGHT * 0.66
    headers = (
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
        (COL_NOTE, TABLE_RIGHT, "비 고"),
    )
    for left, right, label in headers:
        sheet.center_text((left + right) / 2, baseline, label, font_title, 8.5)
    return y + HEADER_HEIGHT


def draw_detail(
    canvas, month: MonthInput, font_body: str, font_title: str, company: str = ""
) -> int:
    """내역서를 그리고 페이지 수를 돌려준다.

    페이지 사이에서만 showPage() 를 부르고 마지막 페이지 뒤에는 부르지 않는다.
    호출한 쪽이 마지막 showPage() 를 책임진다.
    """
    pages = paginate(month)
    spec = SHEET_SPECS[(month.doc_key, "내역서")]
    row_height = DOC_TYPES[month.doc_key].detail_row_height
    for page_index, page in enumerate(pages):
        if page_index > 0:
            canvas.showPage()
        sheet = Sheet(canvas, spec)
        try:
            y = _draw_header(sheet, month, font_body, font_title)
            block_starts = _block_starts(page)
            block_top = y
            for position, row in enumerate(page):
                merged = row.kind in ("entry", "blank")
                # 항목명·회사명 칸은 블록 안에서 세로로 병합한다.
                if merged and position not in block_starts:
                    sheet.line(COL_YEAR, y, TABLE_RIGHT, y)
                else:
                    sheet.line(COL_ITEM, y, TABLE_RIGHT, y)
                for x in COLUMN_DIVIDERS:
                    sheet.line(x, y, x, y + row_height)
                sheet.line(COL_ITEM, y, COL_ITEM, y + row_height)
                sheet.line(TABLE_RIGHT, y, TABLE_RIGHT, y + row_height)

                baseline = y + row_height * 0.62
                if position in block_starts:
                    block_top = y
                    span = block_starts[position]
                    block = page[position : position + span]
                    block_company = next(
                        (r.entry.company for r in block if r.entry is not None), company
                    )
                    _draw_block_label(
                        sheet, row, block_company, block_top, span * row_height,
                        font_body, font_title,
                    )
                    if all(r.kind == "blank" for r in block):
                        sheet.text(
                            COL_DESC + 4, y + row_height * 0.62, "사용내역 없음.", font_body, 8
                        )

                if row.kind in ("subtotal", "grandtotal"):
                    _shade(sheet, COL_ITEM, y, TABLE_RIGHT - COL_ITEM, row_height)
                    sheet.line(COL_ITEM, y, TABLE_RIGHT, y)
                    for x in COLUMN_DIVIDERS:
                        sheet.line(x, y, x, y + row_height)
                    label = "소                   계" if row.kind == "subtotal" else "합                   계"
                    sheet.center_text((COL_ITEM + COL_DESC) / 2, baseline, label, font_title, 8.5)
                    sheet.right_text(
                        COL_NOTE - 4, baseline, format_amount(row.subtotal or 0), font_title, 8.5
                    )
                elif row.kind == "blank":
                    sheet.right_text(COL_NOTE - 4, baseline, "-", font_body, 8)
                elif row.kind == "entry":
                    entry = row.entry
                    assert entry is not None
                    sheet.center_text(
                        (COL_YEAR + COL_MONTH) / 2,
                        baseline,
                        f"{entry.date.year % 100}",
                        font_body,
                        8,
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
                y += row_height
            # 표 아래 테두리
            sheet.line(COL_ITEM, y, TABLE_RIGHT, y)
        finally:
            sheet.close()
    return len(pages)
