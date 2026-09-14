from datetime import date
from pathlib import Path

import pytest

from safetyassist.models import Site

RULES_DIR = Path(__file__).resolve().parents[1] / "rules"


@pytest.fixture
def rules_dir() -> Path:
    return RULES_DIR


@pytest.fixture
def site() -> Site:
    """본 현장 조건: 공사금액 260억, 도급인, 유해위험방지계획서 비대상."""
    return Site(
        name="테스트 현장",
        industry="건설업",
        role="도급인",
        contract_amount_krw=26_000_000_000,
        start_date=date(2025, 9, 16),
        end_date=date(2028, 7, 31),
        appointments={"safety_manager": 1, "general_supervisor": True},
        exclusions={"hazard_prevention_plan": True},
        privacy={"store_personal_data": False},
    )
