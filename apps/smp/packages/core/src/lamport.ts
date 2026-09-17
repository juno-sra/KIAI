/**
 * 램포트 시계 — 기기 시계가 서로 다르게 맞춰져 있어도 이벤트 순서를 판정한다.
 *
 * 현장 PC의 시계는 종종 몇 분씩 어긋난다. 물리 시각만으로 순서를 정하면
 * 나중에 쓴 기록이 먼저 쓴 것보다 앞서는 일이 생긴다.
 */
export class LamportClock {
  #value: number;

  constructor(initial = 0) {
    if (!Number.isInteger(initial) || initial < 0) {
      throw new Error('램포트 시계의 초기값은 0 이상의 정수여야 합니다.');
    }
    this.#value = initial;
  }

  get value(): number {
    return this.#value;
  }

  /** 내 기기에서 이벤트를 만들 때 */
  tick(): number {
    this.#value += 1;
    return this.#value;
  }

  /** 다른 기기의 이벤트를 읽었을 때 — 본 것보다 항상 앞서도록 올린다 */
  observe(remote: number): void {
    if (!Number.isInteger(remote) || remote < 0) return;
    if (remote > this.#value) this.#value = remote;
  }
}
