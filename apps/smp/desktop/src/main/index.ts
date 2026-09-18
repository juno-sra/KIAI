/**
 * Electron 본체.
 *
 * 파일시스템 접근은 전부 여기에 둔다. 화면(renderer)에는 Node 권한을 주지
 * 않는다. 화면이 열어 볼 수 있는 것은 preload가 열어 준 창구뿐이다.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { declaredAccess, probeModules, visibleModules } from '@smp/sync';
import { dailyModule } from '@smp/module-daily';

import { Settings } from './settings.js';
import { Store } from './store.js';
import { FolderWatcher } from './watcher.js';
import { registerHandlers } from './ipc.js';

const here = dirname(fileURLToPath(import.meta.url));

let window: BrowserWindow | null = null;
let watcher: FolderWatcher | null = null;

const settings = new Settings(join(app.getPath('userData')));

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'SMP — 안전관리 프로그램',
    backgroundColor: '#f5f6f8',
    webPreferences: {
      // 화면에 Node 권한을 주지 않는다
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(here, '..', 'preload', 'index.cjs'),
    },
  });

  window.loadFile(join(here, '..', 'renderer', 'index.html'));

  // 바깥 링크는 기본 브라우저로 — 앱 창이 엉뚱한 페이지로 바뀌지 않게 한다
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  window.on('closed', () => {
    window = null;
  });
}

function buildStore(): Store | null {
  const { syncRoot, deviceId } = settings.value;
  if (!syncRoot) return null;
  const store = new Store(syncRoot, deviceId);
  store.refresh('daily');
  return store;
}

function startWatching(store: Store): void {
  watcher?.stop();
  const modules = store.manifest()?.modules ?? ['daily'];
  watcher = new FolderWatcher(store.root, modules, (moduleId) => {
    store.refresh(moduleId);
    // 화면에 "새 기록이 도착했다"고 알린다
    window?.webContents.send('smp:changed', moduleId);
  });
  watcher.start();
}

app.whenReady().then(() => {
  registerHandlers({
    settings,
    buildStore,
    startWatching,
    pickFolder: async () => {
      if (!window) return null;
      const result = await dialog.showOpenDialog(window, {
        title: '동기화 폴더를 선택하십시오 (OneDrive 안의 폴더)',
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    printToPdf: async (html: string, outPath: string) => {
      // 화면과 같은 엔진으로 인쇄한다. 미리보기와 출력물이 어긋나지 않는다.
      const printer = new BrowserWindow({ show: false });
      try {
        await printer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdf = await printer.webContents.printToPDF({
          printBackground: true,
          // CSS의 @page 설정을 그대로 따른다
          preferCSSPageSize: true,
        });
        const { writeFileSync } = await import('node:fs');
        writeFileSync(outPath, pdf);
        return outPath;
      } finally {
        printer.destroy();
      }
    },
    modules: [dailyModule],
    helpers: { declaredAccess, probeModules, visibleModules },
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  watcher?.stop();
  if (process.platform !== 'darwin') app.quit();
});
