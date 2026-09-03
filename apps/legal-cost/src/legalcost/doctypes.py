"""문서 4종 정의.

문자열은 전부 실제 제출본에서 그대로 옮긴 것이다. 띄어쓰기 하나까지 서식의
일부이므로 다듬지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass

CLAUSE_OSH = (
    "건설업 산업안전보건관리비 계상 및 사용기준 제10조 제1항에 의거 "
    "위와 같이 사용내역을 제출합니다."
)
CLAUSE_CTA = "건설기술진흥법 시행규칙 제60조에 의하여 위와 같이 사용내역을 제출합니다."


@dataclass(frozen=True)
class Signature:
    role: str
    title: str


@dataclass(frozen=True)
class DocType:
    key: str
    title: str
    cover_subtitle: str
    summary_title: str
    legal_clause: str
    items: tuple[str, ...]
    signatures: tuple[Signature, ...]
    allocation_label: str


DOC_TYPES: dict[str, DocType] = {
    "산안비": DocType(
        key="산안비",
        title="산업안전보건관리비 사용내역서",
        cover_subtitle="",
        summary_title="산업안전보건관리비 사용내역서",
        legal_clause=CLAUSE_OSH,
        items=(
            "1. 안전관리자 인건비 및 각종 업무수당 등",
            "2. 안전시설비 등",
            "3. 개인보호구 및 안전장구 구입비 등",
            "4. 사업장 안전진단비 등",
            "5. 안전보건 교육비 및 행사비 등",
            "6. 근로자 건강장해예방비 등",
            "7. 건설재해예방 전문지도기관 기술지도비 등",
            "8. 본사 사용비",
            "9. 위험성 평가 등에 따른 소요비용 등",
        ),
        signatures=(
            Signature("작 성 자", "안전 관리자"),
            Signature("확 인 자", "안전보건총괄책임자"),
        ),
        allocation_label="계상된 안전관리비",
    ),
    "안전1": DocType(
        key="안전1",
        title="안전관리비 사용내역서 Ⅰ",
        cover_subtitle="",
        summary_title="안전관리비 사용내역서",
        legal_clause=CLAUSE_CTA,
        items=(
            "1. 공사현장의 안전점검 비용",
            "2. 발파/굴착 등의 주변 피해방지 대책 비용",
            "3. 공사장 주변의 통행안전관리대책 비용",
            "4. 안전 모니터링 장치의 설치ㆍ운용 비용",
            "5. 무선설비 및 무선통신을 이용한 안전관리체계 구축ㆍ운용 비용",
        ),
        signatures=(Signature("확 인 자", "안전보건총괄책임자"),),
        allocation_label="계상된 안전관리비",
    ),
    "안전2": DocType(
        key="안전2",
        title="안전관리비 사용내역서 Ⅱ",
        cover_subtitle="(안전관리계획 및 안전성 검토 관련)",
        summary_title="안전관리계획 및 안전성 검토 관련 안전관리비 사용내역서",
        legal_clause=CLAUSE_CTA,
        items=(
            "1. 안전관리계획의 작성 및 검토비용",
            "2. 공사시행 중 구조적 안전성 확보 비용",
        ),
        signatures=(Signature("확 인 자", "안전보건총괄책임자"),),
        allocation_label="계상된 안전관리비",
    ),
    "환경": DocType(
        key="환경",
        title="환경보전비 사용내역서",
        cover_subtitle="",
        summary_title="환경보전비 사용내역서",
        legal_clause=CLAUSE_CTA,
        items=(
            "1. 환경오염방지시설설치 및 운영비",
            "2. 환경계측비",
            "3. 환경 교육훈련비",
            "4. 현장 환경정리비",
            "5. 환경자료 및 홍보물 구입비",
            "6. 기타 환경관리비",
        ),
        signatures=(Signature("확 인 자", "환경관리 책임자"),),
        allocation_label="계상된 환경 보전비",
    ),
}
