/**
 * 사진대지 렌더러 — 「TBM 및 일일안전교육 일지」 2면.
 *
 * 실측값 (A4 세로 595 × 842 pt)
 *   좌측 46.5pt, 우측 549.0pt → 폭 502.5pt (약 177.3mm)
 *   사진 영역 165.0 ~ 413.2pt → 높이 248.2pt (약 87.6mm)
 *   설명표 414.0 ~ 482.6pt, 라벨 폭 66pt (약 23.3mm)
 *
 * 페이지당 사진 1장이다. 사진이 여러 장이면 장수만큼 면을 늘린다.
 */
import type { TbmPhoto } from './types.js';
import { formatDateKo, ptToMm } from './render.js';

/** 실측 인쇄 폭 (pt) */
export const PHOTO_SHEET_WIDTH_PT = 502.5;
/** 사진 자리 높이 (pt) */
export const PHOTO_AREA_HEIGHT_PT = 248.2;
/** 설명표 라벨 폭 (pt) */
export const PHOTO_LABEL_WIDTH_PT = 66;

export interface PhotoSource {
  /** 첨부 해시 */
  sha256: string;
  /**
   * 화면에 넣을 주소.
   * Electron에서는 축소본의 file:// 경로를, 확인용으로는 data URI를 준다.
   * 원본이 아니라 축소본을 쓴다 — 인쇄에 충분하고 훨씬 가볍다.
   */
  src: string;
}

export interface PhotoSheetOptions {
  siteName: string;
  date: string;
  /** 설명표의 '내용' 칸. 기본값은 'TBM 사진대지' */
  subject?: string;
  photos: TbmPhoto[];
  /** 해시 → 이미지 주소 */
  sources: Record<string, string>;
  fontCss?: string;
  /** 사진이 하나도 없을 때 빈 대지를 낼지. 손으로 붙일 경우 쓴다 */
  allowEmpty?: boolean;
}

const DEFAULT_FONT_CSS = `@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');`;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sheetPage(
  options: PhotoSheetOptions,
  photo: TbmPhoto | null,
  index: number,
  total: number,
): string {
  const src = photo ? options.sources[photo.sha256] : undefined;
  const caption = photo?.caption ?? '';
  const subject = options.subject ?? 'TBM 사진대지';
  const pageNo = total > 1 ? ` (${index + 1}/${total})` : '';

  // 사진이 없거나 주소를 못 찾으면 빈 자리를 남긴다. 조용히 건너뛰면
  // 몇 장이 빠졌는지 알 수 없다.
  const body = src
    ? `<img src="${esc(src)}" alt="${esc(caption)}">`
    : `<div class="missing">사진 없음${photo ? ` (${esc(photo.sha256.slice(0, 8))})` : ''}</div>`;

  return `
<section class="sheet">
  <h1>사 진 대 지</h1>
  <div class="subtitle">TBM(작업 전 안전점검회의)${pageNo}</div>

  <div class="photo">${body}</div>

  <table class="info">
    <tr>
      <td class="label">공 사 명</td>
      <td colspan="3">${esc(options.siteName)}</td>
    </tr>
    <tr>
      <td class="label">내　　용</td>
      <td>${esc(caption === '' ? subject : caption)}</td>
      <td class="label">날　　짜</td>
      <td>${esc(formatDateKo(options.date))}</td>
    </tr>
  </table>
</section>`;
}

export function renderPhotoSheet(options: PhotoSheetOptions): string {
  const fontCss = options.fontCss ?? DEFAULT_FONT_CSS;
  const photos = options.photos;

  if (photos.length === 0 && !options.allowEmpty) {
    throw new Error(
      '첨부된 사진이 없습니다. 빈 사진대지를 내려면 allowEmpty를 켜십시오.',
    );
  }

  const pages =
    photos.length === 0
      ? [sheetPage(options, null, 0, 1)]
      : photos.map((p, i) => sheetPage(options, p, i, photos.length));

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>사진대지 — ${esc(options.date)}</title>
<style>
${fontCss}

/* 실측 좌우 여백 46.5pt ≈ 16.4mm */
@page { size: A4 portrait; margin: ${ptToMm(46.5).toFixed(1)}mm; }

* { box-sizing: border-box; }

body {
  font-family: 'Pretendard', 'Pretendard Variable', -apple-system, sans-serif;
  font-size: 10pt;
  color: #000;
  margin: 0;
}

.sheet {
  width: ${ptToMm(PHOTO_SHEET_WIDTH_PT).toFixed(1)}mm;
  /* 사진이 여러 장이면 장마다 새 면에 인쇄한다 */
  page-break-after: always;
  break-after: page;
}
.sheet:last-child { page-break-after: auto; break-after: auto; }

h1 {
  font-size: 18pt;
  font-weight: 600;
  text-align: center;
  letter-spacing: 6pt;
  margin: ${ptToMm(14).toFixed(1)}mm 0 2mm;
}

.subtitle {
  text-align: center;
  font-size: 10.5pt;
  margin-bottom: ${ptToMm(15).toFixed(1)}mm;
}

/* 사진 자리 — 실측 높이 248.2pt */
.photo {
  height: ${ptToMm(PHOTO_AREA_HEIGHT_PT).toFixed(1)}mm;
  border: 0.5pt solid #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #fff;
}

/* 비율을 유지한 채 칸 안에 맞춘다. 늘려 붙이면 현장 상황이 왜곡된다 */
.photo img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.photo .missing {
  color: #999;
  font-size: 10pt;
}

.info {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-top: 0;
}
.info td {
  border: 0.5pt solid #000;
  border-top: none;
  padding: 2mm 2.5mm;
  height: ${ptToMm(35).toFixed(1)}mm;
  vertical-align: middle;
}
.info .label {
  width: ${ptToMm(PHOTO_LABEL_WIDTH_PT).toFixed(1)}mm;
  background: #f2f2f2;
  font-weight: 600;
  text-align: center;
}
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}
