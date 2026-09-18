/**
 * 개인정보 파일 암호화 — AES-256-GCM.
 *
 * 인원 명부와 서명 이미지처럼 개인정보가 담긴 파일만 암호화한다. 기록 본문은
 * 사람을 ID로만 참조하므로 평문으로 둔다. 전체 암호화를 하지 않는 이유는
 * 키를 잃으면 전부 복구할 수 없기 때문이다.
 *
 * 근거: 개인정보 보호법 제29조, 같은 법 시행령 제30조제1항제3호,
 *       「개인정보의 안전성 확보조치 기준」 제7조
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const MAGIC = Buffer.from('SMP1');

export class DecryptError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DecryptError';
  }
}

export function generateKey(): Buffer {
  return randomBytes(KEY_LEN);
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_LEN) {
    throw new Error(`암호화 키는 ${KEY_LEN}바이트여야 합니다. (받은 값: ${key.length}바이트)`);
  }
}

/**
 * 봉투 형식: MAGIC(4) | IV(12) | TAG(16) | CIPHERTEXT
 *
 * MAGIC을 앞에 두는 이유는, 평문 파일을 실수로 복호화하려 할 때 조용히
 * 이상한 값을 내놓는 대신 분명한 오류를 내기 위해서다.
 */
export function encrypt(plaintext: Buffer | string, key: Buffer): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decrypt(envelope: Buffer, key: Buffer): Buffer {
  assertKey(key);
  const header = MAGIC.length + IV_LEN + TAG_LEN;

  // 길이보다 MAGIC을 먼저 본다. 평문 파일을 잘못 넘긴 경우 '손상되었다'가 아니라
  // 'SMP 파일이 아니다'라고 알려주어야 사용자가 원인을 찾을 수 있다.
  if (!isEncrypted(envelope)) {
    throw new DecryptError(
      'SMP 암호화 파일이 아닙니다. 평문 파일을 복호화하려 한 것은 아닌지 확인하십시오.',
    );
  }
  if (envelope.length < header) {
    throw new DecryptError('암호화 파일이 너무 짧습니다. 파일이 손상되었을 수 있습니다.');
  }

  const iv = envelope.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = envelope.subarray(MAGIC.length + IV_LEN, header);
  const body = envelope.subarray(header);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch (cause) {
    // GCM 인증 실패 — 키가 다르거나 파일이 변조되었다. 둘을 구분할 수는 없다.
    throw new DecryptError(
      '복호화에 실패했습니다. 키가 다르거나 파일이 손상·변조되었습니다.',
      { cause },
    );
  }
}

export function encryptJson(value: unknown, key: Buffer): Buffer {
  return encrypt(JSON.stringify(value, null, 2), key);
}

export function decryptJson<T>(envelope: Buffer, key: Buffer): T {
  const text = decrypt(envelope, key).toString('utf8');
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new DecryptError('복호화는 되었으나 JSON 형식이 아닙니다.', { cause });
  }
}

/** 파일이 SMP 암호화 봉투인지 — 앞 4바이트만 본다 */
export function isEncrypted(data: Buffer): boolean {
  return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}
