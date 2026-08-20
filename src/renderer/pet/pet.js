/**
 * 桌宠渲染进程逻辑
 * 拖拽动画、点击反应、双击对话
 */

// ====== 状态管理 ======
const state = {
  currentIdleFile: null,
  currentClickFile: null,
  isPlayingClick: false,
  isPlayingDrag: false,       // 是否正在播放拖拽动画
  clickTimeoutId: null,

  idlePool: [],
  clickPool: [],
  dragAnimPath: null,          // 拖拽动画路径

  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  hasMoved: false,
  dragAnimTriggered: false,    // 是否已触发拖拽动画

  autoIdleTimer: null,
  bubbleTimer: null,
  placeholderAnimId: null,

  config: {
    opacity: 1.0,
    scale: 1.0,
    idleInterval: 15000,
  },

  appPath: { assets: '', projectRoot: '' }
};

// ====== DOM 元素 ======
const elements = {
  container: document.getElementById('pet-container'),
  video: document.getElementById('pet-video'),
  speechBubble: document.getElementById('speech-bubble'),
  bubbleText: document.getElementById('bubble-text'),
  contextMenu: document.getElementById('context-menu'),
};

// ====== 初始化 ======
async function init() {
  await loadConfig();
  await loadAnimations();
  findDragAnimation();
  setupEventListeners();
  setupIpcListeners();
  startIdleAnimation();

  console.log('🐾 DeskLLMPet 就绪',
    `闲置:${state.idlePool.length} 点击:${state.clickPool.length} 拖拽:${state.dragAnimPath ? '✓' : '✗'}`);
}

async function loadConfig() {
  try {
    const [petConfig, animConfig, appPath] = await Promise.all([
      window.petAPI.getPetConfig(),
      window.petAPI.getAnimationConfig(),
      window.petAPI.getAppPath()
    ]);
    state.config = { ...state.config, ...petConfig };
    state.appPath = appPath;
    state._savedIdlePool = animConfig.idlePool || [];
    state._savedClickPool = animConfig.clickPool || [];
  } catch (e) { console.error('加载配置失败:', e); }
}

async function loadAnimations() {
  try {
    const animations = await window.petAPI.getAvailableAnimations();
    const allIdle = animations.idle || [];
    const allClick = animations.click || [];
    const savedIdle = state._savedIdlePool || [];
    const savedClick = state._savedClickPool || [];

    state.idlePool = (savedIdle.length > 0) ? allIdle.filter(a => savedIdle.includes(a.name)) : allIdle;
    state.clickPool = (savedClick.length > 0) ? allClick.filter(a => savedClick.includes(a.name)) : allClick;
    if (state.idlePool.length === 0) state.idlePool = allIdle;
    if (state.clickPool.length === 0) state.clickPool = allClick;

    // 重新查找拖拽动画
    findDragAnimation();

    delete state._savedIdlePool;
    delete state._savedClickPool;
  } catch (e) { console.error('加载动画列表失败:', e); }
}

/**
 * 查找拖拽专用动画（被鼠标拖拽悬空反馈.webm）
 */
function findDragAnimation() {
  // 在所有动画中查找拖拽动画
  const allAnims = [...state.idlePool, ...state.clickPool];
  const dragAnim = allAnims.find(a => /被鼠标拖拽|拖拽悬空/i.test(a.name));
  if (dragAnim) {
    state.dragAnimPath = dragAnim.path;
  } else {
    // 如果扫描结果中没有，尝试直接构造路径
    state.dragAnimPath = 'assets/thumb/被鼠标拖拽悬空反馈.webm';
  }
}

function setupIpcListeners() {
  window.petAPI.onReloadAnimations(async (animConfig) => {
    console.log('🔄 动画配置变更，实时重载');
    state._savedIdlePool = animConfig.idlePool || [];
    state._savedClickPool = animConfig.clickPool || [];
    await loadAnimations();
    if (!state.isPlayingClick && !state.isPlayingDrag) playRandomIdle();
  });

  window.petAPI.onConfigChanged((config) => {
    if (config.scale !== undefined) state.config.scale = config.scale;
    if (config.opacity !== undefined) state.config.opacity = config.opacity;
  });

  window.petAPI.onThemeChanged((theme) => {
    document.body.setAttribute('data-theme', theme);
  });
}

function setupEventListeners() {
  const { container, contextMenu } = elements;

  container.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  container.addEventListener('dblclick', onDoubleClick);
  container.addEventListener('contextmenu', onContextMenu);

  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
  });

  contextMenu.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.menu-item');
    if (!menuItem) return;
    handleMenuAction(menuItem.dataset.action);
    contextMenu.classList.add('hidden');
  });

  elements.video.addEventListener('error', onVideoError);
  document.addEventListener('keydown', onKeyDown);
}

// ====== 拖拽处理 ======

function onMouseDown(e) {
  if (e.button !== 0) return;
  state.isDragging = true;
  state.hasMoved = false;
  state.dragAnimTriggered = false;
  state.dragStartX = e.screenX;
  state.dragStartY = e.screenY;
  e.preventDefault();
}

function onMouseMove(e) {
  if (!state.isDragging) return;
  const deltaX = e.screenX - state.dragStartX;
  const deltaY = e.screenY - state.dragStartY;

  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    // 进入拖拽模式
    if (!state.hasMoved) {
      state.hasMoved = true;
      // 取消单击计时器
      if (state.clickTimeoutId) {
        clearTimeout(state.clickTimeoutId);
        state.clickTimeoutId = null;
      }
      // 触发拖拽动画
      triggerDragAnimation();
    }
    window.petAPI.moveWindow({ deltaX: Math.round(deltaX), deltaY: Math.round(deltaY) });
    state.dragStartX = e.screenX;
    state.dragStartY = e.screenY;
  }
}

function onMouseUp(e) {
  if (!state.isDragging) return;
  state.isDragging = false;

  if (state.hasMoved) {
    // 拖拽结束
    state.isPlayingDrag = false;
    // 恢复闲置动画
    if (!state.isPlayingClick) playRandomIdle();
  } else {
    // 没有移动 → 单击，延迟给双击留窗口
    if (state.clickTimeoutId) clearTimeout(state.clickTimeoutId);
    state.clickTimeoutId = setTimeout(() => {
      state.clickTimeoutId = null;
      handleClick();
    }, 300);
  }
}

// ====== 拖拽动画 ======

function triggerDragAnimation() {
  if (state.isPlayingDrag) return;
  state.isPlayingDrag = true;
  state.dragAnimTriggered = true;

  // 如果正在播放点击动画，优先拖拽动画
  state.isPlayingClick = false;

  const path = state.dragAnimPath;
  if (path) {
    const video = elements.video;
    // 移除之前所有的 ended 监听器
    video.onended = null;
    playVideoOnce(path, () => {
      // 拖拽动画结束后循环播放
      if (state.isPlayingDrag) {
        playVideoOnce(path, () => {
          if (state.isPlayingDrag) playVideo(path, true);
        });
      }
    });
  }
}

// ====== 交互处理 ======

function handleClick() {
  if (state.isPlayingClick || state.isPlayingDrag) return;
  if (state.clickPool.length > 0) {
    playClickAnimation();
  } else {
    shakePet();
  }
  showRandomBubble();
}

function shakePet() {
  const c = elements.container;
  c.style.transition = 'transform 0.1s ease';
  c.style.transform = 'translateX(-5px)';
  setTimeout(() => { c.style.transform = 'translateX(5px)'; }, 100);
  setTimeout(() => { c.style.transform = 'translateX(-3px)'; }, 200);
  setTimeout(() => { c.style.transform = 'translateX(0)'; }, 300);
}

function onDoubleClick(e) {
  e.preventDefault();
  // 取消单击计时器
  if (state.clickTimeoutId) {
    clearTimeout(state.clickTimeoutId);
    state.clickTimeoutId = null;
  }
  window.petAPI.openChat();
  showBubble('正在打开 AI 对话...', 1500);
}

function onContextMenu(e) {
  e.preventDefault();
  const menu = elements.contextMenu;
  const rect = elements.container.getBoundingClientRect();
  let mx = e.clientX - rect.left, my = e.clientY - rect.top;
  if (mx + 170 > rect.width) mx = rect.width - 170;
  if (my + 200 > rect.height) my = rect.height - 200;
  menu.style.left = mx + 'px';
  menu.style.top = my + 'px';
  menu.classList.remove('hidden');
}

function handleMenuAction(action) {
  switch (action) {
    case 'chat': window.petAPI.openChat(); showBubble('🐾 打开对话', 1500); break;
    case 'settings': window.petAPI.openSettings(); showBubble('⚙️ 打开设置', 1500); break;
    case 'hide': window.petAPI.hidePet(); break;
    case 'quit': showBubble('👋 再见！', 1000); setTimeout(() => window.petAPI.quitApp(), 800); break;
  }
}

function onKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
    e.preventDefault(); window.petAPI.hidePet();
  }
  if (e.key === 'Escape') elements.contextMenu.classList.add('hidden');
}

// ====== 动画控制 ======

function startIdleAnimation() {
  playRandomIdle();
  if (state.autoIdleTimer) clearInterval(state.autoIdleTimer);
  state.autoIdleTimer = setInterval(() => {
    if (!state.isPlayingClick && !state.isPlayingDrag) playRandomIdle();
  }, state.config.idleInterval);
}

function playRandomIdle() {
  if (state.idlePool.length === 0) { createPlaceholderAnimation(); return; }
  let idx;
  if (state.idlePool.length === 1) idx = 0;
  else { do { idx = Math.floor(Math.random() * state.idlePool.length); } while (state.idlePool[idx].name === state.currentIdleFile); }
  const anim = state.idlePool[idx];
  state.currentIdleFile = anim.name;
  playVideo(anim.path, true);
}

function playClickAnimation() {
  if (state.clickPool.length === 0) return;
  state.isPlayingClick = true;

  const idx = Math.floor(Math.random() * state.clickPool.length);
  const anim = state.clickPool[idx];
  state.currentClickFile = anim.name;
  playVideo(anim.path, false);

  const video = elements.video;
  const onEnded = () => {
    state.isPlayingClick = false;
    video.removeEventListener('ended', onEnded);
    if (!state.isPlayingDrag) playRandomIdle();
  };
  video.addEventListener('ended', onEnded);

  setTimeout(() => {
    if (state.isPlayingClick) {
      state.isPlayingClick = false;
      video.removeEventListener('ended', onEnded);
      if (!state.isPlayingDrag) playRandomIdle();
    }
  }, 5000);
}

/**
 * 播放视频（循环或单次）
 */
function playVideo(filePath, loop = true) {
  const video = elements.video;
  video.style.display = '';
  const canvas = document.getElementById('placeholder-canvas');
  if (canvas) canvas.style.display = 'none';
  if (state.placeholderAnimId) { cancelAnimationFrame(state.placeholderAnimId); state.placeholderAnimId = null; }

  video.classList.add('switching');
  const fullPath = getAssetPath(filePath);
  video.loop = loop;
  video.src = fullPath;

  video.play().then(() => {
    setTimeout(() => video.classList.remove('switching'), 200);
  }).catch((e) => {
    console.warn('视频播放失败:', filePath, e.message);
    video.classList.remove('switching');
  });
}

/**
 * 播放视频（单次，带回调）- 用于拖拽动画
 */
function playVideoOnce(filePath, onEnded) {
  const video = elements.video;
  video.style.display = '';
  const canvas = document.getElementById('placeholder-canvas');
  if (canvas) canvas.style.display = 'none';
  if (state.placeholderAnimId) { cancelAnimationFrame(state.placeholderAnimId); state.placeholderAnimId = null; }

  video.loop = false;
  const fullPath = getAssetPath(filePath);
  video.src = fullPath;

  const handler = () => {
    video.removeEventListener('ended', handler);
    if (onEnded) onEnded();
  };
  video.addEventListener('ended', handler);

  video.play().catch((e) => {
    console.warn('拖拽动画播放失败:', e.message);
    video.removeEventListener('ended', handler);
    if (onEnded) onEnded();
  });
}

/**
 * 获取 file:// URL（正确处理中文文件名）
 */
function getAssetPath(relativePath) {
  const projectRoot = state.appPath.projectRoot || '';
  const cleanPath = relativePath.replace(/\\/g, '/');
  const lastSlash = cleanPath.lastIndexOf('/');
  const dirPart = lastSlash >= 0 ? cleanPath.substring(0, lastSlash) : '';
  const filePart = lastSlash >= 0 ? cleanPath.substring(lastSlash + 1) : cleanPath;
  const encodedFile = encodeURIComponent(filePart);
  return `file://${projectRoot}/${dirPart}/${encodedFile}`;
}

function onVideoError(e) {
  const video = elements.video;
  const src = video.src || '';
  console.warn('视频加载错误:', decodeURIComponent(src.substring(src.lastIndexOf('/') + 1)));
  if (!src || src === 'file:///' || src === 'file://') {
    createPlaceholderAnimation();
  }
}

// ====== Canvas 占位动画 ======

function createPlaceholderAnimation() {
  const video = elements.video;
  const container = elements.container;
  video.style.display = 'none';

  let canvas = document.getElementById('placeholder-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'placeholder-canvas';
    canvas.width = 200; canvas.height = 200;
    canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    container.insertBefore(canvas, video);
  }
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  let frame = 0;
  if (state.placeholderAnimId) cancelAnimationFrame(state.placeholderAnimId);

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const bounce = Math.sin(frame * 0.1) * 10;
    const bodyY = cy + bounce;
    ctx.fillStyle = '#8a2be2';
    ctx.beginPath(); ctx.arc(cx, bodyY, 50, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - 15, bodyY - 10, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 15, bodyY - 10, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(cx - 15, bodyY - 10, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 15, bodyY - 10, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, bodyY + 5, 20, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#7b2d8e';
    ctx.beginPath(); ctx.arc(cx - 30, bodyY - 45, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 30, bodyY - 45, 15, 0, Math.PI * 2); ctx.fill();
    frame++;
    state.placeholderAnimId = requestAnimationFrame(animate);
  }
  animate();
}

// ====== 气泡 ======

function showBubble(text, duration = 2000) {
  const { speechBubble, bubbleText } = elements;
  bubbleText.textContent = text;
  speechBubble.classList.remove('hidden');
  if (state.bubbleTimer) clearTimeout(state.bubbleTimer);
  state.bubbleTimer = setTimeout(() => speechBubble.classList.add('hidden'), duration);
}

function showRandomBubble() {
  const msgs = ['你好呀！👋', '戳我干嘛~', '嘿嘿 😊', '有什么需要帮忙的吗？', '双击我可以聊天哦！', '🐾 嗷呜~', '我在呢！', '想和我聊天吗？', '❤️', '✨', '💭', '偷偷告诉你，我可以聊 AI 哦', '🤗', '喵~', '汪汪！', '你好！我是 DeskLLMPet', '🌟'];
  showBubble(msgs[Math.floor(Math.random() * msgs.length)], 2000);
}

// ====== 启动 ======
document.addEventListener('DOMContentLoaded', init);
window.petState = state;