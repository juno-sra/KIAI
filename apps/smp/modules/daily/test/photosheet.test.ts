import { describe, expect, it } from 'vitest';
import {
  MARGIN_BOTTOM_MM,
  MARGIN_TOP_MM,
  PHOTO_PADDING_PX,
  PHOTO_SHEET_WIDTH_PT,
  PHOTOS_PER_PAGE,
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

  it('제목을 뺀 나머지를 장수로 균등 분할한다', () => {
    const m = sheetMetrics(2);
    // (252 - 제목 18.2) / 2
    expect(m.blockMm).toBeCloseTo(116.9, 1);
    expect(m.infoMm).toBeCloseTo(24.7, 1);
    expect(m.photoMm).toBeCloseTo(92.2, 1);
  });

  it('장수를 바꾸면 사진 크기가 따라간다', () => {
    expect(sheetMetrics(1).photoMm).toBeCloseTo(209.1, 1);
    expect(sheetMetrics(3).photoMm).toBeCloseTo(53.2, 1);
  });

  it('사진이 들어갈 자리가 없으면 거부한다', () => {
    // 한 면에 너무 많이 넣으려 하면 설명표만 남는다
    expect(() => sheetMetrics(10)).toThrow(/사진 자리가 남지 않습니다/);
  });

  it('0장 이하는 거부한다', () => {
    expect(() => sheetMetrics(0)).toThrow(/1장 이상/);
  });

  it('계산값을 인쇄 여백과 높이에 넣는다', () => {
    const html = renderPhotoSheet({ ...base, photos: onePhoto });
    expect(html).toContain('margin: 25mm');
    expect(html).toContain('20mm;');
    expect(html).toContain('92.2mm');
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
    expect(html).toContain('공 사 명');
    expect(html).toContain(base.siteName);
    expect(html).toContain('2026년 9월 17일 목요일');
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

describe('페이지당 2장', () => {
  const four = ['a', 'b', 'c', 'd'].map((h) => ({ sha256: h, ext: '.jpg' }));
  const sources = Object.fromEntries(four.map((p) => [p.sha256, `data:image/jpeg;base64,${p.sha256}`]));

  it('기본값이 2장이다', () => {
    expect(PHOTOS_PER_PAGE).toBe(2);
  });

  it('두 장씩 묶어 면을 만든다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: four });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.match(/class="block"/g)).toHaveLength(4);
  });

  it('홀수면 마지막 면에 한 장만 넣는다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: four.slice(0, 3) });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.match(/class="block"/g)).toHaveLength(3);
  });

  it('면 번호를 매긴다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: four });
    expect(html).toContain('(1/2)');
    expect(html).toContain('(2/2)');
  });

  it('한 면으로 끝나면 번호를 붙이지 않는다', () => {
    const html = renderPhotoSheet({ ...base, photos: onePhoto });
    expect(html).not.toContain('(1/1)');
  });

  it('사진마다 번호를 표시한다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: four });
    expect(html.match(/class="no"/g)).toHaveLength(4);
  });

  it('한 장뿐이면 번호를 붙이지 않는다', () => {
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).not.toContain('class="no"');
  });

  it('페이지당 장수를 바꿀 수 있다', () => {
    const html = renderPhotoSheet({ ...base, sources, photos: four, photosPerPage: 1 });
    expect(html.match(/class="sheet"/g)).toHaveLength(4);
  });

  it('렌더러도 0장 이하를 거부한다', () => {
    expect(() =>
      renderPhotoSheet({ ...base, sources, photos: four, photosPerPage: 0 }),
    ).toThrow(/1장 이상/);
  });

  it('면마다 새 페이지에 인쇄한다', () => {
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).toContain('page-break-after: always');
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
