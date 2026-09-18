/**
 * TBM 실시 시간의 안전보건 정기교육 시간 합산.
 *
 * 「안전보건교육규정」(고용노동부고시 제2023-63호, 2023. 12. 13. 시행) 개정으로
 * TBM이 안전보건 정기교육 시간으로 인정되며, 해당 **반기 내** 시간을 합산한다.
 *
 * 주의 — 고시 내 정확한 조문 번호는 **미대조**다. 화면과 출력물에 이를 표시한다.
 * 또한 이 합산은 참고 수치이며, 교육시간 충족 여부의 최종 판단은 사업주에게 있다.
 */
import type { TbmSession } from './tbm/types.js';
import { durationMinutes } from './tbm/types.js';

export const EDUCATION_CREDIT_BASIS =
  '「안전보건교육규정」(고용노동부고시 제2023-63호, 2023. 12. 13. 시행) — 고시 내 조문 미대조';

export type Half = 'H1' | 'H2';

export interface HalfPeriod {
  year: number;
  half: Half;
}

/** 날짜가 속한 반기 */
export function halfOf(date: string): HalfPeriod {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return { year, half: month <= 6 ? 'H1' : 'H2' };
}

export function halfKey(period: HalfPeriod): string {
  return `${period.year}-${period.half}`;
}

export interface WorkerCredit {
  workerId: string;
  /** 반기 키 → 합산 분 */
  minutesByHalf: Record<string, number>;
  /** 반기 키 → 참석한 TBM 수 */
  sessionsByHalf: Record<string, number>;
}

/**
 * 확정된 TBM만 집계한다.
 *
 * 초안은 아직 실시 기록으로 확정되지 않았으므로 교육시간에 넣지 않는다.
 * 넣어 버리면 작성 중인 문서가 이수 시간을 부풀린다.
 */
export function creditFromSessions(sessions: TbmSession[]): Map<string, WorkerCredit> {
  const credits = new Map<string, WorkerCredit>();

  for (const session of sessions) {
    if (session.status !== 'confirmed') continue;

    const key = halfKey(halfOf(session.date));
    const minutes = durationMinutes(session);

    for (const attendee of session.attendees) {
      if (!attendee.attended) continue;

      let credit = credits.get(attendee.workerId);
      if (!credit) {
        credit = { workerId: attendee.workerId, minutesByHalf: {}, sessionsByHalf: {} };
        credits.set(attendee.workerId, credit);
      }
      credit.minutesByHalf[key] = (credit.minutesByHalf[key] ?? 0) + minutes;
      credit.sessionsByHalf[key] = (credit.sessionsByHalf[key] ?? 0) + 1;
    }
  }

  return credits;
}

export interface CreditSummary {
  workerId: string;
  period: string;
  minutes: number;
  hours: number;
  sessionCount: number;
  basis: string;
  /** 근거 조문을 원문과 대조했는지 */
  basisVerified: boolean;
}

export function summarize(
  credits: Map<string, WorkerCredit>,
  period: HalfPeriod,
): CreditSummary[] {
  const key = halfKey(period);
  return [...credits.values()]
    .map((c) => {
      const minutes = c.minutesByHalf[key] ?? 0;
      return {
        workerId: c.workerId,
        period: key,
        minutes,
        hours: Math.floor((minutes / 60) * 10) / 10,
        sessionCount: c.sessionsByHalf[key] ?? 0,
        basis: EDUCATION_CREDIT_BASIS,
        // 고시 내 조문 번호를 대조하지 않았다
        basisVerified: false,
      };
    })
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}
