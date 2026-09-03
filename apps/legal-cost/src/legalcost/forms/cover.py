"""갑지(표지) 렌더러. 4종이 같은 인쇄 설정을 쓴다.

좌표는 실제 제출본 PDF에서 측정한 실측값이다.

정답지 갑지 상단에는 발주처 배너 이미지(로고와 사진 띠)가 들어간다. 그림이라
프로그램이 그릴 수 없으므로 Site.banner_path 에 파일을 지정하면 넣고, 없으면
그 자리를 비운다. 배너가 없으면 픽셀 대조에서 그만큼 차이가 남는다.
"""

from __future__ import annotations

from ..doctypes import DOC_TYPES
from ..models import MonthInput, Site
from .layout import Sheet
from .spec import SHEET_SPECS

CENTER_X = 290.0

# 배너는 인쇄 여백을 넘어 페이지 맨 위부터 제목 윗선 직전까지 채운다(페이지 좌표, pt).
BANNER_PAGE_TOP = 0.0
BANNER_PAGE_BOTTOM = 184.5

RULE_TOP_Y = 142.0
TITLE_Y = 190.0
SUBTITLE_Y = 213.0
RULE_BOTTOM_Y = 221.1
SITE_Y = 246.0
PERIOD_Y = 274.0

BOX_LEFT = 410.5
BOX_DIVIDER = 450.4
BOX_RIGHT = 541.2
BOX_TOP = 613.3
BOX_BOTTOM = 681.5


def draw_cover(canvas, site: Site, month: MonthInput, font_body: str, font_title: str) -> None:
    """갑지 한 장을 그린다. showPage() 는 호출하지 않는다."""
    doc = DOC_TYPES[month.doc_key]
    sheet = Sheet(canvas, SHEET_SPECS[(month.doc_key, "갑지")])
    try:
        if site.banner_path is not None:
            sheet.full_bleed_image(site.banner_path, BANNER_PAGE_TOP, BANNER_PAGE_BOTTOM)

        sheet.line(40, RULE_TOP_Y, CENTER_X * 2 - 40, RULE_TOP_Y, 2.0)
        sheet.center_text(CENTER_X, TITLE_Y, doc.title, font_title, 22)
        if doc.cover_subtitle:
            sheet.center_text(CENTER_X, SUBTITLE_Y, doc.cover_subtitle, font_title, 13)
        sheet.line(40, RULE_BOTTOM_Y, CENTER_X * 2 - 40, RULE_BOTTOM_Y, 2.0)

        sheet.center_text(CENTER_X, SITE_Y, site.site_name, font_title, 14)
        sheet.center_text(
            CENTER_X, PERIOD_Y, f"{month.year}년 {month.month}월 사용분", font_title, 11
        )

        height = BOX_BOTTOM - BOX_TOP
        sheet.rect(BOX_LEFT, BOX_TOP, BOX_RIGHT - BOX_LEFT, height, 1.4)
        sheet.line(BOX_DIVIDER, BOX_TOP, BOX_DIVIDER, BOX_BOTTOM, 1.4)
        label_x = (BOX_LEFT + BOX_DIVIDER) / 2
        for index, char in enumerate("시공사"):
            sheet.center_text(label_x, BOX_TOP + 20 + index * 15, char, font_title, 9)
        sheet.center_text(
            (BOX_DIVIDER + BOX_RIGHT) / 2,
            BOX_TOP + height * 0.58,
            site.cover_company_name(),
            font_title,
            12,
        )
    finally:
        sheet.close()
