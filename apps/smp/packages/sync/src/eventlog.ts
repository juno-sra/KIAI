/**
 * 이벤트 로그 — 덧붙이기 전용 JSONL.
 *
 * 한 줄에 이벤트 하나. 줄 단위라서 동기화 중 파일이 잘려도 마지막 줄만 버리면
 * 나머지는 온전하다. 이 성질이 클라우드 동기화 폴더에서 견디는 근거다.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeSync, fsyncSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SmpEvent } from '@smp/core';
import { isValidEvent } from '@smp/core';
import { QUARANTINE_DIR } from './layout.js';

export interface ReadResult {
  events: SmpEvent[];
  /** 다음에 읽기 시작할 바이트 위치 */
  offset: number;
  /** 형식이 깨져 건너뛴 줄 */
  broken: BrokenLine[];
  /** 마지막 줄이 개행으로 끝나지 않아 이번에는 읽지 않은 경우 */
  truncatedTail: boolean;
}

export interface BrokenLine {
  file: string;
  /** 파일 내 바이트 위치 */
  offset: number;
  raw: string;
  reason: string;
}

/**
 * 이벤트 한 건을 덧붙인다.
 *
 * fsync까지 하는 이유: 현장 PC는 정전으로 꺼지는 일이 있다. 버퍼에만 있던
 * 기록은 사라진다. 안전 기록은 잃으면 안 되므로 느려도 디스크까지 내린다.
 */
export function appendEvent(filePath: string, event: SmpEvent): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  appendFileSync(filePath, line, 'utf8');

  const fd = openSync(filePath, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** 여러 건을 한 번에 덧붙인다 — 한 번의 fsync로 끝낸다 */
export function appendEvents(filePath: string, events: SmpEvent[]): void {
  if (events.length === 0) return;
  mkdirSync(dirname(filePath), { recursive: true });
  const lines = events.map((e) => `${JSON.stringify(e)}\n`).join('');
  appendFileSync(filePath, lines, 'utf8');

  const fd = openSync(filePath, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * 지정한 위치부터 끝까지 읽는다.
 *
 * 마지막 줄이 개행으로 끝나지 않으면 **읽지 않고 남겨 둔다.** 동기화가 아직
 * 진행 중이어서 줄이 잘렸을 수 있기 때문이다. 다음 호출 때 완성된 줄을 읽는다.
 * 잘린 줄을 성급히 버리면 기록이 사라진다.
 */
export function readEventsFrom(filePath: string, startOffset = 0): ReadResult {
  if (!existsSync(filePath)) {
    return { events: [], offset: startOffset, broken: [], truncatedTail: false };
  }

  const size = statSync(filePath).size;
  if (size <= startOffset) {
    // 파일이 줄었다 — 동기화 충돌로 교체되었을 수 있다. 처음부터 다시 읽는다.
    if (size < startOffset) return readEventsFrom(filePath, 0);
    return { events: [], offset: startOffset, broken: [], truncatedTail: false };
  }

  const length = size - startOffset;
  const buffer = Buffer.alloc(length);
  const fd = openSync(filePath, 'r');
  try {
    readSync(fd, buffer, 0, length, startOffset);
  } finally {
    closeSync(fd);
  }

  const text = buffer.toString('utf8');
  const endsWithNewline = text.endsWith('\n');
  const rawLines = text.split('\n');
  // 마지막 조각은 개행이 없으면 미완성이므로 제외한다
  const complete = endsWithNewline ? rawLines.slice(0, -1) : rawLines.slice(0, -1);
  const consumedText = complete.length > 0 ? `${complete.join('\n')}\n` : '';
  const consumedBytes = Buffer.byteLength(consumedText, 'utf8');

  const events: SmpEvent[] = [];
  const broken: BrokenLine[] = [];
  let cursor = startOffset;

  for (const line of complete) {
    const lineBytes = Buffer.byteLength(`${line}\n`, 'utf8');
    const trimmed = line.trim();
    if (trimmed === '') {
      cursor += lineBytes;
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isValidEvent(parsed)) {
        events.push(parsed);
      } else {
        broken.push({
          file: filePath,
          offset: cursor,
          raw: trimmed,
          reason: '이벤트에 필요한 필드가 빠졌습니다.',
        });
      }
    } catch (e) {
      broken.push({
        file: filePath,
        offset: cursor,
        raw: trimmed,
        reason: `JSON 형식이 아닙니다: ${(e as Error).message}`,
      });
    }
    cursor += lineBytes;
  }

  return {
    events,
    offset: startOffset + consumedBytes,
    broken,
    truncatedTail: !endsWithNewline,
  };
}

/**
 * 깨진 줄을 격리 폴더로 옮긴다.
 *
 * 조용히 버리지 않는다. 안전 기록이 사라졌다는 사실 자체를 사용자가 알아야 한다.
 */
export function quarantine(eventsDir: string, broken: BrokenLine[]): string | null {
  if (broken.length === 0) return null;
  const dir = join(eventsDir, QUARANTINE_DIR);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(dir, `broken-${stamp}.jsonl`);
  const body = broken
    .map((b) => JSON.stringify({ ...b, quarantinedAt: new Date().toISOString() }))
    .join('\n');
  appendFileSync(target, `${body}\n`, 'utf8');
  return target;
}
