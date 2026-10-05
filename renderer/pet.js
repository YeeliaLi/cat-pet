// 宠物窗口：显示猫、气泡，区分"点击"和"拖拽"

// 换成你自己的终稿：把图片放进 assets 文件夹，改这里的文件名即可（PNG / GIF / SVG 都行）
const SPRITES = {
  idle: '../assets/cat-idle.png', // 待机
  focus: '../assets/cat-focus.png', // 专注
  break: '../assets/cat-break.png', // 休息
  sleep: '../assets/cat-sleep.png', // 空闲很久后睡着
};

const catEl = document.getElementById('cat');
const bubbleEl = document.getElementById('bubble');

let mode = null; // 初始为 null，保证第一次渲染一定会设置图片（否则启动时可能不刷新）
let lastState = null;
let saying = false; // 正在显示一条临时消息（提醒等）
let sayTimer = null;

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function showBubble(text) {
  bubbleEl.textContent = text;
  bubbleEl.classList.remove('hidden');
}

function hideBubble() {
  bubbleEl.classList.add('hidden');
}

function render(state) {
  lastState = state;
  // 番茄钟进行时优先显示专注/休息；空闲时，久未操作则睡着，否则普通待机。
  let sprite;
  if (state.mode === 'focus' || state.mode === 'break') sprite = state.mode;
  else sprite = state.sleeping ? 'sleep' : 'idle';

  if (sprite !== mode) {
    mode = sprite;
    catEl.src = SPRITES[mode] || SPRITES.idle;
    catEl.classList.toggle('sleeping', mode === 'sleep'); // 睡着时呼吸更慢（见 pet.css）
  }
  if (saying) return;
  if (state.mode === 'idle') {
    hideBubble(); // 待机和睡着都不显示倒计时气泡
  } else {
    showBubble(`${state.mode === 'focus' ? '🍅' : '☕'} ${fmt(state.remainingMs)}`);
  }
}

window.api.onPomo(render);
window.api.pomoGet().then(render);

window.api.onSay((msg) => {
  saying = true;
  showBubble(msg);
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => {
    saying = false;
    if (lastState) render(lastState);
  }, 6000);
});

// ---------- 点击 vs 拖拽 ----------
// 按下后移动超过 4 像素就算拖拽，否则松开时算一次点击。
let pressing = false;
let dragging = false;
let startX = 0;
let startY = 0;

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  pressing = true;
  dragging = false;
  startX = e.screenX;
  startY = e.screenY;
  window.api.dragStart();
});

window.addEventListener('mousemove', (e) => {
  if (!pressing) return;
  if (!dragging && Math.hypot(e.screenX - startX, e.screenY - startY) > 4) dragging = true;
  if (dragging) window.api.dragMove();
});

window.addEventListener('mouseup', (e) => {
  if (!pressing || e.button !== 0) return;
  pressing = false;
  window.api.dragEnd();
  if (!dragging) window.api.petClick();
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.api.petMenu();
});
