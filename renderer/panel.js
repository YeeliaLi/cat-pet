// 面板窗口：周日历（时间格）+ 番茄钟控制 + 今日列表

// ---------- 临时诊断：把任何报错显示在面板底部 ----------
function showFatal(msg) {
  let b = document.getElementById('__err');
  if (!b) {
    b = document.createElement('div');
    b.id = '__err';
    b.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#e0584f;' +
      'color:#fff;font:12px/1.5 sans-serif;padding:8px 12px;white-space:pre-wrap;';
    (document.body || document.documentElement).appendChild(b);
  }
  b.textContent = '面板出错：' + msg;
}
window.addEventListener('error', (e) =>
  showFatal(`${e.message}  (${e.filename || ''}:${e.lineno})`)
);
window.addEventListener('unhandledrejection', (e) =>
  showFatal('Promise: ' + ((e.reason && e.reason.message) || e.reason))
);
if (!window.api) showFatal('window.api 不存在（preload 没加载到面板）');

// 注意：不要写成 const api = window.api
// window.api 是 preload 用 contextBridge 暴露的只读全局变量，
// 再声明一个同名的 const api 会导致整个脚本解析失败（Identifier 'api' already declared）。
const bridge = window.api;

const HOUR_PX = 48; // 每小时的高度，要和 panel.css 里的 --hour 一致
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
const toHM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 一周从周一开始
  return x;
}

let events = []; // { id, date, start, end, title, done }
let weekStart = mondayOf(new Date());
let editing = null; // { ev, isNew }

// ---------- 保存 ----------
async function persist() {
  await bridge.eventsSave(events);
  renderAll();
}

// ---------- 重叠事项的排版 ----------
// 同一天里时间重叠的日程，并排显示（分成几条"车道"）。
function layoutDay(list) {
  const items = list
    .map((e) => {
      const s = toMin(e.start);
      return { e, s, t: Math.max(toMin(e.end), s + 15) };
    })
    .sort((a, b) => a.s - b.s || a.t - b.t);

  const groups = [];
  let group = [];
  let groupEnd = -1;
  for (const it of items) {
    if (group.length && it.s >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -1;
    }
    group.push(it);
    groupEnd = Math.max(groupEnd, it.t);
  }
  if (group.length) groups.push(group);

  for (const g of groups) {
    const laneEnds = [];
    for (const it of g) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.t);
      } else {
        laneEnds[lane] = it.t;
      }
      it.lane = lane;
    }
    for (const it of g) it.lanes = laneEnds.length;
  }
  return items;
}

function hueOf(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// ---------- 渲染：日历 ----------
function renderCalendar() {
  const now = new Date();
  const todayKey = dateKey(now);
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  $('range').textContent =
    `${days[0].getMonth() + 1}/${days[0].getDate()} – ${days[6].getMonth() + 1}/${days[6].getDate()}`;

  // 星期表头
  const heads = $('dayHeads');
  heads.innerHTML = '';
  heads.appendChild(document.createElement('div'));
  days.forEach((d, i) => {
    const h = document.createElement('div');
    h.className = 'head' + (dateKey(d) === todayKey ? ' today' : '');
    const w = document.createElement('span');
    w.textContent = WEEKDAYS[i];
    const n = document.createElement('b');
    n.textContent = d.getDate();
    h.append(w, n);
    heads.appendChild(h);
  });

  // 时间格
  const grid = $('grid');
  grid.innerHTML = '';
  grid.style.height = `${24 * HOUR_PX}px`;

  const timeCol = document.createElement('div');
  for (let h = 0; h < 24; h++) {
    const l = document.createElement('div');
    l.className = 'time-label';
    l.textContent = `${pad(h)}:00`;
    timeCol.appendChild(l);
  }
  grid.appendChild(timeCol);

  days.forEach((d) => {
    const key = dateKey(d);
    const col = document.createElement('div');
    col.className = 'day-col' + (key === todayKey ? ' today' : '');

    // 点空白处 = 在那个时间新建日程（按半小时对齐）
    col.addEventListener('click', (e) => {
      const y = e.clientY - col.getBoundingClientRect().top;
      const startMin = Math.max(0, Math.min(23 * 60 + 30, Math.floor((y / HOUR_PX) * 2) * 30));
      const endMin = Math.min(startMin + 60, 23 * 60 + 59);
      openDialog(
        { id: crypto.randomUUID(), date: key, start: toHM(startMin), end: toHM(endMin), title: '', done: false },
        true
      );
    });

    layoutDay(events.filter((ev) => ev.date === key)).forEach(({ e, s, t, lane, lanes }) => {
      const hue = hueOf(e.title || '');
      const el = document.createElement('div');
      el.className = 'event' + (e.done ? ' done' : '');
      el.style.top = `${(s / 60) * HOUR_PX}px`;
      el.style.height = `${Math.max(20, ((t - s) / 60) * HOUR_PX - 2)}px`;
      el.style.left = `calc(${(lane / lanes) * 100}% + 2px)`;
      el.style.width = `calc(${100 / lanes}% - 4px)`;
      el.style.background = `hsl(${hue} 80% 90%)`;
      el.style.borderLeftColor = `hsl(${hue} 65% 55%)`;

      const time = document.createElement('span');
      time.className = 'et';
      time.textContent = `${e.start}–${e.end}`;
      const name = document.createElement('span');
      name.className = 'en';
      name.textContent = e.title;
      el.append(name, time);

      el.addEventListener('click', (evt) => {
        evt.stopPropagation(); // 不要触发下面的"新建日程"
        openDialog(e, false);
      });
      col.appendChild(el);
    });

    // 当前时间红线
    if (key === todayKey) {
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX}px`;
      col.appendChild(line);
    }

    grid.appendChild(col);
  });
}

// ---------- 渲染：今天列表 ----------
function renderToday() {
  const ul = $('todayList');
  ul.innerHTML = '';
  const list = events
    .filter((e) => e.date === dateKey(new Date()))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '今天没有安排';
    ul.appendChild(li);
    return;
  }

  for (const e of list) {
    const li = document.createElement('li');
    if (e.done) li.className = 'done';
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!e.done;
    cb.addEventListener('change', () => {
      e.done = cb.checked;
      persist();
    });
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = e.start;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = e.title;
    label.append(cb, time, t);
    li.appendChild(label);
    ul.appendChild(li);
  }
}

function renderAll() {
  renderCalendar();
  renderToday();
}

// ---------- 新建 / 编辑弹窗 ----------
function openDialog(ev, isNew) {
  editing = { ev, isNew };
  $('dlgTitle').textContent = isNew ? '新建日程' : '编辑日程';
  $('fTitle').value = ev.title;
  $('fDate').value = ev.date;
  $('fStart').value = ev.start;
  $('fEnd').value = ev.end;
  $('fDone').checked = !!ev.done;
  $('btnDelete').style.display = isNew ? 'none' : '';
  $('dlgError').textContent = '';
  $('dlg').showModal();
  $('fTitle').focus();
}

function dlgError(msg) {
  $('dlgError').textContent = msg;
}

$('evForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('fTitle').value.trim();
  const date = $('fDate').value;
  const start = $('fStart').value;
  const end = $('fEnd').value;
  if (!title) return dlgError('请输入标题');
  if (!date || !start || !end) return dlgError('请填写日期和时间');
  if (toMin(end) <= toMin(start)) return dlgError('结束时间要晚于开始时间');

  Object.assign(editing.ev, { title, date, start, end, done: $('fDone').checked });
  if (editing.isNew) events.push(editing.ev);
  editing = null;
  $('dlg').close();
  await persist();
});

$('btnCancel').addEventListener('click', () => $('dlg').close());

$('btnDelete').addEventListener('click', async () => {
  if (!editing) return;
  const id = editing.ev.id;
  events = events.filter((x) => x.id !== id);
  editing = null;
  $('dlg').close();
  await persist();
});

$('dlg').addEventListener('close', () => {
  editing = null;
});

// ---------- 周切换 ----------
function scrollToHour(h) {
  $('scroll').scrollTop = Math.max(0, h * HOUR_PX);
}

$('prev').addEventListener('click', () => {
  weekStart.setDate(weekStart.getDate() - 7);
  renderAll();
});
$('next').addEventListener('click', () => {
  weekStart.setDate(weekStart.getDate() + 7);
  renderAll();
});
$('today').addEventListener('click', () => {
  weekStart = mondayOf(new Date());
  renderAll();
  scrollToHour(Math.max(0, new Date().getHours() - 1));
});
$('close').addEventListener('click', () => bridge.hidePanel());

// ---------- 番茄钟 ----------
function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function renderPomo(s) {
  const label = { idle: '空闲', focus: '专注中', break: '休息中' }[s.mode];
  $('pomoMode').textContent = label;
  $('pomoMode').className = s.mode;
  $('pomoTime').textContent = fmt(s.mode === 'idle' ? s.focusMin * 60000 : s.remainingMs);
  $('startFocus').textContent = s.mode === 'focus' ? '重新专注' : '开始专注';
  $('stop').disabled = s.mode === 'idle';
  $('todayCount').textContent = `今天已完成 ${s.todayCount} 个番茄 🍅`;
  // 正在输入时不要覆盖用户敲的数字
  if (document.activeElement !== $('focusMin')) $('focusMin').value = s.focusMin;
  if (document.activeElement !== $('breakMin')) $('breakMin').value = s.breakMin;
}

$('startFocus').addEventListener('click', () => bridge.pomoStart('focus').then(renderPomo));
$('startBreak').addEventListener('click', () => bridge.pomoStart('break').then(renderPomo));
$('stop').addEventListener('click', () => bridge.pomoStop().then(renderPomo));

function saveDurations() {
  bridge.pomoSetDurations($('focusMin').value, $('breakMin').value).then(renderPomo);
}
$('focusMin').addEventListener('change', saveDurations);
$('breakMin').addEventListener('change', saveDurations);

// ---------- 启动 ----------
(async function init() {
  try {
    events = await bridge.eventsGet();
    renderAll();
    scrollToHour(7); // 默认先看到早上 7 点
    renderPomo(await bridge.pomoGet());
    bridge.onPomo(renderPomo);
    setInterval(renderCalendar, 60 * 1000); // 每分钟刷新一次"当前时间"红线
  } catch (err) {
    showFatal('启动失败：' + (err && err.message ? err.message : err));
  }
})();
