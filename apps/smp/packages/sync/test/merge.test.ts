import { describe, expect, it } from 'vitest';
import { createEvent, type SmpEvent } from '@smp/core';
import { fold, groupByAggregate, mergeAggregate, mergeAll } from '../src/merge.js';

function ev(
  aggregateId: string,
  type: string,
  lamport: number,
  deviceId: string,
  payload: Record<string, unknown> = {},
): SmpEvent {
  return createEvent({
    module: 'daily',
    type,
    aggregateId,
    siteId: 'site_1',
    actor: { userId: `u_${deviceId}`, deviceId },
    lamport,
    payload,
    at: '2026-09-17T08:00:00+09:00',
  });
}

describe('기록 단위 묶기', () => {
  it('aggregateId로 나누고 순서대로 정렬한다', () => {
    const groups = groupByAggregate([
      ev('tbm_2', 'daily.tbm.created', 5, 'dev_a'),
      ev('tbm_1', 'daily.tbm.created', 1, 'dev_a'),
      ev('tbm_1', 'daily.tbm.confirmed', 3, 'dev_a'),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get('tbm_1')?.map((e) => e.lamport)).toEqual([1, 3]);
  });
});

describe('두 기기가 같은 기록을 고친 경우', () => {
  it('lamport가 큰 쪽이 이기고 진 쪽은 남는다', () => {
    const merged = mergeAggregate('tbm_1', [
      ev('tbm_1', 'daily.tbm.updated', 3, 'dev_a', { 장소: '지하 1층' }),
      ev('tbm_1', 'daily.tbm.updated', 7, 'dev_b', { 장소: '옥상' }),
    ]);

    expect(merged?.head.payload).toEqual({ 장소: '옥상' });
    // 덮인 기록도 남겨야 사고 조사 때 설명할 수 있다
    expect(merged?.superseded).toHaveLength(1);
    expect(merged?.superseded[0]?.payload).toEqual({ 장소: '지하 1층' });
  });

  it('lamport가 같으면 어느 기기에서 보든 같은 결론을 낸다', () => {
    const a = ev('tbm_1', 'daily.tbm.updated', 5, 'dev_a', { v: 'A' });
    const b = ev('tbm_1', 'daily.tbm.updated', 5, 'dev_b', { v: 'B' });

    const fromPcA = mergeAggregate('tbm_1', [a, b]);
    const fromPcB = mergeAggregate('tbm_1', [b, a]);

    expect(fromPcA?.head.id).toBe(fromPcB?.head.id);
    expect(fromPcA?.head.payload).toEqual({ v: 'B' });
  });

  it('종류가 다른 이벤트는 서로 밀어내지 않는다', () => {
    const merged = mergeAggregate('tbm_1', [
      ev('tbm_1', 'daily.tbm.created', 1, 'dev_a'),
      ev('tbm_1', 'daily.tbm.confirmed', 2, 'dev_a'),
    ]);
    expect(merged?.superseded).toHaveLength(0);
    expect(merged?.events).toHaveLength(2);
  });

  it('이벤트가 없으면 null', () => {
    expect(mergeAggregate('tbm_1', [])).toBeNull();
  });
});

describe('전체 병합', () => {
  it('여러 기록을 각각 병합한다', () => {
    const merged = mergeAll([
      ev('tbm_1', 'daily.tbm.created', 1, 'dev_a'),
      ev('tbm_2', 'daily.tbm.created', 2, 'dev_b'),
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe('읽기 모델 만들기', () => {
  it('이벤트를 순서대로 접어 상태를 만든다', () => {
    const events = [
      ev('tbm_1', 'daily.tbm.created', 1, 'dev_a', { status: 'draft' }),
      ev('tbm_1', 'daily.tbm.confirmed', 2, 'dev_a', { status: 'confirmed' }),
    ];
    const state = fold(events, { status: 'none' }, (s, e) => ({
      ...s,
      ...(e.payload as Record<string, unknown>),
    }));
    expect(state.status).toBe('confirmed');
  });

  it('입력 순서가 뒤바뀌어도 같은 결과가 나온다', () => {
    // 동기화 폴더에서는 파일이 늦게 도착할 수 있다
    const a = ev('tbm_1', 'daily.tbm.created', 1, 'dev_a', { v: 1 });
    const b = ev('tbm_1', 'daily.tbm.updated', 2, 'dev_a', { v: 2 });

    const inOrder = fold([a, b], { v: 0 }, (s, e) => ({ ...s, ...(e.payload as { v: number }) }));
    const reversed = fold([b, a], { v: 0 }, (s, e) => ({ ...s, ...(e.payload as { v: number }) }));

    expect(inOrder).toEqual(reversed);
    expect(inOrder.v).toBe(2);
  });
});
