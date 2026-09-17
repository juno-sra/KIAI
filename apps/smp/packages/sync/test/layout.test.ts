import { describe, expect, it } from 'vitest';
import { attachmentPath, eventFilePath, isSafeFileName, modulePaths, paths } from '../src/layout.js';

describe('폴더 구조', () => {
  it('공통과 관리자 폴더를 분리한다', () => {
    const p = paths('C:/OneDrive/SMP');
    // 전체 인원 명부는 관리자 폴더에만 둔다 (개인정보 최소 배포)
    expect(p.adminWorkers).toContain('_관리자');
    expect(p.members).toContain('_공통');
  });

  it('모듈마다 자기 폴더를 가진다 — 담당이 아니면 공유하지 않는다', () => {
    expect(modulePaths('/smp', 'daily').root).toContain('daily');
    expect(modulePaths('/smp', 'education').root).toContain('education');
  });

  it('기기마다 자기 이벤트 파일에만 쓴다', () => {
    const a = eventFilePath('/smp', 'daily', 'dev_a1');
    const b = eventFilePath('/smp', 'daily', 'dev_b2');
    expect(a).not.toBe(b);
    expect(a).toMatch(/dev_a1\.jsonl$/);
  });
});

describe('첨부파일 경로', () => {
  it('내용 해시를 이름으로 써서 덮어쓰기 충돌을 없앤다', () => {
    const hash = 'a'.repeat(64);
    const p = attachmentPath('/smp', 'daily', hash, '.jpg', new Date('2026-09-17'));
    expect(p).toContain('2026');
    expect(p).toContain('09');
    expect(p).toMatch(/a{32}\.jpg$/);
  });

  it('경로 길이 제한을 고려해 해시를 32자로 자른다', () => {
    const p = attachmentPath('/smp', 'daily', 'b'.repeat(64), 'png');
    expect(p.split('/').pop()).toHaveLength(36); // 32 + '.png'
  });
});

describe('OneDrive 파일명 제약', () => {
  it('금지 문자를 걸러낸다', () => {
    for (const bad of ['a:b', 'a/b', 'a\\b', 'a*b', 'a?b', 'a<b', 'a>b', 'a"b', 'a|b']) {
      expect(isSafeFileName(bad)).toBe(false);
    }
  });

  it('끝이 공백이나 마침표면 거부한다', () => {
    expect(isSafeFileName('보고서.')).toBe(false);
    expect(isSafeFileName('보고서 ')).toBe(false);
  });

  it('한글 이름은 허용한다', () => {
    expect(isSafeFileName('TBM일지_20260917')).toBe(true);
  });

  it('너무 긴 이름은 거부한다 — 경로 길이 제한에 걸린다', () => {
    expect(isSafeFileName('가'.repeat(101))).toBe(false);
  });
});
