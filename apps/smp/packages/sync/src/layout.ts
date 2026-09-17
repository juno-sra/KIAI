/**
 * 동기화 폴더 구조.
 *
 * 모듈별로 폴더를 나누는 이유는 격리다. 담당이 아닌 모듈 폴더는 클라우드에서
 * 공유하지 않으므로, 타 담당자는 앱을 우회해도 그 폴더의 존재조차 알 수 없다.
 */
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

/**
 * 이 기기가 쓸 이벤트 파일 경로.
 *
 * 기기마다 자기 파일에만 덧붙이므로 쓰기 충돌이 구조적으로 생기지 않는다.
 * OneDrive가 파일 잠금을 지원하지 않기 때문에 이 방식을 택했다.
 */
export function eventFilePath(root: string, moduleId: string, deviceId: string): string {
  return join(modulePaths(root, moduleId).events, `${deviceId}.jsonl`);
}

/**
 * 첨부파일 경로 — 내용 해시를 이름으로 쓴다.
 *
 * 같은 파일은 같은 이름이 되므로 덮어쓰기 충돌이 없고, 중복 저장도 피한다.
 * OneDrive의 경로 길이 제한(약 260자)을 고려해 해시는 32자로 자른다.
 */
export function attachmentPath(
  root: string,
  moduleId: string,
  sha256: string,
  ext: string,
  date: Date = new Date(),
): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const name = `${sha256.slice(0, 32)}${ext.startsWith('.') ? ext : `.${ext}`}`;
  return join(modulePaths(root, moduleId).attachments, yyyy, mm, name);
}

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
