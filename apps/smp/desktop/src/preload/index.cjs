/**
 * 창구(preload).
 *
 * 화면에는 Node 권한이 없다. 화면이 본체에 부탁할 수 있는 일은 아래 목록이
 * 전부다. 목록에 없는 일은 화면에서 아예 시도할 수 없다.
 *
 * sandbox:true 인 창의 preload는 CommonJS 여야 하므로 이 파일만 .cjs 로 둔다.
 * (TypeScript 빌드 대상이 아니라 그대로 복사된다.)
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('smp', {
  startup: () => call('smp:startup'),
  chooseSyncRoot: () => call('smp:chooseSyncRoot'),

  listCompanies: () => call('smp:listCompanies'),
  listWorkTypes: () => call('smp:listWorkTypes'),
  listWorkers: (companyId) => call('smp:listWorkers', companyId),

  listTbm: (yearMonth) => call('smp:listTbm', yearMonth),
  getTbm: (id) => call('smp:getTbm', id),
  saveTbm: (session) => call('smp:saveTbm', session),
  confirmTbm: (id) => call('smp:confirmTbm', id),
  amendTbm: (id, patch, reason) => call('smp:amendTbm', id, patch, reason),

  suggestHazards: (workTypeCode) => call('smp:suggestHazards', workTypeCode),

  exportTbm: (id) => call('smp:exportTbm', id),

  /**
   * 다른 PC의 기록이 동기화되어 들어왔을 때 알려 준다.
   * 본체가 보내는 값만 전달하고, 이벤트 객체 자체는 넘기지 않는다.
   */
  onChanged: (handler) => {
    const listener = (_event, moduleId) => handler(String(moduleId));
    ipcRenderer.on('smp:changed', listener);
    return () => ipcRenderer.removeListener('smp:changed', listener);
  },
});
