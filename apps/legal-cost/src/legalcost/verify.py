"""생성한 PDF를 정답지(실제 제출본)와 픽셀 단위로 대조한다.

"육안 구분 불가"를 눈짐작이 아니라 수치로 확인하기 위한 장치다.
외부 프로그램 없이 pypdfium2 로 래스터화하므로 어디서든 같은 결과가 나온다.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
from PIL import Image


def render_page(pdf: Path, index: int, scale: float = 2.0) -> Image.Image:
    document = pdfium.PdfDocument(str(pdf))
    try:
        return document[index].render(scale=scale).to_pil().convert("L")
    finally:
        document.close()


def page_count(pdf: Path) -> int:
    document = pdfium.PdfDocument(str(pdf))
    try:
        return len(document)
    finally:
        document.close()


def _aligned(a: Image.Image, b: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    if a.size != b.size:
        b = b.resize(a.size)
    return np.asarray(a, dtype=np.int16), np.asarray(b, dtype=np.int16)


def diff_ratio(a: Image.Image, b: Image.Image, threshold: int = 16) -> float:
    """밝기 차이가 threshold 를 넘는 화소의 비율(0.0~1.0)."""
    left, right = _aligned(a, b)
    return float((np.abs(left - right) > threshold).mean())


def diff_image(a: Image.Image, b: Image.Image, threshold: int = 16) -> Image.Image:
    """차이 나는 화소를 빨강으로 칠한 대조 이미지."""
    left, right = _aligned(a, b)
    mask = np.abs(left - right) > threshold
    canvas = np.stack([np.asarray(a.convert("L"))] * 3, axis=-1).astype(np.uint8)
    canvas[mask] = (255, 0, 0)
    return Image.fromarray(canvas)


def compare(generated: Path, reference: Path, out_dir: Path | None = None) -> list[float]:
    """페이지별 차이율을 돌려준다. 페이지 수가 다르면 ValueError."""
    generated_pages = page_count(generated)
    reference_pages = page_count(reference)
    if generated_pages != reference_pages:
        raise ValueError(
            f"페이지 수가 다릅니다: 생성본 {generated_pages}쪽, 정답지 {reference_pages}쪽"
        )
    if out_dir is not None:
        Path(out_dir).mkdir(parents=True, exist_ok=True)

    ratios: list[float] = []
    for index in range(generated_pages):
        left = render_page(generated, index)
        right = render_page(reference, index)
        ratio = diff_ratio(left, right)
        ratios.append(ratio)
        if out_dir is not None:
            diff_image(left, right).save(
                Path(out_dir) / f"page-{index + 1:03d}-{ratio * 100:.2f}pct.png"
            )
    return ratios
