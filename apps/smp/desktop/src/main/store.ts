/**
 * 기록 저장소.
 *
 * 동기화 폴더의 이벤트 로그를 읽어 메모리에 상태를 만든다. SQLite를 쓰지 않는
 * 이유는 규모 때문이다. TBM을 하루 5건씩 5년 쌓아도 이벤트가 2만 개 남짓,
 * 20MB 수준이라 메모리에 올려도 넉넉하다. 데이터베이스를 들이면 네이티브
 * 모듈이 따라오고 배포가 복잡해진다.
 *
 * 기록이 훨씬 많아지면 그때 도입한다. 이벤트 로그가 진실의 원천이므로
 * 나중에 바꿔도 데이터는 그대로다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LamportClock, type Company, type Manifest, type Member, type Site, type WorkType } from '@smp/core';
import type { SmpEvent } from '@smp/core';
import {
  MemoryCursorStore,
  appendEvent,
  checkModule,
  eventFilePath,
  listEventFiles,
  modulePaths,
  paths,
  quarantine,
  readEventsFrom,
} from '@smp/sync';
import { buildTbmState, type TbmState } from '@smp/module-daily';

export interface StoreIssue {
  kind: 'broken-line' | 'conflict-copy' | 'missing-folder';
  message: string;
}

export class Store {
  readonly #root: string;
  readonly #deviceId: string;
  readonly #cursors = new MemoryCursorStore();
  readonly #clock = new LamportClock();

  #events: SmpEvent[] = [];
  #tbm: TbmState = new Map();
  #issues: StoreIssue[] = [];

  constructor(root: string, deviceId: string) {
    this.#root = root;
    this.#deviceId = deviceId;
  }

  get root(): string {
    return this.#root;
  }

  get issues(): StoreIssue[] {
    return [...this.#issues];
  }

  get tbmState(): TbmState {
    return this.#tbm;
  }

  // ── 공통 마스터 ───────────────────────────────────────────

  manifest(): Manifest | null {
    return this.#readJson<Manifest>(paths(this.#root).manifest);
  }

  members(): Member[] {
    return this.#readJson<{ members: Member[] }>(paths(this.#root).members)?.members ?? [];
  }

  site(): Site | null {
    return this.#readJson<Site>(join(paths(this.#root).masterDir, 'site.json'));
  }

  companies(): Company[] {
    return this.#readJson<{ companies: Company[] }>(
      join(paths(this.#root).masterDir, 'companies.json'),
    )?.companies ?? [];
  }

  workTypes(): WorkType[] {
    return this.#readJson<{ workTypes: WorkType[] }>(
      join(paths(this.#root).masterDir, 'worktypes.json'),
    )?.workTypes ?? [];
  }

  #readJson<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch {
      this.#issues.push({
        kind: 'broken-line',
        message: `${path} 를 읽을 수 없습니다. 파일이 손상되었거나 동기화 중일 수 있습니다.`,
      });
      return null;
    }
  }

  // ── 이벤트 읽기 ───────────────────────────────────────────

  /**
   * 모듈의 이벤트를 읽어 상태를 다시 만든다.
   *
   * 처음 호출하면 전부 읽고, 이후에는 커서 뒤부터만 읽는다.
   */
  refresh(moduleId: string): void {
    const report = checkModule(this.#root, moduleId);
    this.#issues = this.#issues.filter((i) => i.kind !== 'conflict-copy');

    for (const copy of report.conflictCopies) {
      // 기기별 단독 쓰기 구조에서는 나오지 않아야 한다.
      // 나왔다면 두 기기가 같은 deviceId 를 쓰고 있다는 뜻이다.
      this.#issues.push({
        kind: 'conflict-copy',
        message:
          `동기화 충돌 사본이 있습니다: ${copy}\n` +
          `두 기기가 같은 이름을 쓰고 있을 수 있습니다. 관리자에게 알리십시오.`,
      });
    }

    for (const file of listEventFiles(this.#root, moduleId)) {
      const from = this.#cursors.get(file.path);
      const result = readEventsFrom(file.path, from);

      if (result.events.length > 0) {
        this.#events.push(...result.events);
        for (const e of result.events) this.#clock.observe(e.lamport);
      }

      if (result.broken.length > 0) {
        const target = quarantine(modulePaths(this.#root, moduleId).events, result.broken);
        this.#issues.push({
          kind: 'broken-line',
          message:
            `형식이 깨진 기록 ${result.broken.length}건을 발견했습니다. ` +
            `지우지 않고 격리했습니다: ${target}`,
        });
      }

      this.#cursors.set(file.path, result.offset);
    }

    if (moduleId === 'daily') {
      this.#tbm = buildTbmState(this.#events.filter((e) => e.module === 'daily'));
    }
  }

  /** 전체를 처음부터 다시 읽는다 */
  rebuild(moduleId: string): void {
    this.#cursors.reset();
    this.#events = [];
    this.#issues = [];
    this.refresh(moduleId);
  }

  // ── 이벤트 쓰기 ───────────────────────────────────────────

  /**
   * 이벤트를 기록한다.
   *
   * 이 기기의 이번 달 파일에만 덧붙인다. 다른 기기의 파일은 건드리지 않으므로
   * 쓰기 충돌이 생기지 않는다.
   */
  append(moduleId: string, event: SmpEvent): void {
    const path = eventFilePath(this.#root, moduleId, this.#deviceId);
    appendEvent(path, event);

    this.#events.push(event);
    if (moduleId === 'daily') {
      this.#tbm = buildTbmState(this.#events.filter((e) => e.module === 'daily'));
    }

    // 방금 쓴 만큼 커서를 밀어 두어 다음 refresh 에서 중복으로 읽지 않는다
    const result = readEventsFrom(path, this.#cursors.get(path));
    this.#cursors.set(path, result.offset);
  }

  nextLamport(): number {
    return this.#clock.tick();
  }

  get deviceId(): string {
    return this.#deviceId;
  }

  /** 현장 폴더 구조를 만든다 (초기 설정) */
  ensureFolders(modules: string[]): void {
    const p = paths(this.#root);
    mkdirSync(p.masterDir, { recursive: true });
    mkdirSync(join(p.admin, 'master'), { recursive: true });
    mkdirSync(p.adminExports, { recursive: true });
    for (const m of modules) {
      mkdirSync(modulePaths(this.#root, m).events, { recursive: true });
      mkdirSync(modulePaths(this.#root, m).attachments, { recursive: true });
    }
  }

  writeJson(path: string, value: unknown): void {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
  }
}
