/**
 * 시연용 가짜 창구.
 *
 * Electron 없이 브라우저에서 화면만 열어 볼 때 쓴다. 실제 파일은 건드리지
 * 않고 메모리에만 남는다. 여기 들어 있는 현장명·업체명·성명은 전부
 * 가상의 값이다. 실제 현장 자료를 이 파일에 넣지 않는다.
 */
import type { Company, WorkType } from '@smp/core';
import type { TbmSession } from '@smp/module-daily';
import type {
  HazardSuggestion,
  SaveResult,
  SmpApi,
  StartupState,
  TbmListItem,
  WorkerBrief,
} from '../shared/api.js';
import { todayIso } from './dom.js';

const companies: Company[] = [
  { id: 'CO-1', siteId: 'ST-1', name: '○○건설', workTypeIds: ['WT-1'], active: true },
  { id: 'CO-2', siteId: 'ST-1', name: '△△토공', workTypeIds: ['WT-2'], active: true },
];

const workTypes: WorkType[] = [
  { id: 'WT-1', name: '철근콘크리트공사', group: '구조', hazardLibraryCode: 'RCST' },
  { id: 'WT-2', name: '굴착공사', group: '토공', hazardLibraryCode: 'EXCV' },
];

const workers: Record<string, WorkerBrief[]> = {
  'CO-1': [
    { id: 'WK-1', name: '근로자1', jobTitle: '형틀목공' },
    { id: 'WK-2', name: '근로자2', jobTitle: '철근공' },
    { id: 'WK-3', name: '근로자3', jobTitle: '보통인부' },
  ],
  'CO-2': [
    { id: 'WK-4', name: '근로자4', jobTitle: '굴착기운전원' },
    { id: 'WK-5', name: '근로자5', jobTitle: '신호수' },
  ],
};

const hazards: Record<string, HazardSuggestion[]> = {
  EXCV: [
    {
      id: 'HZ-EXCV-001',
      task: '굴착면 형성',
      hazard: '굴착면 기울기 미준수로 인한 토사 붕괴',
      control: '지반 종류별 굴착면 기울기 준수 및 굴착면 상부 하중 제한',
      legalBasis: ['산업안전보건기준에 관한 규칙 제338조'],
      legalBasisVerified: false,
    },
    {
      id: 'HZ-EXCV-002',
      task: '굴착기 작업',
      hazard: '굴착기 선회 반경 내 근로자 접촉',
      control: '작업반경 내 출입 금지 구역 설정 및 유도자 배치',
      legalBasis: ['산업안전보건기준에 관한 규칙 제20조'],
      legalBasisVerified: false,
    },
  ],
  RCST: [
    {
      id: 'HZ-RCST-001',
      task: '거푸집 조립',
      hazard: '동바리 좌굴에 의한 거푸집 붕괴',
      control: '동바리 수직도 확인 및 수평연결재 설치',
      legalBasis: ['산업안전보건기준에 관한 규칙 제332조'],
      legalBasisVerified: false,
    },
  ],
};

function emptySession(): TbmSession {
  return {
    id: `DEMO-${Date.now()}`,
    siteId: 'ST-1',
    date: todayIso(),
    startAt: '07:00',
    endAt: '07:20',
    location: '',
    leaderWorkerId: '',
    leaderRole: '관리감독자',
    companyId: 'CO-1',
    workTypeId: 'WT-1',
    workName: '',
    workDescription: '',
    equipment: [],
    headcount: 0,
    dailyEducation: { method: false, sequence: false, precautions: false },
    regularEducationNote: '',
    hazards: [],
    attendees: [],
    photos: [],
    approvals: [],
    status: 'draft',
    amendments: [],
  };
}

const sessions = new Map<string, TbmSession>();

function toListItem(session: TbmSession): TbmListItem {
  return {
    id: session.id,
    date: session.date,
    startAt: session.startAt,
    endAt: session.endAt,
    companyName: companies.find((c) => c.id === session.companyId)?.name ?? '',
    workName: session.workName,
    attendedCount: session.attendees.filter((a) => a.attended).length,
    hazardCount: session.hazards.length,
    pendingCount: session.hazards.filter((h) => !h.actionTaken).length,
    status: session.status,
    amended: session.amendments.length,
  };
}

const ok: SaveResult = { ok: true, blocking: [], warnings: [] };

export function mockApi(): SmpApi {
  const seed = emptySession();
  seed.location = '지하 1층 코어부';
  seed.workName = '벽체 철근 조립';
  seed.workDescription = '지하 1층 코어 벽체 철근 조립 및 결속';
  seed.leaderWorkerId = 'WK-1';
  seed.headcount = 3;
  seed.attendees = (workers['CO-1'] ?? []).map((w) => ({
    workerId: w.id,
    attended: true,
    healthStatus: '이상없음' as const,
    ppeConfirmed: true,
  }));
  sessions.set(seed.id, seed);

  return {
    startup: async (): Promise<StartupState> => ({
      configured: true,
      syncRoot: 'D:\\OneDrive\\SMP (시연)',
      site: {
        site: { id: 'ST-1', name: '○○ 신축공사 (시연용 가상 현장)' },
        modules: ['daily'],
        member: {
          userId: 'U-1',
          displayName: '안전관리자 (시연)',
          role: 'admin',
          modules: ['daily'],
          registeredAt: '2026-01-02T00:00:00.000Z',
          registeredBy: 'U-1',
          active: true,
        },
      },
      access: [
        { moduleId: 'daily', label: '일상활동', declared: 'write', actual: 'write', warning: null },
      ],
      issues: [],
    }),
    chooseSyncRoot: async () => null,
    listCompanies: async () => companies,
    listWorkTypes: async () => workTypes,
    listWorkers: async (companyId) => workers[companyId] ?? [],
    listTbm: async (yearMonth) =>
      [...sessions.values()].filter((s) => s.date.startsWith(yearMonth)).map(toListItem),
    getTbm: async (id) => sessions.get(id) ?? null,
    saveTbm: async (session) => {
      sessions.set(session.id, session);
      return ok;
    },
    confirmTbm: async (id) => {
      const session = sessions.get(id);
      if (session) sessions.set(id, { ...session, status: 'confirmed' });
      return ok;
    },
    amendTbm: async (id, patch, reason) => {
      const session = sessions.get(id);
      if (session) {
        sessions.set(id, {
          ...session,
          ...patch,
          amendments: [
            ...session.amendments,
            { at: new Date().toISOString(), actor: 'U-1', reason, changedFields: Object.keys(patch) },
          ],
        });
      }
      return ok;
    },
    suggestHazards: async (code) => hazards[code] ?? [],
    exportTbm: async () => null,
    // 시연 창구에는 동기화가 없다
    onChanged: () => () => undefined,
  };
}

/** 새 일지 틀. 화면과 시연 창구가 같은 것을 쓰도록 여기서 내보낸다 */
export { emptySession };
