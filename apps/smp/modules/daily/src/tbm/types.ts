/**
 * TBM 및 일일안전교육 일지 — 데이터 모델.
 *
 * 현장에서 실제 쓰는 서식을 그대로 담는다. 서식에 있는 칸을 프로그램이 못 채우면
 * 결국 손으로 덧쓰게 되고, 그러면 기록이 둘로 갈라진다.
 */

/** 서식의 '작업 전 안전조치 확인' 한 줄 */
export interface TbmHazardItem {
  /** 위험요인 표준 사전 참조 (예: 'HZ-EXCV-003'). 직접 입력이면 비어 있다 */
  hazardId?: string;
  /** 잠재위험요소 — 서식 용어 그대로 */
  description: string;
  /** 대책. 제거 → 대체 → 통제 순서로 검토한 결과 */
  control: string;
  /** 서식의 '조치여부' 예/아니오 */
  actionTaken: boolean;
  /**
   * 미조치 시 대책.
   * 서식에 "※미조치시 대책 기재"가 있으므로, 조치하지 않았다면 반드시 적어야 한다.
   */
  pendingAction?: string;
  /** 중점위험 여부 */
  isCritical: boolean;
  /** 위험성평가 모듈 연계 시 해당 평가 항목 */
  riskAssessmentRef?: string;
}

export type HealthStatus = '이상없음' | '이상있음';

export interface TbmAttendee {
  /** 인원 ID만 남긴다. 성명은 암호화된 명부에서 화면 표시 시점에 결합한다 */
  workerId: string;
  attended: boolean;
  healthStatus: HealthStatus;
  /** healthStatus가 '이상있음'이면 반드시 적는다 */
  healthNote?: string;
  /** 보호구 착용 확인 — 산업안전보건기준에 관한 규칙 제32조 */
  ppeConfirmed: boolean;
  ppeNote?: string;
}

/**
 * 일일 안전교육 사항.
 * 서식에 건설기술진흥법 제65조·시행령 제103조가 근거로 적혀 있으나 **조문 미대조**다.
 */
export interface DailyEducation {
  /** 작업공법의 이해 */
  method: boolean;
  /** 시공상세도면에 따른 세부 시공순서 */
  sequence: boolean;
  /** 시공기술상의 주의사항 */
  precautions: boolean;
  note?: string;
}

export interface ApprovalEntry {
  /** 결재란 설정(document-settings.json)의 칸 ID */
  slotId: string;
  /**
   * 확정 시점의 직위명 스냅샷.
   * 이후 설정을 바꿔도 이미 만든 일지의 결재란은 변하지 않아야 한다.
   */
  titleSnapshot: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface Amendment {
  at: string;
  actor: string;
  /** 확정 후 수정은 사유가 필수다. 소급 수정 사실을 감추지 않기 위해서다 */
  reason: string;
  changedFields: string[];
}

export interface TbmPhoto {
  /** 첨부파일 내용 해시 */
  sha256: string;
  ext: string;
  caption?: string;
  takenAt?: string;
}

export type TbmStatus = 'draft' | 'confirmed';

export interface TbmSession {
  id: string;
  siteId: string;

  /** 실시 일자 및 시각 */
  date: string;      // YYYY-MM-DD
  startAt: string;   // HH:mm
  endAt: string;     // HH:mm

  location: string;

  /** 주관자 (서식의 '진행자') */
  leaderWorkerId: string;
  leaderRole: '관리감독자' | '작업반장' | '안전관리자' | '기타';

  companyId: string;
  workTypeId: string;

  /** 서식 대응 항목 */
  workName: string;
  workDescription: string;
  equipment: string[];
  headcount: number;

  dailyEducation: DailyEducation;
  /** 근로자 일일 안전교육사항 [정기안전교육] */
  regularEducationNote: string;
  /** 작업 후 종료 미팅 — 근로자 건의사항 및 사고사례 전파 */
  closingMeeting?: string;

  hazards: TbmHazardItem[];
  attendees: TbmAttendee[];
  photos: TbmPhoto[];

  approvals: ApprovalEntry[];
  remarks?: string;

  status: TbmStatus;
  amendments: Amendment[];
}

/** 실시 시간(분). 교육시간 합산에 쓴다 */
export function durationMinutes(session: Pick<TbmSession, 'startAt' | 'endAt'>): number {
  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':');
    return Number(h) * 60 + Number(m);
  };
  const start = toMinutes(session.startAt);
  const end = toMinutes(session.endAt);
  // 자정을 넘기는 야간작업 대응
  return end >= start ? end - start : end + 24 * 60 - start;
}

/** 실제 참석한 인원 수 */
export function attendedCount(session: Pick<TbmSession, 'attendees'>): number {
  return session.attendees.filter((a) => a.attended).length;
}
