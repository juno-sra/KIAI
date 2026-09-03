"""장표별 인쇄 설정.

값은 현행 엑셀 통합문서 4종에서 실측한 것이다. 배율과 여백이 문서마다 다르며,
갑지만 4종이 완전히 같다. 임의로 통일하면 발주처가 매달 보던 출력물과 달라진다.
"""

from __future__ import annotations

from dataclasses import dataclass

INCH = 72.0


@dataclass(frozen=True)
class SheetSpec:
    scale: float
    margin_left: float
    margin_right: float
    margin_top: float
    margin_bottom: float


def _spec(scale: float, left: float, right: float, top: float, bottom: float) -> SheetSpec:
    """여백은 인치로 받아 포인트로 저장한다."""
    return SheetSpec(scale, left * INCH, right * INCH, top * INCH, bottom * INCH)


_COVER = _spec(
    0.92, 0.6299212598425197, 0.2362204724409449, 0.7480314960629921, 0.7480314960629921
)
_SUMMARY_OSH = _spec(
    0.92, 0.31496062992125984, 0.31496062992125984, 0.7480314960629921, 0.5511811023622047
)
_SUMMARY_CTA = _spec(
    0.95, 0.31496062992125984, 0.31496062992125984, 0.7480314960629921, 0.5511811023622047
)
_MONTHLY_OSH = _spec(
    0.91, 0.4724409448818898, 0.31496062992125984, 0.3937007874015748, 0.3937007874015748
)
_MONTHLY_CTA = _spec(
    0.97, 0.4724409448818898, 0.31496062992125984, 0.3937007874015748, 0.3937007874015748
)
_DETAIL_OSH = _spec(0.75, 0.39, 0.39, 0.7480314960629921, 0.7480314960629921)
_DETAIL_CTA_75 = _spec(0.75, 0.39, 0.51, 0.7480314960629921, 0.7480314960629921)
_DETAIL_CTA_93 = _spec(0.93, 0.39, 0.51, 0.7480314960629921, 0.7480314960629921)

SHEET_SPECS: dict[tuple[str, str], SheetSpec] = {
    ("산안비", "갑지"): _COVER,
    ("안전1", "갑지"): _COVER,
    ("안전2", "갑지"): _COVER,
    ("환경", "갑지"): _COVER,
    ("산안비", "집계표"): _SUMMARY_OSH,
    ("안전1", "집계표"): _SUMMARY_CTA,
    ("안전2", "집계표"): _SUMMARY_CTA,
    ("환경", "집계표"): _SUMMARY_CTA,
    ("산안비", "항목월"): _MONTHLY_OSH,
    ("안전1", "항목월"): _MONTHLY_CTA,
    ("안전2", "항목월"): _MONTHLY_CTA,
    ("환경", "항목월"): _MONTHLY_CTA,
    ("산안비", "내역서"): _DETAIL_OSH,
    ("안전1", "내역서"): _DETAIL_CTA_75,
    ("안전2", "내역서"): _DETAIL_CTA_93,
    ("환경", "내역서"): _DETAIL_CTA_75,
}
