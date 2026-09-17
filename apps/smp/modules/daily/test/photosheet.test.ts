import { describe, expect, it } from 'vitest';
import {
  MARGIN_BOTTOM_MM,
  MARGIN_TOP_MM,
  PHOTO_PADDING_PX,
  PHOTO_SHEET_WIDTH_PT,
  MIN_PHOTO_HEIGHT_MM,
  PHOTOS_PER_PAGE,
  SAFETY_MARGIN_MM,
  TITLE_BLOCK_MM,
  formatDateShort,
  renderPhotoSheet,
  sheetMetrics,
} from '../src/tbm/photosheet.js';
import { ptToMm } from '../src/tbm/render.js';

const base = {
  siteName: '○○ 도시개발사업 부지조성공사',
  date: '2026-09-17',
  sources: { abc123: 'data:image/jpeg;base64,/9j/TEST' },
};

const onePhoto = [{ sha256: 'abc123', ext: '.jpg', caption: 'TBM 실시 장면' }];

describe('여백과 사진 크기', () => {
  it('상단 25mm·하단 20mm 고정', () => {
    expect(MARGIN_TOP_MM).toBe(25);
    expect(MARGIN_BOTTOM_MM).toBe(20);
  });

  it('여백을 뺀 본문이 252mm다', () => {
    expect(sheetMetrics(2).usableMm).toBeCloseTo(252.0, 1);
  });

  it('제목과 안전 여유를 뺀 나머지를 장수로 균등 분할한다', () => {
    const m = sheetMetrics(3);
    // (252 - 제목 16.0 - 여유 1.0) / 3
    expect(m.blockMm).toBeCloseTo(78.33, 1);
    expect(m.infoMm).toBeCloseTo(9.0, 1);
    expect(m.photoMm).toBeCloseTo(69.33, 1);
  });

  it('제목 높이는 실측값이다', () => {
    // 눈대중으로 잡으면 남는 공간이 생겨 사진이 그만큼 작아진다
    expect(TITLE_BLOCK_MM).toBe(16.0);
  });

  it('안전 여유를 둔다 — 반올림으로 마지막 표가 잘리는 것을 막는다', () => {
    expect(SAFETY_MARGIN_MM).toBe(1.0);
    const withMargin = sheetMetrics(3);
    // 본문이 인쇄 영역보다 작아야 한다
    const used = TITLE_BLOCK_MM + withMargin.blockMm * 3;
    expect(used).toBeLessThan(withMargin.usableMm);
  });

  it('설명표를 한 줄로 줄여 사진 자리를 확보한다', () => {
    // 두 줄이면 사진이 53mm까지 작아져 현장 상황을 확인하기 어렵다
    const m = sheetMetrics(3);
    expect(m.photoMm).toBeGreaterThan(65);
  });

  it('장수를 바꾸면 사진 크기가 따라간다', () => {
    expect(sheetMetrics(1).photoMm).toBeCloseTo(226.0, 1);
    expect(sheetMetrics(2).photoMm).toBeCloseTo(108.5, 1);
  });

  it('사진이 너무 작아지는 설정을 거부한다', () => {
    // 자리가 0보다 크기만 하면 통과시키면 11mm짜리 사진도 지나간다
    expect(() => sheetMetrics(10)).toThrow(/최소 기준 30mm에 못 미칩니다/);
  });

  it('최소 기준을 넘는 장수까지는 허용한다', () => {
    // 설명표를 한 줄로 줄인 덕에 6장까지 가능하다
    expect(() => sheetMetrics(6)).not.toThrow();
    expect(sheetMetrics(6).photoMm).toBeGreaterThanOrEqual(30);
    expect(() => sheetMetrics(7)).toThrow();
  });

  it('0장 이하는 거부한다', () => {
    expect(() => sheetMetrics(0)).toThrow(/1장 이상/);
  });

  it('최소 사진 높이 기준이 30mm다', () => {
    expect(MIN_PHOTO_HEIGHT_MM).toBe(30);
  });

  it('계산값을 인쇄 여백과 높이에 넣는다', () => {
    const html = renderPhotoSheet({ ...base, photos: onePhoto });
    expect(html).toContain('margin: 25mm');
    expect(html).toContain('20mm;');
    expect(html).toContain('69.3mm');
  });

  it('인쇄 폭은 실측값을 유지한다', () => {
    expect(PHOTO_SHEET_WIDTH_PT).toBe(502.5);
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).toContain('177.3mm');
  });

  it('A4 세로로 인쇄하고 Pretendard를 쓴다', () => {
    const html = renderPhotoSheet({ ...base, photos: onePhoto });
    expect(html).toContain('size: A4 portrait');
    expect(html).toContain('Pretendard');
  });
});

describe('서식 항목', () => {
  const html = renderPhotoSheet({ ...base, photos: onePhoto });

  it('제목과 부제를 넣는다', () => {
    expect(html).toContain('사 진 대 지');
    expect(html).toContain('TBM(작업 전 안전점검회의)');
  });

  it('공사명·내용·날짜 표를 그린다', () => {
    expect(html).toContain('공사명');
    expect(html).toContain(base.siteName);
    expect(html).toContain('2026-09-17 (목)');
  });

  it('사진 설명을 내용 칸에 넣는다', () => {
    expect(html).toContain('TBM 실시 장면');
  });

  it('설명이 없으면 기본 문구를 쓴다', () => {
    const noCaption = renderPhotoSheet({
      ...base,
      photos: [{ sha256: 'abc123', ext: '.jpg' }],
    });
    expect(noCaption).toContain('TBM 사진대지');
  });
});

describe('페이지당 3장', () => {
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((h) => ({ sha256: h, ext: '.jpg' }));
  const sources = Object.fromEntries(
    seven.map((p) => [p.sha256, `data:image/jpeg;base64,${p.sha256}`]),
  );

  it('기본값이 3장이다', () => {
    expect(PHOTOS_PER_PAGE).toBe(3);
  });

  it('세 장씩 묶어 면을 만든다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: seven.slice(0, 6) });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.match(/class="block"/g)).toHaveLength(6);
  });

  it('나누어떨어지지 않으면 마지막 면에 남은 장수만 넣는다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: seven });
    expect(html.match(/class="sheet"/g)).toHaveLength(3);
    expect(html.match(/class="block"/g)).toHaveLength(7);
  });

  it('면 번호를 매긴다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: seven });
    expect(html).toContain('(1/3)');
    expect(html).toContain('(3/3)');
  });

  it('한 면으로 끝나면 번호를 붙이지 않는다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: seven.slice(0, 3) });
    expect(html).not.toContain('(1/1)');
  });

  it('사진마다 번호를 표시한다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: seven });
    expect(html.match(/class="no"/g)).toHaveLength(7);
  });

  it('한 장뿐이면 번호를 붙이지 않는다', () => {
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).not.toContain('class="no"');
  });

  it('페이지당 장수를 바꿀 수 있다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: seven.slice(0, 4), photosPerPage: 2 });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
  });

  it('렌더러도 0장 이하를 거부한다', () => {
    expect(() =>
      renderPhotoSheet({ ...base, sources, photos: seven, photosPerPage: 0 }),
    ).toThrow(/1장 이상/);
  });

  it('면마다 새 페이지에 인쇄한다', () => {
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).toContain('page-break-after: always');
  });
});

describe('설명표 한 줄 구성', () => {
  const html = renderPhotoSheet({ ...base, photos: onePhoto });

  it('공사명·내용·날짜를 한 줄에 담는다', () => {
    expect(html).toContain('공사명');
    expect(html).toContain('내용');
    expect(html).toContain('날짜');
    expect(html.match(/<tr>/g)).toHaveLength(1);
  });

  it('날짜를 짧게 적는다 — 한 줄에 들어가야 한다', () => {
    expect(formatDateShort('2026-09-17')).toBe('2026-09-17 (목)');
    expect(html).toContain('2026-09-17 (목)');
  });

  it('형식이 아닌 날짜는 그대로 둔다', () => {
    expect(formatDateShort('날짜미정')).toBe('날짜미정');
  });

  it('긴 현장명이 줄을 밀어내지 않게 한다', () => {
    expect(html).toContain('text-overflow: ellipsis');
  });
});

describe('사진이 빠진 경우', () => {
  it('주소를 못 찾으면 빈 자리를 남기고 해시를 적는다', () => {
    // 조용히 건너뛰면 몇 장이 빠졌는지 알 수 없다
    const html = renderPhotoSheet({
      ...base,
      sources: {},
      photos: [{ sha256: 'deadbeef1234', ext: '.jpg' }],
    });
    expect(html).toContain('사진 없음');
    expect(html).toContain('deadbeef');
  });

  it('사진이 하나도 없으면 기본적으로 거부한다', () => {
    expect(() => renderPhotoSheet({ ...base, photos: [] })).toThrow(/allowEmpty/);
  });

  it('빈 대지를 명시적으로 요청하면 만들어 준다', () => {
    // 손으로 사진을 붙이는 경우
    const html = renderPhotoSheet({ ...base, photos: [], allowEmpty: true });
    expect(html).toContain('사 진 대 지');
    expect(html).toContain('사진 없음');
  });
});

describe('사진 표시 방식', () => {
  it('비율을 유지한 채 칸에 맞춘다', () => {
    // 늘려 붙이면 현장 상황이 왜곡된다
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).toContain('object-fit: contain');
  });

  it('사진 상하에 여백을 둔다 — 테두리에 딱 붙지 않게', () => {
    expect(PHOTO_PADDING_PX).toBe(5);
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).toContain('padding: 5px 0');
  });

  it('설명에 든 특수문자를 escape 한다', () => {
    const html = renderPhotoSheet({
      ...base,
      photos: [{ sha256: 'abc123', ext: '.jpg', caption: '<img onerror=x>' }],
    });
    expect(html).not.toContain('<img onerror=x>');
    expect(html).toContain('&lt;img');
  });
});
