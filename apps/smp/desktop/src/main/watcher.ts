/**
 * 동기화 폴더 감시.
 *
 * 다른 PC에서 쓴 기록이 도착하면 화면을 갱신한다. 이것이 없으면 "옆 사람이
 * 쓴 TBM이 내 화면에 안 뜨는" 증상이 된다.
 *
 * 파일 변경은 몰려서 오므로 잠시 모았다가 한 번에 알린다. 그러지 않으면
 * 한 번 동기화될 때마다 화면이 수십 번 다시 그려진다.
 */
import { watch, type FSWatcher } from 'node:fs';
import { existsSync } from 'node:fs';
import { modulePaths } from '@smp/sync';

const DEBOUNCE_MS = 700;

export class FolderWatcher {
  readonly #watchers: FSWatcher[] = [];
  #timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly root: string,
    private readonly modules: string[],
    private readonly onChange: (moduleId: string) => void,
  ) {}

  start(): void {
    for (const moduleId of this.modules) {
      const dir = modulePaths(this.root, moduleId).events;
      if (!existsSync(dir)) continue;

      try {
        const w = watch(dir, { persistent: true }, (_event, filename) => {
          // 자기 격리 폴더나 임시 파일 변경은 무시한다
          if (typeof filename === 'string' && !filename.endsWith('.jsonl')) return;
          this.#schedule(moduleId);
        });
        this.#watchers.push(w);
      } catch {
        // 감시를 못 걸어도 앱은 돌아야 한다. 수동 새로고침으로 쓴다.
      }
    }
  }

  #schedule(moduleId: string): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.onChange(moduleId);
    }, DEBOUNCE_MS);
  }

  stop(): void {
    if (this.#timer) clearTimeout(this.#timer);
    for (const w of this.#watchers) w.close();
    this.#watchers.length = 0;
  }
}
