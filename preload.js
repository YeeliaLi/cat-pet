// 预加载脚本：把主进程提供的功能，安全地暴露给页面（window.api）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ---- 宠物窗口：拖拽 / 点击 / 右键菜单 ----
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragMove: () => ipcRenderer.send('pet:drag-move'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  petClick: () => ipcRenderer.send('pet:click'),
  petMenu: () => ipcRenderer.send('pet:menu'),
  onSay: (cb) => ipcRenderer.on('pet:say', (_e, msg) => cb(msg)),

  // ---- 番茄钟 ----
  pomoGet: () => ipcRenderer.invoke('pomo:get'),
  pomoStart: (kind) => ipcRenderer.invoke('pomo:start', kind), // 'focus' | 'break'
  pomoStop: () => ipcRenderer.invoke('pomo:stop'),
  pomoSetDurations: (focusMin, breakMin) => ipcRenderer.invoke('pomo:set', focusMin, breakMin),
  onPomo: (cb) => ipcRenderer.on('pomo:update', (_e, state) => cb(state)),

  // ---- 日程 ----
  eventsGet: () => ipcRenderer.invoke('events:get'),
  eventsSave: (events) => ipcRenderer.invoke('events:save', events),

  // ---- 面板 ----
  hidePanel: () => ipcRenderer.send('panel:hide'),
});
