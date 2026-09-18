/**
 * 공통 마스터 — 모든 모듈이 공유하는 기준정보.
 *
 * 모듈 간 직접 참조를 금지하고 여기를 거치게 해서, TBM에 입력한 업체가
 * 교육일지에 안 잡히는 중복 입력 문제를 없앤다.
 */

export interface Site {
  id: string;
  name: string;
  /** 발주처 */
  client?: string;
  /** 원도급사 */
  contractor?: string;
  /** 공사금액 (원) */
  contractAmount?: number;
  startDate?: string;
  endDate?: string;
  address?: string;
}

export interface Company {
  id: string;
  siteId: string;
  name: string;
  /** 사업자등록번호. 형식만 보관하며 검증은 하지 않는다 */
  businessNo?: string;
  workTypeIds: string[];
  contractStart?: string;
  contractEnd?: string;
  active: boolean;
}

export interface WorkType {
  id: string;
  /** 위험요인 사전(data/hazard-library)의 공종 코드 (예: 'EXCV') */
  hazardLibraryCode?: string;
  name: string;
  group: string;
}

/**
 * 인원 — 개인정보다.
 *
 * 이 타입의 값은 암호화된 명부 파일에만 저장한다. 이벤트 본문과 프로젝션에는
 * id만 남기고 성명은 화면 표시 시점에 결합한다. 그래야 .jsonl이 유출되어도
 * 누구의 기록인지 특정되지 않는다.
 *
 * 주민등록번호는 수집하지 않는다 (개인정보 보호법 제24조의2).
 */
export interface Worker {
  id: string;
  siteId: string;
  name: string;
  companyId: string;
  /** 직종 */
  jobTitle?: string;
  /** 생년월일 (YYYY-MM-DD). 동명이인 구분 목적으로만 쓴다 */
  birthDate?: string;
  enteredAt?: string;
  leftAt?: string;
  active: boolean;
}

/** 위험요인 사전 한 건 — data/hazard-library 의 형식과 맞춘다 */
export interface Hazard {
  id: string;
  workTypeCode: string;
  task: string;
  hazard: string;
  accidentTypes: string[];
  controls: { type: 'ELIM' | 'SUBST' | 'ENG' | 'ADMIN' | 'PPE'; text: string }[];
  legalBasis: string[];
  /** 조문을 시행 중인 법령 원문과 대조했는지. false면 화면에 '조문 미대조' 표시 */
  legalBasisVerified: boolean;
  severityDefault?: number;
  likelihoodDefault?: number;
  checkItems?: string[];
  keywords?: string[];
  note?: string;
}

export type UserRole = 'admin' | 'writer' | 'viewer';

export interface Member {
  userId: string;
  displayName: string;
  role: UserRole;
  /** 담당 모듈 ID 목록. admin은 비어 있어도 전체 접근 */
  modules: string[];
  registeredAt: string;
  registeredBy: string;
  active: boolean;
}

export interface DeviceRegistration {
  deviceId: string;
  userId: string;
  /** 사람이 알아보기 위한 이름 (예: '현장사무실-PC') */
  label: string;
  registeredAt: string;
  lastSeenAt?: string;
}

export interface Manifest {
  schemaVersion: number;
  siteId: string;
  siteName: string;
  /** 이 현장에서 사용하는 모듈 ID 목록 */
  modules: string[];
  createdAt: string;
  createdBy: string;
}
