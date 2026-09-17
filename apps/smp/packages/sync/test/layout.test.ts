import { describe, expect, it } from 'vitest';
import {
  attachmentPath,
  eventFilePath,
  isSafeFileName,
  modulePaths,
  parseEventFileName,
  paths,
  yearMonth,
} from '../src/layout.js';

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
});

describe('이벤트 파일 월별 분할', () => {
  it('기기와 월을 파일명에 함께 담는다', () => {
    const p = eventFilePath('/smp', 'daily', 'dev_a1', new Date('2026-09-17'));
    expect(p).toMatch(/dev_a1-2026-09\.jsonl$/);
  });

  it('달이 바뀌면 새 파일로 넘어간다 — 지난달 파일은 다시 올라가지 않는다', () => {
    // OneDrive는 한 줄만 덧붙여도 파일 전체를 다시 올린다
    const sep = eventFilePath('/smp', 'daily', 'dev_a1', new Date('2026-09-30'));
    const oct = eventFilePath('/smp', 'daily', 'dev_a1', new Date('2026-10-01'));
    expect(sep).not.toBe(oct);
    expect(oct).toMatch(/2026-10\.jsonl$/);
  });

  it('기기마다 자기 파일에만 쓴다', () => {
    const d = new Date('2026-09-17');
    const a = eventFilePath('/smp', 'daily', 'dev_a1', d);
    const b = eventFilePath('/smp', 'daily', 'dev_b2', d);
    expect(a).not.toBe(b);
  });

  it('한 자리 월에 0을 채운다 — 문자열 정렬이 곧 시간순이 된다', () => {
    expect(yearMonth(new Date('2026-01-05'))).toBe('2026-01');
    expect(yearMonth(new Date('2026-12-05'))).toBe('2026-12');
    expect('2026-01' < '2026-12').toBe(true);
  });

  it('파일명에서 기기와 월을 되꺼낸다', () => {
    expect(parseEventFileName('dev_현장사무실PC-2026-09.jsonl')).toEqual({
      deviceId: 'dev_현장사무실PC',
      month: '2026-09',
    });
  });

  it('형식이 다른 파일명은 무시한다', () => {
    expect(parseEventFileName('dev_a1.jsonl')).toBeNull();
    expect(parseEventFileName('메모.txt')).toBeNull();
  });
});

describe('첨부파일 경로', () => {
  it('내용 해시를 이름으로 써서 덮어쓰기 충돌을 없앤다', () => {
    const hash = 'a'.repeat(64);
    const p = attachmentPath('/smp', 'daily', hash, '.jpg', 'original', new Date('2026-09-17'));
    expect(p).toContain('2026');
    expect(p).toContain('09');
    expect(p).toMatch(/a{32}\.jpg$/);
  });

  it('축소본은 _s 를 붙여 원본과 함께 둔다', () => {
    const hash = 'b'.repeat(64);
    const d = new Date('2026-09-17');
    const original = attachmentPath('/smp', 'daily', hash, '.jpg', 'original', d);
    const thumb = attachmentPath('/smp', 'daily', hash, '.jpg', 'thumb', d);

    expect(original).not.toBe(thumb);
    expect(thumb).toMatch(/b{32}_s\.jpg$/);
    // 같은 폴더에 나란히 둔다
    expect(thumb.replace('_s.jpg', '.jpg')).toBe(original);
  });

  it('경로 길이 제한을 고려해 해시를 32자로 자른다', () => {
    const p = attachmentPath('/smp', 'daily', 'c'.repeat(64), 'png');
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
