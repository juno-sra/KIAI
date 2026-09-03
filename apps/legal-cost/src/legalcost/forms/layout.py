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

    def wrap(self, s: str, font: str, size: float, max_width: float) -> list[str]:
        """칸 너비에 맞게 문자열을 여러 줄로 접는다.

        한국어는 어절 단위로 끊는다. 한 어절이 칸보다 길면 글자 단위로 자른다.
        """
        if not s:
            return [""]
        lines: list[str] = []
        current = ""
        for word in s.split(" "):
            candidate = f"{current} {word}".strip()
            if current and pdfmetrics.stringWidth(candidate, font, size) > max_width:
                lines.append(current)
                current = word
            else:
                current = candidate
            while pdfmetrics.stringWidth(current, font, size) > max_width and len(current) > 1:
                cut = len(current) - 1
                while cut > 1 and pdfmetrics.stringWidth(current[:cut], font, size) > max_width:
                    cut -= 1
                lines.append(current[:cut])
                current = current[cut:]
        if current:
            lines.append(current)
        return lines

    def wrapped_text(
        self,
        x: float,
        y: float,
        s: str,
        font: str,
        size: float,
        max_width: float,
        line_height: float,
    ) -> int:
        """접어서 그리고 그린 줄 수를 돌려준다. y 는 첫 줄의 기준선이다."""
        lines = self.wrap(s, font, size, max_width)
        for index, line in enumerate(lines):
            self.text(x, y + index * line_height, line, font, size)
        return len(lines)

    def line(self, x1: float, y1: float, x2: float, y2: float, width: float = 0.5) -> None:
        self.canvas.setLineWidth(width)
        self.canvas.line(x1, y1, x2, y2)

    def rect(self, x: float, y: float, w: float, h: float, width: float = 0.5) -> None:
        self.canvas.setLineWidth(width)
        self.canvas.rect(x, y, w, h, stroke=1, fill=0)

    def image(self, path, x: float, y: float, w: float, h: float, keep_ratio: bool = True) -> None:
        def draw():
            self.canvas.drawImage(
                str(path), 0, 0, width=w, height=h, preserveAspectRatio=keep_ratio, anchor="c"
            )

        self._upright(x, y + h, draw)

    def full_bleed_image(self, path, page_top: float, page_bottom: float) -> None:
        """여백을 넘어 페이지 폭을 꽉 채워 그린다. 발주처 배너처럼 재단선까지 가는 그림용."""
        x = -self.spec.margin_left / self.spec.scale
        y = (page_top - self.spec.margin_top) / self.spec.scale
        width = PAGE_SIZE[0] / self.spec.scale
        height = (page_bottom - page_top) / self.spec.scale
        self.image(path, x, y, width, height, keep_ratio=False)

    def close(self) -> None:
        self.canvas.restoreState()
