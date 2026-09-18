#!/usr/bin/env node
/**
 * TBM 일지 샘플 생성.
 *
 *   node tools/sample-tbm.mjs [출력경로]
 *
 * 브라우저로 열어 확인하고, Ctrl+P → 대상을 'PDF로 저장'으로 두면
 * 실제 인쇄물이 어떻게 나오는지 볼 수 있다.
 */
import { writeFileSync } from 'node:fs';
import { renderTbmLog } from '../modules/daily/dist/index.js';

const out = process.argv[2] ?? 'TBM일지-샘플.html';

const session = {
  id: 'tbm_20260917',
  siteId: 'site_1',
  date: '2026-09-17',
  startAt: '07:00',
  endAt: '07:12',
  location: '1공구 진입로 가설사무실 앞',
  leaderWorkerId: 'w_leader',
  leaderRole: '관리감독자',
  companyId: 'c_001',
  workTypeId: 'wt_excv',
  workName: '국토안전관리원 점검대비 현장정비',
  workDescription: '진입로 정비, 가설자재 정리정돈, 안전시설물 보수',
  equipment: ['굴착기(00거0000)', '덤프트럭 2대'],
  headcount: 6,
  dailyEducation: { method: true, sequence: true, precautions: true },
  regularEducationNote:
    '굴착기 작업반경 내 출입금지 및 신호수 배치 준수. 어제 인근 현장에서 발생한 후진 중 협착 사고 사례 전파.',
  closingMeeting: '진입로 조도 부족 건의 → 야간 작업 시 이동식 조명탑 배치하기로 함',
  hazards: [
    {
      hazardId: 'HZ-EXCV-003',
      description: '굴착기 선회 반경 내 작업자 접근으로 협착·충돌',
      control: '선회반경 출입금지 구획 설정, 신호수 배치, 운전원·작업자 상호 육안 확인 후 작업',
      actionTaken: true,
      isCritical: true,
    },
    {
      hazardId: 'HZ-COMMON-001',
      description: '통로에 가설자재가 놓여 있어 걸려 넘어짐',
      control: '작업 전 통로 정리, 자재 적치구역 별도 지정',
      actionTaken: true,
      isCritical: false,
    },
    {
      hazardId: 'HZ-TEMP-009',
      description: '진입로 측구 개구부 덮개 미설치',
      control: '덮개 설치 후 고정, 개구부 표시',
      actionTaken: false,
      pendingAction: '덮개 자재 금일 오후 반입 예정. 반입 전까지 라바콘·경고띠로 출입통제하고 감시자 배치',
      isCritical: true,
    },
  ],
  attendees: [
    { workerId: 'w_001', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
    { workerId: 'w_002', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
    { workerId: 'w_003', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
    { workerId: 'w_004', attended: true, healthStatus: '이상있음', healthNote: '경미한 감기 증세 — 중량물 취급 작업에서 제외', ppeConfirmed: true },
    { workerId: 'w_005', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
    { workerId: 'w_006', attended: true, healthStatus: '이상없음', ppeConfirmed: true },
  ],
  photos: [],
  approvals: [
    { slotId: 'slot_1', titleSnapshot: '공사팀' },
    { slotId: 'slot_2', titleSnapshot: '안전팀' },
    { slotId: 'slot_3', titleSnapshot: '현장대리인' },
  ],
  status: 'confirmed',
  amendments: [],
};

const names = {
  siteName: '○○ 도시개발사업 부지조성공사',
  contractorName: '○○건설 주식회사',
  companyName: '○○토목(주)',
  workTypeName: '토공·굴착',
  workerNames: {
    w_leader: '천○○',
    w_001: '김○○',
    w_002: '이○○',
    w_003: '박○○',
    w_004: '최○○',
    w_005: '정○○',
    w_006: '강○○',
  },
};

writeFileSync(out, renderTbmLog({ session, names }), 'utf8');
console.log(`생성 완료: ${out}`);
console.log('');
console.log('브라우저로 열어 확인하십시오.');
console.log('Ctrl+P → 대상을 "PDF로 저장", 여백 "기본"으로 두면 실제 인쇄물이 나옵니다.');
