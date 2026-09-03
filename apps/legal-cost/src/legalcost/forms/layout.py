"""시트 좌표계 렌더링 도우미.

시트 좌표계는 인쇄영역 좌상단이 원점이고 오른쪽·아래쪽이 양(+)이다.
엑셀 시트를 보며 좌표를 적을 수 있게 하려는 것이며, 인쇄 배율과 여백은
캔버스 변환으로 처리한다. y축이 뒤집혀 있으므로 글자와 이미지는
부분 변환으로 다시 뒤집어 그린다.
"""

from __future__ import annotations

from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from .. import PAGE_SIZE
from .spec import SheetSpec


def register_fonts(font_dir: Path) -> dict[str, str]:
    """폴더의 TTF를 모두 등록하고 {파일이름(확장자 제외): 폰트명} 을 돌려준다."""
    registered: dict[str, str] = {}
    directory = Path(font_dir)
    if not directory.exists():
        return registered
    for path in sorted(directory.glob("*.ttf")):
        name = path.stem
        pdfmetrics.registerFont(TTFont(name, str(path)))
        registered[name] = name
    return registered


class Sheet:
    """한 장의 시트. 배율·여백 변환을 걸고, close() 로 되돌린다."""

    def __init__(self, canvas, spec: SheetSpec):
        self.canvas = canvas
        self.spec = spec
        canvas.saveState()
        # 좌상단을 원점으로, 아래쪽을 + 로 만든다.
        canvas.translate(spec.margin_left, PAGE_SIZE[1] - spec.margin_top)
        canvas.scale(spec.scale, -spec.scale)

    def content_size(self) -> tuple[float, float]:
        """시트 좌표계에서 쓸 수 있는 폭과 높이."""
        width = (PAGE_SIZE[0] - self.spec.margin_left - self.spec.margin_right) / self.spec.scale
        height = (PAGE_SIZE[1] - self.spec.margin_top - self.spec.margin_bottom) / self.spec.scale
        return width, height

    def _upright(self, x: float, y: float, draw) -> None:
        self.canvas.saveState()
        self.canvas.translate(x, y)
        self.canvas.scale(1, -1)
        draw()
        self.canvas.restoreState()

    def text(self, x: float, y: float, s: str, font: str, size: float) -> None:
        def draw():
            self.canvas.setFont(font, size)
            self.canvas.drawString(0, 0, s)

        self._upright(x, y, draw)

    def right_text(self, x: float, y: float, s: str, font: str, size: float) -> None:
        def draw():
            self.canvas.setFont(font, size)
            self.canvas.drawRightString(0, 0, s)

        self._upright(x, y, draw)

    def center_text(self, x: float, y: float, s: str, font: str, size: float) -> None:
        def draw():
            self.canvas.setFont(font, size)
            self.canvas.drawCentredString(0, 0, s)

        self._upright(x, y, draw)

    def line(self, x1: float, y1: float, x2: float, y2: float, width: float = 0.5) -> None:
        self.canvas.setLineWidth(width)
        self.canvas.line(x1, y1, x2, y2)

    def rect(self, x: float, y: float, w: float, h: float, width: float = 0.5) -> None:
        self.canvas.setLineWidth(width)
        self.canvas.rect(x, y, w, h, stroke=1, fill=0)

    def image(self, path, x: float, y: float, w: float, h: float) -> None:
        def draw():
            self.canvas.drawImage(
                str(path), 0, 0, width=w, height=h, preserveAspectRatio=True, anchor="c"
            )

        self._upright(x, y + h, draw)

    def close(self) -> None:
        self.canvas.restoreState()
