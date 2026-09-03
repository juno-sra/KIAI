"""사진 처리.

원본은 그대로 두고 인쇄용 축소본을 따로 만든다. 현행 엑셀 통합문서는 원본 사진을
그대로 품어 월 29MB가 되는데, 그중 28.6MB가 사진이었다.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps

MAX_EDGE = 1600
QUALITY = 82


def make_print_copy(
    src: Path, dest_dir: Path, max_edge: int = MAX_EDGE, quality: int = QUALITY
) -> Path:
    """인쇄용 축소본을 만들어 경로를 돌려준다. 원본보다 키우지 않는다."""
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"{Path(src).stem}.jpg"
    with Image.open(src) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((max_edge, max_edge), Image.LANCZOS)
        image.save(out, "JPEG", quality=quality, optimize=True)
    return out
