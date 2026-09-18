import { describe, expect, it } from 'vitest';
import {
  DecryptError,
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  generateKey,
  isEncrypted,
} from '../src/cipher.js';

describe('개인정보 파일 암호화', () => {
  it('암호화한 것을 같은 키로 되돌린다', () => {
    const key = generateKey();
    const roster = { workers: [{ id: 'w1', name: '홍길동' }] };
    expect(decryptJson(encryptJson(roster, key), key)).toEqual(roster);
  });

  it('같은 내용이라도 매번 다른 암호문이 된다', () => {
    const key = generateKey();
    expect(encrypt('같은 내용', key).equals(encrypt('같은 내용', key))).toBe(false);
  });

  it('다른 키로는 열리지 않는다', () => {
    const envelope = encrypt('인원 명부', generateKey());
    expect(() => decrypt(envelope, generateKey())).toThrow(DecryptError);
  });

  it('한 바이트라도 변조되면 거부한다 — 조용히 이상한 값을 내지 않는다', () => {
    const key = generateKey();
    const envelope = encrypt('안전관리자 홍길동', key);
    envelope[envelope.length - 1] ^= 0xff;
    expect(() => decrypt(envelope, key)).toThrow(/손상·변조/);
  });

  it('평문 파일을 복호화하려 하면 분명한 오류를 낸다', () => {
    const plain = Buffer.from('{"이건": "평문"}', 'utf8');
    expect(isEncrypted(plain)).toBe(false);
    expect(() => decrypt(plain, generateKey())).toThrow(/SMP 암호화 파일이 아닙니다/);
  });

  it('키 길이가 다르면 거부한다', () => {
    expect(() => encrypt('x', Buffer.alloc(16))).toThrow(/32바이트/);
  });

  it('암호화된 파일을 알아본다', () => {
    expect(isEncrypted(encrypt('x', generateKey()))).toBe(true);
  });
});
