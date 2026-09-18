import { describe, expect, it } from 'vitest';
import {
  EDUCATION_CREDIT_BASIS,
  creditFromSessions,
  halfOf,
  summarize,
} from '../src/education-credit.js';
import { sampleSession } from './fixtures.js';

describe('반기 판정', () => {
  it('1~6월은 상반기, 7~12월은 하반기', () => {
    expect(halfOf('2026-06-30')).toEqual({ year: 2026, half: 'H1' });
    expect(halfOf('2026-07-01')).toEqual({ year: 2026, half: 'H2' });
  });
});

describe('TBM 시간의 정기교육 합산', () => {
  it('확정된 TBM의 실시 시간을 참석자별로 합산한다', () => {
    const sessions = [
      sampleSession({ id: 't1', date: '2026-09-01', startAt: '07:00', endAt: '07:10', status: 'confirmed' }),
      sampleSession({ id: 't2', date: '2026-09-02', startAt: '07:00', endAt: '07:15', status: 'confirmed' }),
    ];
    const credits = creditFromSessions(sessions);
    expect(credits.get('w_001')?.minutesByHalf['2026-H2']).toBe(25);
  });

  it('초안은 합산하지 않는다 — 작성 중 문서가 이수 시간을 부풀리면 안 된다', () => {
    const sessions = [
      sampleSession({ id: 't1', date: '2026-09-01', status: 'confirmed' }),
      sampleSession({ id: 't2', date: '2026-09-02', status: 'draft' }),
    ];
    const credits = creditFromSessions(sessions);
    expect(credits.get('w_001')?.sessionsByHalf['2026-H2']).toBe(1);
  });

  it('불참자는 합산하지 않는다', () => {
    const sessions = [
      sampleSession({
        date: '2026-09-01',
        status: 'confirmed',
        attendees: [
          { workerId: 'w_001', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
          { workerId: 'w_002', attended: false, healthStatus: '이상없음', ppeConfirmed: true },
        ],
      }),
    ];
    const credits = creditFromSessions(sessions);
    expect(credits.has('w_001')).toBe(true);
    expect(credits.has('w_002')).toBe(false);
  });

  it('반기가 다르면 따로 쌓인다', () => {
    const sessions = [
      sampleSession({ id: 't1', date: '2026-03-01', status: 'confirmed' }),
      sampleSession({ id: 't2', date: '2026-09-01', status: 'confirmed' }),
    ];
    const credit = creditFromSessions(sessions).get('w_001');
    expect(credit?.minutesByHalf['2026-H1']).toBe(12);
    expect(credit?.minutesByHalf['2026-H2']).toBe(12);
  });

  it('요약에 근거와 미대조 표시를 함께 담는다', () => {
    const sessions = [sampleSession({ date: '2026-09-01', status: 'confirmed' })];
    const [summary] = summarize(creditFromSessions(sessions), { year: 2026, half: 'H2' });

    expect(summary?.basis).toBe(EDUCATION_CREDIT_BASIS);
    // 고시 내 조문 번호를 원문과 대조하지 않았다
    expect(summary?.basisVerified).toBe(false);
    expect(summary?.minutes).toBe(12);
  });

  it('해당 반기에 기록이 없는 사람은 요약에서 뺀다', () => {
    const sessions = [sampleSession({ date: '2026-03-01', status: 'confirmed' })];
    expect(summarize(creditFromSessions(sessions), { year: 2026, half: 'H2' })).toEqual([]);
  });
});
