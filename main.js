// 主进程：负责窗口、计时器、数据存储。页面（renderer）只负责显示。
const { app, BrowserWindow, ipcMain, Menu, Tray, Notification, screen, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------- 可调参数 ----------
const PET_SIZE = { width: 240, height: 300 };
const PANEL_SIZE = { width: 1040, height: 700 };
const HIDE_PANEL_ON_BLUR = true; // 点到面板外面时，面板自动收起
const SLEEP_AFTER_SEC = 120; // 电脑无操作超过这么多秒，猫就睡着（改这里调整）

const gotLock = app.requestSingleInstanceLock(); // 只允许开一只猫
if (!gotLock) app.quit();
app.setAppUserModelId('com.example.catpet'); // Windows 的系统通知需要

let petWin = null;
let panelWin = null;
let tray = null;
let lastPanelBlurHide = 0;

// ---------- 小工具 ----------
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- 数据存储（一个 JSON 文件） ----------
const dataFile = () => path.join(app.getPath('userData'), 'data.json');
const defaultData = () => ({
  events: [], // { id, date:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM', title, done }
  settings: { focusMin: 25, breakMin: 5 },
  stats: {}, // { 'YYYY-MM-DD': 完成的番茄数 }
});
let data = defaultData();

function loadData() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    const base = defaultData();
    data = { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
  } catch {
    data = defaultData();
  }
}

function saveData() {
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('保存数据失败：', err);
  }
}

// ---------- 通知 / 气泡 ----------
function broadcast(channel, payload) {
  for (const w of [petWin, panelWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

function say(msg) {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:say', msg);
}

// ---------- 番茄钟 ----------
// 注意：记录的是"结束时间点"，而不是每秒减 1，这样电脑休眠后时间也是准的。
const pomo = { mode: 'idle', endsAt: null }; // mode: 'idle' | 'focus' | 'break'
let isSleeping = false; // 电脑久未操作 → 猫睡着（仅在 idle 时生效）

function pomoState() {
  return {
    mode: pomo.mode,
    remainingMs: pomo.endsAt ? Math.max(0, pomo.endsAt - Date.now()) : 0,
    focusMin: data.settings.focusMin,
    breakMin: data.settings.breakMin,
    todayCount: data.stats[dateKey(new Date())] || 0,
    sleeping: isSleeping,
  };
}

function startPomo(kind) {
  const minutes = kind === 'focus' ? data.settings.focusMin : data.settings.breakMin;
  pomo.mode = kind;
  pomo.endsAt = Date.now() + minutes * 60 * 1000;
  broadcast('pomo:update', pomoState());
}

function stopPomo() {
  pomo.mode = 'idle';
  pomo.endsAt = null;
  broadcast('pomo:update', pomoState());
}

// ---------- 日程提醒 ----------
const notified = new Set();
function checkEventReminders() {
  const now = new Date();
  const today = dateKey(now);
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (const ev of data.events) {
    if (ev.date === today && ev.start === hm && !ev.done && !notified.has(ev.id)) {
      notified.add(ev.id);
      notify('日程提醒', `${ev.start}  ${ev.title}`);
      say(`${ev.start} ${ev.title}`);
    }
  }
}

// ---------- 每秒一次的心跳 ----------
function tick() {
  if (pomo.mode !== 'idle' && Date.now() >= pomo.endsAt) {
    if (pomo.mode === 'focus') {
      const k = dateKey(new Date());
      data.stats[k] = (data.stats[k] || 0) + 1;
      saveData();
      notify('专注完成 🍅', `休息 ${data.settings.breakMin} 分钟吧`);
      say('辛苦啦，休息一下～');
      startPomo('break'); // 专注结束自动进入休息
    } else {
      notify('休息结束', '准备好开始下一个番茄了吗？');
      say('休息结束啦！');
      stopPomo();
    }
  } else if (pomo.mode !== 'idle') {
    broadcast('pomo:update', pomoState());
  } else {
    // 空闲时：检测电脑整体无操作时长，决定猫是否睡着
    const sleeping = powerMonitor.getSystemIdleTime() >= SLEEP_AFTER_SEC;
    if (sleeping !== isSleeping) {
      isSleeping = sleeping; // 只在状态变化时广播，避免每秒刷屏
      broadcast('pomo:update', pomoState());
    }
  }
  checkEventReminders();
}

// ---------- 窗口 ----------
function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  petWin = new BrowserWindow({
    width: PET_SIZE.width,
    height: PET_SIZE.height,
    x: workArea.x + workArea.width - PET_SIZE.width - 40,
    y: workArea.y + workArea.height - PET_SIZE.height - 10,
    transparent: true, // 透明背景
    frame: false, // 无边框
    alwaysOnTop: true, // 永远置顶
    skipTaskbar: true, // 不占任务栏
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.loadFile(path.join(__dirname, 'renderer', 'pet.html'));
}

function createPanelWindow() {
  panelWin = new BrowserWindow({
    width: PANEL_SIZE.width,
    height: PANEL_SIZE.height,
    minWidth: 760,
    minHeight: 480,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#fffaf3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWin.loadFile(path.join(__dirname, 'renderer', 'panel.html'));

  // 面板获得焦点时按 F12 打开/关闭开发者工具（调试用）
  panelWin.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') panelWin.webContents.toggleDevTools();
  });

  panelWin.on('blur', () => {
    // DevTools 打开时不自动收起，方便调试
    if (panelWin.webContents.isDevToolsOpened()) return;
    if (HIDE_PANEL_ON_BLUR && panelWin.isVisible()) {
      panelWin.hide();
      lastPanelBlurHide = Date.now();
    }
  });
}

// 把面板放在宠物旁边，并保证不跑出屏幕
function placePanel() {
  const pb = petWin.getBounds();
  const wa = screen.getDisplayMatching(pb).workArea;
  const w = Math.min(PANEL_SIZE.width, wa.width - 20);
  const h = Math.min(PANEL_SIZE.height, wa.height - 20);

  const petOnLeftHalf = pb.x + pb.width / 2 < wa.x + wa.width / 2;
  let x = petOnLeftHalf ? pb.x + pb.width + 8 : pb.x - w - 8;
  x = Math.max(wa.x + 10, Math.min(x, wa.x + wa.width - w - 10));
  let y = pb.y + pb.height - h;
  y = Math.max(wa.y + 10, Math.min(y, wa.y + wa.height - h - 10));

  panelWin.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
}

function togglePanel() {
  if (panelWin.isVisible()) {
    panelWin.hide();
    return;
  }
  // 面板打开时点宠物：鼠标按下会先让面板失焦收起，这里避免松开后又立刻弹出来
  if (Date.now() - lastPanelBlurHide < 800) return;
  placePanel();
  panelWin.show();
  panelWin.focus();
}

// ---------- 开机自启 ----------
// Windows 下 setLoginItemSettings 会把"当前这个 exe"写进开机启动项。
// 注意：开发时用 npm start 跑的是 electron.exe，自启意义不大；
// 打包成 exe 安装后，这个开关才真正有效。
function isAutoLaunch() {
  return app.getLoginItemSettings().openAtLogin;
}
function setAutoLaunch(on) {
  app.setLoginItemSettings({ openAtLogin: on });
  if (tray) tray.setContextMenu(buildMenu()); // 刷新托盘菜单里的勾选状态
}

// ---------- 右键菜单 / 托盘 ----------
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: '打开 / 收起日程面板', click: togglePanel },
    { type: 'separator' },
    { label: '开始专注', click: () => startPomo('focus') },
    { label: '开始休息', click: () => startPomo('break') },
    { label: '停止计时', click: stopPomo },
    { type: 'separator' },
    { label: '开机自启动', type: 'checkbox', checked: isAutoLaunch(), click: (item) => setAutoLaunch(item.checked) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('桌面猫咪');
  tray.setContextMenu(buildMenu());
  tray.on('click', togglePanel);
}

// ---------- IPC：宠物拖拽 ----------
// 用"鼠标当前的屏幕坐标"来算窗口位置，比在页面里算增量更稳，高分屏也不容易漂移。
let drag = null;
ipcMain.on('pet:drag-start', () => {
  const cur = screen.getCursorScreenPoint();
  const b = petWin.getBounds();
  drag = { dx: cur.x - b.x, dy: cur.y - b.y, w: b.width, h: b.height };
});
ipcMain.on('pet:drag-move', () => {
  if (!drag) return;
  const cur = screen.getCursorScreenPoint();
  petWin.setBounds({
    x: Math.round(cur.x - drag.dx),
    y: Math.round(cur.y - drag.dy),
    width: drag.w, // 每次都带上宽高，避免 Windows 缩放下窗口越拖越大
    height: drag.h,
  });
});
ipcMain.on('pet:drag-end', () => {
  drag = null;
});
ipcMain.on('pet:click', togglePanel);
ipcMain.on('pet:menu', () => buildMenu().popup({ window: petWin }));
ipcMain.on('panel:hide', () => panelWin.hide());

// ---------- IPC：番茄钟 ----------
ipcMain.handle('pomo:get', () => pomoState());
ipcMain.handle('pomo:start', (_e, kind) => {
  if (kind === 'focus' || kind === 'break') startPomo(kind);
  return pomoState();
});
ipcMain.handle('pomo:stop', () => {
  stopPomo();
  return pomoState();
});
ipcMain.handle('pomo:set', (_e, focusMin, breakMin) => {
  const clamp = (v, fallback) => Math.min(180, Math.max(1, Math.round(Number(v)) || fallback));
  data.settings.focusMin = clamp(focusMin, 25);
  data.settings.breakMin = clamp(breakMin, 5);
  saveData();
  broadcast('pomo:update', pomoState());
  return pomoState();
});

// ---------- IPC：日程 ----------
ipcMain.handle('events:get', () => data.events);
ipcMain.handle('events:save', (_e, events) => {
  data.events = Array.isArray(events) ? events : [];
  saveData();
  return true;
});

// ---------- 启动 ----------
app.whenReady().then(() => {
  if (!gotLock) return;
  loadData();
  createPetWindow();
  createPanelWindow();
  createTray();
  setInterval(tick, 1000);
});

app.on('window-all-closed', () => app.quit());
