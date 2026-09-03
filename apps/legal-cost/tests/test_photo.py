import re
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.forms.photosheet import draw_photo_sheets, pair_photos
from legalcost.models import Photo
from legalcost.photo import make_print_copy


def _make_image(path: Path, size=(4000, 3000)) -> Path:
    Image.new("RGB", size, (180, 190, 200)).save(path, "JPEG", quality=95)
    return path


def _photo(path: Path, item_no: int = 1, order: int = 0) -> Photo:
    return Photo(
        item_no=item_no,
        image_path=path,
        site_name="안양 인덕원 주변 도시개발사업 부지조성공사",
        location="현장 내",
        content="안전난간 설치",
        date="2026-08-10",
        order=order,
    )


def test_print_copy_is_smaller_and_bounded(tmp_path):
    src = _make_image(tmp_path / "big.jpg")
    out = make_print_copy(src, tmp_path / "print")
    assert out.exists()
    assert out.stat().st_size < src.stat().st_size
    with Image.open(out) as image:
        assert max(image.size) <= 1600


def test_print_copy_does_not_upscale_small_images(tmp_path):
    src = _make_image(tmp_path / "small.jpg", size=(800, 600))
    out = make_print_copy(src, tmp_path / "print")
    with Image.open(out) as image:
        assert image.size == (800, 600)


def test_photos_are_paired_two_per_page(tmp_path):
    paths = [_make_image(tmp_path / f"{i}.jpg", (400, 300)) for i in range(5)]
    pages = pair_photos([_photo(p, order=i) for i, p in enumerate(paths)])
    assert [len(page) for page in pages] == [2, 2, 1]


def test_photos_are_ordered_by_item_then_order(tmp_path):
    a = _photo(_make_image(tmp_path / "a.jpg", (400, 300)), item_no=2, order=0)
    b = _photo(_make_image(tmp_path / "b.jpg", (400, 300)), item_no=1, order=1)
    c = _photo(_make_image(tmp_path / "c.jpg", (400, 300)), item_no=1, order=0)
    pages = pair_photos([a, b, c])
    assert [p.image_path.name for p in pages[0]] == ["c.jpg", "b.jpg"]


def test_photo_sheet_renders_title_and_captions(tmp_path, fonts):
    paths = [_make_image(tmp_path / f"{i}.jpg", (400, 300)) for i in range(3)]
    photos = [_photo(p, order=i) for i, p in enumerate(paths)]
    path = tmp_path / "photos.pdf"
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    count = draw_photo_sheets(canvas, photos, fonts["body"], fonts["title"], "산안비")
    canvas.showPage()
    canvas.save()
    assert count == 2
    document = pdfium.PdfDocument(str(path))
    assert len(document) == 2
    text = re.sub(r"\s+", " ", document[0].get_textpage().get_text_range())
    assert "사 진 대 지" in text
    assert "공 사 명" in text
    assert "위 치" in text
    assert "내 용" in text
    assert "날 짜" in text
    assert "안전난간 설치" in text


def test_no_photos_draws_nothing(tmp_path, fonts):
    path = tmp_path / "empty.pdf"
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    assert draw_photo_sheets(canvas, [], fonts["body"], fonts["title"], "산안비") == 0
