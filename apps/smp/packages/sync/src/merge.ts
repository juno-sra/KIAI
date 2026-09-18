/**
 * 병합 — 여러 기기의 이벤트를 합쳐 현재 상태를 만든다.
 *
 * 같은 기록을 두 사람이 동시에 고치면 한쪽이 이긴다(LWW). 다만 진 쪽을
 * 지우지 않고 남겨 둔다. 안전 기록에서 "무엇이 덮였는지"를 못 보면
 * 나중에 사고 조사 때 설명할 수 없다.
 */
import type { SmpEvent } from '@smp/core';
import { compareEvents } from '@smp/core';

export interface MergedAggregate {
  aggregateId: string;
  /** 시간순으로 정렬된 이 기록의 모든 이벤트 */
  events: SmpEvent[];
  /** 마지막으로 이긴 이벤트 */
  head: SmpEvent;
  /** 경합에서 밀려난 이벤트 — 이력 조회에서 보여준다 */
  superseded: SmpEvent[];
}

/** 이벤트를 기록 단위로 묶고 순서대로 정렬한다 */
export function groupByAggregate(events: SmpEvent[]): Map<string, SmpEvent[]> {
  const groups = new Map<string, SmpEvent[]>();
  for (const event of events) {
    const list = groups.get(event.aggregateId);
    if (list) list.push(event);
    else groups.set(event.aggregateId, [event]);
  }
  for (const list of groups.values()) list.sort(compareEvents);
  return groups;
}

/**
 * 같은 종류의 이벤트가 여러 기기에서 겹쳤을 때 승자를 가린다.
 *
 * 승부는 (lamport, 물리시각, deviceId, id) 순으로 정한다. 모든 기기가 같은
 * 규칙으로 판정하므로 어디서 보든 결과가 같다.
 */
export function mergeAggregate(aggregateId: string, events: SmpEvent[]): MergedAggregate | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort(compareEvents);

  // 같은 type이 중복된 경우 마지막 것만 유효하고 나머지는 밀려난 것으로 본다
  const lastByType = new Map<string, SmpEvent>();
  for (const event of sorted) lastByType.set(event.type, event);

  const winners = new Set([...lastByType.values()].map((e) => e.id));
  const superseded = sorted.filter((e) => !winners.has(e.id));
  const head = sorted[sorted.length - 1];
  if (!head) return null;

  return { aggregateId, events: sorted, head, superseded };
}

export function mergeAll(events: SmpEvent[]): MergedAggregate[] {
  const result: MergedAggregate[] = [];
  for (const [aggregateId, list] of groupByAggregate(events)) {
    const merged = mergeAggregate(aggregateId, list);
    if (merged) result.push(merged);
  }
  return result;
}

/**
 * 이벤트를 하나씩 적용해 상태를 만든다 (폴드).
 *
 * 모듈은 이 함수에 자기 reducer를 넘겨 자기 읽기 모델을 만든다.
 * 캐시가 깨져도 이벤트만 있으면 언제든 다시 만들 수 있다.
 */
export function fold<S>(
  events: SmpEvent[],
  initial: S,
  reducer: (state: S, event: SmpEvent) => S,
): S {
  return [...events].sort(compareEvents).reduce(reducer, initial);
}
