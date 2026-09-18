import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Member } from '@smp/core';
import { declaredAccess, probeAccess, probeModules, visibleModules } from '../src/permission.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'smp-perm-'));
});

afterEach(() => {
  // 권한을 되돌려 놓지 않으면 정리가 실패한다
  for (const m of ['daily', 'education']) {
    try {
      chmodSync(join(root, m), 0o755);
    } catch {
      /* 없으면 넘어간다 */
    }
  }
  rmSync(root, { recursive: true, force: true });
});

const member = (over: Partial<Member> = {}): Member => ({
  userId: 'u_kim',
  displayName: '김○○',
  role: 'writer',
  modules: ['daily'],
  registeredAt: '2026-09-17T09:00:00+09:00',
  registeredBy: 'u_admin',
  active: true,
  ...over,
});

describe('선언된 권한', () => {
  it('관리자는 모든 모듈에 쓰기', () => {
    expect(declaredAccess(member({ role: 'admin', modules: [] }), 'education')).toBe('write');
  });

  it('작성자는 담당 모듈만 쓰기', () => {
    const m = member();
    expect(declaredAccess(m, 'daily')).toBe('write');
    expect(declaredAccess(m, 'education')).toBe('none');
  });

  it('열람자는 담당 모듈도 읽기만', () => {
    expect(declaredAccess(member({ role: 'viewer' }), 'daily')).toBe('read');
  });
});

describe('실제 접근 권한 확인', () => {
  it('없는 폴더는 none', () => {
    expect(probeAccess(join(root, '없는모듈'))).toBe('none');
  });

  it('쓸 수 있으면 write', () => {
    mkdirSync(join(root, 'daily'));
    expect(probeAccess(join(root, 'daily'))).toBe('write');
  });

  it.skipIf(process.getuid?.() === 0)('읽기만 되면 read', () => {
    // root로 실행하면 권한 제한이 적용되지 않아 의미가 없다
    const dir = join(root, 'daily');
    mkdirSync(dir);
    chmodSync(dir, 0o555);
    expect(probeAccess(dir)).toBe('read');
  });
});

describe('선언과 실제가 어긋난 경우', () => {
  it('담당이 아닌데 접근되면 격리가 깨진 것으로 경고한다', () => {
    // OneDrive 공유 설정이 잘못된 상태. 앱이 화면을 가려도 파일은 열린다.
    mkdirSync(join(root, 'education'));
    const [, education] = probeModules({
      root,
      member: member(),
      modules: ['daily', 'education'],
    });

    expect(education?.mismatch?.kind).toBe('unexpected-access');
    expect(education?.mismatch?.message).toMatch(/격리가 깨진 상태/);
  });

  it('담당인데 폴더가 없으면 읽기 실패로 알린다', () => {
    const [daily] = probeModules({ root, member: member(), modules: ['daily'] });
    expect(daily?.mismatch?.kind).toBe('missing-read');
    expect(daily?.mismatch?.message).toMatch(/동기화가 완료되었는지/);
  });

  it.skipIf(process.getuid?.() === 0)('쓰기 권한이 없으면 읽기 전용으로 알린다', () => {
    const dir = join(root, 'daily');
    mkdirSync(dir);
    chmodSync(dir, 0o555);

    const [daily] = probeModules({ root, member: member(), modules: ['daily'] });
    expect(daily?.mismatch?.kind).toBe('missing-write');
  });

  it('선언과 실제가 맞으면 경고하지 않는다', () => {
    mkdirSync(join(root, 'daily'));
    const [daily] = probeModules({ root, member: member(), modules: ['daily'] });
    expect(daily?.mismatch).toBeNull();
  });
});

describe('화면에 보일 모듈', () => {
  it('담당이 아니거나 접근 불가한 모듈은 아예 뺀다', () => {
    mkdirSync(join(root, 'daily'));
    mkdirSync(join(root, 'education'));

    const access = probeModules({ root, member: member(), modules: ['daily', 'education'] });
    // education은 접근이 되더라도 담당이 아니므로 화면에 내비게이션조차 만들지 않는다
    expect(visibleModules(access)).toEqual(['daily']);
  });
});
