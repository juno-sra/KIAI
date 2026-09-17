/**
 * 일상활동 모듈 등록 정의.
 *
 * TBM으로 시작하고, 순회점검일지·작업허가서·안전관리자 업무일지가 뒤따른다.
 */
import type { SmpModule } from '@smp/module-sdk';
import { ALL_TBM_EVENT_TYPES } from './tbm/events.js';

export const dailyModule: SmpModule = {
  id: 'daily',
  name: '일상활동',
  version: '0.1.0',

  eventTypes: ALL_TBM_EVENT_TYPES,

  projections: [],

  routes: [
    { path: '/tbm', label: 'TBM 일지', roles: ['admin', 'writer', 'viewer'] },
    { path: '/tbm/new', label: 'TBM 작성', roles: ['admin', 'writer'], hidden: true },
    { path: '/tbm/:id', label: 'TBM 상세', roles: ['admin', 'writer', 'viewer'], hidden: true },
    { path: '/tbm/hazards', label: '위험요인 사전', roles: ['admin', 'writer', 'viewer'] },
  ],

  documents: [{ kind: 'tbm-log', title: 'TBM 및 일일안전교육 일지', paper: 'A4-portrait' }],

  masterRefs: ['site', 'company', 'worker', 'workType', 'hazard'],

  retention: [
    {
      documentKind: 'tbm-log',
      years: 3,
      // 산업안전보건법 제164조의 보존 대상 서류 목록에 'TBM 일지'가 명시되어 있지
      // 않다. 법정 기간처럼 보이게 하지 않기 위해 운영 기본값으로 표시한다.
      basis: '근거 확인 불가 — 운영 기본값 3년',
      isOperationalDefault: true,
    },
  ],

  rosterScope: 'byCompany',
};
