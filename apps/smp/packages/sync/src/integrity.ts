/**
 * 무결성 검사 — 앱 시작 시 이벤트 파일이 온전한지 본다.
 */
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS_DIR, QUARANTINE_DIR } from './layout.js';

export interface FileCheck {
  file: string;
  size: number;
  /** 마지막 줄이 개행으로 끝나는지. 아니면 동기화 중일 수 있다 */
  endsWithNewline: boolean;
}

export interface IntegrityReport {
  moduleId: string;
  files: FileCheck[];
  /** 동기화 도구가 만든 충돌 사본 (예: '...-홍길동의 충돌 사본.jsonl') */
  conflictCopies: string[];
  hasQuarantine: boolean;
}

/**
 * OneDrive·구글드라이브가 충돌 시 만드는 사본을 찾아낸다.
 *
 * 기기별 단독 쓰기 구조에서는 이런 파일이 나오지 않아야 정상이다. 나왔다면
 * 두 기기가 같은 deviceId를 쓰고 있다는 뜻이므로 사용자에게 알려야 한다.
 */
const CONFLICT_RE = /(충돌 사본|conflicted copy|\(\d+\)\.jsonl$)/i;

export function checkModule(root: string, moduleId: string): IntegrityReport {
  const eventsDir = join(root, moduleId, EVENTS_DIR);
  const report: IntegrityReport = {
    moduleId,
    files: [],
    conflictCopies: [],
    hasQuarantine: existsSync(join(eventsDir, QUARANTINE_DIR)),
  };

  if (!existsSync(eventsDir)) return report;

  for (const name of readdirSync(eventsDir)) {
    if (name === QUARANTINE_DIR) continue;
    if (!name.endsWith('.jsonl')) continue;

    const full = join(eventsDir, name);
    if (!statSync(full).isFile()) continue;

    if (CONFLICT_RE.test(name)) {
      report.conflictCopies.push(full);
      continue;
    }

    const size = statSync(full).size;
    report.files.push({ file: full, size, endsWithNewline: lastByteIsNewline(full, size) });
  }

  return report;
}

function lastByteIsNewline(file: string, size: number): boolean {
  if (size === 0) return true;
  const buf = Buffer.alloc(1);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buf, 0, 1, size - 1);
  } finally {
    closeSync(fd);
  }
  return buf[0] === 0x0a;
}
