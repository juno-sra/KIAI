/**
 * 이 PC의 설정.
 *
 * 동기화 폴더 경로, 기기 식별자, 사용자 아이디처럼 이 PC에만 해당하는 것을
 * 담는다. 동기화 폴더가 아니라 로컬에 둔다 — 기기마다 달라야 하기 때문이다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

export interface LocalSettings {
  schemaVersion: number;
  /** 동기화 폴더 (예: C:\Users\...\OneDrive\SMP) */
  syncRoot: string | null;
  /** 이 기기 식별자. 한 번 정하면 바꾸지 않는다 */
  deviceId: string;
  /** 사람이 알아보기 위한 기기 이름 */
  deviceLabel: string;
  /** 현재 사용자 */
  userId: string | null;
  /** 총 저장 용량 (바이트). 사용률 계산에 쓴다 */
  quotaBytes: number | null;
}

function defaults(): LocalSettings {
  return {
    schemaVersion: 1,
    syncRoot: null,
    // 기기마다 다른 이름이어야 쓰기 충돌이 생기지 않는다
    deviceId: `dev_${randomBytes(4).toString('hex')}`,
    deviceLabel: '',
    userId: null,
    quotaBytes: null,
  };
}

export class Settings {
  readonly #path: string;
  #value: LocalSettings;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.#path = join(dir, 'settings.json');
    this.#value = this.#load();
  }

  #load(): LocalSettings {
    if (!existsSync(this.#path)) {
      const fresh = defaults();
      writeFileSync(this.#path, JSON.stringify(fresh, null, 2), 'utf8');
      return fresh;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as Partial<LocalSettings>;
      // 빠진 항목은 기본값으로 채운다 — 설정 파일이 옛 형식이어도 동작해야 한다
      return { ...defaults(), ...parsed };
    } catch {
      // 설정이 깨졌다고 앱이 못 뜨면 안 된다. 새로 만들되 원본은 남긴다.
      const backup = `${this.#path}.broken-${Date.now()}`;
      try {
        writeFileSync(backup, readFileSync(this.#path));
      } catch {
        /* 백업 실패는 넘어간다 */
      }
      const fresh = defaults();
      writeFileSync(this.#path, JSON.stringify(fresh, null, 2), 'utf8');
      return fresh;
    }
  }

  get value(): LocalSettings {
    return { ...this.#value };
  }

  update(patch: Partial<LocalSettings>): LocalSettings {
    this.#value = { ...this.#value, ...patch };
    writeFileSync(this.#path, JSON.stringify(this.#value, null, 2), 'utf8');
    return this.value;
  }
}
