import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachmentPath, eventFilePath } from '../src/layout.js';
import { checkQuota, formatBytes, moduleUsage, siteUsage } from '../src/usage.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'smp-usage-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeAt(path: string, bytes: number): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, Buffer.alloc(bytes));
}

describe('용량 집계', () => {
  it('이벤트와 첨부를 나눠 센다', () => {
    const sep = new Date('2026-09-17');
    writeAt(eventFilePath(root, 'daily', 'dev_a1', sep), 1000);
    writeAt(attachmentPath(root, 'daily', 'a'.repeat(64), '.jpg', 'original', sep), 3_000_000);
    writeAt(attachmentPath(root, 'daily', 'a'.repeat(64), '.jpg', 'thumb', sep), 500_000);

    const usage = moduleUsage(root, 'daily');
    expect(usage.eventBytes).toBe(1000);
    expect(usage.attachmentBytes).toBe(3_500_000);
    expect(usage.totalBytes).toBe(3_501_000);
  });

  it('원본과 축소본을 구분해 센다', () => {
    const sep = new Date('2026-09-17');
    writeAt(attachmentPath(root, 'daily', 'a'.repeat(64), '.jpg', 'original', sep), 3_000_000);
    writeAt(attachmentPath(root, 'daily', 'a'.repeat(64), '.jpg', 'thumb', sep), 500_000);

    const [bucket] = moduleUsage(root, 'daily').byMonth;
    expect(bucket?.originalBytes).toBe(3_000_000);
    expect(bucket?.thumbBytes).toBe(500_000);
  });

  it('월별로 나눠 어디서 커지는지 보여준다', () => {
    writeAt(eventFilePath(root, 'daily', 'dev_a1', new Date('2026-08-15')), 500);
    writeAt(eventFilePath(root, 'daily', 'dev_a1', new Date('2026-09-15')), 1500);

    const months = moduleUsage(root, 'daily').byMonth;
    expect(months.map((m) => m.month)).toEqual(['2026-08', '2026-09']);
    expect(months[1]?.eventBytes).toBe(1500);
  });

  it('없는 모듈은 집계에서 뺀다', () => {
    writeAt(eventFilePath(root, 'daily', 'dev_a1'), 100);
    const usage = siteUsage(root, ['daily', 'education', 'cost']);
    expect(usage.modules).toHaveLength(1);
    expect(usage.totalBytes).toBe(100);
  });
});

describe('크기 표기', () => {
  it('사람이 읽을 수 있게 바꾼다', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3_500_000)).toMatch(/MB$/);
    expect(formatBytes(5 * 1024 ** 4)).toBe('5.0 TB');
  });
});

describe('용량 경고', () => {
  const TB = 1024 ** 4;

  it('여유가 있으면 조용히 알린다', () => {
    expect(checkQuota(0.5 * TB, 5 * TB).level).toBe('ok');
  });

  it('70%를 넘으면 알린다', () => {
    expect(checkQuota(3.6 * TB, 5 * TB).level).toBe('notice');
  });

  it('85%를 넘으면 정리를 권한다', () => {
    const w = checkQuota(4.3 * TB, 5 * TB);
    expect(w.level).toBe('warning');
    expect(w.message).toMatch(/원본 사진을 별도 보관/);
  });

  it('95%를 넘으면 강하게 경고한다', () => {
    const w = checkQuota(4.8 * TB, 5 * TB);
    expect(w.level).toBe('critical');
    expect(w.message).toMatch(/기록을 저장할 수 없게 됩니다/);
  });

  it('총 용량을 모르면 확인할 수 없다고 말한다', () => {
    // 프로그램이 OneDrive 잔여 용량을 직접 알 수는 없다
    expect(checkQuota(100, 0).message).toMatch(/설정되지 않아/);
  });
});
