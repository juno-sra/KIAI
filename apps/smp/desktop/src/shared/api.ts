/**
 * 화면과 본체 사이의 약속.
 *
 * Electron에서는 preload가 이 인터페이스를 구현해 `window.smp` 로 넘겨준다.
 * 브라우저에서 열면 `window.smp` 가 없으므로 시연용 가짜 구현이 대신 들어간다.
 * 덕분에 화면을 브라우저에서 바로 확인할 수 있다.
 */
import type { Company, Member, Site, WorkType } from '@smp/core';
import type { TbmSession } from '@smp/module-daily';

export interface SiteSummary {
  site: Site;
  /** 이 현장에서 쓰는 모듈 */
  modules: string[];
  /** 현재 사용자 */
  member: Member;
}

export interface ModuleAccessInfo {
  moduleId: string;
  label: string;
  declared: 'none' | 'read' | 'write';
  actual: 'none' | 'read' | 'write';
  warning: string | null;
}

export interface StartupState {
  /** 동기화 폴더가 정해졌는지 */
  configured: boolean;
  syncRoot: string | null;
  site: SiteSummary | null;
  access: ModuleAccessInfo[];
  /** 깨진 줄이나 충돌 사본 같은 경고 */
  issues: string[];
}

export interface TbmListItem {
  id: string;
  date: string;
  startAt: string;
  endAt: string;
  companyName: string;
  workName: string;
  attendedCount: number;
  hazardCount: number;
  /** 조치되지 않은 위험요인 수 */
  pendingCount: number;
  status: 'draft' | 'confirmed';
  amended: number;
}

export interface HazardSuggestion {
  id: string;
  task: string;
  hazard: string;
  control: string;
  legalBasis: string[];
  /** 조문을 원문과 대조했는지 */
  legalBasisVerified: boolean;
}

export interface SaveResult {
  ok: boolean;
  blocking: { field: string; message: string; basis?: string }[];
  warnings: { field: string; message: string; basis?: string }[];
}

export interface WorkerBrief {
  id: string;
  name: string;
  jobTitle?: string;
}

export interface SmpApi {
  /** 앱 시작 시 상태 */
  startup(): Promise<StartupState>;
  /** 동기화 폴더 선택 */
  chooseSyncRoot(): Promise<string | null>;

  listCompanies(): Promise<Company[]>;
  listWorkTypes(): Promise<WorkType[]>;
  /** 업체 소속 인원 — 성명은 암호화된 명부에서 온다 */
  listWorkers(companyId: string): Promise<WorkerBrief[]>;

  listTbm(yearMonth: string): Promise<TbmListItem[]>;
  getTbm(id: string): Promise<TbmSession | null>;
  /** 초안 저장 */
  saveTbm(session: TbmSession): Promise<SaveResult>;
  /** 확정 — 검증을 통과해야 한다 */
  confirmTbm(id: string): Promise<SaveResult>;
  /** 확정 후 수정 — 사유 필수 */
  amendTbm(id: string, patch: Partial<TbmSession>, reason: string): Promise<SaveResult>;

  /** 공종별 위험요인 후보 */
  suggestHazards(workTypeCode: string): Promise<HazardSuggestion[]>;

  /** 일지를 PDF로 저장 */
  exportTbm(id: string): Promise<{ path: string } | null>;

  /**
   * 다른 PC의 기록이 동기화되어 들어왔을 때 알려 준다.
   * 반환값을 부르면 구독이 끊긴다.
   */
  onChanged(handler: (moduleId: string) => void): () => void;
}

declare global {
  interface Window {
    smp?: SmpApi;
  }
}
