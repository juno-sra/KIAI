/**
 * 동기화 폴더 구조.
 *
 * 모듈별로 폴더를 나누는 이유는 격리다. 담당이 아닌 모듈 폴더는 OneDrive에서
 * 공유하지 않으므로, 타 담당자는 앱을 우회해도 그 폴더의 존재조차 알 수 없다.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const COMMON_DIR = '_공통';
export const ADMIN_DIR = '_관리자';
export const EVENTS_DIR = 'events';
export const ATTACHMENTS_DIR = 'attachments';
export const QUARANTINE_DIR = '.quarantine';

export interface SmpPaths {
  root: string;
  common: string;
  manifest: string;
  members: string;
  documentSettings: string;
  masterDir: string;
  admin: string;
  adminWorkers: string;
  adminExports: string;
  adminAudit: string;
}

export function paths(root: string): SmpPaths {
  const common = join(root, COMMON_DIR);
  const admin = join(root, ADMIN_DIR);
  return {
    root,
    common,
    manifest: join(common, 'manifest.json'),
    members: join(common, 'members.json'),
    documentSettings: join(common, 'document-settings.json'),
    masterDir: join(common, 'master'),
    admin,
    adminWorkers: join(admin, 'master', 'workers.json'),
    adminExports: join(admin, 'exports'),
    adminAudit: join(admin, 'audit'),
  };
}

export interface ModulePaths {
  root: string;
  events: string;
  attachments: string;
  quarantine: string;
  roster: string;
}

export function modulePaths(root: string, moduleId: string): ModulePaths {
  const moduleRoot = join(root, moduleId);
  return {
    root: moduleRoot,
    events: join(moduleRoot, EVENTS_DIR),
    attachments: join(moduleRoot, ATTACHMENTS_DIR),
    quarantine: join(moduleRoot, EVENTS_DIR, QUARANTINE_DIR),
    roster: join(moduleRoot, 'roster.json'),
  };
}

// ── 이벤트 파일 (기기별 × 월별) ────────────────────────────────

/**
 * 이벤트 파일을 **월별로 나눈다.**
 *
 * OneDrive는 파일에 한 줄만 덧붙여도 파일 전체를 다시 올린다. 한 파일에 계속
 * 쌓으면 몇 년 뒤 기록 한 건 쓸 때마다 수 MB를 올리게 된다. 월이 바뀌면 새
 * 파일로 넘어가므로, 지난달 파일은 더 이상 올라가지 않는다.
 *
 * 현장에서 사진을 이미 월별 폴더로 관리하고 있어 셈법도 맞다.
 */
export function yearMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function eventFilePath(
  root: string,
  moduleId: string,
  deviceId: string,
  date: Date = new Date(),
): string {
  return join(modulePaths(root, moduleId).events, `${deviceId}-${yearMonth(date)}.jsonl`);
}

export interface EventFileInfo {
  path: string;
  deviceId: string;
  /** 'YYYY-MM' */
  month: string;
  size: number;
}

/** 'dev_현장PC-2026-09.jsonl' 을 기기와 월로 나눈다 */
const EVENT_FILE_RE = /^(.+)-(\d{4}-\d{2})\.jsonl$/;

export function parseEventFileName(name: string): { deviceId: string; month: string } | null {
  const m = EVENT_FILE_RE.exec(name);
  if (!m) return null;
  const [, deviceId, month] = m;
  if (!deviceId || !month) return null;
  return { deviceId, month };
}

/**
 * 모듈의 모든 이벤트 파일을 찾는다.
 *
 * 월 오름차순 → 기기 순으로 정렬한다. 기록을 시간순으로 훑을 때 자연스럽다.
 */
export function listEventFiles(root: string, moduleId: string): EventFileInfo[] {
  const dir = modulePaths(root, moduleId).events;
  if (!existsSync(dir)) return [];

  const files: EventFileInfo[] = [];
  for (const name of readdirSync(dir)) {
    if (name === QUARANTINE_DIR) continue;
    const parsed = parseEventFileName(name);
    if (!parsed) continue;

    const full = join(dir, name);
    if (!statSync(full).isFile()) continue;
    files.push({ path: full, deviceId: parsed.deviceId, month: parsed.month, size: statSync(full).size });
  }

  return files.sort((a, b) =>
    a.month === b.month ? a.deviceId.localeCompare(b.deviceId) : a.month.localeCompare(b.month),
  );
}

/** 특정 기간의 파일만 — 월간 현황처럼 범위가 정해진 조회에 쓴다 */
export function listEventFilesInRange(
  root: string,
  moduleId: string,
  fromMonth: string,
  toMonth: string,
): EventFileInfo[] {
  return listEventFiles(root, moduleId).filter((f) => f.month >= fromMonth && f.month <= toMonth);
}

// ── 첨부파일 ──────────────────────────────────────────────────

export type AttachmentVariant = 'original' | 'thumb';

/**
 * 첨부파일 경로 — 내용 해시를 이름으로 쓴다.
 *
 * 같은 파일은 같은 이름이 되므로 덮어쓰기 충돌이 없고 중복 저장도 피한다.
 * 원본과 축소본을 함께 두되, 축소본에는 `_s` 를 붙인다. 화면과 문서는 축소본을
 * 쓰고 원본은 증거로 남긴다.
 *
 * OneDrive의 경로 길이 제한(약 260자)을 고려해 해시는 32자로 자른다.
 */
export function attachmentPath(
  root: string,
  moduleId: string,
  sha256: string,
  ext: string,
  variant: AttachmentVariant = 'original',
  date: Date = new Date(),
): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const suffix = variant === 'thumb' ? '_s' : '';
  const dot = ext.startsWith('.') ? ext : `.${ext}`;
  return join(modulePaths(root, moduleId).attachments, yyyy, mm, `${sha256.slice(0, 32)}${suffix}${dot}`);
}

/** 축소본 기준 — 긴 변 픽셀. 문서 첨부·인쇄에 충분한 크기 */
export const THUMB_MAX_EDGE_PX = 1600;

// ── 파일명 제약 ───────────────────────────────────────────────

/**
 * OneDrive에서 쓸 수 없는 문자를 걸러낸다.
 * 금지 문자: " * : < > ? / \ |  그리고 이름 끝의 공백·마침표
 */
export function isSafeFileName(name: string): boolean {
  if (name.length === 0 || name.length > 100) return false;
  if (/["*:<>?/\\|]/.test(name)) return false;
  if (/[ .]$/.test(name)) return false;
  return true;
}
