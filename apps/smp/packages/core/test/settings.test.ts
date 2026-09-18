import { describe, expect, it } from 'vitest';
import {
  MAX_APPROVAL_SLOTS,
  defaultDocumentSettings,
  slotWidthPt,
  validateApprovalBlock,
} from '../src/settings.js';

const slot = (id: string, title: string, order: number) => ({
  id,
  title,
  order,
  required: false,
});

describe('결재란 설정', () => {
  it('기본값은 공사팀·안전팀·현장대리인 3칸이다', () => {
    const block = defaultDocumentSettings().approvalBlocks['daily.tbm'];
    expect(block?.slots.map((s) => s.title)).toEqual(['공사팀', '안전팀', '현장대리인']);
  });

  it('6칸을 넘기면 거부한다 — A4 폭을 벗어나 인쇄가 깨진다', () => {
    const block = {
      label: '담당자',
      position: 'top-right' as const,
      slots: Array.from({ length: MAX_APPROVAL_SLOTS + 1 }, (_, i) =>
        slot(`s${i}`, `직위${i}`, i),
      ),
    };
    const result = validateApprovalBlock(block);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/인쇄가 깨집니다/);
  });

  it('칸이 하나도 없으면 거부한다', () => {
    const result = validateApprovalBlock({ label: '담당자', position: 'bottom', slots: [] });
    expect(result.ok).toBe(false);
  });

  it('직위명이 비면 거부한다', () => {
    const result = validateApprovalBlock({
      label: '담당자',
      position: 'bottom',
      slots: [slot('s1', '   ', 1)],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/직위명이 비어/);
  });

  it('id나 순서가 겹치면 거부한다', () => {
    const dupId = validateApprovalBlock({
      label: '담당자',
      position: 'bottom',
      slots: [slot('s1', '공사팀', 1), slot('s1', '안전팀', 2)],
    });
    expect(dupId.ok).toBe(false);

    const dupOrder = validateApprovalBlock({
      label: '담당자',
      position: 'bottom',
      slots: [slot('s1', '공사팀', 1), slot('s2', '안전팀', 1)],
    });
    expect(dupOrder.ok).toBe(false);
  });

  it('칸 수로 폭을 균등 분할한다', () => {
    expect(slotWidthPt(3)).toBeCloseTo(64.5, 1);
    expect(slotWidthPt(1)).toBeCloseTo(193.5, 1);
  });
});
