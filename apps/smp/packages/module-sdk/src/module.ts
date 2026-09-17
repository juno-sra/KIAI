/**
 * 모듈 인터페이스.
 *
 * 모듈은 이것만 구현하면 등록된다. 모듈 간 직접 참조는 금지하고, 공유가
 * 필요한 데이터는 공통 마스터를 통해서만 오간다.
 */
import type { SmpEvent } from '@smp/core';

export type MasterRef = 'site' | 'company' | 'worker' | 'workType' | 'hazard';

export interface ModuleRoute {
  /** 화면 경로 (예: '/tbm') */
  path: string;
  /** 좌측 내비게이션 표시명 */
  label: string;
  /** 이 화면을 볼 수 있는 역할 */
  roles: ('admin' | 'writer' | 'viewer')[];
  /** 내비게이션에 표시하지 않고 경로로만 접근 */
  hidden?: boolean;
}

export interface DocumentDef {
  /** 문서 종류 키 (예: 'tbm-log'). 결재란 설정의 키와 맞춘다 */
  kind: string;
  title: string;
  /** 용지 */
  paper: 'A4-portrait' | 'A4-landscape';
}

/**
 * 법정 보존기간 선언.
 *
 * basis에는 근거 조문을 반드시 적는다. 근거가 없으면 '근거 확인 불가'를 적고,
 * 그 문서는 보존기간 자동 안내 대상에서 뺀다. 없는 근거를 지어내지 않는다.
 */
export interface RetentionRule {
  documentKind: string;
  years: number;
  basis: string;
  /** basis가 '근거 확인 불가'이면 true — 화면에 운영 기본값임을 표시한다 */
  isOperationalDefault: boolean;
}

export interface ProjectionDef<S = unknown> {
  name: string;
  initial: () => S;
  reduce: (state: S, event: SmpEvent) => S;
}

export interface SmpModule {
  /** 고유 식별자이자 데이터 폴더명 (예: 'daily') */
  id: string;
  name: string;
  version: string;
  /** 이 모듈이 발행하는 이벤트 type 목록 */
  eventTypes: string[];
  projections: ProjectionDef[];
  routes: ModuleRoute[];
  documents?: DocumentDef[];
  masterRefs?: MasterRef[];
  retention?: RetentionRule[];
  /** 관리자가 roster.json을 배포할 때 어느 범위의 인원을 담을지 */
  rosterScope?: 'all' | 'byCompany' | 'byWorkType';
}

const MODULE_ID_RE = /^[a-z][a-z0-9-]{1,30}$/;

export interface ModuleValidation {
  ok: boolean;
  errors: string[];
}

export function validateModule(mod: SmpModule): ModuleValidation {
  const errors: string[] = [];

  if (!MODULE_ID_RE.test(mod.id)) {
    errors.push(
      `모듈 id '${mod.id}' 는 소문자·숫자·하이픈만 쓸 수 있습니다. 폴더명으로 쓰이기 때문입니다.`,
    );
  }

  for (const type of mod.eventTypes) {
    if (!type.startsWith(`${mod.id}.`)) {
      errors.push(`이벤트 type '${type}' 이 모듈 id '${mod.id}' 로 시작하지 않습니다.`);
    }
  }

  const routePaths = new Set<string>();
  for (const route of mod.routes) {
    if (routePaths.has(route.path)) errors.push(`화면 경로 '${route.path}' 가 중복됩니다.`);
    routePaths.add(route.path);
    if (route.roles.length === 0) errors.push(`화면 '${route.path}' 에 접근 역할이 없습니다.`);
  }

  for (const rule of mod.retention ?? []) {
    if (rule.basis.trim() === '') {
      errors.push(
        `보존기간 규칙 '${rule.documentKind}' 에 근거가 비어 있습니다. ` +
          `근거가 없으면 '근거 확인 불가'라고 적으십시오.`,
      );
    }
    if (rule.basis.includes('근거 확인 불가') && !rule.isOperationalDefault) {
      errors.push(
        `보존기간 규칙 '${rule.documentKind}' 의 근거가 확인되지 않았는데 ` +
          `isOperationalDefault가 false입니다. 법정 기간처럼 보이게 하면 안 됩니다.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export class ModuleRegistry {
  #modules = new Map<string, SmpModule>();

  register(mod: SmpModule): void {
    const validation = validateModule(mod);
    if (!validation.ok) {
      throw new Error(`모듈 '${mod.id}' 등록 실패:\n  - ${validation.errors.join('\n  - ')}`);
    }
    if (this.#modules.has(mod.id)) {
      throw new Error(`모듈 '${mod.id}' 가 이미 등록되어 있습니다.`);
    }
    this.#modules.set(mod.id, mod);
  }

  get(id: string): SmpModule | undefined {
    return this.#modules.get(id);
  }

  all(): SmpModule[] {
    return [...this.#modules.values()];
  }

  /** 이벤트 type으로 담당 모듈을 찾는다 */
  findByEventType(type: string): SmpModule | undefined {
    return this.all().find((m) => m.eventTypes.includes(type));
  }

  ids(): string[] {
    return [...this.#modules.keys()];
  }
}
