from legalcost.doctypes import DOC_TYPES


def test_four_document_types_exist():
    assert set(DOC_TYPES) == {"산안비", "안전1", "안전2", "환경"}


def test_item_counts_match_submitted_forms():
    assert len(DOC_TYPES["산안비"].items) == 9
    assert len(DOC_TYPES["안전1"].items) == 5
    assert len(DOC_TYPES["안전2"].items) == 2
    assert len(DOC_TYPES["환경"].items) == 6


def test_first_item_names_match_submitted_forms():
    assert DOC_TYPES["산안비"].items[0] == "1. 안전관리자 인건비 및 각종 업무수당 등"
    assert DOC_TYPES["안전1"].items[0] == "1. 공사현장의 안전점검 비용"
    assert DOC_TYPES["안전2"].items[0] == "1. 안전관리계획의 작성 및 검토비용"
    assert DOC_TYPES["환경"].items[0] == "1. 환경오염방지시설설치 및 운영비"


def test_legal_clause_differs_between_families():
    assert DOC_TYPES["산안비"].legal_clause.startswith(
        "건설업 산업안전보건관리비 계상 및 사용기준 제10조 제1항"
    )
    for key in ("안전1", "안전2", "환경"):
        assert DOC_TYPES[key].legal_clause.startswith("건설기술진흥법 시행규칙 제60조")


def test_signature_lines_match_submitted_forms():
    assert [s.role for s in DOC_TYPES["산안비"].signatures] == ["작 성 자", "확 인 자"]
    assert [s.title for s in DOC_TYPES["산안비"].signatures] == [
        "안전 관리자",
        "안전보건총괄책임자",
    ]
    assert [s.title for s in DOC_TYPES["환경"].signatures] == ["환경관리 책임자"]
    assert [s.title for s in DOC_TYPES["안전2"].signatures] == ["안전보건총괄책임자"]


def test_allocation_label_differs():
    assert DOC_TYPES["산안비"].allocation_label == "계상된 안전관리비"
    assert DOC_TYPES["환경"].allocation_label == "계상된 환경 보전비"
