"""제출 전 검증 규칙.

규칙은 현행 엑셀 통합문서에서 실제로 발견된 사고에서 나왔다.
특히 CAPTION_SITE_MISMATCH 는 지난달 파일을 복사해 쓰다 다른 현장 이름이
사진 캡션에 남아 있던 사례를 막기 위한 것이다.
"""

from __future__ import annotations

from dataclasses import dataclass

from .calc import compute
from .models import MonthInput, Site


@dataclass(frozen=True)
class Finding:
    code: str
    level: str
    message: str


def validate(site: Site, month: MonthInput) -> list[Finding]:
    findings: list[Finding] = []
    totals = compute(month)

    if totals.remaining < 0:
        findings.append(
            Finding(
                "ALLOCATION_EXCEEDED",
                "error",
                f"누계 사용금액 {totals.total.cum:,}원이 계상액 {month.allocation:,}원을 "
                f"{-totals.remaining:,}원 초과합니다.",
            )
        )

    evidenced = {evidence.entry_index for evidence in month.evidences}
    for index, entry in enumerate(month.entries):
        expected = round(entry.quantity * entry.unit_price)
        if expected != entry.amount:
            findings.append(
                Finding(
                    "AMOUNT_MISMATCH",
                    "error",
                    f"{index + 1}번째 집행 '{entry.description}': "
                    f"수량×단가={expected:,}원인데 금액은 {entry.amount:,}원입니다.",
                )
            )
        if entry.amount != 0 and index not in evidenced:
            findings.append(
                Finding(
                    "EVIDENCE_MISSING",
                    "warning",
                    f"{index + 1}번째 집행 '{entry.description}'에 증빙이 없습니다.",
                )
            )

    for photo in month.photos:
        blanks = [
            label
            for label, value in (
                ("공사명", photo.site_name),
                ("위치", photo.location),
                ("내용", photo.content),
                ("날짜", photo.date),
            )
            if not value.strip()
        ]
        if blanks:
            findings.append(
                Finding(
                    "CAPTION_EMPTY",
                    "error",
                    f"사진 '{photo.image_path.name}'의 캡션이 비었습니다: {', '.join(blanks)}",
                )
            )
        if photo.site_name.strip() and photo.site_name.strip() != site.site_name:
            findings.append(
                Finding(
                    "CAPTION_SITE_MISMATCH",
                    "error",
                    f"사진 '{photo.image_path.name}'의 공사명이 현장 설정과 다릅니다: "
                    f"'{photo.site_name}'",
                )
            )

    return findings
