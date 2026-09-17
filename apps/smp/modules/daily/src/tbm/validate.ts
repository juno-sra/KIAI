/**
 * TBM 확정 전 검증.
 *
 * 차단과 경고를 나눈다. 차단은 기록이 서식·법령 요구를 못 채우는 경우이고,
 * 경고는 사실일 수 있으나 사유를 남겨야 하는 경우다. 모두 차단해 버리면
 * 현장에서 우회 수단을 찾게 되고, 그러면 기록이 프로그램 밖으로 나간다.
 */
import type { TbmSession } from './types.js';
import { attendedCount, durationMinutes } from './types.js';

export interface ValidationIssue {
  field: string;
  message: string;
  /** 근거가 있으면 적는다. 없으면 비워 둔다 — 없는 근거를 지어내지 않는다 */
  basis?: string;
}

export interface ValidationResult {
  /** 확정 가능 여부 */
  canConfirm: boolean;
  /** 확정을 막는 문제 */
  blocking: ValidationIssue[];
  /** 확정은 되나 사용자가 알아야 하는 것 */
  warnings: ValidationIssue[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidateOptions {
  /** 오늘 날짜 (YYYY-MM-DD). 시험을 위해 주입 가능하게 둔다 */
  today?: string;
  /** 결재란 설정에서 필수로 지정된 칸 ID */
  requiredApprovalSlots?: string[];
}

export function validateTbm(session: TbmSession, options: ValidateOptions = {}): ValidationResult {
  const blocking: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  // ── 일자·시각 ──────────────────────────────────────────
  if (!DATE_RE.test(session.date)) {
    blocking.push({ field: 'date', message: '실시 일자 형식이 올바르지 않습니다.' });
  } else if (session.date > today) {
    blocking.push({
      field: 'date',
      message: '미래 일자로는 확정할 수 없습니다. 실시하지 않은 TBM을 기록하는 것이기 때문입니다.',
    });
  }

  for (const [field, value] of [['startAt', session.startAt], ['endAt', session.endAt]] as const) {
    if (!TIME_RE.test(value)) {
      blocking.push({ field, message: '시각은 HH:mm 형식이어야 합니다.' });
    }
  }

  if (TIME_RE.test(session.startAt) && TIME_RE.test(session.endAt)) {
    const minutes = durationMinutes(session);
    if (minutes === 0) {
      blocking.push({ field: 'endAt', message: '시작 시각과 종료 시각이 같습니다.' });
    } else if (minutes > 120) {
      warnings.push({
        field: 'endAt',
        message: `실시 시간이 ${minutes}분입니다. 시각을 잘못 입력하지 않았는지 확인하십시오.`,
      });
    }
  }

  // ── 기본 정보 ──────────────────────────────────────────
  if (session.location.trim() === '') {
    blocking.push({ field: 'location', message: '실시 장소를 입력하십시오.' });
  }
  if (session.workName.trim() === '') {
    blocking.push({ field: 'workName', message: '작업명을 입력하십시오.' });
  }
  if (session.companyId.trim() === '') {
    blocking.push({ field: 'companyId', message: '업체를 선택하십시오.' });
  }
  if (session.leaderWorkerId.trim() === '') {
    blocking.push({ field: 'leaderWorkerId', message: '진행자를 선택하십시오.' });
  }

  // ── 위험요인 ──────────────────────────────────────────
  if (session.hazards.length === 0) {
    blocking.push({
      field: 'hazards',
      message: '잠재위험요소를 1건 이상 입력하십시오. 위험요인 없이 실시한 TBM은 기록으로 인정하기 어렵습니다.',
      basis: '산업안전보건기준에 관한 규칙 제35조제1항 및 별표 2 (관리감독자의 유해·위험 방지 업무)',
    });
  }

  session.hazards.forEach((h, i) => {
    const at = `hazards[${i}]`;
    if (h.description.trim() === '') {
      blocking.push({ field: at, message: `${i + 1}번 잠재위험요소가 비어 있습니다.` });
    }
    if (h.control.trim() === '') {
      blocking.push({ field: at, message: `${i + 1}번 위험요소의 대책이 비어 있습니다.` });
    }
    // 서식에 "※미조치시 대책 기재"가 명시되어 있다
    if (!h.actionTaken && (h.pendingAction ?? '').trim() === '') {
      blocking.push({
        field: at,
        message: `${i + 1}번 위험요소를 조치하지 않았다면 미조치 시 대책을 적어야 합니다.`,
      });
    }
    if (!h.actionTaken && h.isCritical) {
      warnings.push({
        field: at,
        message: `${i + 1}번은 중점위험인데 조치되지 않았습니다. 작업 개시 여부를 다시 판단하십시오.`,
      });
    }
  });

  // ── 참석자 ────────────────────────────────────────────
  const attended = attendedCount(session);
  if (attended === 0) {
    blocking.push({ field: 'attendees', message: '참석자가 없습니다.' });
  }

  session.attendees.forEach((a, i) => {
    const at = `attendees[${i}]`;
    if (a.healthStatus === '이상있음' && (a.healthNote ?? '').trim() === '') {
      blocking.push({
        field: at,
        message: `${i + 1}번 참석자의 건강상태가 '이상있음'인데 내용이 비어 있습니다.`,
      });
    }
    if (a.attended && !a.ppeConfirmed && (a.ppeNote ?? '').trim() === '') {
      warnings.push({
        field: at,
        message: `${i + 1}번 참석자의 보호구 착용이 확인되지 않았습니다. 사유를 적으십시오.`,
        basis: '산업안전보건기준에 관한 규칙 제32조(보호구의 지급 등)',
      });
    }
  });

  if (session.headcount > 0 && attended !== session.headcount) {
    warnings.push({
      field: 'headcount',
      message: `출역인원 ${session.headcount}명과 참석자 ${attended}명이 다릅니다. 미참석자 사유를 확인하십시오.`,
    });
  }

  // ── 교육 사항 ─────────────────────────────────────────
  const edu = session.dailyEducation;
  if (!edu.method && !edu.sequence && !edu.precautions && (edu.note ?? '').trim() === '') {
    warnings.push({
      field: 'dailyEducation',
      message: '일일 안전교육 사항이 하나도 선택되지 않았습니다.',
    });
  }

  // ── 결재란 ────────────────────────────────────────────
  for (const slotId of options.requiredApprovalSlots ?? []) {
    const entry = session.approvals.find((a) => a.slotId === slotId);
    if (!entry || (entry.approvedBy ?? '').trim() === '') {
      blocking.push({
        field: `approvals.${slotId}`,
        message: `필수 결재란 '${entry?.titleSnapshot ?? slotId}' 이 비어 있습니다.`,
      });
    }
  }

  return { canConfirm: blocking.length === 0, blocking, warnings };
}

/**
 * 확정 후 수정 검증.
 *
 * 사유 없이 고치는 것을 막는다. 언제 누가 왜 고쳤는지 남지 않으면
 * 기록의 신뢰성이 무너진다.
 */
export function validateAmendment(reason: string): ValidationResult {
  const blocking: ValidationIssue[] = [];
  if (reason.trim().length < 5) {
    blocking.push({
      field: 'reason',
      message: '확정된 기록을 수정하려면 사유를 5자 이상 적어야 합니다.',
    });
  }
  return { canConfirm: blocking.length === 0, blocking, warnings: [] };
}
