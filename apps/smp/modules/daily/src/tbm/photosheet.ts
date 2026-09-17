/**
 * 사진대지 렌더러 — 「TBM 및 일일안전교육 일지」 2면.
 *
 * 여백은 사용자 지정값을 따른다 — 상단 25mm, 하단 20mm 고정. 좌우는 실측값
 * 46.5pt(약 16.4mm)를 쓴다.
 *
 * 제목을 뺀 나머지 높이를 페이지당 장수로 **정확히 균등 분할**한다. 사진 자리
 * 높이는 고정 상수가 아니라 이 분할에서 계산된다. 여백이나 장수를 바꾸면
 * 사진 크기가 자동으로 따라간다.
 *
 * 실측 참고값
 *   인쇄 폭 502.5pt (약 177.3mm)
 *   설명표 라벨 폭 66pt (약 23.3mm), 행 높이 35pt
 */
import type { TbmPhoto } from './types.js';
import { formatDateKo, ptToMm } from './render.js';

/** 실측 인쇄 폭 (pt) */
export const PHOTO_SHEET_WIDTH_PT = 502.5;
/** 설명표 라벨 폭 (pt) */
export const PHOTO_LABEL_WIDTH_PT = 66;
/** 설명표 한 행 높이 (pt) */
export const INFO_ROW_HEIGHT_PT = 35;
/** 페이지당 사진 수 */
export const PHOTOS_PER_PAGE = 2;
/** 사진 상하 여백 (px) — 테두리에 딱 붙지 않게 한다 */
export const PHOTO_PADDING_PX = 5;

/** 용지 높이 (mm) — A4 세로 */
export const PAGE_HEIGHT_MM = 297;
/** 상단 여백 (mm) — 사용자 지정 */
export const MARGIN_TOP_MM = 25;
/** 하단 여백 (mm) — 사용자 지정 */
export const MARGIN_BOTTOM_MM = 20;
/** 좌우 여백 (mm) — 실측 46.5pt */
export const MARGIN_SIDE_MM = 46.5 * (25.4 / 72);

/** 제목 + 부제가 차지하는 높이 (mm) */
export const TITLE_BLOCK_MM = 18.2;

export interface SheetMetrics {
  /** 여백을 뺀 본문 높이 */
  usableMm: number;
  /** 세트(사진 + 설명표) 하나의 높이 */
  blockMm: number;
  /** 사진 자리 높이 */
  photoMm: number;
  /** 설명표 높이 */
  infoMm: number;
}

/**
 * 여백과 장수로부터 사진 크기를 구한다.
 *
 * 제목을 뺀 나머지를 장수로 균등 분할하므로, 한 면의 사진들은 항상 같은 크기다.
 */
export function sheetMetrics(photosPerPage: number = PHOTOS_PER_PAGE): SheetMetrics {
  if (photosPerPage < 1) throw new Error('페이지당 사진 수는 1장 이상이어야 합니다.');

  const usableMm = PAGE_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;
  const blockMm = (usableMm - TITLE_BLOCK_MM) / photosPerPage;
  const infoMm = INFO_ROW_HEIGHT_PT * 2 * (25.4 / 72);
  const photoMm = blockMm - infoMm;

  if (photoMm <= 0) {
    throw new Error(
      `여백과 장수가 맞지 않습니다. 본문 ${usableMm.toFixed(1)}mm에 ` +
        `${photosPerPage}장을 넣으면 사진 자리가 남지 않습니다.`,
    );
  }

  return { usableMm, blockMm, photoMm, infoMm };
}

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

  const metrics = sheetMetrics(perPage);

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

/* 여백 — 상단·하단은 사용자 지정, 좌우는 실측값 */
@page {
  size: A4 portrait;
  margin: ${MARGIN_TOP_MM}mm ${MARGIN_SIDE_MM.toFixed(1)}mm ${MARGIN_BOTTOM_MM}mm;
}

* { box-sizing: border-box; }

body {
  font-family: 'Pretendard', 'Pretendard Variable', -apple-system, sans-serif;
  font-size: 10pt;
  color: #000;
  margin: 0;
}

.sheet {
  width: ${ptToMm(PHOTO_SHEET_WIDTH_PT).toFixed(1)}mm;
  /* 한 면을 넘으면 새 면에 인쇄한다 */
  page-break-after: always;
  break-after: page;
}
.sheet:last-child { page-break-after: auto; break-after: auto; }

/* 제목 영역 — 합계 ${TITLE_BLOCK_MM}mm */
h1 {
  font-size: 17pt;
  font-weight: 600;
  text-align: center;
  letter-spacing: 6pt;
  margin: 0 0 1.5mm;
  line-height: 1.1;
}

.subtitle {
  text-align: center;
  font-size: 10pt;
  margin: 0 0 4mm;
  line-height: 1.1;
}

/*
 * 사진 한 장 + 설명표 한 세트.
 * 제목을 뺀 나머지를 장수로 균등 분할한 높이다.
 */
.block {
  height: ${metrics.blockMm.toFixed(1)}mm;
}

.photo {
  position: relative;
  height: ${metrics.photoMm.toFixed(1)}mm;
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
  padding: 1.5mm 2.5mm;
  height: ${(metrics.infoMm / 2).toFixed(1)}mm;
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
