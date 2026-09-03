"""사진대지 렌더러. A4 한 장에 사진 2컷, 컷마다 캡션 4칸.

캡션의 공사명은 현장 설정에서 채워야 한다. 현행 엑셀에서는 이 칸에 다른 현장
이름(경기도 광주 쌍동1지구, 2021년)이 그대로 남아 제출된 사례가 있었다.
"""

from __future__ import annotations

from ..models import Photo
from .layout import Sheet
from .spec import SHEET_SPECS

TITLE_Y = 30.0
BLOCK_TOP = 60.0
BLOCK_HEIGHT = 300.0
IMAGE_LEFT = 40.0
IMAGE_WIDTH = 420.0
IMAGE_HEIGHT = 220.0
CAPTION_LABEL_WIDTH = 70.0
CAPTION_ROW_HEIGHT = 20.0
SHEET_RIGHT = 500.0


def pair_photos(photos: list[Photo]) -> list[list[Photo]]:
    """항목 순서·order 순으로 정렬해 2장씩 묶는다. 마지막 묶음은 1장일 수 있다."""
    ordered = sorted(photos, key=lambda p: (p.item_no, p.order, p.image_path.name))
    return [ordered[i : i + 2] for i in range(0, len(ordered), 2)]


def _draw_block(sheet, photo: Photo, top: float, font_body: str) -> None:
    sheet.rect(IMAGE_LEFT, top, IMAGE_WIDTH, IMAGE_HEIGHT)
    sheet.image(photo.image_path, IMAGE_LEFT + 2, top + 2, IMAGE_WIDTH - 4, IMAGE_HEIGHT - 4)

    y = top + IMAGE_HEIGHT
    half = IMAGE_LEFT + IMAGE_WIDTH / 2
    rows = [
        ("공 사 명", photo.site_name, "위      치", photo.location),
        ("내      용", photo.content, "날      짜", photo.date),
    ]
    for label, value, label2, value2 in rows:
        sheet.rect(IMAGE_LEFT, y, IMAGE_WIDTH, CAPTION_ROW_HEIGHT)
        sheet.line(
            IMAGE_LEFT + CAPTION_LABEL_WIDTH,
            y,
            IMAGE_LEFT + CAPTION_LABEL_WIDTH,
            y + CAPTION_ROW_HEIGHT,
        )
        sheet.line(half, y, half, y + CAPTION_ROW_HEIGHT)
        sheet.line(
            half + CAPTION_LABEL_WIDTH, y, half + CAPTION_LABEL_WIDTH, y + CAPTION_ROW_HEIGHT
        )
        baseline = y + CAPTION_ROW_HEIGHT * 0.68
        sheet.center_text(IMAGE_LEFT + CAPTION_LABEL_WIDTH / 2, baseline, label, font_body, 8)
        sheet.text(IMAGE_LEFT + CAPTION_LABEL_WIDTH + 4, baseline, value, font_body, 7.5)
        sheet.center_text(half + CAPTION_LABEL_WIDTH / 2, baseline, label2, font_body, 8)
        sheet.text(half + CAPTION_LABEL_WIDTH + 4, baseline, value2, font_body, 7.5)
        y += CAPTION_ROW_HEIGHT


def draw_photo_sheets(
    canvas, photos: list[Photo], font_body: str, font_title: str, doc_key: str
) -> int:
    """사진대지를 그리고 페이지 수를 돌려준다. 사진이 없으면 0.

    페이지 사이에서만 showPage() 를 부른다. 마지막 showPage() 는 호출한 쪽 책임이다.
    """
    pages = pair_photos(photos)
    if not pages:
        return 0
    spec = SHEET_SPECS[(doc_key, "갑지")]
    for page_index, page in enumerate(pages):
        if page_index > 0:
            canvas.showPage()
        sheet = Sheet(canvas, spec)
        try:
            sheet.center_text(SHEET_RIGHT / 2, TITLE_Y, "사  진  대  지", font_title, 16)
            for slot, photo in enumerate(page):
                _draw_block(sheet, photo, BLOCK_TOP + slot * BLOCK_HEIGHT, font_body)
        finally:
            sheet.close()
    return len(pages)
