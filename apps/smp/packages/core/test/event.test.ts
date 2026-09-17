import { describe, expect, it } from 'vitest';
import { compareEvents, createEvent, isValidEvent, isoNow } from '../src/event.js';
import { LamportClock } from '../src/lamport.js';

const actor = { userId: 'u_kim', deviceId: 'dev_a1' };

function make(overrides: Partial<Parameters<typeof createEvent>[0]> = {}) {
  return createEvent({
    module: 'daily',
    type: 'daily.tbm.created',
    aggregateId: 'tbm_1',
    siteId: 'site_1',
    actor,
    lamport: 1,
    payload: {},
    ...overrides,
  });
}

describe('이벤트 생성', () => {
  it('type이 모듈명으로 시작하지 않으면 거부한다', () => {
    expect(() => make({ type: 'education.course.created' })).toThrow(/모듈 'daily' 로 시작/);
  });

  it('type 형식이 세 마디가 아니면 거부한다', () => {
    expect(() => make({ type: 'daily.tbm' })).toThrow(/형식이 올바르지 않습니다/);
  });

  it('시각에 로컬 오프셋을 남긴다', () => {
    // 'Z'로 뭉개면 현장의 실제 시각을 잃는다
    expect(isoNow()).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});

describe('이벤트 순서 판정', () => {
  it('lamport가 다르면 그것으로 정한다', () => {
    const a = make({ lamport: 1 });
    const b = make({ lamport: 2 });
    expect(compareEvents(a, b)).toBeLessThan(0);
  });

  it('lamport가 같으면 물리시각으로 정한다', () => {
    const a = make({ lamport: 5, at: '2026-09-17T08:00:00+09:00' });
    const b = make({ lamport: 5, at: '2026-09-17T09:00:00+09:00' });
    expect(compareEvents(a, b)).toBeLessThan(0);
  });

  it('시각까지 같으면 deviceId로 정해 모든 기기가 같은 결론을 낸다', () => {
    const at = '2026-09-17T08:00:00+09:00';
    const a = make({ lamport: 5, at, actor: { userId: 'u1', deviceId: 'dev_a' } });
    const b = make({ lamport: 5, at, actor: { userId: 'u2', deviceId: 'dev_b' } });
    expect(compareEvents(a, b)).toBeLessThan(0);
    expect(compareEvents(b, a)).toBeGreaterThan(0);
  });
});

describe('램포트 시계', () => {
  it('내 이벤트마다 1씩 오른다', () => {
    const clock = new LamportClock();
    expect(clock.tick()).toBe(1);
    expect(clock.tick()).toBe(2);
  });

  it('다른 기기의 더 큰 값을 보면 그보다 앞서도록 올린다', () => {
    const clock = new LamportClock(3);
    clock.observe(10);
    expect(clock.tick()).toBe(11);
  });

  it('더 작은 값은 무시한다', () => {
    const clock = new LamportClock(10);
    clock.observe(2);
    expect(clock.value).toBe(10);
  });
});

describe('이벤트 형식 검사', () => {
  it('필드가 빠지면 거부한다', () => {
    const { lamport: _omitted, ...incomplete } = make();
    expect(isValidEvent(incomplete)).toBe(false);
  });

  it('온전한 이벤트는 통과시킨다', () => {
    expect(isValidEvent(make())).toBe(true);
  });
});
