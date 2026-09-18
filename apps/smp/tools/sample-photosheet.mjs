#!/usr/bin/env node
/**
 * 사진대지 샘플 생성.
 *
 *   node tools/sample-photosheet.mjs <사진파일...> [--out 파일명]
 *
 * 사진을 data URI로 넣어 단일 HTML을 만든다. 실제 프로그램에서는 축소본의
 * file:// 경로를 주므로 파일이 커지지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { renderPhotoSheet } from '../modules/daily/dist/index.js';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : '사진대지-샘플.html';
const files = (outIndex >= 0 ? [...args.slice(0, outIndex), ...args.slice(outIndex + 2)] : args);

if (files.length === 0) {
  console.error('사용법: node tools/sample-photosheet.mjs <사진파일...> [--out 파일명]');
  process.exit(1);
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

const photos = [];
const sources = {};

for (const [i, file] of files.entries()) {
  const buf = readFileSync(file);
  const ext = extname(file).toLowerCase();
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const mime = MIME[ext] ?? 'image/jpeg';

  photos.push({
    sha256,
    ext,
    caption: i === 0 ? 'TBM 실시 장면' : `현장 사진 ${i + 1}`,
  });
  sources[sha256] = `data:${mime};base64,${buf.toString('base64')}`;

  console.log(`  ${basename(file)} — ${(buf.length / 1024).toFixed(0)}KB`);
}

const html = renderPhotoSheet({
  siteName: '○○ 도시개발사업 부지조성공사',
  date: '2026-09-17',
  photos,
  sources,
});

writeFileSync(out, html, 'utf8');
console.log('');
console.log(`생성 완료: ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)}KB)`);
console.log('브라우저로 열고 Ctrl+P → "PDF로 저장" 으로 인쇄 결과를 확인하십시오.');
