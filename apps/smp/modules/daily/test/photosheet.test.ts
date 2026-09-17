import { describe, expect, it } from 'vitest';
import {
  PHOTO_AREA_HEIGHT_PT,
  PHOTO_SHEET_WIDTH_PT,
  renderPhotoSheet,
} from '../src/tbm/photosheet.js';
import { ptToMm } from '../src/tbm/render.js';

const base = {
  siteName: '○○ 도시개발사업 부지조성공사',
  date: '2026-09-17',
  sources: { abc123: 'data:image/jpeg;base64,/9j/TEST' },
};

const onePhoto = [{ sha256: 'abc123', ext: '.jpg', caption: 'TBM 실시 장면' }];

describe('실측값 반영', () => {
  it('인쇄 폭과 사진 자리 높이가 실측값과 맞는다', () => {
    expect(PHOTO_SHEET_WIDTH_PT).toBe(502.5);
    expect(PHOTO_AREA_HEIGHT_PT).toBe(248.2);
    expect(ptToMm(502.5)).toBeCloseTo(177.3, 1);
  });

  it('여백과 치수를 mm로 환산해 넣는다', () => {
    const html = renderPhotoSheet({ ...base, photos: onePhoto });
    expect(html).toContain(`margin: ${ptToMm(46.5).toFixed(1)}mm`);
    expect(html).toContain(`${ptToMm(248.2).toFixed(1)}mm`);
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

describe('사진 여러 장', () => {
  it('장수만큼 면을 만들고 번호를 매긴다', () => {
    const html = renderPhotoSheet({
      ...base,
      sources: { a: 'data:image/jpeg;base64,A', b: 'data:image/jpeg;base64,B' },
      photos: [
        { sha256: 'a', ext: '.jpg' },
        { sha256: 'b', ext: '.jpg' },
      ],
    });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).toContain('(1/2)');
    expect(html).toContain('(2/2)');
  });

  it('한 장이면 번호를 붙이지 않는다', () => {
    expect(renderPhotoSheet({ ...base, photos: onePhoto })).not.toContain('(1/1)');
  });

  it('장마다 새 면에 인쇄한다', () => {
    const html = renderPhotoSheet({ ...base, photos: onePhoto });
    expect(html).toContain('page-break-after: always');
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

  it('설명에 든 특수문자를 escape 한다', () => {
    const html = renderPhotoSheet({
      ...base,
      photos: [{ sha256: 'abc123', ext: '.jpg', caption: '<img onerror=x>' }],
    });
    expect(html).not.toContain('<img onerror=x>');
    expect(html).toContain('&lt;img');
  });
});
