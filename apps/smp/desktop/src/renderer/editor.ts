/**
 * TBM 및 일일안전교육 일지 — 작성 화면.
 *
 * 다섯 단계로 나눈다. 서식 한 장을 한 화면에 다 펼치면 새벽 현장에서
 * 빠뜨리는 칸이 생긴다. 단계마다 빠진 것을 그 자리에서 보여 준다.
 *
 * 성명은 화면에만 나타난다. 저장되는 것은 인원 ID뿐이다.
 */
import type { Company, WorkType } from '@smp/core';
import type { TbmHazardItem, TbmSession } from '@smp/module-daily';
import type { HazardSuggestion, SaveResult, SmpApi, WorkerBrief } from '../shared/api.js';
import { button, clear, el, field, input, legalBasis, on, select } from './dom.js';

const STEPS = ['기본사항', '위험요인', '교육사항', '참석자', '확인'] as const;

export interface EditorDeps {
  api: SmpApi;
  companies: Company[];
  workTypes: WorkType[];
  /** 저장 후 목록으로 */
  onDone(): void;
  notify(message: string, kind?: 'ok' | 'warn'): void;
}

export class TbmEditor {
  private step = 0;
  private workers: WorkerBrief[] = [];
  private suggestions: HazardSuggestion[] = [];
  private lastResult: SaveResult | null = null;

  constructor(
    private readonly deps: EditorDeps,
    private session: TbmSession,
  ) {}

  async mount(host: HTMLElement): Promise<void> {
    await this.loadWorkers();
    await this.loadSuggestions();
    this.render(host);
  }

  private async loadWorkers(): Promise<void> {
    this.workers = await this.deps.api.listWorkers(this.session.companyId);
    // 명부에서 빠진 인원이 참석자에 남아 있으면 이름 없이 ID만 보이게 둔다.
    // 조용히 지우면 그 사람이 참석하지 않은 것처럼 되어 기록이 틀어진다.
  }

  private async loadSuggestions(): Promise<void> {
    const workType = this.deps.workTypes.find((w) => w.id === this.session.workTypeId);
    const code = workType?.hazardLibraryCode;
    this.suggestions = code ? await this.deps.api.suggestHazards(code) : [];
  }

  private workerName(id: string): string {
    return this.workers.find((w) => w.id === id)?.name ?? id;
  }

  private render(host: HTMLElement): void {
    clear(host);
    host.append(this.renderSteps(host));

    const body = el('div', { class: 'editor-body' });
    host.append(body);
    this.renderStep(body, host);

    host.append(this.renderFooter(host));
  }

  private renderSteps(host: HTMLElement): HTMLElement {
    const bar = el('ol', { class: 'steps' });
    STEPS.forEach((label, index) => {
      const item = el('li', {
        class: index === this.step ? 'step step-current' : 'step',
        text: `${index + 1}. ${label}`,
      });
      on(item, 'click', () => {
        this.step = index;
        this.render(host);
      });
      bar.append(item);
    });
    return bar;
  }

  private renderFooter(host: HTMLElement): HTMLElement {
    const footer = el('div', { class: 'editor-footer' });

    const back = button('이전', { class: 'ghost' });
    back.disabled = this.step === 0;
    on(back, 'click', () => {
      this.step -= 1;
      this.render(host);
    });

    const next = button('다음', { class: 'primary' });
    next.disabled = this.step === STEPS.length - 1;
    on(next, 'click', () => {
      this.step += 1;
      this.render(host);
    });

    const save = button('임시저장');
    on(save, 'click', () => void this.save(host));

    footer.append(back, save, next);
    return footer;
  }

  private renderStep(body: HTMLElement, host: HTMLElement): void {
    if (this.step === 0) this.renderBasics(body, host);
    else if (this.step === 1) this.renderHazards(body, host);
    else if (this.step === 2) this.renderEducation(body);
    else if (this.step === 3) this.renderAttendees(body, host);
    else this.renderReview(body, host);
  }

  // 1단계 ─ 기본사항
  private renderBasics(body: HTMLElement, host: HTMLElement): void {
    const s = this.session;

    const date = input({ type: 'date', value: s.date });
    on(date, 'change', () => {
      s.date = date.value;
    });

    const startAt = input({ type: 'time', value: s.startAt });
    on(startAt, 'change', () => {
      s.startAt = startAt.value;
    });

    const endAt = input({ type: 'time', value: s.endAt });
    on(endAt, 'change', () => {
      s.endAt = endAt.value;
    });

    const location = input({ value: s.location, placeholder: '예: 지하 1층 코어부' });
    on(location, 'input', () => {
      s.location = location.value;
    });

    const company = select(
      this.deps.companies.map((c) => ({ value: c.id, label: c.name })),
      s.companyId,
    );
    on(company, 'change', () => {
      s.companyId = company.value;
      // 업체가 바뀌면 참석자 명부가 통째로 달라진다. 남겨 두면 남의 업체
      // 근로자가 참석한 것으로 남는다.
      s.attendees = [];
      s.leaderWorkerId = '';
      void this.loadWorkers().then(() => this.render(host));
    });

    const workType = select(
      this.deps.workTypes.map((w) => ({ value: w.id, label: `${w.group} · ${w.name}` })),
      s.workTypeId,
    );
    on(workType, 'change', () => {
      s.workTypeId = workType.value;
      void this.loadSuggestions();
    });

    const leader = select(
      [{ value: '', label: '— 선택 —' }, ...this.workers.map((w) => ({ value: w.id, label: w.name }))],
      s.leaderWorkerId,
    );
    on(leader, 'change', () => {
      s.leaderWorkerId = leader.value;
    });

    const leaderRole = select(
      ['관리감독자', '작업반장', '안전관리자', '기타'].map((r) => ({ value: r, label: r })),
      s.leaderRole,
    );
    on(leaderRole, 'change', () => {
      s.leaderRole = leaderRole.value as TbmSession['leaderRole'];
    });

    const workName = input({ value: s.workName, placeholder: '예: 벽체 철근 조립' });
    on(workName, 'input', () => {
      s.workName = workName.value;
    });

    const description = el('textarea', { rows: 3 });
    description.value = s.workDescription;
    on(description, 'input', () => {
      s.workDescription = description.value;
    });

    const equipment = input({ value: s.equipment.join(', '), placeholder: '쉼표로 구분' });
    on(equipment, 'input', () => {
      s.equipment = equipment.value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    });

    const headcount = input({ type: 'number', min: 0, value: String(s.headcount) });
    on(headcount, 'input', () => {
      s.headcount = Number(headcount.value) || 0;
    });

    body.append(
      el(
        'div',
        { class: 'grid grid-3' },
        field('실시 일자', date),
        field('시작', startAt),
        field('종료', endAt),
      ),
      el(
        'div',
        { class: 'grid grid-2' },
        field('장소', location),
        field('작업명', workName),
        field('업체', company),
        field('공종', workType),
        field('진행자', leader),
        field('진행자 구분', leaderRole),
      ),
      field('작업내용', description),
      el(
        'div',
        { class: 'grid grid-2' },
        field('투입 장비', equipment),
        field('투입 인원(명)', headcount, '참석자 단계에서 실제 참석 인원과 대조한다'),
      ),
    );
  }

  // 2단계 ─ 위험요인 및 안전조치
  private renderHazards(body: HTMLElement, host: HTMLElement): void {
    const s = this.session;

    const picker = el('div', { class: 'panel' });
    picker.append(el('h3', { text: '공종별 위험요인 후보' }));
    if (this.suggestions.length === 0) {
      picker.append(
        el('p', { class: 'muted', text: '이 공종에 연결된 사전 항목이 없습니다. 아래에서 직접 적으십시오.' }),
      );
    }
    for (const item of this.suggestions) {
      const already = s.hazards.some((h) => h.hazardId === item.id);
      const row = el('div', { class: 'suggest' });
      const add = button(already ? '추가됨' : '추가', { class: 'small' });
      add.disabled = already;
      on(add, 'click', () => {
        s.hazards.push({
          hazardId: item.id,
          description: item.hazard,
          control: item.control,
          actionTaken: false,
          isCritical: false,
        });
        this.render(host);
      });
      row.append(
        el(
          'div',
          {},
          el('strong', { text: item.hazard }),
          el('div', { class: 'muted', text: `${item.task} → ${item.control}` }),
          legalBasis(item.legalBasis, item.legalBasisVerified),
        ),
        add,
      );
      picker.append(row);
    }

    const list = el('div', { class: 'panel' });
    list.append(el('h3', { text: `기재된 위험요인 (${s.hazards.length}건)` }));
    s.hazards.forEach((hazard, index) => {
      list.append(this.renderHazardRow(hazard, index, host));
    });

    const add = button('직접 입력 추가');
    on(add, 'click', () => {
      s.hazards.push({ description: '', control: '', actionTaken: false, isCritical: false });
      this.render(host);
    });
    list.append(add);

    body.append(picker, list);
  }

  private renderHazardRow(hazard: TbmHazardItem, index: number, host: HTMLElement): HTMLElement {
    const row = el('div', { class: hazard.isCritical ? 'hazard hazard-critical' : 'hazard' });

    const description = input({ value: hazard.description, placeholder: '잠재위험요소' });
    on(description, 'input', () => {
      hazard.description = description.value;
    });

    const control = input({ value: hazard.control, placeholder: '대책' });
    on(control, 'input', () => {
      hazard.control = control.value;
    });

    const taken = el('input', { type: 'checkbox' });
    taken.checked = hazard.actionTaken;
    on(taken, 'change', () => {
      hazard.actionTaken = taken.checked;
      this.render(host);
    });

    const critical = el('input', { type: 'checkbox' });
    critical.checked = hazard.isCritical;
    on(critical, 'change', () => {
      hazard.isCritical = critical.checked;
      this.render(host);
    });

    const remove = button('삭제', { class: 'small ghost' });
    on(remove, 'click', () => {
      this.session.hazards.splice(index, 1);
      this.render(host);
    });

    row.append(
      el('div', { class: 'grid grid-2' }, field('잠재위험요소', description), field('대책', control)),
      el(
        'div',
        { class: 'row' },
        el('label', { class: 'check' }, taken, el('span', { text: '조치완료' })),
        el('label', { class: 'check' }, critical, el('span', { text: '중점위험' })),
        remove,
      ),
    );

    // 서식에 "※미조치시 대책 기재"가 있다. 조치하지 않았으면 이 칸이 비어 있으면 안 된다.
    if (!hazard.actionTaken) {
      const pending = input({
        value: hazard.pendingAction ?? '',
        placeholder: '미조치 시 대책 (필수)',
        class: (hazard.pendingAction ?? '').trim().length === 0 ? 'need' : '',
      });
      on(pending, 'input', () => {
        hazard.pendingAction = pending.value;
      });
      row.append(field('미조치 시 대책', pending, '조치하지 않았다면 반드시 적어야 확정할 수 있습니다'));
    }

    return row;
  }

  // 3단계 ─ 교육사항
  private renderEducation(body: HTMLElement): void {
    const s = this.session;

    const box = el('div', { class: 'panel' });
    box.append(
      el('h3', { text: '일일 안전교육사항' }),
      el('p', { class: 'muted' }, legalBasis(['건설기술진흥법 제65조', '같은 법 시행령 제103조'], false)),
    );

    const items: { key: keyof Omit<typeof s.dailyEducation, 'note'>; label: string }[] = [
      { key: 'method', label: '작업공법의 이해' },
      { key: 'sequence', label: '시공상세도면에 따른 세부 시공순서' },
      { key: 'precautions', label: '시공기술상의 주의사항' },
    ];
    for (const item of items) {
      const check = el('input', { type: 'checkbox' });
      check.checked = s.dailyEducation[item.key];
      on(check, 'change', () => {
        s.dailyEducation[item.key] = check.checked;
      });
      box.append(el('label', { class: 'check' }, check, el('span', { text: item.label })));
    }

    const note = el('textarea', { rows: 2 });
    note.value = s.dailyEducation.note ?? '';
    on(note, 'input', () => {
      s.dailyEducation.note = note.value;
    });
    box.append(field('비고', note));

    const regular = el('textarea', { rows: 4 });
    regular.value = s.regularEducationNote;
    on(regular, 'input', () => {
      s.regularEducationNote = regular.value;
    });

    const closing = el('textarea', { rows: 3 });
    closing.value = s.closingMeeting ?? '';
    on(closing, 'input', () => {
      s.closingMeeting = closing.value;
    });

    const regularBox = el('div', { class: 'panel' });
    regularBox.append(
      el('h3', { text: '근로자 일일 안전교육사항 [정기안전교육]' }),
      el('p', { class: 'muted' }, legalBasis(['안전보건교육규정(고용노동부고시 제2023-63호)'], false)),
      el('p', {
        class: 'muted',
        text: 'TBM 실시 시간은 정기교육 시간으로 인정될 수 있습니다. 고시 내 세부 조문은 미대조입니다.',
      }),
      regular,
    );

    body.append(
      box,
      regularBox,
      el('div', { class: 'panel' }, el('h3', { text: '작업 후 종료 미팅 — 건의사항·사고사례 전파' }), closing),
    );
  }

  // 4단계 ─ 참석자
  private renderAttendees(body: HTMLElement, host: HTMLElement): void {
    const s = this.session;

    const table = el('table', { class: 'attendees' });
    table.append(
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: '성명' }),
          el('th', { text: '직종' }),
          el('th', { text: '참석' }),
          el('th', { text: '건강상태' }),
          el('th', { text: '보호구' }),
        ),
      ),
    );

    const tbody = el('tbody');
    for (const worker of this.workers) {
      let attendee = s.attendees.find((a) => a.workerId === worker.id);
      if (!attendee) {
        attendee = {
          workerId: worker.id,
          attended: false,
          healthStatus: '이상없음',
          ppeConfirmed: false,
        };
        s.attendees.push(attendee);
      }
      const record = attendee;

      const attended = el('input', { type: 'checkbox' });
      attended.checked = record.attended;
      on(attended, 'change', () => {
        record.attended = attended.checked;
        this.render(host);
      });

      const health = select(
        [
          { value: '이상없음', label: '이상없음' },
          { value: '이상있음', label: '이상있음' },
        ],
        record.healthStatus,
      );
      on(health, 'change', () => {
        record.healthStatus = health.value as typeof record.healthStatus;
        this.render(host);
      });

      const ppe = el('input', { type: 'checkbox' });
      ppe.checked = record.ppeConfirmed;
      on(ppe, 'change', () => {
        record.ppeConfirmed = ppe.checked;
      });

      const healthCell = el('td', {}, health);
      if (record.healthStatus === '이상있음') {
        // 이상이 있다고만 적고 넘어가면 나중에 아무 조치도 확인할 수 없다
        const healthNote = input({
          value: record.healthNote ?? '',
          placeholder: '조치 내용 (필수)',
          class: (record.healthNote ?? '').trim().length === 0 ? 'need' : '',
        });
        on(healthNote, 'input', () => {
          record.healthNote = healthNote.value;
        });
        healthCell.append(healthNote);
      }

      tbody.append(
        el(
          'tr',
          {},
          el('td', { text: worker.name }),
          el('td', { text: worker.jobTitle ?? '' }),
          el('td', {}, attended),
          healthCell,
          el('td', {}, ppe),
        ),
      );
    }
    table.append(tbody);

    const attended = s.attendees.filter((a) => a.attended).length;
    const mismatch = s.headcount > 0 && attended !== s.headcount;

    body.append(
      el('div', { class: 'panel' }, el('h3', { text: '참석자 확인' }), table),
      el('p', {
        class: mismatch ? 'notice notice-warn' : 'notice',
        text: mismatch
          ? `투입 인원 ${s.headcount}명과 참석 ${attended}명이 다릅니다. 확인하십시오.`
          : `참석 ${attended}명`,
      }),
      el('p', {
        class: 'muted',
        text: '서명은 종이 서식에 받습니다. 여기서는 참석 여부만 기록합니다.',
      }),
    );
  }

  // 5단계 ─ 확인
  private renderReview(body: HTMLElement, host: HTMLElement): void {
    const s = this.session;

    const summary = el('div', { class: 'panel' });
    summary.append(el('h3', { text: '작성 내용' }));
    const rows: [string, string][] = [
      ['실시', `${s.date} ${s.startAt}~${s.endAt}`],
      ['장소', s.location],
      ['업체', this.deps.companies.find((c) => c.id === s.companyId)?.name ?? ''],
      ['작업명', s.workName],
      ['진행자', s.leaderWorkerId ? `${this.workerName(s.leaderWorkerId)} (${s.leaderRole})` : ''],
      ['위험요인', `${s.hazards.length}건 (미조치 ${s.hazards.filter((h) => !h.actionTaken).length}건)`],
      ['참석', `${s.attendees.filter((a) => a.attended).length}명 / 투입 ${s.headcount}명`],
    ];
    const table = el('table', { class: 'summary' });
    for (const [label, value] of rows) {
      table.append(el('tr', {}, el('th', { text: label }), el('td', { text: value })));
    }
    summary.append(table);

    const issues = el('div', { class: 'panel' });
    issues.append(el('h3', { text: '검증 결과' }));
    if (!this.lastResult) {
      issues.append(el('p', { class: 'muted', text: '아래 「확정」을 누르면 검사합니다.' }));
    } else {
      for (const item of this.lastResult.blocking) {
        issues.append(
          el('p', { class: 'notice notice-block' }, el('span', { text: `${item.field}: ${item.message}` }),
            item.basis ? legalBasis([item.basis], false) : null),
        );
      }
      for (const item of this.lastResult.warnings) {
        issues.append(
          el('p', { class: 'notice notice-warn' }, el('span', { text: `${item.field}: ${item.message}` }),
            item.basis ? legalBasis([item.basis], false) : null),
        );
      }
      if (this.lastResult.ok) {
        issues.append(el('p', { class: 'notice notice-ok', text: '확정되었습니다.' }));
      }
    }

    const confirm = button('확정', { class: 'primary' });
    on(confirm, 'click', () => void this.confirm(host));

    const exportPdf = button('PDF로 저장');
    on(exportPdf, 'click', () => void this.exportPdf());

    body.append(summary, issues, el('div', { class: 'row' }, confirm, exportPdf));
  }

  private async save(host: HTMLElement): Promise<void> {
    const result = await this.deps.api.saveTbm(this.session);
    this.lastResult = result;
    this.deps.notify(
      result.blocking.length > 0 ? '저장했습니다. 확정 전 보완할 항목이 있습니다.' : '저장했습니다.',
      result.blocking.length > 0 ? 'warn' : 'ok',
    );
    this.render(host);
  }

  private async confirm(host: HTMLElement): Promise<void> {
    // 확정 전에 지금 화면의 내용을 먼저 저장한다. 저장하지 않은 값으로 검사하면
    // 화면에는 채워져 있는데 미기재라고 나온다.
    await this.deps.api.saveTbm(this.session);
    const result = await this.deps.api.confirmTbm(this.session.id);
    this.lastResult = result;
    if (result.ok) {
      this.session.status = 'confirmed';
      this.deps.notify('확정했습니다.', 'ok');
      this.deps.onDone();
      return;
    }
    this.deps.notify('확정하지 못했습니다. 검증 결과를 확인하십시오.', 'warn');
    this.render(host);
  }

  private async exportPdf(): Promise<void> {
    const result = await this.deps.api.exportTbm(this.session.id);
    this.deps.notify(
      result ? `PDF로 저장했습니다: ${result.path}` : 'PDF 저장은 프로그램에서만 됩니다.',
      result ? 'ok' : 'warn',
    );
  }
}
