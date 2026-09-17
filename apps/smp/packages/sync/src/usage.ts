/**
 * 용량 집계.
 *
 * 5TB를 쓰더라도 현장이 늘고 해가 쌓이면 어디서 용량이 커지는지 알아야 한다.
 * 사진이 대부분을 차지하므로 연·월별로 나눠 보여준다.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ATTACHMENTS_DIR, EVENTS_DIR, listEventFiles, modulePaths } from './layout.js';

export interface UsageBucket {
  /** 'YYYY-MM' */
  month: string;
  eventBytes: number;
  originalBytes: number;
  thumbBytes: number;
  fileCount: number;
}

export interface ModuleUsage {
  moduleId: string;
  totalBytes: number;
  eventBytes: number;
  attachmentBytes: number;
  byMonth: UsageBucket[];
}

function emptyBucket(month: string): UsageBucket {
  return { month, eventBytes: 0, originalBytes: 0, thumbBytes: 0, fileCount: 0 };
}

export function moduleUsage(root: string, moduleId: string): ModuleUsage {
  const buckets = new Map<string, UsageBucket>();
  const bucket = (month: string): UsageBucket => {
    let b = buckets.get(month);
    if (!b) {
      b = emptyBucket(month);
      buckets.set(month, b);
    }
    return b;
  };

  let eventBytes = 0;
  for (const file of listEventFiles(root, moduleId)) {
    eventBytes += file.size;
    const b = bucket(file.month);
    b.eventBytes += file.size;
    b.fileCount += 1;
  }

  let attachmentBytes = 0;
  const attachRoot = modulePaths(root, moduleId).attachments;
  if (existsSync(attachRoot)) {
    for (const year of readdirSync(attachRoot)) {
      const yearDir = join(attachRoot, year);
      if (!statSync(yearDir).isDirectory()) continue;

      for (const mm of readdirSync(yearDir)) {
        const monthDir = join(yearDir, mm);
        if (!statSync(monthDir).isDirectory()) continue;

        const b = bucket(`${year}-${mm}`);
        for (const name of readdirSync(monthDir)) {
          const full = join(monthDir, name);
          const st = statSync(full);
          if (!st.isFile()) continue;

          attachmentBytes += st.size;
          b.fileCount += 1;
          // 축소본은 파일명에 _s 가 붙는다
          if (/_s\.[^.]+$/.test(name)) b.thumbBytes += st.size;
          else b.originalBytes += st.size;
        }
      }
    }
  }

  return {
    moduleId,
    totalBytes: eventBytes + attachmentBytes,
    eventBytes,
    attachmentBytes,
    byMonth: [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export interface SiteUsage {
  totalBytes: number;
  modules: ModuleUsage[];
}

export function siteUsage(root: string, moduleIds: string[]): SiteUsage {
  const modules = moduleIds
    .filter((id) => existsSync(join(root, id)))
    .map((id) => moduleUsage(root, id));
  return {
    totalBytes: modules.reduce((sum, m) => sum + m.totalBytes, 0),
    modules,
  };
}

/** 사람이 읽는 크기 표기 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

/**
 * 남은 용량 경고.
 *
 * OneDrive 잔여 용량은 프로그램이 직접 알 수 없다. 사용자가 총 용량을 입력하면
 * 사용률을 계산해 알려준다.
 */
export interface QuotaWarning {
  level: 'ok' | 'notice' | 'warning' | 'critical';
  usedRatio: number;
  message: string;
}

export function checkQuota(usedBytes: number, quotaBytes: number): QuotaWarning {
  if (quotaBytes <= 0) {
    return { level: 'ok', usedRatio: 0, message: '총 용량이 설정되지 않아 확인할 수 없습니다.' };
  }
  const ratio = usedBytes / quotaBytes;
  const pct = (ratio * 100).toFixed(1);
  const used = formatBytes(usedBytes);
  const quota = formatBytes(quotaBytes);

  if (ratio >= 0.95) {
    return {
      level: 'critical',
      usedRatio: ratio,
      message: `용량의 ${pct}%를 썼습니다 (${used} / ${quota}). 곧 기록을 저장할 수 없게 됩니다. 즉시 정리하거나 용량을 늘리십시오.`,
    };
  }
  if (ratio >= 0.85) {
    return {
      level: 'warning',
      usedRatio: ratio,
      message: `용량의 ${pct}%를 썼습니다 (${used} / ${quota}). 오래된 현장의 원본 사진을 별도 보관하는 것을 검토하십시오.`,
    };
  }
  if (ratio >= 0.7) {
    return {
      level: 'notice',
      usedRatio: ratio,
      message: `용량의 ${pct}%를 썼습니다 (${used} / ${quota}).`,
    };
  }
  return { level: 'ok', usedRatio: ratio, message: `${used} / ${quota} 사용 중입니다.` };
}
