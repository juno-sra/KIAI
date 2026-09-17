/**
 * TBM 이벤트.
 *
 * 확정 전에는 updated, 확정 후에는 amended만 허용한다. 소급 수정 사실을
 * 감추지 않기 위해서다.
 */
import { createEvent, type EventActor, type SmpEvent } from '@smp/core';
import type { Amendment, TbmSession } from './types.js';

export const MODULE_ID = 'daily';

export const TBM_EVENT_TYPES = {
  created: 'daily.tbm.created',
  updated: 'daily.tbm.updated',
  confirmed: 'daily.tbm.confirmed',
  amended: 'daily.tbm.amended',
  photoAttached: 'daily.tbm.photo_attached',
  exported: 'daily.tbm.exported',
} as const;

export type TbmEventType = (typeof TBM_EVENT_TYPES)[keyof typeof TBM_EVENT_TYPES];

export const ALL_TBM_EVENT_TYPES: string[] = Object.values(TBM_EVENT_TYPES);

interface Base {
  actor: EventActor;
  lamport: number;
  siteId: string;
  at?: string;
}

export function tbmCreated(
  base: Base,
  session: TbmSession,
): SmpEvent<{ session: TbmSession }> {
  return createEvent({
    module: MODULE_ID,
    type: TBM_EVENT_TYPES.created,
    aggregateId: session.id,
    siteId: base.siteId,
    actor: base.actor,
    lamport: base.lamport,
    payload: { session },
    ...(base.at === undefined ? {} : { at: base.at }),
  });
}

export function tbmUpdated(
  base: Base,
  sessionId: string,
  patch: Partial<TbmSession>,
): SmpEvent<{ patch: Partial<TbmSession> }> {
  return createEvent({
    module: MODULE_ID,
    type: TBM_EVENT_TYPES.updated,
    aggregateId: sessionId,
    siteId: base.siteId,
    actor: base.actor,
    lamport: base.lamport,
    payload: { patch },
    ...(base.at === undefined ? {} : { at: base.at }),
  });
}

export function tbmConfirmed(base: Base, sessionId: string): SmpEvent<{ confirmedBy: string }> {
  return createEvent({
    module: MODULE_ID,
    type: TBM_EVENT_TYPES.confirmed,
    aggregateId: sessionId,
    siteId: base.siteId,
    actor: base.actor,
    lamport: base.lamport,
    payload: { confirmedBy: base.actor.userId },
    ...(base.at === undefined ? {} : { at: base.at }),
  });
}

/**
 * 확정 후 수정.
 * 사유가 비면 만들지 않는다 — 기록의 신뢰성이 여기에 달려 있다.
 */
export function tbmAmended(
  base: Base,
  sessionId: string,
  patch: Partial<TbmSession>,
  reason: string,
): SmpEvent<{ patch: Partial<TbmSession>; amendment: Amendment }> {
  if (reason.trim() === '') {
    throw new Error('확정된 TBM을 수정하려면 사유가 필요합니다.');
  }
  const amendment: Amendment = {
    at: base.at ?? new Date().toISOString(),
    actor: base.actor.userId,
    reason,
    changedFields: Object.keys(patch),
  };
  return createEvent({
    module: MODULE_ID,
    type: TBM_EVENT_TYPES.amended,
    aggregateId: sessionId,
    siteId: base.siteId,
    actor: base.actor,
    lamport: base.lamport,
    payload: { patch, amendment },
    ...(base.at === undefined ? {} : { at: base.at }),
  });
}

export function tbmExported(
  base: Base,
  sessionId: string,
  documentKind: string,
  path: string,
): SmpEvent<{ documentKind: string; path: string }> {
  return createEvent({
    module: MODULE_ID,
    type: TBM_EVENT_TYPES.exported,
    aggregateId: sessionId,
    siteId: base.siteId,
    actor: base.actor,
    lamport: base.lamport,
    payload: { documentKind, path },
    ...(base.at === undefined ? {} : { at: base.at }),
  });
}
