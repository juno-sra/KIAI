import { describe, expect, it } from 'vitest';
import { validateAmendment, validateTbm } from '../src/tbm/validate.js';
import { sampleSession } from './fixtures.js';

const TODAY = '2026-09-17';

describe('TBM 확정 검증', () => {
  it('제대로 작성된 기록은 확정된다', () => {
    const result = validateTbm(sampleSession(), { today: TODAY });
    expect(result.canConfirm).toBe(true);
    expect(result.blocking).toEqual([]);
  });

  it('위험요인이 없으면 확정을 막고 근거를 제시한다', () => {
    const result = validateTbm(sampleSession({ hazards: [] }), { today: TODAY });
    expect(result.canConfirm).toBe(false);
    expect(result.blocking[0]?.basis).toMatch(/제35조제1항/);
  });

  it('조치하지 않았는데 미조치 대책이 없으면 막는다', () => {
    // 서식에 "※미조치시 대책 기재"가 명시되어 있다
    const session = sampleSession({
      hazards: [
        {
          description: '개구부 추락',
          control: '덮개 설치',
          actionTaken: false,
          isCritical: false,
        },
      ],
    });
    const result = validateTbm(session, { today: TODAY });
    expect(result.canConfirm).toBe(false);
    expect(result.blocking.some((b) => b.message.includes('미조치 시 대책'))).toBe(true);
  });

  it('미조치 대책을 적으면 확정된다', () => {
    const session = sampleSession({
      hazards: [
        {
          description: '개구부 추락',
          control: '덮개 설치',
          actionTaken: false,
          pendingAction: '오후 자재 반입 후 즉시 설치, 그때까지 출입통제',
          isCritical: false,
        },
      ],
    });
    expect(validateTbm(session, { today: TODAY }).canConfirm).toBe(true);
  });

  it('중점위험이 미조치면 확정은 되나 경고한다', () => {
    const session = sampleSession({
      hazards: [
        {
          description: '흙막이 붕괴 우려',
          control: '보강 시공',
          actionTaken: false,
          pendingAction: '금일 중 보강, 그 전까지 작업 중지',
          isCritical: true,
        },
      ],
    });
    const result = validateTbm(session, { today: TODAY });
    expect(result.canConfirm).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('작업 개시 여부'))).toBe(true);
  });

  it('미래 일자는 막는다', () => {
    const result = validateTbm(sampleSession({ date: '2026-09-18' }), { today: TODAY });
    expect(result.canConfirm).toBe(false);
    expect(result.blocking[0]?.message).toMatch(/실시하지 않은 TBM/);
  });

  it('참석자가 없으면 막는다', () => {
    const session = sampleSession({
      attendees: [{ workerId: 'w_001', attended: false, healthStatus: '이상없음', ppeConfirmed: true }],
    });
    expect(validateTbm(session, { today: TODAY }).canConfirm).toBe(false);
  });

  it("건강상태가 '이상있음'인데 내용이 비면 막는다", () => {
    const session = sampleSession({
      attendees: [
        { workerId: 'w_001', attended: true, healthStatus: '이상있음', ppeConfirmed: true },
      ],
    });
    const result = validateTbm(session, { today: TODAY });
    expect(result.canConfirm).toBe(false);
    expect(result.blocking.some((b) => b.message.includes('건강상태'))).toBe(true);
  });

  it('보호구 미확인은 경고하고 근거를 붙인다', () => {
    const session = sampleSession({
      attendees: [
        { workerId: 'w_001', attended: true, healthStatus: '이상없음', ppeConfirmed: false },
      ],
    });
    const result = validateTbm(session, { today: TODAY });
    expect(result.canConfirm).toBe(true);
    expect(result.warnings.some((w) => w.basis?.includes('제32조'))).toBe(true);
  });

  it('출역인원과 참석자 수가 다르면 경고한다', () => {
    const session = sampleSession({ headcount: 5 });
    const result = validateTbm(session, { today: TODAY });
    expect(result.warnings.some((w) => w.message.includes('출역인원'))).toBe(true);
  });

  it('필수 결재란이 비면 막는다', () => {
    const result = validateTbm(sampleSession(), {
      today: TODAY,
      requiredApprovalSlots: ['slot_2'],
    });
    expect(result.canConfirm).toBe(false);
    expect(result.blocking[0]?.message).toMatch(/안전팀/);
  });

  it('실시 시간이 비정상적으로 길면 경고한다', () => {
    const result = validateTbm(sampleSession({ endAt: '10:30' }), { today: TODAY });
    expect(result.warnings.some((w) => w.message.includes('잘못 입력'))).toBe(true);
  });
});

describe('확정 후 수정', () => {
  it('사유가 짧으면 막는다', () => {
    expect(validateAmendment('오타').canConfirm).toBe(false);
  });

  it('사유를 제대로 적으면 허용한다', () => {
    expect(validateAmendment('실제 실시 장소로 정정').canConfirm).toBe(true);
  });
});
