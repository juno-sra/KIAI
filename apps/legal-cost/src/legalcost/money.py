"""금액 서식 변환."""

_DIGITS = "영일이삼사오육칠팔구"
# 제출본은 자릿수 1도 생략하지 않는다: 삼백'일십'이, 육천'일백'이십칠, '일천'사십이.
# 흔히 쓰는 '십'/'백'/'천' 축약을 쓰면 정답지와 어긋난다.
_SMALL_UNITS = ["", "십", "백", "천"]
_BIG_UNITS = ["", "만", "억", "조"]


def format_amount(value: int) -> str:
    """금액을 천단위 구분 문자열로. 0은 대시로."""
    if value == 0:
        return "-"
    return f"{value:,}"


def format_percent(ratio: float) -> str:
    """비율(0.1544=15.44%)을 소수 둘째자리 백분율로. 0은 대시로."""
    if ratio == 0:
        return "-"
    return f"{ratio * 100:.2f}%"


def _four_digits_to_korean(chunk: int) -> str:
    """0~9999 를 한글로."""
    out = ""
    for position in range(3, -1, -1):
        digit = (chunk // (10**position)) % 10
        if digit == 0:
            continue
        out += _DIGITS[digit] + _SMALL_UNITS[position]
    return out


def to_korean_amount(value: int) -> str:
    """금액을 한글 표기로. 제출본 표기 규칙을 따른다."""
    if value == 0:
        return "영원"
    chunks: list[int] = []
    remaining = value
    while remaining > 0:
        chunks.append(remaining % 10000)
        remaining //= 10000
    parts: list[str] = []
    for index in range(len(chunks) - 1, -1, -1):
        chunk = chunks[index]
        if chunk == 0:
            continue
        parts.append(_four_digits_to_korean(chunk) + _BIG_UNITS[index])
    return "".join(parts) + "원"


def format_allocation(value: int) -> str:
    """계상액 표기: 숫자와 한글 병기."""
    return f"₩{value:,} 원 ({to_korean_amount(value)})"
