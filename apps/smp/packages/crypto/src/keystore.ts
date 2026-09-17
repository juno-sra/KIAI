/**
 * 암호화 키 보관.
 *
 * 마스터 키는 OS의 자격증명 저장소에 묶어 둔다. Windows에서는 Electron의
 * safeStorage가 DPAPI를 사용하므로, 다른 PC나 다른 사용자 계정에서는
 * 같은 파일을 가져가도 키를 풀 수 없다.
 *
 * PC 교체에 대비해 키 내보내기·복구를 제공한다. 이것이 없으면 PC가 고장났을 때
 * 암호화된 명부를 영영 못 읽는다.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { encrypt, decrypt, generateKey, DecryptError } from './cipher.js';

/**
 * OS 자격증명 저장소 어댑터.
 *
 * Electron에서는 safeStorage를 넘기고, 시험 환경에서는 메모리 구현을 넘긴다.
 * 이 인터페이스를 둔 이유는 Electron 없이도 암호화 계층을 시험하기 위해서다.
 */
export interface SecureStorage {
  /** 이 환경에서 OS 자격증명 저장소를 실제로 쓸 수 있는지 */
  isAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface KeyStoreFs {
  readFile(path: string): Buffer;
  writeFile(path: string, data: Buffer): void;
  exists(path: string): boolean;
}

export interface KeyStoreOptions {
  /** 키 파일 경로 (예: %LOCALAPPDATA%\SMP\key.bin) */
  keyPath: string;
  storage: SecureStorage;
  fs: KeyStoreFs;
}

export class KeyStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyStoreUnavailableError';
  }
}

export class KeyStore {
  readonly #keyPath: string;
  readonly #storage: SecureStorage;
  readonly #fs: KeyStoreFs;
  #cached: Buffer | null = null;

  constructor(options: KeyStoreOptions) {
    this.#keyPath = options.keyPath;
    this.#storage = options.storage;
    this.#fs = options.fs;
  }

  get keyPath(): string {
    return this.#keyPath;
  }

  hasKey(): boolean {
    return this.#fs.exists(this.#keyPath);
  }

  /**
   * 마스터 키를 가져온다. 없으면 새로 만들어 저장한다.
   *
   * OS 자격증명 저장소를 쓸 수 없으면 키를 만들지 않고 실패시킨다. 평문으로
   * 저장해 버리면 암호화를 한 의미가 없기 때문이다.
   */
  getOrCreate(): Buffer {
    if (this.#cached) return this.#cached;

    if (!this.#storage.isAvailable()) {
      throw new KeyStoreUnavailableError(
        'OS 자격증명 저장소를 사용할 수 없어 암호화 키를 안전하게 보관할 수 없습니다. ' +
          'Windows 사용자 계정 상태를 확인하십시오. 키를 평문으로 저장하지 않습니다.',
      );
    }

    if (this.hasKey()) {
      const wrapped = this.#fs.readFile(this.#keyPath);
      const hex = this.#storage.decryptString(wrapped);
      const key = Buffer.from(hex, 'hex');
      if (key.length !== 32) {
        throw new DecryptError('저장된 암호화 키가 손상되었습니다. 키 복구가 필요합니다.');
      }
      this.#cached = key;
      return key;
    }

    const key = generateKey();
    this.#fs.writeFile(this.#keyPath, this.#storage.encryptString(key.toString('hex')));
    this.#cached = key;
    return key;
  }

  /** 복구된 키를 이 PC에 설치한다 */
  install(key: Buffer): void {
    if (key.length !== 32) throw new Error('암호화 키는 32바이트여야 합니다.');
    if (!this.#storage.isAvailable()) {
      throw new KeyStoreUnavailableError('OS 자격증명 저장소를 사용할 수 없습니다.');
    }
    this.#fs.writeFile(this.#keyPath, this.#storage.encryptString(key.toString('hex')));
    this.#cached = key;
  }

  /** 시험용 — 메모리 캐시를 비운다 */
  clearCache(): void {
    this.#cached = null;
  }
}

// ── 키 내보내기 / 복구 ──────────────────────────────────────────────

const EXPORT_MAGIC = 'SMPKEY1';
const SALT_LEN = 16;
const SCRYPT_N = 2 ** 15; // 약 32MB. 현장 PC에서 1초 내외
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export interface ExportedKey {
  magic: string;
  salt: string;
  payload: string;
  createdAt: string;
  /** 사람이 알아보기 위한 메모 (현장명 등). 비밀 정보를 넣지 말 것 */
  note?: string;
}

function derive(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize('NFKC'), salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
}

/**
 * 마스터 키를 사용자 암호로 감싸 파일로 내보낸다.
 *
 * 이 파일과 암호가 함께 유출되면 암호화가 무력화된다. 서로 다른 곳에 보관해야 한다.
 */
export function exportKey(key: Buffer, passphrase: string, note?: string): ExportedKey {
  if (key.length !== 32) throw new Error('암호화 키는 32바이트여야 합니다.');
  if (passphrase.length < 8) {
    throw new Error('키 내보내기 암호는 8자 이상이어야 합니다.');
  }
  const salt = randomBytes(SALT_LEN);
  const wrapping = derive(passphrase, salt);
  return {
    magic: EXPORT_MAGIC,
    salt: salt.toString('base64'),
    payload: encrypt(key, wrapping).toString('base64'),
    createdAt: new Date().toISOString(),
    ...(note === undefined ? {} : { note }),
  };
}

export function importKey(exported: ExportedKey, passphrase: string): Buffer {
  if (exported.magic !== EXPORT_MAGIC) {
    throw new DecryptError('SMP 키 내보내기 파일이 아닙니다.');
  }
  const salt = Buffer.from(exported.salt, 'base64');
  if (salt.length !== SALT_LEN) {
    throw new DecryptError('키 파일의 salt가 손상되었습니다.');
  }
  const wrapping = derive(passphrase, salt);
  const key = decrypt(Buffer.from(exported.payload, 'base64'), wrapping);
  if (key.length !== 32) {
    throw new DecryptError('복구된 키의 길이가 올바르지 않습니다.');
  }
  return key;
}

/** 두 키가 같은지 — 타이밍 공격을 피해 비교한다 */
export function keysEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
