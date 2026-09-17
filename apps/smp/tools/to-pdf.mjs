#!/usr/bin/env node
/**
 * HTML을 A4 PDF로 변환한다.
 *
 *   node tools/to-pdf.mjs <입력.html> <출력.pdf>
 *
 * CSS의 @page 설정을 그대로 쓴다. 실제 프로그램에서 Electron이 인쇄하는 방식과
 * 같으므로, 여기서 나온 PDF가 곧 최종 출력물이다.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error('사용법: node tools/to-pdf.mjs <입력.html> <출력.pdf>');
  process.exit(1);
}

const { chromium } = require('playwright-core');

const paths = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);

let browser;
for (const executablePath of paths) {
  try {
    browser = await chromium.launch({ executablePath });
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
await page.goto(`file://${resolve(input)}`, { waitUntil: 'networkidle' });
// format 과 함께 주면 축소 인쇄가 걸린다. CSS @page 를 그대로 따른다.
await page.pdf({ path: output, printBackground: true, preferCSSPageSize: true });
await browser.close();

const pages = (readFileSync(output).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`${output} — ${pages}면`);
