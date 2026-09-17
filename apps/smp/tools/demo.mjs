#!/usr/bin/env node
/**
 * SMP 동작 시연.
 *
 *   node tools/demo.mjs [폴더경로]
 *
 * 폴더를 지정하지 않으면 바탕화면에 SMP-데모 폴더를 만든다.
 * OneDrive 폴더를 지정하면 실제 동기화 환경에서 확인할 수 있다.
 *
 * 화면에 나오는 것을 읽는 데서 그치지 말고, 탐색기로 만들어진 폴더를 직접
 * 열어 보십시오. .jsonl 파일은 메모장으로 열립니다.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { LamportClock, createEvent, defaultDocumentSettings, validateApprovalBlock } from '../packages/core/dist/index.js';
import { encryptJson, decryptJson, generateKey, isEncrypted } from '../packages/crypto/dist/index.js';
import {
  appendEvent,
  eventFilePath,
  mergeAll,
  modulePaths,
  paths,
  probeModules,
  quarantine,
  readEventsFrom,
  visibleModules,
} from '../packages/sync/dist/index.js';

// ── 화면 꾸미기 ──────────────────────────────────────────────
const line = (ch = '─') => console.log(ch.repeat(64));
function step(n, title) {
  console.log('');
  line();
  console.log(`  ${n}. ${title}`);
  line();
}
const ok = (msg) => console.log(`  [확인] ${msg}`);
const info = (msg) => console.log(`         ${msg}`);
const warn = (msg) => console.log(`  [경고] ${msg}`);

// ── 준비 ────────────────────────────────────────────────────
const target = process.argv[2] ?? join(homedir(), 'Desktop', 'SMP-데모');
const root = join(target, 'SMP');

console.log('');
console.log('  SMP (Safety Management Program) 동작 시연');
console.log(`  대상 폴더: ${root}`);

if (existsSync(root)) {
  rmSync(root, { recursive: true, force: true });
  info('이전 시연 폴더를 지우고 새로 시작합니다.');
}

const p = paths(root);
mkdirSync(p.common, { recursive: true });
mkdirSync(join(p.admin, 'master'), { recursive: true });
mkdirSync(modulePaths(root, 'daily').events, { recursive: true });
mkdirSync(modulePaths(root, 'education').events, { recursive: true });

const SITE = 'site_안양인덕원';
const 기기A = 'dev_현장사무실PC';
const 기기B = 'dev_안전팀노트북';

// ── 1. 현장 초기화 ───────────────────────────────────────────
step(1, '현장 초기화 — 폴더 구조를 만든다');

writeFileSync(
  p.manifest,
  JSON.stringify(
    {
      schemaVersion: 1,
      siteId: SITE,
      siteName: '안양·인덕원 주변 도시개발사업 부지조성공사',
      modules: ['daily', 'education'],
      createdAt: new Date().toISOString(),
      createdBy: 'u_안전관리자',
    },
    null,
    2,
  ),
  'utf8',
);

const 사용자 = {
  userId: 'u_안전관리자',
  displayName: '안전관리자',
  role: 'admin',
  modules: [],
  registeredAt: new Date().toISOString(),
  registeredBy: 'u_안전관리자',
  active: true,
};
writeFileSync(p.members, JSON.stringify({ members: [사용자] }, null, 2), 'utf8');
writeFileSync(p.documentSettings, JSON.stringify(defaultDocumentSettings(), null, 2), 'utf8');

ok('폴더 구조 생성됨');
info('_공통/    → 전원 읽기 (현장·업체·공종 정보)');
info('daily/     → 일상활동 담당자만');
info('education/ → 교육훈련 담당자만');
info('_관리자/  → 안전관리자 본인만 (인원 명부)');
info('');
info('담당이 아닌 모듈 폴더는 OneDrive에서 공유하지 않습니다.');
info('공유받지 못하면 폴더의 존재조차 알 수 없습니다.');

// ── 2. TBM 기록 ─────────────────────────────────────────────
step(2, 'TBM 기록 — 이벤트를 덧붙인다');

const 시계A = new LamportClock();
const 파일A = eventFilePath(root, 'daily', 기기A);

const tbm작성 = createEvent({
  module: 'daily',
  type: 'daily.tbm.created',
  aggregateId: 'tbm_20260917',
  siteId: SITE,
  actor: { userId: 'u_안전관리자', deviceId: 기기A },
  lamport: 시계A.tick(),
  payload: {
    date: '2026-09-17',
    startAt: '07:00',
    endAt: '07:12',
    location: '1공구 진입로',
    workName: '국토안전관리원 점검대비 현장정비',
    equipment: ['굴착기(002거6010)'],
    headcount: 3,
    // 사람은 ID로만 적는다. 성명은 암호화된 명부에만 있다.
    attendeeIds: ['w_001', 'w_002', 'w_003'],
    hazards: [
      {
        hazardId: 'HZ-EXCV-003',
        description: '장비에 의한 협착 및 충돌',
        control: '신호수 배치 및 작업구획 설정',
        actionTaken: true,
        isCritical: true,
      },
    ],
  },
});
appendEvent(파일A, tbm작성);
ok('TBM 작성 기록됨');

const tbm확정 = createEvent({
  module: 'daily',
  type: 'daily.tbm.confirmed',
  aggregateId: 'tbm_20260917',
  siteId: SITE,
  actor: { userId: 'u_안전관리자', deviceId: 기기A },
  lamport: 시계A.tick(),
  payload: { confirmedBy: 'u_안전관리자' },
});
appendEvent(파일A, tbm확정);
ok('TBM 확정됨');
info('');
info(`파일: ${파일A}`);
info('메모장으로 열어 보십시오. 한 줄에 기록 하나씩 쌓입니다.');
info('기존 줄은 절대 고치지 않고 덧붙이기만 하므로,');
info('언제 누가 무엇을 기록했는지가 그대로 남습니다.');

// ── 3. 두 사람이 같은 기록을 고친 경우 ────────────────────────
step(3, '두 기기가 같은 기록을 동시에 고친 경우');

const 시계B = new LamportClock();
const 파일B = eventFilePath(root, 'daily', 기기B);

// 기기 A: 장소를 고침
시계A.tick();
appendEvent(
  파일A,
  createEvent({
    module: 'daily',
    type: 'daily.tbm.amended',
    aggregateId: 'tbm_20260917',
    siteId: SITE,
    actor: { userId: 'u_안전관리자', deviceId: 기기A },
    lamport: 시계A.value,
    payload: { location: '1공구 진입로 (수정)', reason: '장소 오기' },
  }),
);

// 기기 B: 나중에 같은 항목을 고침
시계B.observe(시계A.value);
appendEvent(
  파일B,
  createEvent({
    module: 'daily',
    type: 'daily.tbm.amended',
    aggregateId: 'tbm_20260917',
    siteId: SITE,
    actor: { userId: 'u_안전팀', deviceId: 기기B },
    lamport: 시계B.tick(),
    payload: { location: '2공구 가설사무실 앞', reason: '실제 실시 장소로 정정' },
  }),
);

const 전체 = [
  ...readEventsFrom(파일A).events,
  ...readEventsFrom(파일B).events,
];
const 병합 = mergeAll(전체);
const tbm = 병합.find((m) => m.aggregateId === 'tbm_20260917');

ok(`이벤트 ${전체.length}건을 병합했습니다`);
info(`최종 장소: ${tbm.head.payload.location ?? '(변경 없음)'}`);
info(`밀려난 수정: ${tbm.superseded.length}건`);
for (const s of tbm.superseded) {
  info(`  · ${s.actor.deviceId} → "${s.payload.location}" (사유: ${s.payload.reason})`);
}
info('');
info('진 쪽 기록도 지우지 않고 남깁니다.');
info('무엇이 덮였는지 못 보면 사고 조사 때 설명할 수 없기 때문입니다.');

// ── 4. 동기화 중 잘린 줄 ────────────────────────────────────
step(4, 'OneDrive 동기화 중 파일이 잘려 보이는 경우');

const 위치 = readEventsFrom(파일A).offset;
appendFileSync(파일A, '{"id":"01J...","module":"daily","type":"daily.tbm.am', 'utf8');

const 잘린결과 = readEventsFrom(파일A, 위치);
ok(`잘린 줄을 읽지 않고 남겨 두었습니다 (truncatedTail=${잘린결과.truncatedTail})`);
info('동기화가 끝나 줄이 완성되면 그때 읽습니다.');
info('성급히 버리면 안전 기록이 사라집니다.');

// 나머지가 도착한 상황
appendFileSync(파일A, 'ended","aggregateId":"x"}\n', 'utf8');
const 완성후 = readEventsFrom(파일A, 위치);
ok(`줄이 완성된 뒤 다시 읽었습니다 (깨진 줄 ${완성후.broken.length}건 검출)`);

if (완성후.broken.length > 0) {
  const 격리 = quarantine(modulePaths(root, 'daily').events, 완성후.broken);
  warn('형식이 깨진 줄은 조용히 버리지 않고 격리했습니다.');
  info(`격리 파일: ${격리}`);
}

// ── 5. 개인정보 암호화 ──────────────────────────────────────
step(5, '개인정보 암호화 — 명부만 잠근다');

const 키 = generateKey();
const 명부 = {
  workers: [
    { id: 'w_001', name: '김○○', companyId: 'c_001', jobTitle: '보통인부' },
    { id: 'w_002', name: '이○○', companyId: 'c_001', jobTitle: '굴착기운전원' },
    { id: 'w_003', name: '박○○', companyId: 'c_002', jobTitle: '신호수' },
  ],
};
const 명부파일 = p.adminWorkers;
mkdirSync(join(p.admin, 'master'), { recursive: true });
writeFileSync(명부파일, encryptJson(명부, 키));

const 저장된내용 = readFileSync(명부파일);
ok(`명부를 암호화해 저장했습니다 (${저장된내용.length} 바이트)`);
info(`암호화 여부: ${isEncrypted(저장된내용) ? '예' : '아니오'}`);
info(`파일에 '김○○' 포함 여부: ${저장된내용.includes(Buffer.from('김○○', 'utf8')) ? '예' : '아니오'}`);
info('');
info('반면 TBM 기록 파일은 평문입니다. 열어서 확인해 보십시오.');

const tbm내용 = readFileSync(파일A, 'utf8');
info(`TBM 파일에 '김○○' 포함 여부: ${tbm내용.includes('김○○') ? '예' : '아니오'}`);
info(`TBM 파일에 'w_001' 포함 여부: ${tbm내용.includes('w_001') ? '예' : '아니오'}`);
info('');
info('기록에는 ID만 남고 성명은 암호화된 명부에만 있습니다.');
info('그래서 .jsonl이 유출되어도 누구의 기록인지 특정되지 않습니다.');

const 복호화 = decryptJson(저장된내용, 키);
ok(`올바른 키로는 열립니다 — ${복호화.workers.length}명`);

try {
  decryptJson(저장된내용, generateKey());
  warn('다른 키로 열렸습니다 — 이러면 안 됩니다');
} catch (e) {
  ok(`다른 키로는 열리지 않습니다 — ${e.message}`);
}

// ── 6. 권한 점검 ────────────────────────────────────────────
step(6, '권한 점검 — 공유 설정이 잘못되었는지 찾아낸다');

const 작성자 = {
  userId: 'u_김주임',
  displayName: '김주임',
  role: 'writer',
  modules: ['daily'], // 일상활동만 담당
  registeredAt: new Date().toISOString(),
  registeredBy: 'u_안전관리자',
  active: true,
};

const 점검 = probeModules({ root, member: 작성자, modules: ['daily', 'education'] });
for (const r of 점검) {
  const 표시 = `${r.moduleId.padEnd(10)} 선언=${r.declared.padEnd(5)} 실제=${r.actual}`;
  if (r.mismatch) {
    warn(표시);
    info(`  ${r.mismatch.message}`);
  } else {
    ok(표시);
  }
}
info('');
info(`화면에 보일 모듈: ${visibleModules(점검).join(', ')}`);
info('');
info('이 PC에서는 education 폴더가 같은 디스크에 있어 접근됩니다.');
info('실제 운영에서는 OneDrive에서 공유하지 않으므로 접근 자체가 불가능합니다.');
info('프로그램은 공유 설정을 대신 바꿀 수 없고, 어긋난 것을 알릴 수만 있습니다.');

// ── 7. 결재란 설정 ──────────────────────────────────────────
step(7, '결재란 설정 — 칸을 늘리고 줄인다');

const 설정 = defaultDocumentSettings();
const 기본 = 설정.approvalBlocks['daily.tbm'];
ok(`기본 결재란: ${기본.slots.map((s) => s.title).join(' / ')}`);

기본.slots.push({ id: 'slot_4', title: '감리', order: 4, required: false });
const 검사1 = validateApprovalBlock(기본);
ok(`감리 추가 → ${검사1.ok ? '통과' : '거부'} (총 ${기본.slots.length}칸)`);

for (let i = 5; i <= 7; i += 1) {
  기본.slots.push({ id: `slot_${i}`, title: `추가${i}`, order: i, required: false });
}
const 검사2 = validateApprovalBlock(기본);
warn(`7칸으로 늘림 → ${검사2.ok ? '통과' : '거부'}`);
for (const e of 검사2.errors) info(`  ${e}`);

// ── 마무리 ──────────────────────────────────────────────────
console.log('');
line('═');
console.log('  시연이 끝났습니다.');
line('═');
console.log('');
console.log(`  만들어진 폴더: ${root}`);
console.log('');
console.log('  탐색기로 열어 직접 확인해 보십시오.');
console.log('');
console.log('   · daily\\events\\*.jsonl     → 메모장으로 열면 기록이 보입니다 (평문)');
console.log('   · _관리자\\master\\workers.json → 열어도 읽을 수 없습니다 (암호화)');
console.log('   · daily\\events\\.quarantine  → 격리된 깨진 줄');
console.log('');
console.log('  OneDrive 폴더에서 시험하려면:');
console.log('   node tools\\demo.mjs "C:\\Users\\사용자명\\OneDrive\\SMP시험"');
console.log('');

const 파일수 = countFiles(root);
console.log(`  생성된 파일 ${파일수}개`);
console.log('');

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else n += 1;
  }
  return n;
}
