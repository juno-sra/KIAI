/**
 * 읽기 위치 기억.
 *
 * 앱을 켤 때마다 모든 이벤트를 처음부터 읽으면, 몇 년 쌓인 현장에서는
 * 시작이 느려진다. 파일별로 어디까지 읽었는지 남겨 증분만 읽는다.
 */
export interface CursorEntry {
  sourceFile: string;
  byteOffset: number;
  lastReadAt: string;
}

export interface CursorStore {
  get(sourceFile: string): number;
  set(sourceFile: string, byteOffset: number): void;
  all(): CursorEntry[];
  /** 전체 재구성이 필요할 때 */
  reset(): void;
}

export class MemoryCursorStore implements CursorStore {
  #map = new Map<string, CursorEntry>();

  get(sourceFile: string): number {
    return this.#map.get(sourceFile)?.byteOffset ?? 0;
  }

  set(sourceFile: string, byteOffset: number): void {
    this.#map.set(sourceFile, {
      sourceFile,
      byteOffset,
      lastReadAt: new Date().toISOString(),
    });
  }

  all(): CursorEntry[] {
    return [...this.#map.values()];
  }

  reset(): void {
    this.#map.clear();
  }
}
