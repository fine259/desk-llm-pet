/**
 * 桌宠渲染进程逻辑
 * 拖拽移动、点击反应、API 余额气泡，以及插件贡献的右键菜单项
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

  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  hasMoved: false,
  dragAnimTriggered: false,    // 是否已触发拖拽动画

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
    crop: 0.55,
    cropOffsetX: 0,
    cropOffsetY: 0
  },

  appPath: { assets: '', projectRoot: '' },
  pluginMenuItems: []          // 插件贡献的右键菜单项（无插件时为空）
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
  pluginMenuHost: document.getElementById('plugin-menu-items')
};

// ====== 初始化 ======
async function init() {
  await loadConfig();
  applyCrop();
  await loadAnimations();
  findDragAnimation();
  setupEventListeners();
  setupDropSafetyGuard();
  setupIpcListeners();
  startIdleAnimation();
  startBalanceTimer();
  await loadPluginMenuItems();

  // 启动后稍作延迟展示一次余额，让用户确认配置是否生效
  if (state.balance.enabled) {
    setTimeout(() => showBalance({ silent: true }), BALANCE_FIRST_DELAY);
  }

  console.log('🐾 DeskLLMPet 就绪',
    `闲置:${state.idlePool.length} 点击:${state.clickPool.length} 拖拽:${state.dragAnimPath ? '✓' : '✗'}`,
    `窗口裁剪:${Math.round((Number(state.config.crop) || 0.55) * 100)}%`,
    `插件菜单:${state.pluginMenuItems.length}`);
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
    await loadAnimations();
    if (!state.isPlayingClick && !state.isPlayingDrag) playRandomIdle();
  });

  window.petAPI.onConfigChanged((config) => {
    if (config.scale !== undefined) state.config.scale = config.scale;
    if (config.opacity !== undefined) state.config.opacity = config.opacity;
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

  // 插件系统加载 / 变化时刷新右键菜单里的插件项
  if (typeof window.petAPI.onPluginsChanged === 'function') {
    window.petAPI.onPluginsChanged(() => loadPluginMenuItems());
  }
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
    // 插件贡献的菜单项：交给插件系统处理
    if (menuItem.dataset.pluginId) {
      runPluginCommand(menuItem.dataset.pluginId, menuItem.dataset.command);
    } else {
      handleMenuAction(menuItem.dataset.action);
    }
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

  // 先显示再量尺寸：插件菜单项数量不固定，按实际大小做边界收敛
  menu.classList.remove('hidden');
  const menuW = menu.offsetWidth || 170;
  const menuH = menu.offsetHeight || 200;

  let mx = e.clientX - rect.left, my = e.clientY - rect.top;
  if (mx + menuW > rect.width) mx = rect.width - menuW;
  if (my + menuH > rect.height) my = rect.height - menuH;
  menu.style.left = Math.max(0, mx) + 'px';
  menu.style.top = Math.max(0, my) + 'px';
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
    // 正在拖拽宠物时不打扰
    if (state.isDragging) return;
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

// ====== 插件贡献的右键菜单 ======

/**
 * 拉取插件贡献的桌宠右键菜单项
 * 插件系统不可用 / 没有插件时保持原菜单不变
 */
async function loadPluginMenuItems() {
  if (typeof window.petAPI.getPluginMenuItems !== 'function') return;
  try {
    const items = await window.petAPI.getPluginMenuItems();
    renderPluginMenuItems(Array.isArray(items) ? items : []);
  } catch (e) {
    console.warn('插件菜单加载失败（不影响本体功能）:', e.message);
  }
}

/**
 * 渲染插件菜单项
 * @param {Array<{pluginId: string, command: string, label: string, icon?: string}>} items
 */
function renderPluginMenuItems(items) {
  state.pluginMenuItems = items;
  const host = elements.pluginMenuHost;
  if (!host) return;

  if (items.length === 0) {
    host.innerHTML = '';
    host.classList.add('hidden');
    return;
  }

  host.innerHTML = items.map((item) => {
    const icon = escapeHtml(item.icon || '🧩');
    const label = escapeHtml(item.label || item.command || '插件功能');
    return `<div class="menu-item" data-plugin-id="${escapeAttr(item.pluginId)}" data-command="${escapeAttr(item.command)}">` +
      `<span class="menu-icon">${icon}</span><span>${label}</span></div>`;
  }).join('');
  host.classList.remove('hidden');
}

/** 触发插件命令（例如打开插件窗口） */
async function runPluginCommand(pluginId, command) {
  if (typeof window.petAPI.runPluginCommand !== 'function') return;
  try {
    const result = await window.petAPI.runPluginCommand(pluginId, command, { source: 'pet-menu' });
    if (result && result.success === false) {
      showBubble(`⚠️ 插件执行失败：${result.error || '未知错误'}`, 3000);
    }
  } catch (e) {
    showBubble(`⚠️ 插件执行失败：${e.message}`, 3000);
  }
}

// ====== 拖拽安全兜底 ======
// 文件拖入功能已移除；这里只阻止窗口被浏览器默认行为导航到被拖入的文件，
// 不做任何文件操作，保证桌宠窗口始终停留在 pet.html。
function setupDropSafetyGuard() {
  const block = (e) => { e.preventDefault(); };
  window.addEventListener('dragover', block, true);
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showBubble('🐾 我暂时不接收文件哦', 2000);
  }, true);
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
  const msgs = ['你好呀！👋', '戳我干嘛~', '嘿嘿 😊', '有什么需要帮忙的吗？', '🐾 嗷呜~', '我在呢！', '❤️', '✨', '💭', '偷偷告诉你，点击我可以看 API 余额', '🤗', '喵~', '汪汪！', '你好！我是 DeskLLMPet', '🌟'];
  showBubble(msgs[Math.floor(Math.random() * msgs.length)], 2000);
}

// ====== 工具函数 ======

/** HTML 转义 */
function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML 属性转义（用于 data-* 属性） */
function escapeAttr(text) {
  return escapeHtml(text);
}

// ====== 启动 ======
document.addEventListener('DOMContentLoaded', init);
window.petState = state;
