import { describe, expect, it } from 'vitest';
import { isUlid, ulid, ulidTime } from '../src/ulid.js';

describe('ULID', () => {
  it('26자 Crockford Base32 문자열을 만든다', () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
  });

  it('같은 밀리초에 연달아 만들어도 순서가 유지된다', () => {
    const now = 1_700_000_000_000;
    const ids = Array.from({ length: 200 }, () => ulid(now));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('시각이 다르면 문자열 정렬이 곧 시간순이다', () => {
    const early = ulid(1_700_000_000_000);
    const late = ulid(1_700_000_001_000);
    expect(early < late).toBe(true);
  });

  it('생성 시각을 되꺼낼 수 있다', () => {
    const now = 1_726_500_000_000;
    expect(ulidTime(ulid(now))).toBe(now);
  });

  it('형식이 아니면 시각을 내주지 않는다', () => {
    expect(ulidTime('not-a-ulid')).toBeNull();
    // I, L, O, U는 Crockford Base32에 없다
    expect(isUlid('IIIIIIIIIIIIIIIIIIIIIIIIII')).toBe(false);
  });
});
