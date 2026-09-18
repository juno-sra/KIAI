import { describe, expect, it } from 'vitest';
import { CONTENT_WIDTH_PT, formatDateKo, ptToMm, renderTbmLog } from '../src/tbm/render.js';
import { sampleNames, sampleSession } from './fixtures.js';

const names = sampleNames();

function render(over = {}) {
  return renderTbmLog({ session: sampleSession(over), names });
}

describe('실측값 반영', () => {
  it('인쇄 폭이 실측값과 맞는다', () => {
    // 좌측 여백 28.5pt, 우측 경계 567.0pt
    expect(CONTENT_WIDTH_PT).toBe(538.5);
    expect(ptToMm(538.5)).toBeCloseTo(190.0, 1);
  });

  it('결재란 구역 폭이 실측값(193.5pt)과 맞는다', () => {
    expect(render()).toContain(`${ptToMm(193.5).toFixed(1)}mm`);
  });

  it('A4 세로로 인쇄하도록 지정한다', () => {
    expect(render()).toContain('size: A4 portrait');
  });

  it('Pretendard를 쓴다', () => {
    // 사용자 상시 지침
    expect(render()).toContain('Pretendard');
  });
});

describe('서식 항목 재현', () => {
  const html = render();

  it('제목과 현장명을 넣는다', () => {
    expect(html).toContain('TBM 및 일일안전교육 일지');
    expect(html).toContain(names.siteName);
  });

  it('결재란을 설정된 칸 수대로 그린다', () => {
    expect(html).toContain('공사팀');
    expect(html).toContain('안전팀');
    expect(html).toContain('현장대리인');
  });

  it('기본정보 칸을 채운다', () => {
    expect(html).toContain('국토안전관리원 점검대비 현장정비');
    expect(html).toContain('굴착기(002거6010)');
    expect(html).toContain('3명');
  });

  it('일일 안전교육 3개 항목을 체크 표시로 그린다', () => {
    expect(html).toContain('■ 작업공법의 이해');
    expect(html).toContain('■ 시공상세도면에 따른 세부 시공순서');
  });

  it('선택하지 않은 항목은 빈 상자로 그린다', () => {
    const partial = render({ dailyEducation: { method: true, sequence: false, precautions: false } });
    expect(partial).toContain('□ 시공상세도면에 따른 세부 시공순서');
  });

  it('조치여부를 예/아니오로 표시한다', () => {
    expect(html).toContain('예 ■');
  });

  it('참석자를 이름·서명 3쌍 구조로 그린다', () => {
    expect(html).toContain('김○○');
    expect(html).toContain('att-sign');
  });

  it('진행자를 표시한다', () => {
    expect(html).toContain('진행자 : 천○○');
  });
});

describe('법적 근거 표시', () => {
  const html = render();

  it('조문을 대조하지 않은 근거에 미대조를 명시한다', () => {
    // 없는 근거를 지어내거나 확인된 것처럼 보이게 하지 않는다
    expect(html).toContain('건설기술진흥법 제65조, 시행령 제103조 — 조문 미대조');
    expect(html).toContain('고용노동부고시 제2023-63호');
    expect(html).toContain('고시 내 조문 미대조');
  });
});

describe('주의가 필요한 상태 표시', () => {
  it('중점위험을 눈에 띄게 표시한다', () => {
    expect(render()).toContain('[중점]');
  });

  it('미조치 대책을 본문에 함께 적는다', () => {
    const html = render({
      hazards: [
        {
          description: '개구부 추락',
          control: '덮개 설치',
          actionTaken: false,
          pendingAction: '오후 자재 반입 후 즉시 설치',
          isCritical: false,
        },
      ],
    });
    expect(html).toContain('※ 미조치 대책: 오후 자재 반입 후 즉시 설치');
  });

  it('건강상태 이상자를 구분해 표시한다', () => {
    const html = render({
      attendees: [
        {
          workerId: 'w_001',
          attended: true,
          healthStatus: '이상있음',
          healthNote: '감기 증세',
          ppeConfirmed: true,
        },
      ],
    });
    expect(html).toContain('att-name abnormal');
  });

  it('초안이면 미확정 문서임을 밝힌다', () => {
    expect(render({ status: 'draft' })).toContain('미확정 문서');
  });

  it('확정 후 수정 횟수를 밝힌다', () => {
    const html = render({
      status: 'confirmed',
      amendments: [
        { at: '2026-09-17T10:00:00+09:00', actor: 'u_kim', reason: '장소 정정', changedFields: ['location'] },
      ],
    });
    expect(html).toContain('확정 후 1회 수정됨');
  });
});

describe('입력값 처리', () => {
  it('HTML 특수문자를 escape 한다', () => {
    const html = render({ workName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('위험요인이 적으면 빈 줄을 남겨 손으로 채울 수 있게 한다', () => {
    const html = render();
    // 서식에 위험요인 칸이 3줄 있다
    expect(html.match(/예 □&nbsp;&nbsp;아니오 □/g)?.length).toBe(2);
  });

  it('날짜를 한글 요일과 함께 표기한다', () => {
    expect(formatDateKo('2026-09-17')).toBe('2026년 9월 17일 목요일');
  });
});
