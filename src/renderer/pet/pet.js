/**
 * 桌宠渲染进程逻辑
 * 拖拽移动、点击反应、API 余额气泡、拖入文件移入回收站
 */

// ====== 状态管理 ======
const state = {
  currentIdleFile: null,
  currentClickFile: null,
  isPlayingClick: false,
  isPlayingDrag: false,       // 是否正在播放拖拽动画

  idlePool: [],
  clickPool: [],
  dragAnimPath: null,          // 拖拽动画路径
  fileDropAnimPath: null,      // 拖入文件动画路径（暂留空，素材补充后自动启用）

  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  hasMoved: false,
  dragAnimTriggered: false,    // 是否已触发拖拽动画

  isFileDragOver: false,       // 是否有文件悬停在桌宠上
  dropHintTimer: null,         // 拖入文件动画结束后的复位计时器

  autoIdleTimer: null,
  balanceTimer: null,
  placeholderAnimId: null,

  balance: {
    enabled: true,
    intervalMinutes: 30,
    fetching: false,           // 是否正在请求余额
    lastText: '',              // 最近一次成功的余额文案
    lastData: null,            // 最近一次成功的余额数据（用于冷却期内重绘卡片）
    lastError: '',             // 最近一次失败文案
    lastOk: false,             // 最近一次是否成功
    lastFetchAt: 0             // 最近一次请求时间（用于避免连续点击刷接口）
  },

  config: {
    opacity: 1.0,
    scale: 1.0,
    idleInterval: 15000,
    confirmTrash: true,
    crop: 0.55,
    cropOffsetX: 0,
    cropOffsetY: 0
  },

  appPath: { assets: '', projectRoot: '' }
};

/** 余额气泡自动展示的初始延迟（毫秒） */
const BALANCE_FIRST_DELAY = 3000;
/** 手动点击触发余额查询的最小间隔（毫秒），避免连点刷接口 */
const BALANCE_MANUAL_COOLDOWN = 5000;

// ====== DOM 元素 ======
const elements = {
  container: document.getElementById('pet-container'),
  video: document.getElementById('pet-video'),
  contextMenu: document.getElementById('context-menu'),
  dropHint: document.getElementById('drop-hint'),
};

// ====== 初始化 ======
async function init() {
  await loadConfig();
  applyCrop();
  await loadAnimations();
  findDragAnimation();
  findFileDropAnimation();
  setupEventListeners();
  setupDragAndDrop();
  setupIpcListeners();
  startIdleAnimation();
  startBalanceTimer();

  // 启动后稍作延迟展示一次余额，让用户确认配置是否生效
  if (state.balance.enabled) {
    setTimeout(() => showBalance({ silent: true }), BALANCE_FIRST_DELAY);
  }

  console.log('🐾 DeskLLMPet 就绪',
    `闲置:${state.idlePool.length} 点击:${state.clickPool.length} 拖拽:${state.dragAnimPath ? '✓' : '✗'}`,
    `窗口裁剪:${Math.round((Number(state.config.crop) || 0.55) * 100)}%`);
}

async function loadConfig() {
  try {
    const [petConfig, animConfig, balanceConfig, appPath] = await Promise.all([
      window.petAPI.getPetConfig(),
      window.petAPI.getAnimationConfig(),
      window.petAPI.getBalanceConfig(),
      window.petAPI.getAppPath()
    ]);
    state.config = { ...state.config, ...petConfig };
    state.appPath = appPath;
    state._savedIdlePool = animConfig.idlePool || [];
    state._savedClickPool = animConfig.clickPool || [];
    state._savedFileDropAnim = animConfig.fileDropAnim || '';
    applyBalanceConfig(balanceConfig);
  } catch (e) { console.error('加载配置失败:', e); }
}

/**
 * 应用「窗口裁剪」设置
 * 动画本身保持原大小（视频尺寸 = 窗口 / 裁剪比例），窗口变小后只显示中间一块，
 * 周围不重要的背景被裁掉；偏移用来选择显示动画的哪个区域
 */
function applyCrop() {
  const crop = clampNumber(state.config.crop, 0.25, 1, 0.55);
  const offsetX = clampNumber(state.config.cropOffsetX, -50, 50, 0);
  const offsetY = clampNumber(state.config.cropOffsetY, -50, 50, 0);
  const container = elements.container;
  if (!container) return;
  container.style.setProperty('--pet-crop', String(crop));
  container.style.setProperty('--pet-offset-x', `${offsetX}%`);
  container.style.setProperty('--pet-offset-y', `${offsetY}%`);
}

/** 数值裁剪，非法值回退默认值 */
function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
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

    // 重新查找拖拽 / 拖入文件动画
    findDragAnimation();
    findFileDropAnimation();

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

/**
 * 查找「拖入文件」专用动画
 * 暂留空：当前素材库中没有对应动画，匹配不到时保持 null（不播放特定动画）
 * 后续把命名为「拖入文件 / 接收文件 / 回收站」等的 .webm 放入 assets/thumb 即可自动启用，
 * 也可以在动画配置里通过 animations.fileDropAnim 指定文件名。
 */
function findFileDropAnimation() {
  const configured = (state._savedFileDropAnim || '').trim();
  const allAnims = [...state.idlePool, ...state.clickPool];

  if (configured) {
    const hit = allAnims.find(a => a.name === configured);
    state.fileDropAnimPath = hit ? hit.path : null;
    return;
  }

  const found = allAnims.find(a => /拖入文件|接收文件|文件回收|回收站|垃圾桶/i.test(a.name));
  state.fileDropAnimPath = found ? found.path : null; // 暂留空
}

/**
 * 应用余额气泡配置并重启定时器
 */
function applyBalanceConfig(config) {
  if (!config) return;
  if (config.enabled !== undefined) state.balance.enabled = !!config.enabled;
  if (config.intervalMinutes !== undefined) {
    const minutes = Number(config.intervalMinutes);
    state.balance.intervalMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 30;
  }
  startBalanceTimer();
}

function setupIpcListeners() {
  window.petAPI.onReloadAnimations(async (animConfig) => {
    console.log('🔄 动画配置变更，实时重载');
    state._savedIdlePool = animConfig.idlePool || [];
    state._savedClickPool = animConfig.clickPool || [];
    state._savedFileDropAnim = animConfig.fileDropAnim || '';
    await loadAnimations();
    if (!state.isPlayingClick && !state.isPlayingDrag) playRandomIdle();
  });

  window.petAPI.onConfigChanged((config) => {
    if (config.scale !== undefined) state.config.scale = config.scale;
    if (config.opacity !== undefined) state.config.opacity = config.opacity;
    if (config.confirmTrash !== undefined) state.config.confirmTrash = config.confirmTrash;
    if (config.crop !== undefined) state.config.crop = config.crop;
    if (config.cropOffsetX !== undefined) state.config.cropOffsetX = config.cropOffsetX;
    if (config.cropOffsetY !== undefined) state.config.cropOffsetY = config.cropOffsetY;
    applyCrop();
  });

  // 余额配置变更（设置页面保存后立即生效）
  window.petAPI.onBalanceConfigChanged((config) => {
    applyBalanceConfig(config);
    // 配置刚被修改，顺手刷新一次让用户看到效果（未启用时忽略）
    if (state.balance.enabled) showBalance();
  });

  // 托盘菜单：立即查看余额
  window.petAPI.onShowBalance(() => {
    showBalance({ force: true });
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
    // 没有移动 → 单击
    handleClick();
  }
}

// ====== 拖拽动画 ======

function triggerDragAnimation() {
  if (state.isPlayingDrag) return;
  state.isPlayingDrag = true;
  state.dragAnimTriggered = true;

  // 如果正在播放点击动画，优先拖拽动画
  state.isPlayingClick = false;

  const animPath = state.dragAnimPath;
  if (animPath) {
    const video = elements.video;
    // 移除之前所有的 ended 监听器
    video.onended = null;
    playVideoOnce(animPath, () => {
      // 拖拽动画结束后循环播放
      if (state.isPlayingDrag) {
        playVideoOnce(animPath, () => {
          if (state.isPlayingDrag) playVideo(animPath, true);
        });
      }
    });
  }
}

/**
 * 播放「拖入文件」专属动画
 * 暂留空：未配置对应素材时不改变当前动画，仅给一次轻微反馈
 * @returns {boolean} 是否播放了专属动画
 */
function playFileDropAnimation() {
  const animPath = state.fileDropAnimPath;
  if (!animPath) {
    // TODO: 拖入文件的专属动画暂留空，素材就绪后放入 assets 即可自动启用
    return false;
  }

  state.isPlayingClick = false;
  state.isPlayingDrag = true;
  playVideoOnce(animPath, () => {
    state.isPlayingDrag = false;
    if (!state.isPlayingClick) playRandomIdle();
  });
  return true;
}

// ====== 交互处理 ======

function handleClick() {
  if (state.isPlayingClick || state.isPlayingDrag) return;
  if (state.clickPool.length > 0) {
    playClickAnimation();
  } else {
    shakePet();
  }

  if (state.balance.enabled) {
    showBalance();
  } else {
    showRandomBubble();
  }
}

function shakePet() {
  const c = elements.container;
  c.style.transition = 'transform 0.1s ease';
  c.style.transform = 'translateX(-5px)';
  setTimeout(() => { c.style.transform = 'translateX(5px)'; }, 100);
  setTimeout(() => { c.style.transform = 'translateX(-3px)'; }, 200);
  setTimeout(() => { c.style.transform = 'translateX(0)'; }, 300);
}

function onContextMenu(e) {
  e.preventDefault();
  const menu = elements.contextMenu;
  const rect = elements.container.getBoundingClientRect();
  let mx = e.clientX - rect.left, my = e.clientY - rect.top;
  if (mx + 170 > rect.width) mx = rect.width - 170;
  if (my + 200 > rect.height) my = rect.height - 200;
  menu.style.left = Math.max(0, mx) + 'px';
  menu.style.top = Math.max(0, my) + 'px';
  menu.classList.remove('hidden');
}

function handleMenuAction(action) {
  switch (action) {
    case 'balance': showBalance({ force: true }); break;
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

// ====== API 余额气泡 ======

/**
 * 启动/重启余额定时展示
 * intervalMinutes = 0 表示不自动展示，仅点击触发
 */
function startBalanceTimer() {
  if (state.balanceTimer) {
    clearInterval(state.balanceTimer);
    state.balanceTimer = null;
  }
  if (!state.balance.enabled) return;
  if (!(state.balance.intervalMinutes > 0)) return;

  const intervalMs = state.balance.intervalMinutes * 60 * 1000;
  state.balanceTimer = setInterval(() => {
    // 正在拖拽/拖入文件时不打扰
    if (state.isDragging || state.isFileDragOver) return;
    showBalance({ silent: true });
  }, intervalMs);
}

/**
 * 展示 API 余额气泡
 * @param {Object} [options]
 * @param {boolean} [options.force] 忽略冷却时间（右键菜单/托盘触发）
 * @param {boolean} [options.silent] 定时触发时，失败不打扰用户
 * @returns {Promise<boolean>} 是否成功取到余额
 */
async function showBalance(options = {}) {
  const { force = false, silent = false } = options;
  if (state.balance.fetching) return false;

  // 冷却期内复用最近一次结果（成功或失败），避免连续点击频繁请求接口
  if (!force && state.balance.lastFetchAt &&
      Date.now() - state.balance.lastFetchAt < BALANCE_MANUAL_COOLDOWN) {
    if (state.balance.lastOk && state.balance.lastData) {
      showBalanceCard(state.balance.lastData);
      return true;
    }
    const cached = state.balance.lastOk ? state.balance.lastText : state.balance.lastError;
    if (cached) {
      showBubble(cached, 4000);
      return state.balance.lastOk;
    }
  }

  state.balance.fetching = true;
  if (!state.balance.lastText) showBubble('💰 查询余额中...', 8000);

  let result = null;
  try {
    result = await window.petAPI.getApiBalance();
  } catch (e) {
    result = { success: false, error: e.message };
  } finally {
    state.balance.fetching = false;
  }

  state.balance.lastFetchAt = Date.now();

  if (result && result.success) {
    state.balance.lastOk = true;
    state.balance.lastError = '';
    state.balance.lastText = result.text || '💰 暂无余额信息';
    state.balance.lastData = result.data || null;
    if (result.data) {
      showBalanceCard(result.data);
    } else {
      showBubble(state.balance.lastText, 5000);
    }
    console.log('💰 余额气泡已更新:', state.balance.lastText.replace(/\n/g, ' '));
    return true;
  }

  const errorText = `⚠️ 余额查询失败：${(result && result.error) || '未知错误'}`;
  state.balance.lastOk = false;
  state.balance.lastError = errorText;
  if (silent) {
    // 定时展示失败时只在控制台提示，避免频繁打扰
    console.warn(errorText);
  } else {
    showBubble(errorText, 4000);
  }
  return false;
}

// ====== 拖入文件 → 回收站 ======

function setupDragAndDrop() {
  // 避免拖入文件时窗口直接跳转到该文件
  window.addEventListener('dragover', (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    // 文件拖拽（或无法判断类型）时都要 preventDefault，否则浏览器会取消 drop
    e.preventDefault();
    if (state.isFileDragOver) refreshDropHintTimer();
    try { dt.dropEffect = 'move'; } catch (err) { /* 某些平台只读 */ }
  }, true);

  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    // 只要有任何拖拽进入窗口就先给出提示，便于用户确认拖拽事件已到达
    if (state.isFileDragOver) return;
    state.isFileDragOver = true;
    setDropHintVisible(true);
    dndDebug('dragenter', describeDragData(e.dataTransfer));
  }, true);

  window.addEventListener('dragleave', (e) => {
    if (!state.isFileDragOver) return;
    // 只有真正离开窗口时才复位（避免子元素间移动误触发）
    if (e.relatedTarget === null || !document.documentElement.contains(e.relatedTarget)) {
      resetFileDragOver();
      dndDebug('dragleave');
    }
  }, true);

  window.addEventListener('drop', async (e) => {
    // 第一件事就是阻止默认行为，避免窗口直接跳转到被拖入的文件
    e.preventDefault();
    e.stopPropagation();

    const dt = e.dataTransfer;
    if (!dt) return;

    const files = Array.from(dt.files || []);
    resetFileDragOver();
    dndDebug('drop', `${describeDragData(dt)} files=${files.length}`);

    const paths = getDroppedPaths(files, dt);
    console.log('📥 拖入文件:', paths.length ? paths.join(' | ') : '(未获取到路径)');
    dndDebug('paths', paths.length ? paths.join(' | ') : '(未获取到路径)');

    if (paths.length === 0) {
      showBubble('⚠️ 无法读取拖入的文件路径，请重试或反馈日志', 3000);
      return;
    }

    // 1. 播放拖入文件动画（暂留空，未配置素材时不播放）
    playFileDropAnimation();

    // 2. 移到回收站
    await trashDroppedItems(paths);
  }, true);
}

/** 描述拖拽数据，便于排查拖拽无响应的问题 */
function describeDragData(dt) {
  try {
    const types = dt && dt.types ? Array.from(dt.types).join(',') : '';
    const itemKinds = dt && dt.items
      ? Array.from(dt.items).map((it) => `${it.kind}/${it.type}`).join(',')
      : '';
    return `types=[${types}] items=[${itemKinds}]`;
  } catch (e) {
    return 'types=?';
  }
}

/** 把拖拽诊断信息送到主进程打印（不打开 DevTools 也能看到） */
function dndDebug(stage, detail) {
  try {
    if (window.petAPI && window.petAPI.dndDebug) window.petAPI.dndDebug(stage, detail);
  } catch (e) { /* 忽略 */ }
}

/**
 * 从拖拽数据中取出本地路径
 * 依次尝试：File.path（Electron < 32）→ webUtils.getPathForFile（Electron ≥ 29）
 * → dataTransfer 的 text/uri-list / text/plain 中的 file:// 路径
 */
function getDroppedPaths(files, dataTransfer) {
  const paths = [];
  const push = (p) => { if (p && !paths.includes(p)) paths.push(p); };

  for (const file of files) {
    let filePath = '';
    try { filePath = file.path || ''; } catch (e) { filePath = ''; }
    if (!filePath && window.petAPI.getPathForFile) {
      try { filePath = window.petAPI.getPathForFile(file) || ''; } catch (e) { filePath = ''; }
    }
    push(filePath);
  }

  if (paths.length === 0 && dataTransfer) {
    for (const type of ['text/uri-list', 'text/plain']) {
      let raw = '';
      try { raw = dataTransfer.getData(type) || ''; } catch (e) { raw = ''; }
      if (!raw) continue;
      for (const line of raw.split(/\r?\n/)) {
        const candidate = line.trim();
        if (!candidate || candidate.startsWith('#')) continue;
        const fromUri = fileUriToPath(candidate);
        if (fromUri) push(fromUri);
      }
      if (paths.length > 0) break;
    }
  }

  return paths;
}

/** 把 file:// URL 转成系统路径 */
function fileUriToPath(uri) {
  if (!/^file:\/\//i.test(uri)) return '';
  try {
    const url = new URL(uri);
    return decodeURIComponent(url.pathname);
  } catch (e) {
    return '';
  }
}

/** 调用主进程把拖入的项目移到回收站 */
async function trashDroppedItems(paths) {
  let result;
  try {
    result = await window.petAPI.trashItems(paths);
  } catch (e) {
    showBubble(`⚠️ 移到回收站失败：${e.message}`, 4000);
    return;
  }

  if (!result) {
    showBubble('⚠️ 移到回收站失败', 3000);
    return;
  }
  if (result.canceled) {
    showBubble('已取消 🐾', 1500);
    return;
  }
  if (result.success) {
    showBubble(`🗑️ 已将 ${result.trashed.length} 个项目移到回收站`, 3000);
    return;
  }
  const reason = (result.errors && result.errors[0]) || '未知错误';
  const done = (result.trashed && result.trashed.length) || 0;
  showBubble(done > 0
    ? `🗑️ 已移入回收站 ${done} 个，${result.errors.length} 个失败`
    : `⚠️ 移入回收站失败：${reason}`, 4000);
}

/** 显示/隐藏拖入提示 */
function setDropHintVisible(visible) {
  const hint = elements.dropHint;
  if (!hint) return;
  if (state.dropHintTimer) { clearTimeout(state.dropHintTimer); state.dropHintTimer = null; }
  hint.classList.toggle('hidden', !visible);
  elements.container.classList.toggle('file-drop-active', visible);
  if (visible) refreshDropHintTimer();
}

/** 续期拖入提示的自动复位计时器 */
function refreshDropHintTimer() {
  if (state.dropHintTimer) clearTimeout(state.dropHintTimer);
  state.dropHintTimer = setTimeout(() => resetFileDragOver(), 4000);
}

function resetFileDragOver() {
  state.isFileDragOver = false;
  if (state.dropHintTimer) { clearTimeout(state.dropHintTimer); state.dropHintTimer = null; }
  if (elements.dropHint) elements.dropHint.classList.add('hidden');
  elements.container.classList.remove('file-drop-active');
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

// ====== 气泡（交给独立的气泡窗口显示） ======

/**
 * 显示普通文字气泡
 * @param {string} text 支持 \n 换行的多行文案
 * @param {number} [duration] 展示时长（毫秒）
 */
function showBubble(text, duration = 2000) {
  try {
    window.petAPI.showBubble({ kind: 'text', text: String(text), duration });
  } catch (e) {
    console.warn('气泡显示失败:', e.message);
  }
}

/**
 * 显示余额卡片（由气泡窗口渲染，比文字气泡更大更醒目）
 * @param {Object} data - 主进程返回的余额数据
 * @param {number} [duration] 展示时长（毫秒），默认 6 秒
 */
function showBalanceCard(data, duration = 6000) {
  try {
    window.petAPI.showBubble({ kind: 'balance', data, duration });
  } catch (e) {
    console.warn('余额气泡显示失败:', e.message);
    showBubble(formatBalancePlain(data), duration);
  }
}

/** 卡片不可用时的纯文本兜底 */
function formatBalancePlain(data) {
  const balances = (data && Array.isArray(data.balances)) ? data.balances : [];
  const symbolOf = (currency) => (currency === 'CNY' ? '¥' : (currency === 'USD' ? '$' : `${currency || ''} `));
  if (balances.length === 0) return '💰 暂无余额信息';
  const head = (!data || data.isAvailable !== false) ? '💰 API 余额' : '⚠️ 余额不足';
  return head + '\n' + balances.map((b) => `${symbolOf(b.currency)}${b.totalBalance}`).join('\n');
}

function showRandomBubble() {
  const msgs = ['你好呀！👋', '戳我干嘛~', '嘿嘿 😊', '有什么需要帮忙的吗？', '拖文件给我可以帮你丢进回收站哦', '🐾 嗷呜~', '我在呢！', '❤️', '✨', '💭', '偷偷告诉你，点击我可以看 API 余额', '🤗', '喵~', '汪汪！', '你好！我是 DeskLLMPet', '🌟'];
  showBubble(msgs[Math.floor(Math.random() * msgs.length)], 2000);
}

// ====== 启动 ======
document.addEventListener('DOMContentLoaded', init);
window.petState = state;
