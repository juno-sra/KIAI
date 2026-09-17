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
 * 한 면에 3장을 넣기 위해 설명표를 한 줄로 줄였다. 두 줄이면 사진이 53mm까지
 * 작아져 현장 상황을 확인하기 어렵다.
 *
 * 실측 참고값
 *   인쇄 폭 502.5pt (약 177.3mm)
 *   설명표 라벨 폭 66pt (약 23.3mm), 행 높이 35pt
 */
import type { TbmPhoto } from './types.js';
import { ptToMm } from './render.js';

/** 실측 인쇄 폭 (pt) */
export const PHOTO_SHEET_WIDTH_PT = 502.5;
/** 설명표 라벨 폭 (pt) */
export const PHOTO_LABEL_WIDTH_PT = 66;
/**
 * 설명표 높이 (mm).
 *
 * 표 셀 높이는 글자 크기와 안쪽 여백에 따라 결정되므로, 지정한 값이 그대로
 * 나오지 않는다. 이 값은 실제 렌더링에서 확인한 높이다.
 */
export const INFO_HEIGHT_MM = 9.0;
/** 페이지당 사진 수 */
export const PHOTOS_PER_PAGE = 3;
/** 설명표 행 수 — 한 면에 3장을 넣기 위해 공사명·내용·날짜를 한 줄에 담는다 */
export const INFO_ROWS = 1;
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

/**
 * 제목 + 부제가 차지하는 높이 (mm).
 *
 * 브라우저에서 실제로 렌더링해 잰 값이다 (제목 6.6 + 여백 1.5 + 부제 3.9 + 여백 4.0).
 * 눈대중으로 잡으면 남는 공간이 생겨 사진이 그만큼 작아진다.
 */
export const TITLE_BLOCK_MM = 16.0;

/**
 * 사진 자리 최소 높이 (mm).
 *
 * 이보다 작으면 현장 상황을 확인할 수 없어 사진대지의 목적을 잃는다.
 * 자리가 0보다 크기만 하면 통과시키면, 한 면에 10장을 넣어 11mm짜리 사진을
 * 만드는 설정도 지나간다.
 */
export const MIN_PHOTO_HEIGHT_MM = 30;

/**
 * 안전 여유 (mm).
 *
 * 브라우저는 요소 높이를 소수점 아래에서 반올림하므로, 지정한 값보다 조금씩
 * 커진다. 본문 높이를 딱 맞추면 0.1mm 초과로 마지막 표가 다음 면으로 밀리거나
 * 잘려 사라진다. 실제로 그렇게 표 하나가 통째로 없어지는 일이 있었다.
 */
export const SAFETY_MARGIN_MM = 1.0;

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
  const blockMm = (usableMm - TITLE_BLOCK_MM - SAFETY_MARGIN_MM) / photosPerPage;
  const infoMm = INFO_HEIGHT_MM;
  const photoMm = blockMm - infoMm;

  if (photoMm < MIN_PHOTO_HEIGHT_MM) {
    throw new Error(
      `한 면에 ${photosPerPage}장을 넣으면 사진 높이가 ${photoMm.toFixed(1)}mm가 되어 ` +
        `최소 기준 ${MIN_PHOTO_HEIGHT_MM}mm에 못 미칩니다. ` +
        `현장 상황을 확인할 수 없는 크기이므로 장수를 줄이거나 여백을 조정하십시오.`,
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

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 한 줄 표에 들어가도록 짧게 — 2026-09-17 (목) */
export function formatDateShort(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${date} (${WEEKDAYS[d.getDay()]})`;
}

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
        <td class="label">공사명</td>
        <td class="v-site">${esc(options.siteName)}</td>
        <td class="label">내용</td>
        <td class="v-subject">${esc(caption === '' ? subject : caption)}</td>
        <td class="label">날짜</td>
        <td class="v-date">${esc(formatDateShort(options.date))}</td>
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
  height: ${metrics.infoMm.toFixed(1)}mm;
  margin-top: 0;
}
.info td {
  border: 0.5pt solid #000;
  border-top: none;
  /*
   * 셀 높이는 글자 크기와 안쪽 여백으로 결정된다. 높이를 직접 지정해도
   * 내용이 더 크면 밀려나므로, line-height로 잡아 정확히 맞춘다.
   */
  padding: 0 2.5mm;
  height: ${metrics.infoMm.toFixed(1)}mm;
  line-height: ${(metrics.infoMm - 1).toFixed(1)}mm;
  vertical-align: middle;
}
.info .label {
  width: ${ptToMm(PHOTO_LABEL_WIDTH_PT * 0.62).toFixed(1)}mm;
  background: #f2f2f2;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

/* 한 줄에 공사명·내용·날짜를 담는다. 긴 현장명은 줄이지 않고 줄바꿈 없이 흘린다 */
.info .v-site { width: 38%; }
.info .v-subject { width: 26%; }
.info .v-date { width: 16%; white-space: nowrap; text-align: center; }
.info td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}
