#!/usr/bin/env node
/**
 * 인쇄 결과 검증.
 *
 *   node tools/verify-print.mjs
 *
 * 계산한 치수가 실제 인쇄물에서 그대로 나오는지 확인한다. 브라우저로 렌더링해
 * 요소 높이를 재고, PDF로 뽑아 면 수와 여백을 잰다.
 *
 * 이 도구가 없어 실제로 놓친 일이 있다. 본문 높이가 0.06mm 초과해 마지막
 * 설명표가 통째로 사라졌는데, 계산상으로는 아무 문제가 없어 보였다.
 *
 * Chromium이 필요하다. 환경변수 CHROMIUM_PATH 로 경로를 줄 수 있다.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import {
  MARGIN_BOTTOM_MM,
  MARGIN_TOP_MM,
  PAGE_HEIGHT_MM,
  PHOTOS_PER_PAGE,
  SAFETY_MARGIN_MM,
  renderPhotoSheet,
  renderTbmLog,
  sheetMetrics,
} from '../modules/daily/dist/index.js';

const require = createRequire(import.meta.url);

function loadChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);

  let playwright;
  try {
    playwright = require('playwright-core');
  } catch {
    console.error('playwright-core 가 없습니다. npm install 후 다시 실행하십시오.');
    process.exit(2);
  }
  return { playwright, candidates };
}

const TOLERANCE_MM = 1.5;
const results = [];

function check(label, actual, expected, tolerance = TOLERANCE_MM) {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tolerance;
  results.push({ label, actual, expected, diff, ok });
  const mark = ok ? '  OK ' : '  실패';
  console.log(
    `${mark} ${label.padEnd(34)} ${actual.toFixed(2)}mm  (기대 ${expected.toFixed(2)}mm, 차이 ${diff.toFixed(2)}mm)`,
  );
}

function checkEq(label, actual, expected) {
  const ok = actual === expected;
  results.push({ label, actual, expected, diff: 0, ok });
  console.log(`${ok ? '  OK ' : '  실패'} ${label.padEnd(34)} ${actual}  (기대 ${expected})`);
}

const { playwright, candidates } = loadChromium();
const dir = mkdtempSync(join(tmpdir(), 'smp-verify-'));

// 1×1 투명 PNG — 사진 내용은 검증 대상이 아니다
const DOT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

try {
  let browser;
  for (const path of candidates) {
    try {
      browser = await playwright.chromium.launch({ executablePath: path });
      console.log(`Chromium: ${path}\n`);
      break;
    } catch {
      /* 다음 후보 */
    }
  }
  if (!browser) {
    console.error('Chromium을 찾지 못했습니다. CHROMIUM_PATH 를 지정하십시오.');
    process.exit(2);
  }

  const page = await browser.newPage();

  // ── 사진대지 ────────────────────────────────────────────
  console.log('사진대지 — 한 면 3장');

  const photos = Array.from({ length: 4 }, (_, i) => ({
    sha256: `hash${i}`,
    ext: '.png',
    caption: `현장 사진 ${i + 1}`,
  }));
  const sources = Object.fromEntries(photos.map((p) => [p.sha256, DOT]));

  const sheetHtml = renderPhotoSheet({
    siteName: '검증용 현장명',
    date: '2026-09-17',
    photos,
    sources,
  });
  const sheetFile = join(dir, 'sheet.html');
  writeFileSync(sheetFile, sheetHtml, 'utf8');
  await page.goto(`file://${sheetFile}`, { waitUntil: 'networkidle' });

  const metrics = sheetMetrics(PHOTOS_PER_PAGE);
  const dom = await page.evaluate(() => {
    const px2mm = (px) => (px / 96) * 25.4;
    const sheet = document.querySelector('.sheet');
    const block = sheet.querySelector('.block');
    return {
      body: px2mm(sheet.getBoundingClientRect().height),
      photo: px2mm(block.querySelector('.photo').getBoundingClientRect().height),
      info: px2mm(block.querySelector('.info').getBoundingClientRect().height),
      blocks: sheet.querySelectorAll('.block').length,
    };
  });

  const limit = PAGE_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;
  check('사진 높이', dom.photo, metrics.photoMm, 0.5);
  check('설명표 높이', dom.info, metrics.infoMm, 0.5);
  checkEq('한 면의 사진 수', dom.blocks, PHOTOS_PER_PAGE);

  // 본문이 인쇄 영역을 넘으면 마지막 요소가 잘린다
  const ok = dom.body <= limit;
  results.push({ label: '본문이 인쇄 영역 안에 있음', ok });
  console.log(
    `${ok ? '  OK ' : '  실패'} ${'본문 높이'.padEnd(34)} ${dom.body.toFixed(2)}mm  (한계 ${limit}mm, 여유 ${(limit - dom.body).toFixed(2)}mm)`,
  );

  const pdfFile = join(dir, 'sheet.pdf');
  await page.pdf({ path: pdfFile, printBackground: true, preferCSSPageSize: true });
  const pdf = readFileSync(pdfFile).toString('latin1');
  const pageCount = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  checkEq('사진 4장 → 면 수', pageCount, 2);

  // ── TBM 일지 ────────────────────────────────────────────
  console.log('\nTBM 및 일일안전교육 일지');

  const logHtml = renderTbmLog({
    session: {
      id: 't1', siteId: 's1', date: '2026-09-17', startAt: '07:00', endAt: '07:12',
      location: '검증', leaderWorkerId: 'w0', leaderRole: '관리감독자',
      companyId: 'c1', workTypeId: 'wt1', workName: '검증 작업',
      workDescription: '검증', equipment: ['장비'], headcount: 6,
      dailyEducation: { method: true, sequence: true, precautions: true },
      regularEducationNote: '검증', closingMeeting: '검증',
      hazards: [{ description: '위험', control: '대책', actionTaken: true, isCritical: true }],
      attendees: Array.from({ length: 6 }, (_, i) => ({
        workerId: `w${i}`, attended: true, healthStatus: '이상없음', ppeConfirmed: true,
      })),
      photos: [], approvals: [
        { slotId: 's1', titleSnapshot: '공사팀' },
        { slotId: 's2', titleSnapshot: '안전팀' },
        { slotId: 's3', titleSnapshot: '현장대리인' },
      ],
      status: 'confirmed', amendments: [],
    },
    names: {
      siteName: '검증용 현장명', contractorName: '검증 시공사',
      companyName: '검증 업체', workTypeName: '검증 공종',
      workerNames: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`w${i}`, `인원${i}`])),
    },
  });
  const logFile = join(dir, 'log.html');
  writeFileSync(logFile, logHtml, 'utf8');
  await page.goto(`file://${logFile}`, { waitUntil: 'networkidle' });

  const logPdf = join(dir, 'log.pdf');
  await page.pdf({ path: logPdf, printBackground: true, preferCSSPageSize: true });
  const logPages = (readFileSync(logPdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  // 참석자 6명이면 한 장에 들어가야 한다
  checkEq('참석자 6명 → 면 수', logPages, 1);

  await browser.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length > 0) {
  console.log(`실패 ${failed.length}건 / 전체 ${results.length}건`);
  console.log('');
  console.log('계산값과 실제 인쇄 결과가 다릅니다. 치수 상수를 실측값으로 보정하십시오.');
  process.exit(1);
}
console.log(`인쇄 검증 통과 — ${results.length}건`);
console.log(`(안전 여유 ${SAFETY_MARGIN_MM}mm 적용 중)`);
