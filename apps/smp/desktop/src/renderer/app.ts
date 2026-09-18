/**
 * 화면 전체 틀.
 *
 * Electron에서 열면 preload가 넣어 준 window.smp 를 쓰고, 그냥 브라우저에서
 * 열면 시연용 가짜 창구를 쓴다. 화면 코드는 둘을 구분하지 않는다.
 */
import type { Company, WorkType } from '@smp/core';
import type { SmpApi, StartupState, TbmListItem } from '../shared/api.js';
import { button, clear, el, on, todayIso } from './dom.js';
import { TbmEditor } from './editor.js';
import { emptySession, mockApi } from './mock.js';

const api: SmpApi = window.smp ?? mockApi();
const isDemo = window.smp === undefined;

let state: StartupState | null = null;
let companies: Company[] = [];
let workTypes: WorkType[] = [];
let month = todayIso().slice(0, 7);

const root = document.getElementById('app') as HTMLElement;
const view = el('div', { class: 'view' });
const toast = el('div', { class: 'toast', hidden: true });

function notify(message: string, kind: 'ok' | 'warn' = 'ok'): void {
  toast.className = kind === 'warn' ? 'toast toast-warn' : 'toast';
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

function shell(): void {
  clear(root);
  const header = el('header', { class: 'app-header' });
  header.append(
    el('div', { class: 'brand' }, el('strong', { text: 'SMP' }), el('span', { text: '안전관리 프로그램' })),
    el('div', { class: 'site', text: state?.site?.site.name ?? '' }),
  );
  if (isDemo) header.append(el('span', { class: 'badge', text: '시연 모드 — 실제 저장되지 않음' }));

  const nav = el('nav', { class: 'nav' });
  const tabs: [string, () => void][] = [
    ['TBM 일지', () => void showList()],
    ['설정', () => showSettings()],
  ];
  for (const [label, go] of tabs) {
    const tab = button(label, { class: 'tab' });
    on(tab, 'click', go);
    nav.append(tab);
  }

  root.append(header, nav, view, toast);
}

async function showStartup(): Promise<void> {
  state = await api.startup();
  shell();

  if (!state.configured) {
    clear(view);
    const pick = button('동기화 폴더 선택', { class: 'primary' });
    on(pick, 'click', () => {
      void api.chooseSyncRoot().then((path) => {
        if (path) void showStartup();
      });
    });
    view.append(
      el(
        'div',
        { class: 'panel' },
        el('h2', { text: '동기화 폴더를 정하십시오' }),
        el('p', {
          text: 'OneDrive 안에 폴더를 하나 만들고 그 폴더를 지정합니다. 기록은 그 폴더에만 쌓입니다.',
        }),
        el('p', {
          class: 'muted',
          text: '다른 사람에게 보이고 안 보이고는 OneDrive의 폴더 공유 설정으로 정해집니다. 프로그램은 설정이 어긋났을 때 알려 줄 수 있을 뿐, 대신 막아 주지는 못합니다.',
        }),
        pick,
      ),
    );
    return;
  }

  companies = await api.listCompanies();
  workTypes = await api.listWorkTypes();

  for (const item of state.access) {
    if (item.warning) notify(`${item.label}: ${item.warning}`, 'warn');
  }
  for (const issue of state.issues) notify(issue, 'warn');

  await showList();
}

async function showList(): Promise<void> {
  clear(view);

  const picker = el('input', { type: 'month', value: month });
  on(picker, 'change', () => {
    month = picker.value;
    void showList();
  });

  const create = button('새 일지', { class: 'primary' });
  on(create, 'click', () => {
    const session = emptySession();
    session.siteId = state?.site?.site.id ?? session.siteId;
    session.companyId = companies[0]?.id ?? '';
    session.workTypeId = workTypes[0]?.id ?? '';
    void showEditor(session);
  });

  const bar = el('div', { class: 'row bar' }, picker, create);
  const items = await api.listTbm(month);

  const table = el('table', { class: 'list' });
  table.append(
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: '일자' }),
        el('th', { text: '시간' }),
        el('th', { text: '업체' }),
        el('th', { text: '작업명' }),
        el('th', { text: '참석' }),
        el('th', { text: '위험요인' }),
        el('th', { text: '상태' }),
        el('th', { text: '' }),
      ),
    ),
  );

  const tbody = el('tbody');
  for (const item of items) {
    tbody.append(listRow(item));
  }
  table.append(tbody);

  view.append(
    bar,
    items.length > 0
      ? table
      : el('p', { class: 'muted', text: '이 달에 작성된 일지가 없습니다.' }),
  );
}

function listRow(item: TbmListItem): HTMLElement {
  const open = button('열기', { class: 'small' });
  on(open, 'click', () => {
    void api.getTbm(item.id).then((session) => {
      if (session) void showEditor(session);
    });
  });

  return el(
    'tr',
    {},
    el('td', { text: item.date }),
    el('td', { text: `${item.startAt}~${item.endAt}` }),
    el('td', { text: item.companyName }),
    el('td', { text: item.workName }),
    el('td', { text: `${item.attendedCount}명` }),
    el(
      'td',
      { class: item.pendingCount > 0 ? 'warn-cell' : '' },
      // 미조치가 남아 있는 일지는 목록에서 바로 보여야 한다
      `${item.hazardCount}건${item.pendingCount > 0 ? ` (미조치 ${item.pendingCount})` : ''}`,
    ),
    el(
      'td',
      {},
      el('span', {
        class: item.status === 'confirmed' ? 'chip chip-done' : 'chip',
        text: item.status === 'confirmed' ? '확정' : '작성중',
      }),
      item.amended > 0 ? el('span', { class: 'chip chip-amend', text: `수정 ${item.amended}회` }) : null,
    ),
    el('td', {}, open),
  );
}

async function showEditor(session: Parameters<SmpApi['saveTbm']>[0]): Promise<void> {
  clear(view);
  const host = el('div', { class: 'editor' });
  view.append(host);
  const editor = new TbmEditor(
    { api, companies, workTypes, notify, onDone: () => void showList() },
    session,
  );
  await editor.mount(host);
}

function showSettings(): void {
  clear(view);

  const access = el('table', { class: 'list' });
  access.append(
    el(
      'thead',
      {},
      el('tr', {}, el('th', { text: '모듈' }), el('th', { text: '부여된 권한' }), el('th', { text: '실제 접근' }), el('th', { text: '비고' })),
    ),
  );
  const body = el('tbody');
  for (const item of state?.access ?? []) {
    body.append(
      el(
        'tr',
        {},
        el('td', { text: item.label }),
        el('td', { text: item.declared }),
        el('td', { text: item.actual }),
        el('td', { class: item.warning ? 'warn-cell' : '', text: item.warning ?? '일치' }),
      ),
    );
  }
  access.append(body);

  view.append(
    el(
      'div',
      { class: 'panel' },
      el('h2', { text: '동기화 폴더' }),
      el('p', { class: 'mono', text: state?.syncRoot ?? '(미설정)' }),
    ),
    el(
      'div',
      { class: 'panel' },
      el('h2', { text: '모듈 권한 점검' }),
      el('p', {
        class: 'muted',
        text: '부여된 권한과 실제 폴더 접근이 다르면 아래에 표시됩니다. 실제 차단은 OneDrive 폴더 공유 설정으로만 됩니다.',
      }),
      access,
    ),
    el(
      'div',
      { class: 'panel' },
      el('h2', { text: '결재란' }),
      el('p', { class: 'muted', text: '결재란 증감은 다음 작업에서 붙입니다.' }),
    ),
  );
}

api.onChanged(() => {
  // 다른 PC에서 들어온 기록이 있으면 목록을 다시 읽는다
  notify('다른 PC의 기록이 도착했습니다.');
});

void showStartup();
