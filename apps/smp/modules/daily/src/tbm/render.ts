/**
 * 「TBM 및 일일안전교육 일지」 렌더러.
 *
 * 현장 실사용 서식을 실측해 재현한다. HTML로 그리는 이유는, Electron이 이
 * HTML을 그대로 PDF로 인쇄하기 때문이다. 미리보기와 인쇄물이 같은 엔진으로
 * 그려지므로 "화면값과 인쇄값 불일치"가 생기지 않는다.
 *
 * 실측값 (A4 세로 595 × 842 pt)
 *   좌측 여백 28.5pt, 우측 경계 567.0pt → 인쇄 폭 538.5pt (약 190mm)
 *   결재란 구역 373.5 ~ 567.0pt → 193.5pt, 3칸이면 칸당 64.5pt
 */
import type { TbmSession } from './types.js';
import { attendedCount, durationMinutes } from './types.js';

/** 실측 인쇄 폭 (pt) */
export const CONTENT_WIDTH_PT = 538.5;
const PT_TO_MM = 25.4 / 72;

export function ptToMm(pt: number): number {
  return pt * PT_TO_MM;
}

/** 이름 결합용 — 성명은 암호화된 명부에서 온다 */
export interface RenderNames {
  siteName: string;
  contractorName: string;
  companyName: string;
  workTypeName: string;
  /** workerId → 성명 */
  workerNames: Record<string, string>;
}

export interface RenderOptions {
  session: TbmSession;
  names: RenderNames;
  /**
   * 폰트 불러오는 곳.
   * Electron에서는 로컬 파일 경로(file://...)를, 브라우저 확인용으로는 CDN을 준다.
   * Pretendard 계열을 쓴다 (사용자 상시 지침).
   */
  fontCss?: string;
  /** 참석자 표의 행 수. 실제 인원이 적어도 빈 줄을 남겨 손으로 채울 수 있게 한다 */
  attendeeRows?: number;
  /** 미리보기용 워터마크 (예: '미확정') */
  watermark?: string;
}

const DEFAULT_FONT_CSS = `@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');`;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDateKo(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function checkbox(checked: boolean, label: string): string {
  return `<span class="chk">${checked ? '■' : '□'} ${esc(label)}</span>`;
}

/** 조치여부 — 서식의 '예 ■ 아니오 □' 표기 */
function yesNo(taken: boolean): string {
  return `${taken ? '예 ■' : '예 □'}&nbsp;&nbsp;${taken ? '아니오 □' : '아니오 ■'}`;
}

function approvalBlock(session: TbmSession): string {
  if (session.approvals.length === 0) return '';
  const width = (100 / session.approvals.length).toFixed(2);
  const heads = session.approvals
    .map((a) => `<th style="width:${width}%">${esc(a.titleSnapshot)}</th>`)
    .join('');
  const cells = session.approvals
    .map((a) => `<td class="sign">${esc(a.approvedBy ?? '')}</td>`)
    .join('');
  return `
    <table class="approval">
      <tr><th class="approval-label" rowspan="2">담당자</th>${heads}</tr>
      <tr>${cells}</tr>
    </table>`;
}

function hazardRows(session: TbmSession): string {
  // 서식에는 위험요인 칸이 3줄 있다. 적으면 빈 줄을 남긴다.
  const rows = [...session.hazards];
  while (rows.length < 3) {
    rows.push({ description: '', control: '', actionTaken: false, isCritical: false });
  }
  return rows
    .map((h) => {
      const empty = h.description === '' && h.control === '';
      const mark = h.isCritical ? '<span class="critical">[중점]</span> ' : '';
      const pending =
        !empty && !h.actionTaken && h.pendingAction
          ? `<div class="pending">※ 미조치 대책: ${esc(h.pendingAction)}</div>`
          : '';
      return `
      <tr>
        <td>${empty ? '' : mark + esc(h.description)}</td>
        <td>${empty ? '' : esc(h.control) + pending}</td>
        <td class="center small">${empty ? '예 □&nbsp;&nbsp;아니오 □' : yesNo(h.actionTaken)}</td>
      </tr>`;
    })
    .join('');
}

function attendeeRows(session: TbmSession, names: RenderNames, minRows: number): string {
  const present = session.attendees.filter((a) => a.attended);
  const cells = present.map((a) => ({
    name: names.workerNames[a.workerId] ?? a.workerId,
    health: a.healthStatus,
  }));

  // 이름·서명 3쌍이 한 줄이다 (실측 서식 구조)
  const perRow = 3;
  const rowCount = Math.max(minRows, Math.ceil(cells.length / perRow));
  const rows: string[] = [];

  for (let r = 0; r < rowCount; r += 1) {
    const tds: string[] = [];
    for (let c = 0; c < perRow; c += 1) {
      const item = cells[r * perRow + c];
      const abnormal = item?.health === '이상있음';
      tds.push(
        `<td class="att-name${abnormal ? ' abnormal' : ''}">${item ? esc(item.name) : ''}</td>`,
        `<td class="att-sign"></td>`,
      );
    }
    rows.push(`<tr>${tds.join('')}</tr>`);
  }
  return rows.join('');
}

/** 1면 — TBM 및 일일안전교육 일지 */
export function renderTbmLog(options: RenderOptions): string {
  const { session, names } = options;
  const fontCss = options.fontCss ?? DEFAULT_FONT_CSS;
  const minRows = options.attendeeRows ?? 5;
  const leader = names.workerNames[session.leaderWorkerId] ?? session.leaderWorkerId;
  const edu = session.dailyEducation;

  const watermark = options.watermark
    ? `<div class="watermark">${esc(options.watermark)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>TBM 및 일일안전교육 일지 — ${esc(session.date)}</title>
<style>
${fontCss}

@page { size: A4 portrait; margin: 10mm; }

* { box-sizing: border-box; }

body {
  font-family: 'Pretendard', 'Pretendard Variable', -apple-system, sans-serif;
  font-size: 9pt;
  line-height: 1.35;
  color: #000;
  margin: 0;
  /* 인쇄 폭 실측값 538.5pt */
  width: ${ptToMm(CONTENT_WIDTH_PT).toFixed(1)}mm;
}

h1 {
  font-size: 15pt;
  font-weight: 600;
  text-align: center;
  margin: 0 0 3mm;
  letter-spacing: 0.5pt;
}

.site { text-align: center; font-size: 10pt; margin-bottom: 1mm; }
.contractor { text-align: center; font-size: 9pt; margin-bottom: 3mm; color: #333; }

table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 0.5pt solid #000; padding: 1.2mm 1.5mm; vertical-align: middle; }
th { background: #f2f2f2; font-weight: 600; text-align: center; }
td.label { background: #f2f2f2; font-weight: 600; text-align: center; }

.center { text-align: center; }
.small { font-size: 8pt; }

/* 결재란 — 실측 구역 193.5pt, 칸 수로 균등 분할 */
.approval {
  width: ${ptToMm(193.5).toFixed(1)}mm;
  margin-left: auto;
  margin-bottom: 2mm;
}
.approval th { font-size: 8pt; padding: 0.8mm; }
.approval .approval-label { width: 14mm; background: #e8e8e8; }
.approval td.sign { height: 11mm; text-align: center; }

.section {
  margin-top: 2.5mm;
  margin-bottom: 1mm;
  font-weight: 600;
  font-size: 9pt;
}
.section .basis { font-weight: 400; font-size: 7.5pt; color: #444; }

.chk { margin-right: 4mm; white-space: nowrap; }

.critical { color: #c00; font-weight: 600; }
.pending { margin-top: 0.8mm; font-size: 8pt; color: #c00; }

td.att-name { width: 10%; text-align: center; background: #fafafa; }
td.att-sign { width: 23.33%; height: 8mm; }
td.att-name.abnormal { background: #ffe8e8; }

.note { min-height: 12mm; }
.note-sm { min-height: 8mm; }

.leader { margin-top: 2mm; text-align: right; font-size: 9pt; }

.footer {
  margin-top: 3mm;
  font-size: 7pt;
  color: #555;
  border-top: 0.5pt solid #999;
  padding-top: 1.5mm;
}

.watermark {
  position: fixed;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-25deg);
  font-size: 60pt;
  font-weight: 600;
  color: rgba(200, 0, 0, 0.12);
  pointer-events: none;
  z-index: 10;
}

@media print { .watermark { position: fixed; } }
</style>
</head>
<body>
${watermark}

<h1>TBM 및 일일안전교육 일지</h1>
<div class="site">${esc(names.siteName)}</div>
<div class="contractor">${esc(names.contractorName)}</div>

${approvalBlock(session)}

<table>
  <tr>
    <td class="label" style="width:14.5%">TBM 일시</td>
    <td style="width:35.5%">${esc(formatDateKo(session.date))} ${esc(session.startAt)} ~ ${esc(session.endAt)} (${durationMinutes(session)}분)</td>
    <td class="label" style="width:14.5%">장　소</td>
    <td>${esc(session.location)}</td>
  </tr>
  <tr>
    <td class="label">업 체 명</td>
    <td>${esc(names.companyName)}</td>
    <td class="label">공　종</td>
    <td>${esc(names.workTypeName)}</td>
  </tr>
  <tr>
    <td class="label">작 업 명</td>
    <td colspan="3">${esc(session.workName)}</td>
  </tr>
  <tr>
    <td class="label">작업내용</td>
    <td colspan="3" class="note-sm">${esc(session.workDescription)}</td>
  </tr>
  <tr>
    <td class="label">투입장비</td>
    <td>${esc(session.equipment.join(', '))}</td>
    <td class="label">출역인원</td>
    <td class="center">${session.headcount}명</td>
  </tr>
</table>

<div class="section">
  ■ 일일 안전교육 사항
  <span class="basis">[건설기술진흥법 제65조, 시행령 제103조 — 조문 미대조]</span>
</div>
<table>
  <tr><td>
    ${checkbox(edu.method, '작업공법의 이해')}
    ${checkbox(edu.sequence, '시공상세도면에 따른 세부 시공순서')}
    ${checkbox(edu.precautions, '시공기술상의 주의사항')}
    ${edu.note ? `<div style="margin-top:1mm">${esc(edu.note)}</div>` : ''}
  </td></tr>
</table>

<div class="section">
  ■ 작업 전 안전조치 확인
  <span class="basis">※ 위 잠재위험요인(중점위험 포함) 안전조치 여부 재확인</span>
</div>
<table>
  <tr>
    <th style="width:33%">잠재위험요소 (중점위험 포함)</th>
    <th>대책 (※ 제거 → 대체 → 통제 순서 고려)</th>
    <th style="width:17%">조치여부</th>
  </tr>
  ${hazardRows(session)}
</table>

<div class="section">
  ■ 근로자 일일 안전교육사항 [정기안전교육]
  <span class="basis">고용노동부고시 제2023-63호 「안전보건교육규정」 — 고시 내 조문 미대조</span>
</div>
<table>
  <tr><td class="note">${esc(session.regularEducationNote)}</td></tr>
</table>

<div class="section">■ 작업 후 종료 미팅 (근로자 건의사항 및 사고사례 전파)</div>
<table>
  <tr><td class="note-sm">${esc(session.closingMeeting ?? '')}</td></tr>
</table>

<div class="section">
  ■ 참석자 확인
  <span class="basis">※ TBM에 참여하지 않은 작업자를 확인하여 미팅 참석 유도</span>
</div>
<table>
  <tr>
    <th style="width:10%">이 름</th><th style="width:23.33%">서 명</th>
    <th style="width:10%">이 름</th><th style="width:23.33%">서 명</th>
    <th style="width:10%">이 름</th><th style="width:23.33%">서 명</th>
  </tr>
  ${attendeeRows(session, names, minRows)}
</table>

<div class="leader">진행자 : ${esc(leader)} <span style="margin-left:6mm">(서명)</span></div>

<div class="footer">
  참석 ${attendedCount(session)}명 / 출역 ${session.headcount}명 ·
  실시시간 ${durationMinutes(session)}분
  ${session.status === 'draft' ? ' · <strong>미확정 문서</strong>' : ''}
  ${session.amendments.length > 0 ? ` · 확정 후 ${session.amendments.length}회 수정됨` : ''}
</div>

</body>
</html>`;
}
