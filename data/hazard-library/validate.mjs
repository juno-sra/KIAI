#!/usr/bin/env node
/**
 * 위험요인 표준 사전 검증 스크립트
 *
 *   node data/hazard-library/validate.mjs
 *
 * 검사 항목
 *   1. JSON 파싱 가능 여부
 *   2. 필수 필드 존재
 *   3. id 형식 및 전역 중복
 *   4. workTypeCode / accidentTypes / controls.type 이 taxonomy.json에 있는 코드인지
 *   5. legalBasis 비어 있지 않은지, 조문 형식이 그럴듯한지
 *   6. 조문 미대조(legalBasisVerified=false) 건수 집계
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const taxonomy = JSON.parse(readFileSync(join(root, 'taxonomy.json'), 'utf8'));

const workTypeCodes = new Set(taxonomy.workTypes.map((w) => w.code));
const accidentCodes = new Set(taxonomy.accidentTypes.map((a) => a.code));
const controlCodes = new Set(taxonomy.controlTypes.map((c) => c.code));

const ID_RE = /^HZ-[A-Z_]+-\d{3}$/;
// '규칙 제42조(...)', '산업안전보건법 제29조', '같은 규칙 별표 3' 등을 허용
const LAW_RE = /(제\s?\d+조|별표\s?\d+|근거 확인 불가)/;

const errors = [];
const warnings = [];
const seenIds = new Map();
let total = 0;
let unverified = 0;
const byWorkType = new Map();

const files = readdirSync(join(root, 'hazards')).filter((f) => f.endsWith('.json')).sort();

for (const file of files) {
  const path = join(root, 'hazards', file);
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${file}: JSON 파싱 실패 — ${e.message}`);
    continue;
  }

  if (doc.schemaVersion !== 1) errors.push(`${file}: schemaVersion이 1이 아님`);
  if (!workTypeCodes.has(doc.workTypeCode)) {
    errors.push(`${file}: workTypeCode '${doc.workTypeCode}' 가 taxonomy에 없음`);
  }
  if (!Array.isArray(doc.hazards) || doc.hazards.length === 0) {
    errors.push(`${file}: hazards 배열이 비어 있음`);
    continue;
  }

  for (const h of doc.hazards) {
    total += 1;
    const where = `${file} / ${h.id ?? '(id 없음)'}`;

    if (!h.id || !ID_RE.test(h.id)) {
      errors.push(`${where}: id 형식이 HZ-<공종>-<3자리> 가 아님`);
    } else if (seenIds.has(h.id)) {
      errors.push(`${where}: id 중복 (이미 ${seenIds.get(h.id)} 에 있음)`);
    } else {
      seenIds.set(h.id, file);
    }

    for (const field of ['task', 'hazard']) {
      if (!h[field] || typeof h[field] !== 'string' || h[field].trim() === '') {
        errors.push(`${where}: ${field} 가 비어 있음`);
      }
    }

    if (!Array.isArray(h.accidentTypes) || h.accidentTypes.length === 0) {
      errors.push(`${where}: accidentTypes 가 비어 있음`);
    } else {
      for (const a of h.accidentTypes) {
        if (!accidentCodes.has(a)) errors.push(`${where}: 재해유형 코드 '${a}' 가 taxonomy에 없음`);
      }
    }

    if (!Array.isArray(h.controls) || h.controls.length === 0) {
      errors.push(`${where}: controls 가 비어 있음`);
    } else {
      for (const c of h.controls) {
        if (!controlCodes.has(c.type)) errors.push(`${where}: 대책 유형 '${c.type}' 가 taxonomy에 없음`);
        if (!c.text || c.text.trim() === '') errors.push(`${where}: 대책 text 가 비어 있음`);
      }
      // 보호구만으로 끝나는 대책은 경고 — 보호구는 최후 수단이다
      if (h.controls.every((c) => c.type === 'PPE')) {
        warnings.push(`${where}: 대책이 보호구뿐임. 제거·대체·공학적 통제를 먼저 검토할 것`);
      }
    }

    if (!Array.isArray(h.legalBasis) || h.legalBasis.length === 0) {
      errors.push(`${where}: legalBasis 가 비어 있음. 근거가 없으면 '근거 확인 불가'를 명시할 것`);
    } else {
      for (const b of h.legalBasis) {
        if (!LAW_RE.test(b)) {
          warnings.push(`${where}: 근거 '${b}' 에 조문 번호나 '근거 확인 불가' 표기가 없음`);
        }
      }
    }

    if (h.legalBasisVerified !== true) unverified += 1;

    for (const f of ['severityDefault', 'likelihoodDefault']) {
      if (h[f] !== undefined && (h[f] < 1 || h[f] > 3)) {
        errors.push(`${where}: ${f} 는 1~3 이어야 함`);
      }
    }

    byWorkType.set(doc.workTypeCode, (byWorkType.get(doc.workTypeCode) ?? 0) + 1);
  }
}

console.log('=== 위험요인 표준 사전 검증 ===');
console.log(`파일 ${files.length}개, 위험요인 ${total}건`);
console.log('');
console.log('공종별 건수:');
for (const [code, n] of [...byWorkType].sort((a, b) => b[1] - a[1])) {
  const name = taxonomy.workTypes.find((w) => w.code === code)?.name ?? code;
  console.log(`  ${code.padEnd(8)} ${String(n).padStart(3)}건  ${name}`);
}
// taxonomy에 있으나 데이터가 없는 공종 안내
const missing = taxonomy.workTypes.filter((w) => !byWorkType.has(w.code));
if (missing.length) {
  console.log('데이터가 아직 없는 공종:');
  for (const w of missing) console.log(`  · ${w.code.padEnd(8)} ${w.name}`);
  console.log('  (다른 파일이 해당 작업을 포함할 수 있음 — README의 매핑표 참조)');
  console.log('');
}

if (warnings.length) {
  console.log(`경고 ${warnings.length}건:`);
  for (const w of warnings) console.log(`  · ${w}`);
  console.log('');
}

if (errors.length) {
  console.log(`오류 ${errors.length}건:`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}

console.log('오류 없음');
console.log('');
console.log(`※ 조문 미대조 ${unverified}/${total}건 — 시행 중인 법령 원문과 대조 후`);
console.log('   legalBasisVerified 를 true 로 바꿀 것. 미대조 항목은 화면·출력물에 표시된다.');
