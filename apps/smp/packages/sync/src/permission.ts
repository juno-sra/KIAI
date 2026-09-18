/**
 * 권한 점검.
 *
 * 앱 안에서 화면을 가리는 것은 격리가 아니다. 폴더 접근 권한이 있는 사람은
 * 탐색기로 원본 .jsonl을 그냥 열 수 있다. 실제 차단선은 OneDrive의 폴더 공유
 * 권한이고, 그 설정은 사람이 직접 한다.
 *
 * 그래서 프로그램이 할 수 있는 일은 하나뿐이다 — 선언된 역할과 실제 접근
 * 권한이 어긋났는지 찾아내 알리는 것.
 */
import { accessSync, constants, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Member, UserRole } from '@smp/core';

export type AccessLevel = 'none' | 'read' | 'write';

export interface ModuleAccess {
  moduleId: string;
  /** members.json 이 말하는 권한 */
  declared: AccessLevel;
  /** 파일시스템이 실제로 허용하는 권한 */
  actual: AccessLevel;
  mismatch: PermissionMismatch | null;
}

export type PermissionMismatch =
  | { kind: 'missing-write'; message: string }
  | { kind: 'unexpected-access'; message: string }
  | { kind: 'missing-read'; message: string };

export interface ProbeOptions {
  root: string;
  member: Member;
  /** 이 현장에서 사용하는 모듈 목록 */
  modules: string[];
}

export function declaredAccess(member: Member, moduleId: string): AccessLevel {
  if (member.role === 'admin') return 'write';
  if (!member.modules.includes(moduleId)) return 'none';
  return member.role === 'writer' ? 'write' : 'read';
}

/**
 * 실제 접근 권한을 확인한다.
 *
 * 쓰기 여부는 임시 파일을 만들어 본다. 윈도우에서 accessSync의 W_OK는
 * 공유 폴더 권한을 제대로 반영하지 않는 경우가 있어 믿을 수 없다.
 */
export function probeAccess(dir: string): AccessLevel {
  if (!existsSync(dir)) return 'none';
  try {
    accessSync(dir, constants.R_OK);
  } catch {
    return 'none';
  }

  const probe = join(dir, `.smp-probe-${process.pid}-${Date.now()}`);
  try {
    writeFileSync(probe, '');
    rmSync(probe, { force: true });
    return 'write';
  } catch {
    return 'read';
  }
}

export function probeModules(options: ProbeOptions): ModuleAccess[] {
  return options.modules.map((moduleId) => {
    const declared = declaredAccess(options.member, moduleId);
    const actual = probeAccess(join(options.root, moduleId));
    return { moduleId, declared, actual, mismatch: compare(moduleId, declared, actual) };
  });
}

function compare(
  moduleId: string,
  declared: AccessLevel,
  actual: AccessLevel,
): PermissionMismatch | null {
  if (declared === actual) return null;

  if (declared === 'none' && actual !== 'none') {
    return {
      kind: 'unexpected-access',
      message:
        `'${moduleId}' 모듈은 담당이 아닌데 폴더에 접근할 수 있습니다. ` +
        `OneDrive 공유 설정이 잘못되어 격리가 깨진 상태입니다. ` +
        `관리자에게 알려 공유를 해제하십시오.`,
    };
  }

  if (declared === 'write' && actual === 'read') {
    return {
      kind: 'missing-write',
      message:
        `'${moduleId}' 모듈에 기록할 권한이 없습니다. 읽기 전용으로 동작합니다. ` +
        `관리자에게 편집 권한 공유를 요청하십시오.`,
    };
  }

  return {
    kind: 'missing-read',
    message:
      `'${moduleId}' 모듈 폴더를 읽을 수 없습니다. ` +
      `OneDrive 동기화가 완료되었는지, 공유가 되어 있는지 확인하십시오.`,
  };
}

/** 사용자에게 보여줄 화면 목록 — 실제 권한이 없는 모듈은 아예 빼낸다 */
export function visibleModules(access: ModuleAccess[]): string[] {
  return access
    .filter((a) => a.declared !== 'none' && a.actual !== 'none')
    .map((a) => a.moduleId);
}

export interface AuditRecord {
  checkedAt: string;
  userId: string;
  deviceId: string;
  role: UserRole;
  results: ModuleAccess[];
}

/** 점검 결과를 _관리자/audit 에 남긴다. 관리자 기기에서만 성공한다 */
export function writeAudit(auditDir: string, record: AuditRecord): boolean {
  try {
    mkdirSync(auditDir, { recursive: true });
    const name = `probe-${record.checkedAt.replace(/[:.]/g, '-')}-${record.deviceId}.json`;
    writeFileSync(join(auditDir, name), JSON.stringify(record, null, 2), 'utf8');
    return true;
  } catch {
    // 관리자가 아니면 쓸 수 없다. 실패가 정상인 경우다.
    return false;
  }
}
