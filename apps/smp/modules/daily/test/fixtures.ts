import type { TbmSession } from '../src/tbm/types.js';
import type { RenderNames } from '../src/tbm/render.js';

export function sampleSession(over: Partial<TbmSession> = {}): TbmSession {
  return {
    id: 'tbm_20260917',
    siteId: 'site_1',
    date: '2026-09-17',
    startAt: '07:00',
    endAt: '07:12',
    location: '1공구 진입로',
    leaderWorkerId: 'w_leader',
    leaderRole: '관리감독자',
    companyId: 'c_001',
    workTypeId: 'wt_excv',
    workName: '국토안전관리원 점검대비 현장정비',
    workDescription: '진입로 정비 및 자재 정리',
    equipment: ['굴착기(002거6010)'],
    headcount: 3,
    dailyEducation: { method: true, sequence: true, precautions: true },
    regularEducationNote: '굴착기 작업 시 신호수 배치 및 접근금지 구역 준수',
    closingMeeting: '건의사항 없음',
    hazards: [
      {
        hazardId: 'HZ-EXCV-003',
        description: '장비에 의한 협착 및 충돌',
        control: '신호수 배치 및 작업구획 설정',
        actionTaken: true,
        isCritical: true,
      },
    ],
    attendees: [
      { workerId: 'w_001', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
      { workerId: 'w_002', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
      { workerId: 'w_003', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
    ],
    photos: [],
    approvals: [
      { slotId: 'slot_1', titleSnapshot: '공사팀' },
      { slotId: 'slot_2', titleSnapshot: '안전팀' },
      { slotId: 'slot_3', titleSnapshot: '현장대리인' },
    ],
    status: 'draft',
    amendments: [],
    ...over,
  };
}

export function sampleNames(): RenderNames {
  return {
    siteName: '○○ 도시개발사업 부지조성공사',
    contractorName: '○○건설 주식회사',
    companyName: '○○토목(주)',
    workTypeName: '토공·굴착',
    workerNames: {
      w_leader: '천○○',
      w_001: '김○○',
      w_002: '이○○',
      w_003: '박○○',
    },
  };
}
