import { describe, expect, it } from 'vitest';
import {
  buildTbmState,
  hazardFrequency,
  listByMonth,
  missingDays,
  unresolvedHazards,
} from '../src/tbm/projection.js';
import { tbmAmended, tbmConfirmed, tbmCreated, tbmUpdated } from '../src/tbm/events.js';
import { sampleSession } from './fixtures.js';

const actor = { userId: 'u_kim', deviceId: 'dev_a1' };
const base = (lamport: number) => ({ actor, lamport, siteId: 'site_1' });

describe('TBM 상태 재구성', () => {
  it('작성 → 확정 순서로 상태가 쌓인다', () => {
    const session = sampleSession();
    const state = buildTbmState([
      tbmCreated(base(1), session),
      tbmConfirmed(base(2), session.id),
    ]);
    expect(state.get(session.id)?.status).toBe('confirmed');
  });

  it('확정된 기록은 updated로 덮이지 않는다', () => {
    // 다른 기기의 오래된 이벤트가 뒤늦게 도착해 확정 내용을 바꾸면 안 된다
    const session = sampleSession();
    const state = buildTbmState([
      tbmCreated(base(1), session),
      tbmConfirmed(base(2), session.id),
      tbmUpdated(base(3), session.id, { location: '엉뚱한 장소' }),
    ]);
    expect(state.get(session.id)?.location).toBe('1공구 진입로');
  });

  it('확정 후 수정은 사유와 함께 이력에 남는다', () => {
    const session = sampleSession();
    const state = buildTbmState([
      tbmCreated(base(1), session),
      tbmConfirmed(base(2), session.id),
      tbmAmended(base(3), session.id, { location: '2공구 앞' }, '실제 실시 장소로 정정'),
    ]);

    const result = state.get(session.id);
    expect(result?.location).toBe('2공구 앞');
    expect(result?.amendments).toHaveLength(1);
    expect(result?.amendments[0]?.reason).toBe('실제 실시 장소로 정정');
    expect(result?.amendments[0]?.changedFields).toEqual(['location']);
  });

  it('사유 없이는 수정 이벤트를 만들 수 없다', () => {
    expect(() => tbmAmended(base(3), 'tbm_1', { location: 'x' }, '  ')).toThrow(/사유가 필요/);
  });

  it('이벤트가 뒤섞여 도착해도 결과가 같다', () => {
    // 동기화 폴더에서는 파일이 늦게 도착할 수 있다
    const session = sampleSession();
    const events = [
      tbmCreated(base(1), session),
      tbmUpdated(base(2), session.id, { location: '수정된 장소' }),
      tbmConfirmed(base(3), session.id),
    ];
    const forward = buildTbmState(events);
    const reversed = buildTbmState([...events].reverse());

    expect(reversed.get(session.id)?.location).toBe(forward.get(session.id)?.location);
    expect(reversed.get(session.id)?.status).toBe('confirmed');
  });

  it('같은 기록의 created가 두 번 와도 덮지 않는다', () => {
    const session = sampleSession();
    const state = buildTbmState([
      tbmCreated(base(1), session),
      tbmCreated(base(2), { ...session, location: '두 번째' }),
    ]);
    expect(state.get(session.id)?.location).toBe('1공구 진입로');
  });
});

describe('조회', () => {
  const state = buildTbmState([
    tbmCreated(base(1), sampleSession({ id: 't1', date: '2026-09-01' })),
    tbmCreated(base(2), sampleSession({ id: 't2', date: '2026-09-15' })),
    tbmCreated(base(3), sampleSession({ id: 't3', date: '2026-10-01' })),
  ]);

  it('월별로 모아 날짜순으로 준다', () => {
    expect(listByMonth(state, '2026-09').map((s) => s.id)).toEqual(['t1', 't2']);
  });

  it('작업일 중 기록이 없는 날을 찾아낸다', () => {
    const missing = missingDays(state, ['2026-09-01', '2026-09-02', '2026-09-15']);
    expect(missing).toEqual(['2026-09-02']);
  });

  it('반복되는 위험요인을 빈도순으로 준다', () => {
    // 같은 위험요인이 계속 나오면 근본 대책이 필요하다는 신호다
    const freq = hazardFrequency(state);
    expect(freq[0]?.key).toBe('HZ-EXCV-003');
    expect(freq[0]?.count).toBe(3);
  });

  it('조치되지 않은 위험요인을 모은다', () => {
    const withPending = buildTbmState([
      tbmCreated(
        base(1),
        sampleSession({
          id: 'p1',
          hazards: [
            {
              description: '개구부',
              control: '덮개',
              actionTaken: false,
              pendingAction: '오후 설치',
              isCritical: true,
            },
          ],
        }),
      ),
    ]);
    expect(unresolvedHazards(withPending)).toHaveLength(1);
  });
});
