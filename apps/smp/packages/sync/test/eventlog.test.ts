import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEvent, type SmpEvent } from '@smp/core';
import { appendEvent, appendEvents, quarantine, readEventsFrom } from '../src/eventlog.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smp-log-'));
  mkdirSync(join(dir, 'events'), { recursive: true });
  file = join(dir, 'events', 'dev_a1.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function event(n: number): SmpEvent {
  return createEvent({
    module: 'daily',
    type: 'daily.tbm.created',
    aggregateId: `tbm_${n}`,
    siteId: 'site_1',
    actor: { userId: 'u_kim', deviceId: 'dev_a1' },
    lamport: n,
    payload: { seq: n },
  });
}

describe('이벤트 로그 쓰기', () => {
  it('없는 폴더를 만들어 가며 기록한다', () => {
    appendEvent(file, event(1));
    expect(readFileSync(file, 'utf8').trimEnd().split('\n')).toHaveLength(1);
  });

  it('덧붙이기만 하고 기존 줄을 건드리지 않는다', () => {
    appendEvent(file, event(1));
    const first = readFileSync(file, 'utf8');
    appendEvent(file, event(2));
    expect(readFileSync(file, 'utf8').startsWith(first)).toBe(true);
  });

  it('여러 건을 한 번에 덧붙인다', () => {
    appendEvents(file, [event(1), event(2), event(3)]);
    expect(readEventsFrom(file).events).toHaveLength(3);
  });
});

describe('이벤트 로그 읽기', () => {
  it('읽은 위치부터 증분만 읽는다', () => {
    appendEvents(file, [event(1), event(2)]);
    const first = readEventsFrom(file);
    expect(first.events).toHaveLength(2);

    appendEvent(file, event(3));
    const second = readEventsFrom(file, first.offset);
    expect(second.events).toHaveLength(1);
    expect(second.events[0]?.aggregateId).toBe('tbm_3');
  });

  it('한글이 섞여도 바이트 위치가 어긋나지 않는다', () => {
    const korean = createEvent({
      module: 'daily',
      type: 'daily.tbm.created',
      aggregateId: 'tbm_ko',
      siteId: 'site_1',
      actor: { userId: 'u_kim', deviceId: 'dev_a1' },
      lamport: 1,
      payload: { 작업내용: '국토안전관리원 점검대비 현장정비', 장비: '굴착기' },
    });
    appendEvents(file, [korean, event(2)]);

    const first = readEventsFrom(file);
    appendEvent(file, event(3));
    const second = readEventsFrom(file, first.offset);

    expect(second.events).toHaveLength(1);
    expect(second.events[0]?.aggregateId).toBe('tbm_3');
  });

  it('없는 파일은 빈 결과를 낸다', () => {
    expect(readEventsFrom(join(dir, '없는파일.jsonl')).events).toEqual([]);
  });
});

describe('동기화 중 잘린 줄', () => {
  it('개행으로 끝나지 않는 마지막 줄은 읽지 않고 남겨 둔다', () => {
    // OneDrive가 파일을 내려받는 중이면 줄이 잘려 보일 수 있다.
    // 성급히 버리면 기록이 사라진다.
    appendEvents(file, [event(1)]);
    const partial = JSON.stringify(event(2)).slice(0, 40);
    appendFileSync(file, partial, 'utf8');

    const result = readEventsFrom(file);
    expect(result.events).toHaveLength(1);
    expect(result.truncatedTail).toBe(true);
  });

  it('동기화가 끝나 줄이 완성되면 그때 읽는다', () => {
    appendEvents(file, [event(1)]);
    const full = JSON.stringify(event(2));
    appendFileSync(file, full.slice(0, 30), 'utf8');

    const first = readEventsFrom(file);
    expect(first.events).toHaveLength(1);

    appendFileSync(file, `${full.slice(30)}\n`, 'utf8');
    const second = readEventsFrom(file, first.offset);
    expect(second.events).toHaveLength(1);
    expect(second.truncatedTail).toBe(false);
  });
});

describe('깨진 줄 처리', () => {
  it('JSON이 아닌 줄을 건너뛰되 보고한다', () => {
    appendEvents(file, [event(1)]);
    appendFileSync(file, '이건 JSON이 아니다\n', 'utf8');
    appendEvents(file, [event(2)]);

    const result = readEventsFrom(file);
    expect(result.events).toHaveLength(2);
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0]?.reason).toMatch(/JSON 형식이 아닙니다/);
  });

  it('필드가 빠진 이벤트도 보고한다', () => {
    appendFileSync(file, `${JSON.stringify({ id: 'x', module: 'daily' })}\n`, 'utf8');
    const result = readEventsFrom(file);
    expect(result.events).toHaveLength(0);
    expect(result.broken[0]?.reason).toMatch(/필드가 빠졌습니다/);
  });

  it('깨진 줄을 조용히 버리지 않고 격리 폴더에 남긴다', () => {
    appendFileSync(file, '깨진 줄\n', 'utf8');
    const result = readEventsFrom(file);
    const target = quarantine(join(dir, 'events'), result.broken);

    expect(target).not.toBeNull();
    expect(readFileSync(target!, 'utf8')).toContain('깨진 줄');
  });

  it('깨진 줄이 없으면 격리 파일을 만들지 않는다', () => {
    expect(quarantine(join(dir, 'events'), [])).toBeNull();
  });
});

describe('파일이 교체된 경우', () => {
  it('파일이 줄어들면 처음부터 다시 읽는다', () => {
    // 동기화 충돌로 파일이 통째로 교체되면 기억한 위치가 무의미해진다
    appendEvents(file, [event(1), event(2), event(3)]);
    const { offset } = readEventsFrom(file);

    writeFileSync(file, `${JSON.stringify(event(9))}\n`, 'utf8');
    const result = readEventsFrom(file, offset);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.aggregateId).toBe('tbm_9');
  });
});
