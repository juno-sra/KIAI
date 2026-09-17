/**
 * 위험요인 표준 사전 연동.
 *
 * `data/hazard-library/` 의 데이터를 읽어 TBM 작성 시 후보로 제시한다.
 * 사전은 **참고용 체크리스트이지 법정 위험성평가 결과가 아니다.**
 */
import type { Hazard } from '@smp/core';

export interface HazardLibrary {
  /** 공종 코드 → 위험요인 목록 */
  byWorkType: Map<string, Hazard[]>;
  all: Hazard[];
}

export const HAZARD_LIBRARY_DISCLAIMER =
  '이 목록은 참고용이며 법정 위험성평가 결과가 아닙니다. ' +
  '산업안전보건법 제36조의 위험성평가는 해당 사업장의 실제 작업을 대상으로 실시해야 하며, ' +
  '현장 고유의 위험요인은 직접 확인해 추가해야 합니다.';

interface RawFile {
  schemaVersion: number;
  workTypeCode: string;
  hazards: Hazard[];
}

/** 파일 내용(파싱된 JSON)들을 받아 사전을 구성한다 */
export function buildLibrary(files: RawFile[]): HazardLibrary {
  const byWorkType = new Map<string, Hazard[]>();
  const all: Hazard[] = [];

  for (const file of files) {
    const list = file.hazards.map((h) => ({ ...h, workTypeCode: file.workTypeCode }));
    const existing = byWorkType.get(file.workTypeCode) ?? [];
    byWorkType.set(file.workTypeCode, [...existing, ...list]);
    all.push(...list);
  }

  return { byWorkType, all };
}

/** 공종에 해당하는 위험요인 + 전 공종 공통 */
export function suggestFor(library: HazardLibrary, workTypeCode: string): Hazard[] {
  const specific = library.byWorkType.get(workTypeCode) ?? [];
  const common = workTypeCode === 'COMMON' ? [] : (library.byWorkType.get('COMMON') ?? []);
  return [...specific, ...common];
}

export function findById(library: HazardLibrary, id: string): Hazard | undefined {
  return library.all.find((h) => h.id === id);
}

/** 검색 — 위험요인 내용, 작업 단계, 검색어로 찾는다 */
export function search(library: HazardLibrary, query: string): Hazard[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return library.all.filter((h) => {
    const haystack = [h.hazard, h.task, ...(h.keywords ?? [])].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * 조문을 원문과 대조하지 않은 항목.
 * 화면과 출력물에 '조문 미대조'로 표시해야 한다.
 */
export function unverifiedCount(library: HazardLibrary): number {
  return library.all.filter((h) => !h.legalBasisVerified).length;
}
