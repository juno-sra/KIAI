import { describe, expect, it } from 'vitest';
import {
  DecryptError,
  KeyStore,
  KeyStoreUnavailableError,
  exportKey,
  generateKey,
  importKey,
  keysEqual,
  type KeyStoreFs,
  type SecureStorage,
} from '../src/index.js';

/** Windows DPAPI 대역 — 실제로는 Electron safeStorage가 들어간다 */
function fakeStorage(available = true): SecureStorage {
  return {
    isAvailable: () => available,
    encryptString: (plain) => Buffer.from(`WRAPPED:${plain}`, 'utf8'),
    decryptString: (buf) => buf.toString('utf8').replace(/^WRAPPED:/, ''),
  };
}

function memoryFs(): KeyStoreFs & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    readFile: (p) => {
      const v = files.get(p);
      if (!v) throw new Error(`없는 파일: ${p}`);
      return v;
    },
    writeFile: (p, d) => void files.set(p, d),
    exists: (p) => files.has(p),
  };
}

describe('키 보관', () => {
  it('처음 실행하면 키를 만들어 저장한다', () => {
    const fs = memoryFs();
    const store = new KeyStore({ keyPath: 'C:/key.bin', storage: fakeStorage(), fs });
    expect(store.hasKey()).toBe(false);
    const key = store.getOrCreate();
    expect(key).toHaveLength(32);
    expect(store.hasKey()).toBe(true);
  });

  it('다시 실행하면 같은 키를 돌려준다', () => {
    const fs = memoryFs();
    const opts = { keyPath: 'C:/key.bin', storage: fakeStorage(), fs };
    const first = new KeyStore(opts).getOrCreate();
    const second = new KeyStore(opts).getOrCreate();
    expect(keysEqual(first, second)).toBe(true);
  });

  it('키 파일을 평문으로 두지 않는다', () => {
    const fs = memoryFs();
    const key = new KeyStore({ keyPath: 'C:/key.bin', storage: fakeStorage(), fs }).getOrCreate();
    const stored = fs.files.get('C:/key.bin')!;
    expect(stored.includes(key)).toBe(false);
    expect(stored.toString('utf8').startsWith('WRAPPED:')).toBe(true);
  });

  it('OS 자격증명 저장소를 못 쓰면 키를 만들지 않는다', () => {
    // 평문으로 저장해 버리면 암호화를 한 의미가 없다
    const store = new KeyStore({
      keyPath: 'C:/key.bin',
      storage: fakeStorage(false),
      fs: memoryFs(),
    });
    expect(() => store.getOrCreate()).toThrow(KeyStoreUnavailableError);
  });

  it('저장된 키가 손상되면 알린다', () => {
    const fs = memoryFs();
    fs.writeFile('C:/key.bin', Buffer.from('WRAPPED:deadbeef', 'utf8'));
    const store = new KeyStore({ keyPath: 'C:/key.bin', storage: fakeStorage(), fs });
    expect(() => store.getOrCreate()).toThrow(/손상되었습니다/);
  });
});

describe('키 내보내기와 복구 — PC 교체 대비', () => {
  it('암호로 감싼 키를 다시 풀 수 있다', () => {
    const key = generateKey();
    const exported = exportKey(key, 'a-strong-passphrase', '안양 현장');
    expect(keysEqual(importKey(exported, 'a-strong-passphrase'), key)).toBe(true);
  });

  it('암호가 틀리면 열리지 않는다', () => {
    const exported = exportKey(generateKey(), 'correct-passphrase');
    expect(() => importKey(exported, 'wrong-passphrase')).toThrow(DecryptError);
  });

  it('내보낸 파일에 키가 그대로 들어 있지 않다', () => {
    const key = generateKey();
    const exported = exportKey(key, 'a-strong-passphrase');
    expect(exported.payload).not.toContain(key.toString('base64'));
    expect(exported.payload).not.toContain(key.toString('hex'));
  });

  it('짧은 암호는 거부한다', () => {
    expect(() => exportKey(generateKey(), 'short')).toThrow(/8자 이상/);
  });

  it('SMP 키 파일이 아니면 거부한다', () => {
    expect(() =>
      importKey({ magic: 'OTHER', salt: '', payload: '', createdAt: '' }, 'x'.repeat(10)),
    ).toThrow(/SMP 키 내보내기 파일이 아닙니다/);
  });

  it('복구한 키를 새 PC에 설치할 수 있다', () => {
    const key = generateKey();
    const exported = exportKey(key, 'a-strong-passphrase');

    const newPc = memoryFs();
    const store = new KeyStore({ keyPath: 'D:/key.bin', storage: fakeStorage(), fs: newPc });
    store.install(importKey(exported, 'a-strong-passphrase'));

    expect(keysEqual(store.getOrCreate(), key)).toBe(true);
  });
});
