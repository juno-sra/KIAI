from pathlib import Path

import pytest
from reportlab.pdfgen import canvas as rl_canvas

from legalcost import PAGE_SIZE
from legalcost.verify import compare, diff_ratio, render_page


def _pdf(path: Path, texts: list[str], font: str) -> Path:
    canvas = rl_canvas.Canvas(str(path), pagesize=PAGE_SIZE)
    for text in texts:
        canvas.setFont(font, 12)
        canvas.drawString(72, 700, text)
        canvas.showPage()
    canvas.save()
    return path


def test_identical_pdfs_have_zero_difference(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["같은 내용"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["같은 내용"], fonts["body"])
    assert compare(a, b) == [0.0]


def test_different_pdfs_have_nonzero_difference(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["내용 하나"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["전혀 다른 내용이 여기 있다"], fonts["body"])
    assert compare(a, b)[0] > 0.0


def test_page_count_mismatch_raises(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["1"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["1", "2"], fonts["body"])
    with pytest.raises(ValueError):
        compare(a, b)


def test_diff_images_are_written_when_out_dir_given(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["내용 하나"], fonts["body"])
    b = _pdf(tmp_path / "b.pdf", ["다른 내용"], fonts["body"])
    out = tmp_path / "diff"
    compare(a, b, out_dir=out)
    assert list(out.glob("page-001*.png"))


def test_render_page_size_is_consistent(tmp_path, fonts):
    a = _pdf(tmp_path / "a.pdf", ["x"], fonts["body"])
    image = render_page(a, 0, scale=2.0)
    assert image.size == (1191, 1684)
    assert diff_ratio(image, image) == 0.0
