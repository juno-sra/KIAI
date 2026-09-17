/**
 * 이벤트 — SMP의 모든 기록은 이벤트로 남는다.
 *
 * 레코드를 덮어쓰지 않고 이벤트를 덧붙이므로, 언제 누가 무엇을 바꿨는지가
 * 항상 남는다. 산업안전보건법 제164조의 서류 보존과 소급 작성 추적에 쓰인다.
 */
import { ulid } from './ulid.js';

export interface EventActor {
  /** _공통/members.json 에 등록된 사용자 ID */
  userId: string;
  /** 기기 식별자. 어느 PC에서 기록했는지 */
  deviceId: string;
}

export interface SmpEvent<P = unknown> {
  id: string;
  /** 모듈 ID이자 데이터 폴더명 (예: 'daily') */
  module: string;
  /** '<module>.<aggregate>.<action>' 형식 (예: 'daily.tbm.confirmed') */
  type: string;
  /** 이 이벤트가 다루는 기록의 ID */
  aggregateId: string;
  siteId: string;
  actor: EventActor;
  /** 논리 시각. 기기 시계가 어긋나도 순서를 판정할 수 있게 한다 */
  lamport: number;
  /** 물리 시각 (ISO8601, 오프셋 포함) */
  at: string;
  payload: P;
  schemaVersion: number;
}

export interface NewEventInput<P> {
  module: string;
  type: string;
  aggregateId: string;
  siteId: string;
  actor: EventActor;
  lamport: number;
  payload: P;
  schemaVersion?: number;
  /** 시험용. 지정하지 않으면 현재 시각 */
  at?: string;
}

const TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;

export function createEvent<P>(input: NewEventInput<P>): SmpEvent<P> {
  if (!TYPE_RE.test(input.type)) {
    throw new Error(
      `이벤트 type '${input.type}' 형식이 올바르지 않습니다. '<모듈>.<대상>.<동작>' 형태여야 합니다.`,
    );
  }
  if (!input.type.startsWith(`${input.module}.`)) {
    throw new Error(
      `이벤트 type '${input.type}' 은 모듈 '${input.module}' 로 시작해야 합니다.`,
    );
  }
  return {
    id: ulid(),
    module: input.module,
    type: input.type,
    aggregateId: input.aggregateId,
    siteId: input.siteId,
    actor: input.actor,
    lamport: input.lamport,
    at: input.at ?? isoNow(),
    payload: input.payload,
    schemaVersion: input.schemaVersion ?? 1,
  };
}

/** 로컬 오프셋을 포함한 ISO8601. 'Z'로 뭉개면 현장의 실제 시각을 잃는다 */
export function isoNow(date: Date = new Date()): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const local = new Date(date.getTime() + offsetMin * 60_000).toISOString().slice(0, 23);
  return `${local}${sign}${hh}:${mm}`;
}

/**
 * 같은 기록에 대한 두 이벤트 중 어느 쪽이 나중인지 판정한다.
 *
 * lamport → 물리시각 → deviceId 순으로 비교한다. deviceId까지 가는 이유는
 * 모든 기기가 같은 결론에 도달해야 하기 때문이다. 판정이 갈리면 기기마다
 * 다른 내용이 보인다.
 *
 * @returns 양수면 a가 나중, 음수면 b가 나중, 0이면 같은 이벤트
 */
export function compareEvents(a: SmpEvent, b: SmpEvent): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.actor.deviceId !== b.actor.deviceId) {
    return a.actor.deviceId < b.actor.deviceId ? -1 : 1;
  }
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** 이벤트 한 건이 최소한의 형태를 갖췄는지 검사한다 */
export function isValidEvent(value: unknown): value is SmpEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  const actor = e['actor'] as Record<string, unknown> | undefined;
  return (
    typeof e['id'] === 'string' &&
    typeof e['module'] === 'string' &&
    typeof e['type'] === 'string' &&
    typeof e['aggregateId'] === 'string' &&
    typeof e['siteId'] === 'string' &&
    typeof e['lamport'] === 'number' &&
    typeof e['at'] === 'string' &&
    typeof e['schemaVersion'] === 'number' &&
    typeof actor === 'object' &&
    actor !== null &&
    typeof actor['userId'] === 'string' &&
    typeof actor['deviceId'] === 'string' &&
    'payload' in e
  );
}
