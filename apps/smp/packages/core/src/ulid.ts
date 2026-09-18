/**
 * ULID — 시간순 정렬이 가능한 식별자.
 *
 * 앞 10글자가 밀리초 타임스탬프, 뒤 16글자가 난수다. 문자열을 그대로 정렬하면
 * 생성 순서대로 늘어서므로, 이벤트 로그를 훑을 때 별도 정렬 키가 필요 없다.
 *
 * 외부 라이브러리를 쓰지 않는 이유: 이 프로그램은 현장 PC에 설치되어 수 년간
 * 돌아간다. 의존성이 적을수록 오래 산다.
 */
import { randomFillSync } from 'node:crypto';

// Crockford Base32 — 사람이 옮겨 적을 때 헷갈리는 I, L, O, U를 뺀 문자표
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RANDOM_LEN = 16;

/** 같은 밀리초 안에서도 순서가 보장되도록 직전 상태를 기억한다 */
let lastTime = -1;
let lastRandom: number[] = [];

function encodeTime(now: number): string {
  let out = '';
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i -= 1) {
    out = ENCODING[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function randomChars(): number[] {
  const bytes = new Uint8Array(RANDOM_LEN);
  randomFillSync(bytes);
  return Array.from(bytes, (b) => b % 32);
}

/** 같은 밀리초에 연달아 발급될 때 난수부를 1 증가시켜 단조성을 지킨다 */
function incrementRandom(chars: number[]): number[] {
  const next = [...chars];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const v = next[i] ?? 0;
    if (v < 31) {
      next[i] = v + 1;
      return next;
    }
    next[i] = 0;
  }
  // 16자리가 전부 넘친 경우 — 사실상 일어나지 않지만, 조용히 틀리느니 새로 뽑는다
  return randomChars();
}

export function ulid(now: number = Date.now()): string {
  if (now === lastTime) {
    lastRandom = incrementRandom(lastRandom);
  } else {
    lastTime = now;
    lastRandom = randomChars();
  }
  return encodeTime(now) + lastRandom.map((c) => ENCODING[c]).join('');
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: string): boolean {
  return ULID_RE.test(value);
}

/** ULID에서 생성 시각을 되꺼낸다. 형식이 아니면 null */
export function ulidTime(id: string): number | null {
  if (!isUlid(id)) return null;
  let t = 0;
  for (const ch of id.slice(0, TIME_LEN)) {
    const v = ENCODING.indexOf(ch);
    if (v < 0) return null;
    t = t * 32 + v;
  }
  return t;
}
