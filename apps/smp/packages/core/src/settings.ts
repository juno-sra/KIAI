/**
 * 문서 설정 — 결재란처럼 현장·회사마다 다른 것을 코드에서 빼낸다.
 */

export interface ApprovalSlot {
  id: string;
  /** 직위명 (예: '공사팀', '안전팀', '현장대리인', '감리') */
  title: string;
  order: number;
  /** 확정 전 이 칸이 채워져야 하는지 */
  required: boolean;
}

export type ApprovalPosition = 'top-right' | 'top-left' | 'bottom';

export interface ApprovalBlock {
  /** 결재란 묶음 제목 (예: '담당자') */
  label: string;
  position: ApprovalPosition;
  slots: ApprovalSlot[];
}

export interface DocumentSettings {
  schemaVersion: number;
  /** 문서 종류별 결재란. 키는 '<모듈>.<문서>' (예: 'daily.tbm') */
  approvalBlocks: Record<string, ApprovalBlock>;
}

/**
 * A4 가로 폭에서 결재란이 차지할 수 있는 최대 칸 수.
 * 실측 서식의 결재란 구역은 약 193.5pt이며, 6칸이면 칸당 32pt로 직위명이 겨우 들어간다.
 * 더 늘리면 인쇄가 깨진다.
 */
export const MAX_APPROVAL_SLOTS = 6;
export const MIN_APPROVAL_SLOTS = 1;

/** 실측값 기준 결재란 구역 폭 (pt) */
export const APPROVAL_BLOCK_WIDTH_PT = 193.5;

export function slotWidthPt(slotCount: number): number {
  if (slotCount < 1) throw new Error('결재란은 최소 1칸이어야 합니다.');
  return APPROVAL_BLOCK_WIDTH_PT / slotCount;
}

export interface ApprovalValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateApprovalBlock(block: ApprovalBlock): ApprovalValidationResult {
  const errors: string[] = [];

  if (block.slots.length < MIN_APPROVAL_SLOTS) {
    errors.push(`결재란은 최소 ${MIN_APPROVAL_SLOTS}칸이어야 합니다.`);
  }
  if (block.slots.length > MAX_APPROVAL_SLOTS) {
    errors.push(
      `결재란은 최대 ${MAX_APPROVAL_SLOTS}칸까지만 만들 수 있습니다. ` +
        `더 늘리면 A4 폭을 넘어 인쇄가 깨집니다.`,
    );
  }

  const ids = new Set<string>();
  for (const slot of block.slots) {
    if (slot.title.trim() === '') errors.push('직위명이 비어 있는 칸이 있습니다.');
    if (ids.has(slot.id)) errors.push(`결재란 id '${slot.id}' 가 중복됩니다.`);
    ids.add(slot.id);
  }

  const orders = block.slots.map((s) => s.order);
  if (new Set(orders).size !== orders.length) {
    errors.push('결재란 순서(order)가 중복됩니다.');
  }

  return { ok: errors.length === 0, errors };
}

/** 현장 초기 설정 시 깔아주는 기본값 — 사용자가 설정 화면에서 바꾼다 */
export function defaultDocumentSettings(): DocumentSettings {
  return {
    schemaVersion: 1,
    approvalBlocks: {
      'daily.tbm': {
        label: '담당자',
        position: 'top-right',
        slots: [
          { id: 'slot_1', title: '공사팀', order: 1, required: false },
          { id: 'slot_2', title: '안전팀', order: 2, required: false },
          { id: 'slot_3', title: '현장대리인', order: 3, required: false },
        ],
      },
    },
  };
}
