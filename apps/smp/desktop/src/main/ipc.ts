/**
 * 화면의 요청을 처리한다.
 *
 * 화면은 여기 등록된 것만 부를 수 있다. 목록에 없는 일은 아예 할 수 없다.
 */
import { ipcMain } from 'electron';
import { join } from 'node:path';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

import type { Member } from '@smp/core';
import { paths } from '@smp/sync';
import type { SmpModule } from '@smp/module-sdk';
import {
  attendedCount,
  buildLibrary,
  renderTbmLog,
  suggestFor,
  tbmAmended,
  tbmConfirmed,
  tbmCreated,
  tbmUpdated,
  validateAmendment,
  validateTbm,
  type TbmSession,
} from '@smp/module-daily';

import type { Settings } from './settings.js';
import type { Store } from './store.js';
import type {
  HazardSuggestion,
  ModuleAccessInfo,
  SaveResult,
  StartupState,
  TbmListItem,
  WorkerBrief,
} from '../shared/api.js';

export interface HandlerDeps {
  settings: Settings;
  buildStore(): Store | null;
  startWatching(store: Store): void;
  pickFolder(): Promise<string | null>;
  printToPdf(html: string, outPath: string): Promise<string>;
  modules: SmpModule[];
  helpers: {
    declaredAccess(member: Member, moduleId: string): 'none' | 'read' | 'write';
    probeModules(options: { root: string; member: Member; modules: string[] }): {
      moduleId: string;
      declared: 'none' | 'read' | 'write';
      actual: 'none' | 'read' | 'write';
      mismatch: { message: string } | null;
    }[];
    visibleModules(access: { declared: string; actual: string; moduleId: string }[]): string[];
  };
}

let store: Store | null = null;

export function registerHandlers(deps: HandlerDeps): void {
  const ensureStore = (): Store => {
    if (!store) {
      store = deps.buildStore();
      if (!store) throw new Error('동기화 폴더가 설정되지 않았습니다.');
      deps.startWatching(store);
    }
    return store;
  };

  ipcMain.handle('smp:startup', (): StartupState => {
    const { syncRoot, userId } = deps.settings.value;
    if (!syncRoot) {
      return { configured: false, syncRoot: null, site: null, access: [], issues: [] };
    }

    store = deps.buildStore();
    if (!store) {
      return { configured: false, syncRoot, site: null, access: [], issues: [] };
    }
    deps.startWatching(store);

    const manifest = store.manifest();
    const members = store.members();
    const member = members.find((m) => m.userId === userId) ?? members[0] ?? null;
    const site = store.site();

    const moduleIds = manifest?.modules ?? deps.modules.map((m) => m.id);
    const access: ModuleAccessInfo[] = member
      ? deps.helpers
          .probeModules({ root: syncRoot, member, modules: moduleIds })
          .map((a) => ({
            moduleId: a.moduleId,
            label: deps.modules.find((m) => m.id === a.moduleId)?.name ?? a.moduleId,
            declared: a.declared,
            actual: a.actual,
            warning: a.mismatch?.message ?? null,
          }))
      : [];

    return {
      configured: Boolean(manifest && member && site),
      syncRoot,
      site: manifest && member && site ? { site, modules: moduleIds, member } : null,
      access,
      issues: store.issues.map((i) => i.message),
    };
  });

  ipcMain.handle('smp:chooseSyncRoot', async (): Promise<string | null> => {
    const picked = await deps.pickFolder();
    if (picked) {
      deps.settings.update({ syncRoot: picked });
      store = null;
    }
    return picked;
  });

  ipcMain.handle('smp:listCompanies', () => ensureStore().companies());
  ipcMain.handle('smp:listWorkTypes', () => ensureStore().workTypes());

  ipcMain.handle('smp:listWorkers', (_e, companyId: string): WorkerBrief[] => {
    const s = ensureStore();
    // 인원 명부는 모듈 폴더의 roster.json 에서 온다.
    // 관리자가 해당 업무에 필요한 인원만 배포한 것이다.
    const rosterPath = join(s.root, 'daily', 'roster.json');
    if (!existsSync(rosterPath)) return [];
    try {
      const roster = JSON.parse(readFileSync(rosterPath, 'utf8')) as {
        workers: { id: string; name: string; companyId: string; jobTitle?: string }[];
      };
      return roster.workers
        .filter((w) => w.companyId === companyId)
        .map((w) => ({ id: w.id, name: w.name, ...(w.jobTitle ? { jobTitle: w.jobTitle } : {}) }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('smp:listTbm', (_e, yearMonth: string): TbmListItem[] => {
    const s = ensureStore();
    const companies = new Map(s.companies().map((c) => [c.id, c.name]));

    return [...s.tbmState.values()]
      .filter((t) => t.date.startsWith(yearMonth))
      .sort((a, b) => b.date.localeCompare(a.date) || b.startAt.localeCompare(a.startAt))
      .map((t) => ({
        id: t.id,
        date: t.date,
        startAt: t.startAt,
        endAt: t.endAt,
        companyName: companies.get(t.companyId) ?? t.companyId,
        workName: t.workName,
        attendedCount: attendedCount(t),
        hazardCount: t.hazards.length,
        pendingCount: t.hazards.filter((h) => !h.actionTaken).length,
        status: t.status,
        amended: t.amendments.length,
      }));
  });

  ipcMain.handle('smp:getTbm', (_e, id: string) => ensureStore().tbmState.get(id) ?? null);

  ipcMain.handle('smp:saveTbm', (_e, session: TbmSession): SaveResult => {
    const s = ensureStore();
    const existing = s.tbmState.get(session.id);
    const actor = { userId: deps.settings.value.userId ?? 'unknown', deviceId: s.deviceId };
    const base = { actor, lamport: s.nextLamport(), siteId: session.siteId };

    // 확정된 기록은 초안 저장으로 덮지 않는다
    if (existing?.status === 'confirmed') {
      return {
        ok: false,
        blocking: [
          {
            field: 'status',
            message: '확정된 기록입니다. 수정하려면 사유를 적고 수정 기능을 쓰십시오.',
          },
        ],
        warnings: [],
      };
    }

    s.append('daily', existing ? tbmUpdated(base, session.id, session) : tbmCreated(base, session));

    const result = validateTbm(session);
    return { ok: true, blocking: [], warnings: result.warnings };
  });

  ipcMain.handle('smp:confirmTbm', (_e, id: string): SaveResult => {
    const s = ensureStore();
    const session = s.tbmState.get(id);
    if (!session) {
      return { ok: false, blocking: [{ field: 'id', message: '기록을 찾을 수 없습니다.' }], warnings: [] };
    }

    const result = validateTbm(session);
    if (!result.canConfirm) {
      return { ok: false, blocking: result.blocking, warnings: result.warnings };
    }

    const actor = { userId: deps.settings.value.userId ?? 'unknown', deviceId: s.deviceId };
    s.append('daily', tbmConfirmed({ actor, lamport: s.nextLamport(), siteId: session.siteId }, id));
    return { ok: true, blocking: [], warnings: result.warnings };
  });

  ipcMain.handle(
    'smp:amendTbm',
    (_e, id: string, patch: Partial<TbmSession>, reason: string): SaveResult => {
      const s = ensureStore();
      const session = s.tbmState.get(id);
      if (!session) {
        return { ok: false, blocking: [{ field: 'id', message: '기록을 찾을 수 없습니다.' }], warnings: [] };
      }

      const check = validateAmendment(reason);
      if (!check.canConfirm) return { ok: false, blocking: check.blocking, warnings: [] };

      const actor = { userId: deps.settings.value.userId ?? 'unknown', deviceId: s.deviceId };
      s.append(
        'daily',
        tbmAmended({ actor, lamport: s.nextLamport(), siteId: session.siteId }, id, patch, reason),
      );
      return { ok: true, blocking: [], warnings: [] };
    },
  );

  ipcMain.handle('smp:suggestHazards', (_e, workTypeCode: string): HazardSuggestion[] => {
    const library = loadHazardLibrary();
    if (!library) return [];
    return suggestFor(library, workTypeCode).map((h) => ({
      id: h.id,
      task: h.task,
      hazard: h.hazard,
      // 대책은 가장 앞선 것(제거에 가까운 것)을 기본으로 제시한다
      control: h.controls[0]?.text ?? '',
      legalBasis: h.legalBasis,
      legalBasisVerified: h.legalBasisVerified,
    }));
  });

  ipcMain.handle('smp:exportTbm', async (_e, id: string) => {
    const s = ensureStore();
    const session = s.tbmState.get(id);
    if (!session) return null;

    const companies = new Map(s.companies().map((c) => [c.id, c.name]));
    const workTypes = new Map(s.workTypes().map((w) => [w.id, w.name]));
    const site = s.site();

    const html = renderTbmLog({
      session,
      names: {
        siteName: site?.name ?? '',
        contractorName: site?.contractor ?? '',
        companyName: companies.get(session.companyId) ?? '',
        workTypeName: workTypes.get(session.workTypeId) ?? '',
        workerNames: {},
      },
    });

    const out = join(paths(s.root).adminExports, `TBM일지-${session.date}-${session.id}.pdf`);
    await deps.printToPdf(html, out);
    return { path: out };
  });
}

/** 위험요인 사전은 프로그램에 내장 배포된다 */
let libraryCache: ReturnType<typeof buildLibrary> | null = null;

function loadHazardLibrary(): ReturnType<typeof buildLibrary> | null {
  if (libraryCache) return libraryCache;
  try {
    const dir = join(process.resourcesPath ?? '.', 'hazard-library', 'hazards');
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
    libraryCache = buildLibrary(files);
    return libraryCache;
  } catch {
    return null;
  }
}
