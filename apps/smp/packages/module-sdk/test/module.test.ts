import { describe, expect, it } from 'vitest';
import { ModuleRegistry, validateModule, type SmpModule } from '../src/module.js';

const base = (over: Partial<SmpModule> = {}): SmpModule => ({
  id: 'daily',
  name: '일상활동',
  version: '0.1.0',
  eventTypes: ['daily.tbm.created', 'daily.tbm.confirmed'],
  projections: [],
  routes: [{ path: '/tbm', label: 'TBM', roles: ['admin', 'writer', 'viewer'] }],
  ...over,
});

describe('모듈 형식 검사', () => {
  it('폴더명으로 쓸 수 없는 id를 거부한다', () => {
    const result = validateModule(base({ id: 'Daily_Works' }));
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/폴더명으로 쓰이기 때문/);
  });

  it('남의 모듈 이름으로 이벤트를 내는 것을 막는다', () => {
    const result = validateModule(base({ eventTypes: ['education.course.created'] }));
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/시작하지 않습니다/);
  });

  it('화면 경로 중복을 잡는다', () => {
    const result = validateModule(
      base({
        routes: [
          { path: '/tbm', label: 'TBM', roles: ['admin'] },
          { path: '/tbm', label: '중복', roles: ['admin'] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('접근 역할이 없는 화면을 잡는다', () => {
    const result = validateModule(base({ routes: [{ path: '/tbm', label: 'TBM', roles: [] }] }));
    expect(result.ok).toBe(false);
  });
});

describe('보존기간 근거', () => {
  it('근거가 비면 거부한다', () => {
    const result = validateModule(
      base({ retention: [{ documentKind: 'tbm-log', years: 3, basis: '  ', isOperationalDefault: false }] }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/근거 확인 불가.*적으십시오/);
  });

  it('근거가 없는데 법정 기간처럼 표시하려 하면 거부한다', () => {
    // 없는 근거를 지어내거나, 운영 기본값을 법정 기간처럼 보이게 하면 안 된다
    const result = validateModule(
      base({
        retention: [
          { documentKind: 'tbm-log', years: 3, basis: '근거 확인 불가', isOperationalDefault: false },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/법정 기간처럼 보이게 하면 안 됩니다/);
  });

  it('운영 기본값임을 밝히면 통과한다', () => {
    const result = validateModule(
      base({
        retention: [
          { documentKind: 'tbm-log', years: 3, basis: '근거 확인 불가', isOperationalDefault: true },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('법정 근거가 있으면 통과한다', () => {
    const result = validateModule(
      base({
        retention: [
          {
            documentKind: 'education-log',
            years: 3,
            basis: '산업안전보건법 제164조제1항',
            isOperationalDefault: false,
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('모듈 등록', () => {
  it('형식이 틀린 모듈은 등록을 거절한다', () => {
    const registry = new ModuleRegistry();
    expect(() => registry.register(base({ id: 'BAD ID' }))).toThrow(/등록 실패/);
  });

  it('같은 id를 두 번 등록할 수 없다', () => {
    const registry = new ModuleRegistry();
    registry.register(base());
    expect(() => registry.register(base())).toThrow(/이미 등록/);
  });

  it('이벤트 type으로 담당 모듈을 찾는다', () => {
    const registry = new ModuleRegistry();
    registry.register(base());
    registry.register(
      base({ id: 'education', name: '교육훈련', eventTypes: ['education.course.created'] }),
    );

    expect(registry.findByEventType('daily.tbm.created')?.id).toBe('daily');
    expect(registry.findByEventType('education.course.created')?.id).toBe('education');
    expect(registry.findByEventType('없는.이벤트.타입')).toBeUndefined();
  });
});
