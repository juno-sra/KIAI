/**
 * 사진대지 렌더러 — 「TBM 및 일일안전교육 일지」 2면.
 *
 * 실측값 (A4 세로 595 × 842 pt)
 *   좌측 46.5pt, 우측 549.0pt → 폭 502.5pt (약 177.3mm)
 *   사진 영역 165.0 ~ 413.2pt → 높이 248.2pt (약 87.6mm)
 *   설명표 414.0 ~ 482.6pt, 라벨 폭 66pt (약 23.3mm)
 *
 * 페이지당 사진 2장을 넣는다. 실측 치수 그대로 두 세트를 쌓아도 A4 세로에
 * 21.5mm 여유가 남는다. 사진이 더 많으면 2장씩 나눠 면을 늘린다.
 */
import type { TbmPhoto } from './types.js';
import { formatDateKo, ptToMm } from './render.js';

/** 실측 인쇄 폭 (pt) */
export const PHOTO_SHEET_WIDTH_PT = 502.5;
/** 사진 자리 높이 (pt) */
export const PHOTO_AREA_HEIGHT_PT = 248.2;
/** 설명표 라벨 폭 (pt) */
export const PHOTO_LABEL_WIDTH_PT = 66;
/** 페이지당 사진 수 */
export const PHOTOS_PER_PAGE = 2;
/** 사진 상하 여백 (px) — 테두리에 딱 붙지 않게 한다 */
export const PHOTO_PADDING_PX = 5;

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
  /** 페이지당 사진 수. 기본 2장 */
  photosPerPage?: number;
}

const DEFAULT_FONT_CSS = `@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');`;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 사진 한 장과 설명표 한 세트 */
function photoBlock(
  options: PhotoSheetOptions,
  photo: TbmPhoto | null,
  index: number,
  total: number,
): string {
  const src = photo ? options.sources[photo.sha256] : undefined;
  const caption = photo?.caption ?? '';
  const subject = options.subject ?? 'TBM 사진대지';
  const no = total > 1 && photo ? `<span class="no">${index + 1}</span>` : '';

  // 사진이 없거나 주소를 못 찾으면 빈 자리를 남긴다. 조용히 건너뛰면
  // 몇 장이 빠졌는지 알 수 없다.
  const body = src
    ? `<img src="${esc(src)}" alt="${esc(caption)}">`
    : `<div class="missing">사진 없음${photo ? ` (${esc(photo.sha256.slice(0, 8))})` : ''}</div>`;

  return `
  <div class="block">
    <div class="photo">${no}${body}</div>
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
  </div>`;
}

/** 한 면 — 제목과 사진 세트들 */
function sheetPage(
  options: PhotoSheetOptions,
  photos: (TbmPhoto | null)[],
  startIndex: number,
  total: number,
  pageNo: number,
  pageCount: number,
): string {
  const label = pageCount > 1 ? ` (${pageNo}/${pageCount})` : '';
  const blocks = photos
    .map((p, i) => photoBlock(options, p, startIndex + i, total))
    .join('\n');

  return `
<section class="sheet">
  <h1>사 진 대 지</h1>
  <div class="subtitle">TBM(작업 전 안전점검회의)${label}</div>
${blocks}
</section>`;
}

export function renderPhotoSheet(options: PhotoSheetOptions): string {
  const fontCss = options.fontCss ?? DEFAULT_FONT_CSS;
  const perPage = options.photosPerPage ?? PHOTOS_PER_PAGE;
  const photos = options.photos;

  if (perPage < 1) throw new Error('페이지당 사진 수는 1장 이상이어야 합니다.');

  if (photos.length === 0 && !options.allowEmpty) {
    throw new Error(
      '첨부된 사진이 없습니다. 빈 사진대지를 내려면 allowEmpty를 켜십시오.',
    );
  }

  // 빈 대지는 한 면에 빈 자리 하나만 낸다
  const groups: (TbmPhoto | null)[][] =
    photos.length === 0
      ? [[null]]
      : Array.from({ length: Math.ceil(photos.length / perPage) }, (_, i) =>
          photos.slice(i * perPage, (i + 1) * perPage),
        );

  const pages = groups.map((group, i) =>
    sheetPage(options, group, i * perPage, photos.length, i + 1, groups.length),
  );

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
  margin-bottom: ${ptToMm(12).toFixed(1)}mm;
}

/* 사진 한 장 + 설명표 한 세트 */
.block { margin-bottom: ${ptToMm(18).toFixed(1)}mm; }
.block:last-child { margin-bottom: 0; }

/* 사진 자리 — 실측 높이 248.2pt */
.photo {
  position: relative;
  height: ${ptToMm(PHOTO_AREA_HEIGHT_PT).toFixed(1)}mm;
  border: 0.5pt solid #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #fff;
  /* 사진이 테두리에 딱 붙지 않게 상하 여백을 둔다 */
  padding: ${PHOTO_PADDING_PX}px 0;
}

/* 사진 번호 */
.photo .no {
  position: absolute;
  top: 1.5mm;
  left: 2mm;
  font-size: 8pt;
  font-weight: 600;
  color: #444;
  background: rgba(255, 255, 255, 0.85);
  padding: 0.3mm 1.2mm;
  border: 0.4pt solid #999;
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
