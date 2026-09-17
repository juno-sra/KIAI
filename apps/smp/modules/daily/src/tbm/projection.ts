/**
 * TBM 읽기 모델.
 *
 * 이벤트를 접어 현재 상태를 만든다. 캐시가 깨져도 이벤트만 있으면 언제든
 * 다시 만들 수 있다.
 */
import type { SmpEvent } from '@smp/core';
import { compareEvents } from '@smp/core';
import { TBM_EVENT_TYPES } from './events.js';
import type { Amendment, TbmSession } from './types.js';

export type TbmState = Map<string, TbmSession>;

/**
 * 이벤트 하나를 적용한다.
 *
 * 확정된 기록에 updated가 오면 무시한다. 다른 기기의 오래된 이벤트가 뒤늦게
 * 도착해 확정 내용을 덮는 것을 막기 위해서다.
 */
export function applyEvent(state: TbmState, event: SmpEvent): TbmState {
  const next = new Map(state);

  switch (event.type) {
    case TBM_EVENT_TYPES.created: {
      const { session } = event.payload as { session: TbmSession };
      // 이미 있으면 덮지 않는다 — 같은 기록의 created가 두 번 올 이유가 없다
      if (!next.has(session.id)) next.set(session.id, { ...session });
      break;
    }

    case TBM_EVENT_TYPES.updated: {
      const current = next.get(event.aggregateId);
      if (!current || current.status === 'confirmed') break;
      const { patch } = event.payload as { patch: Partial<TbmSession> };
      next.set(event.aggregateId, { ...current, ...patch });
      break;
    }

    case TBM_EVENT_TYPES.confirmed: {
      const current = next.get(event.aggregateId);
      if (!current) break;
      next.set(event.aggregateId, { ...current, status: 'confirmed' });
      break;
    }

    case TBM_EVENT_TYPES.amended: {
      const current = next.get(event.aggregateId);
      if (!current) break;
      const { patch, amendment } = event.payload as {
        patch: Partial<TbmSession>;
        amendment: Amendment;
      };
      next.set(event.aggregateId, {
        ...current,
        ...patch,
        status: 'confirmed',
        amendments: [...current.amendments, amendment],
      });
      break;
    }

    case TBM_EVENT_TYPES.photoAttached: {
      const current = next.get(event.aggregateId);
      if (!current) break;
      const { photo } = event.payload as { photo: TbmSession['photos'][number] };
      // 같은 사진(해시 동일)을 두 번 붙이지 않는다
      if (current.photos.some((p) => p.sha256 === photo.sha256)) break;
      next.set(event.aggregateId, { ...current, photos: [...current.photos, photo] });
      break;
    }

    default:
      break;
  }

  return next;
}

export function buildTbmState(events: SmpEvent[]): TbmState {
  return [...events].sort(compareEvents).reduce(applyEvent, new Map() as TbmState);
}

// ── 조회 ──────────────────────────────────────────────────

export function listByDate(state: TbmState, date: string): TbmSession[] {
  return [...state.values()].filter((s) => s.date === date);
}

export function listByMonth(state: TbmState, yearMonth: string): TbmSession[] {
  return [...state.values()]
    .filter((s) => s.date.startsWith(yearMonth))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startAt.localeCompare(b.startAt));
}

/**
 * 작업일 중 TBM이 없는 날.
 * 작업일 목록은 다른 모듈(출역 기록 등)에서 온다.
 */
export function missingDays(state: TbmState, workDays: string[]): string[] {
  const recorded = new Set([...state.values()].map((s) => s.date));
  return workDays.filter((d) => !recorded.has(d)).sort();
}

/** 반복되는 위험요인 — 같은 것이 계속 나오면 근본 대책이 필요하다는 신호다 */
export function hazardFrequency(state: TbmState): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const session of state.values()) {
    for (const h of session.hazards) {
      const key = h.hazardId ?? h.description.trim();
      if (key === '') continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** 조치되지 않은 채 남은 위험요인 */
export function unresolvedHazards(state: TbmState): { session: TbmSession; index: number }[] {
  const result: { session: TbmSession; index: number }[] = [];
  for (const session of state.values()) {
    session.hazards.forEach((h, index) => {
      if (!h.actionTaken) result.push({ session, index });
    });
  }
  return result;
}
