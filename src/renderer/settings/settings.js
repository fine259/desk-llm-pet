/**
 * 设置窗口逻辑
 * 处理 API 余额配置、动画选择、宠物设置等的可视化配置
 */

// ====== 状态管理 ======
const state = {
  config: {
    llm: {},
    animations: {},
    balance: {},
    pet: {}
  },
  availableAnimations: { idle: [], click: [] },
  selectedIdle: [],
  selectedClick: []
};

// ====== DOM 元素 ======
const elements = {};

// ====== 初始化 ======
async function init() {
  // 平台检测
  const isMac = navigator.userAgent.includes('Mac');
  document.body.className = isMac ? 'platform-mac' : 'platform-win';

  cacheElements();
  await loadAllConfig();
  setupTabNavigation();
  setupEventListeners();
  populateForms();

  // 显示当前运行的代码目录，方便确认「跑的是哪份代码」
  try {
    const paths = await window.settingsAPI.getAppPath();
    const el = document.getElementById('about-code-root');
    if (el && paths && paths.projectRoot) el.textContent = paths.projectRoot;
  } catch (e) { /* 忽略 */ }

  console.log('⚙️ 设置窗口已就绪');
}

/**
 * 缓存所有 DOM 元素
 */
function cacheElements() {
  elements.btnClose = document.getElementById('btn-close');
  elements.tabBtns = document.querySelectorAll('.tab-btn');
  elements.tabPanels = document.querySelectorAll('.tab-panel');

  // API 配置
  elements.apiEndpoint = document.getElementById('api-endpoint');
  elements.apiKey = document.getElementById('api-key');
  elements.balanceEndpoint = document.getElementById('balance-endpoint');
  elements.toggleApiKey = document.getElementById('toggle-api-key');
  elements.btnTestApi = document.getElementById('btn-test-api');
  elements.btnSaveApi = document.getElementById('btn-save-api');
  elements.apiTestResult = document.getElementById('api-test-result');

  // 动画配置
  elements.idleAnimList = document.getElementById('idle-anim-list');
  elements.clickAnimList = document.getElementById('click-anim-list');
  elements.btnSelectAllIdle = document.getElementById('btn-select-all-idle');
  elements.btnSelectAllClick = document.getElementById('btn-select-all-click');
  elements.btnSaveAnimations = document.getElementById('btn-save-animations');

  // 宠物设置
  elements.petOpacity = document.getElementById('pet-opacity');
  elements.opacityValue = document.getElementById('opacity-value');
  elements.petScale = document.getElementById('pet-scale');
  elements.scaleValue = document.getElementById('scale-value');
  elements.petAutoStart = document.getElementById('pet-auto-start');
  elements.petConfirmTrash = document.getElementById('pet-confirm-trash');
  elements.btnSavePet = document.getElementById('btn-save-pet');

  // 窗口裁剪
  elements.crop = document.getElementById('pet-crop');
  elements.cropValue = document.getElementById('crop-value');
  elements.cropX = document.getElementById('pet-crop-x');
  elements.cropXValue = document.getElementById('crop-x-value');
  elements.cropY = document.getElementById('pet-crop-y');
  elements.cropYValue = document.getElementById('crop-y-value');
  elements.btnResetCrop = document.getElementById('btn-reset-crop');

  // 气泡
  elements.bubbleScale = document.getElementById('bubble-scale');
  elements.bubbleScaleValue = document.getElementById('bubble-scale-value');
  elements.bubbleOffsetX = document.getElementById('bubble-offset-x');
  elements.bubbleXValue = document.getElementById('bubble-x-value');
  elements.bubbleOffsetY = document.getElementById('bubble-offset-y');
  elements.bubbleYValue = document.getElementById('bubble-y-value');
  elements.btnPreviewBubble = document.getElementById('btn-preview-bubble');
  elements.btnResetBubble = document.getElementById('btn-reset-bubble');

  // 余额气泡
  elements.balanceEnabled = document.getElementById('balance-enabled');
  elements.balanceInterval = document.getElementById('balance-interval');
}

/**
 * 加载所有配置
 */
async function loadAllConfig() {
  try {
    const [config, animations] = await Promise.all([
      window.settingsAPI.getAllConfig(),
      window.settingsAPI.getAvailableAnimations()
    ]);

    state.config = config;
    state.availableAnimations = animations;
    state.selectedIdle = config.animations.idlePool || [];
    state.selectedClick = config.animations.clickPool || [];
  } catch (e) {
    console.error('加载配置失败:', e);
  }
}

/**
 * 设置标签导航
 */
function setupTabNavigation() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // 切换按钮状态
      elements.tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 切换面板
      elements.tabPanels.forEach(p => p.classList.remove('active'));
      document.getElementById(`tab-${tabName}`).classList.add('active');
    });
  });
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 标题栏
  elements.btnClose.addEventListener('click', () => window.settingsAPI.closeWindow());

  // 显示/隐藏 API Key
  elements.toggleApiKey.addEventListener('click', () => {
    const input = elements.apiKey;
    if (input.type === 'password') {
      input.type = 'text';
      elements.toggleApiKey.textContent = '🙈';
    } else {
      input.type = 'password';
      elements.toggleApiKey.textContent = '👁️';
    }
  });

  // 保存 API 配置
  elements.btnSaveApi.addEventListener('click', () => saveApiConfig(true));

  // 测试 API 连接（查询余额）
  elements.btnTestApi.addEventListener('click', testApiConnection);

  // 宠物透明度
  elements.petOpacity.addEventListener('input', () => {
    elements.opacityValue.textContent = Math.round(elements.petOpacity.value * 100) + '%';
  });

  // 宠物大小
  elements.petScale.addEventListener('input', () => {
    elements.scaleValue.textContent = parseFloat(elements.petScale.value).toFixed(1) + 'x';
  });

  // 窗口裁剪：拖动即时预览（防抖写盘）
  elements.crop.addEventListener('input', () => {
    elements.cropValue.textContent = Math.round(parseFloat(elements.crop.value) * 100) + '%';
    queueCropPreview();
  });
  elements.cropX.addEventListener('input', () => {
    elements.cropXValue.textContent = Math.round(elements.cropX.value) + '%';
    queueCropPreview();
  });
  elements.cropY.addEventListener('input', () => {
    elements.cropYValue.textContent = Math.round(elements.cropY.value) + '%';
    queueCropPreview();
  });
  elements.btnResetCrop.addEventListener('click', () => {
    elements.crop.value = '0.55';
    elements.cropValue.textContent = '55%';
    elements.cropX.value = '0';
    elements.cropXValue.textContent = '0%';
    elements.cropY.value = '0';
    elements.cropYValue.textContent = '0%';
    queueCropPreview(0);
  });

  // 气泡大小 / 位置：即时生效（防抖写盘）
  elements.bubbleScale.addEventListener('input', () => {
    elements.bubbleScaleValue.textContent = parseFloat(elements.bubbleScale.value).toFixed(2) + 'x';
    queueBubblePreview();
  });
  elements.bubbleOffsetX.addEventListener('input', () => {
    elements.bubbleXValue.textContent = Math.round(elements.bubbleOffsetX.value) + 'px';
    queueBubblePreview();
  });
  elements.bubbleOffsetY.addEventListener('input', () => {
    elements.bubbleYValue.textContent = Math.round(elements.bubbleOffsetY.value) + 'px';
    queueBubblePreview();
  });
  elements.btnPreviewBubble.addEventListener('click', () => {
    window.settingsAPI.previewBubble();
  });
  elements.btnResetBubble.addEventListener('click', () => {
    elements.bubbleScale.value = '1';
    elements.bubbleScaleValue.textContent = '1.00x';
    elements.bubbleOffsetX.value = '0';
    elements.bubbleXValue.textContent = '0px';
    elements.bubbleOffsetY.value = '0';
    elements.bubbleYValue.textContent = '0px';
    queueBubblePreview(0);
  });

  // 保存宠物设置
  elements.btnSavePet.addEventListener('click', savePetConfig);

  // 关于页面 GitHub 链接
  const githubLink = document.getElementById('about-github-link');
  if (githubLink) {
    githubLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.settingsAPI.openExternal?.('https://github.com/isKage/desk-llm-pet');
    });
  }

  // 动画配置按钮
  elements.btnSaveAnimations.addEventListener('click', saveAnimationConfig);
  if (elements.btnSelectAllIdle) elements.btnSelectAllIdle.addEventListener('click', () => selectAllAnimations('idle'));
  if (elements.btnSelectAllClick) elements.btnSelectAllClick.addEventListener('click', () => selectAllAnimations('click'));
}

/**
 * 填充表单
 */
function populateForms() {
  const { llm = {}, balance = {}, pet = {} } = state.config || {};

  // API 配置
  elements.apiEndpoint.value = llm.apiEndpoint || '';
  elements.apiKey.value = llm.apiKey || '';
  elements.balanceEndpoint.value = llm.balanceEndpoint || '';

  // 余额气泡
  elements.balanceEnabled.checked = balance.enabled !== false;
  elements.balanceInterval.value = Number.isFinite(Number(balance.intervalMinutes))
    ? Number(balance.intervalMinutes) : 30;

  // 宠物设置
  elements.petOpacity.value = pet.opacity || 1;
  elements.opacityValue.textContent = Math.round((pet.opacity || 1) * 100) + '%';
  elements.petScale.value = pet.scale || 1;
  elements.scaleValue.textContent = (pet.scale || 1).toFixed(1) + 'x';
  elements.petAutoStart.checked = pet.autoStart === true;
  elements.petConfirmTrash.checked = pet.confirmTrash !== false;

  // 窗口裁剪
  const crop = Number.isFinite(Number(pet.crop)) ? Number(pet.crop) : 0.55;
  elements.crop.value = String(crop);
  elements.cropValue.textContent = Math.round(crop * 100) + '%';
  const offsetX = Number.isFinite(Number(pet.cropOffsetX)) ? Number(pet.cropOffsetX) : 0;
  elements.cropX.value = String(offsetX);
  elements.cropXValue.textContent = Math.round(offsetX) + '%';
  const offsetY = Number.isFinite(Number(pet.cropOffsetY)) ? Number(pet.cropOffsetY) : 0;
  elements.cropY.value = String(offsetY);
  elements.cropYValue.textContent = Math.round(offsetY) + '%';

  // 气泡
  const bubble = state.config.bubble || {};
  const bubbleScale = Number.isFinite(Number(bubble.scale)) ? Number(bubble.scale) : 1;
  elements.bubbleScale.value = String(bubbleScale);
  elements.bubbleScaleValue.textContent = bubbleScale.toFixed(2) + 'x';
  const bubbleX = Number.isFinite(Number(bubble.offsetX)) ? Number(bubble.offsetX) : 0;
  elements.bubbleOffsetX.value = String(bubbleX);
  elements.bubbleXValue.textContent = Math.round(bubbleX) + 'px';
  const bubbleY = Number.isFinite(Number(bubble.offsetY)) ? Number(bubble.offsetY) : 0;
  elements.bubbleOffsetY.value = String(bubbleY);
  elements.bubbleYValue.textContent = Math.round(bubbleY) + 'px';

  // 动画列表
  renderAnimationList('idle');
  renderAnimationList('click');
}

/**
 * 渲染动画列表
 */
function renderAnimationList(type) {
  const listEl = type === 'idle' ? elements.idleAnimList : elements.clickAnimList;
  const animations = state.availableAnimations[type] || [];
  const selected = type === 'idle' ? state.selectedIdle : state.selectedClick;

  if (animations.length === 0) {
    listEl.innerHTML = `<div class="anim-empty">
      📁 暂无动画文件<br>
      <small>请将 .webm 文件放入 assets/animations/${type}/ 目录</small>
    </div>`;
    return;
  }

  listEl.innerHTML = animations.map(anim => {
    const isChecked = selected.length === 0 || selected.includes(anim.name);
    return `
      <div class="anim-item">
        <input type="checkbox"
               value="${escapeHtml(anim.name)}"
               data-type="${type}"
               ${isChecked ? 'checked' : ''}>
        <span class="anim-item-name">🎬 ${escapeHtml(anim.name)}</span>
        <button class="anim-item-preview" data-path="${escapeHtml(anim.path)}">预览</button>
      </div>
    `;
  }).join('');

  // 绑定复选框事件
  listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => updateSelectedAnimations(type));
  });
}

/**
 * 更新选中的动画列表
 */
function updateSelectedAnimations(type) {
  const listEl = type === 'idle' ? elements.idleAnimList : elements.clickAnimList;
  const checkboxes = listEl.querySelectorAll('input[type="checkbox"]:checked');
  const selected = Array.from(checkboxes).map(cb => cb.value);

  if (type === 'idle') {
    state.selectedIdle = selected;
  } else {
    state.selectedClick = selected;
  }
}

/**
 * 全选/取消全选
 */
function selectAllAnimations(type) {
  const listEl = type === 'idle' ? elements.idleAnimList : elements.clickAnimList;
  const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);

  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
  });

  updateSelectedAnimations(type);
}

/**
 * 添加动画文件
 */
async function addAnimationFile(type) {
  try {
    const result = await window.settingsAPI.selectAnimationFile();
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;

    // 这里只是通知用户需要手动复制文件
    alert(`请将选中的 .webm 文件复制到 assets/animations/${type}/ 目录下，然后刷新动画列表。`);
  } catch (e) {
    console.error('选择文件失败:', e);
  }
}

/**
 * 保存 API 配置
 * @param {boolean} [notify] 是否弹出保存成功提示
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveApiConfig(notify = true) {
  const config = {
    apiEndpoint: elements.apiEndpoint.value.trim(),
    balanceEndpoint: elements.balanceEndpoint.value.trim(),
    apiKey: elements.apiKey.value.trim()
  };

  try {
    await window.settingsAPI.setLLMConfig(config);
    if (notify) showToast('✅ API 配置已保存');
    return true;
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message);
    return false;
  }
}

/**
 * 测试 API 连接（通过查询余额验证 Key 是否可用）
 */
async function testApiConnection() {
  const resultEl = elements.apiTestResult;
  resultEl.classList.remove('hidden', 'success', 'error');
  resultEl.textContent = '⏳ 正在测试连接...';
  resultEl.className = 'test-result';

  // 先保存配置，保证用最新参数测试
  const saved = await saveApiConfig(false);
  if (!saved) {
    resultEl.textContent = '❌ 保存配置失败，请重试';
    resultEl.className = 'test-result error';
    return;
  }

  try {
    const response = await window.settingsAPI.getApiBalance();
    if (response && response.success) {
      // response.text 形如 "💰 API 余额\n¥110.00"，这里只取余额明细
      const detail = String(response.text || '').split('\n').slice(1).join(' / ').trim();
      resultEl.textContent = detail ? `✅ 连接成功！当前余额：${detail}` : '✅ 连接成功！API Key 可用';
      resultEl.className = 'test-result success';
    } else {
      resultEl.textContent = '❌ 连接失败: ' + ((response && response.error) || '未知错误');
      resultEl.className = 'test-result error';
    }
  } catch (e) {
    resultEl.textContent = '❌ 连接失败: ' + e.message;
    resultEl.className = 'test-result error';
  }
}

/**
 * 保存动画配置
 */
async function saveAnimationConfig() {
  const config = {
    idlePool: state.selectedIdle,
    clickPool: state.selectedClick
  };

  try {
    await window.settingsAPI.setAnimationConfig(config);
    showToast('✅ 动画配置已保存');
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message);
  }
}

/**
 * 画面裁剪即时预览（防抖，避免拖动滑块时频繁写盘）
 */
let cropPreviewTimer = null;
function queueCropPreview(delay = 120) {
  if (cropPreviewTimer) clearTimeout(cropPreviewTimer);
  cropPreviewTimer = setTimeout(async () => {
    cropPreviewTimer = null;
    try {
      await window.settingsAPI.setPetConfig(readCropConfig());
    } catch (e) {
      console.error('裁剪预览失败:', e);
    }
  }, delay);
}

/** 读取窗口裁剪表单值 */
function readCropConfig() {
  const crop = Math.min(1, Math.max(0.25, parseFloat(elements.crop.value) || 0.55));
  const offsetX = Math.min(40, Math.max(-40, parseFloat(elements.cropX.value) || 0));
  const offsetY = Math.min(40, Math.max(-40, parseFloat(elements.cropY.value) || 0));
  return { crop, cropOffsetX: offsetX, cropOffsetY: offsetY };
}

/**
 * 气泡大小 / 位置即时预览（防抖）
 */
let bubblePreviewTimer = null;
function queueBubblePreview(delay = 120) {
  if (bubblePreviewTimer) clearTimeout(bubblePreviewTimer);
  bubblePreviewTimer = setTimeout(async () => {
    bubblePreviewTimer = null;
    try {
      await window.settingsAPI.setBubbleConfig(readBubbleConfig());
    } catch (e) {
      console.error('气泡预览失败:', e);
    }
  }, delay);
}

/** 读取气泡表单值 */
function readBubbleConfig() {
  const scale = Math.min(1.6, Math.max(0.6, parseFloat(elements.bubbleScale.value) || 1));
  const offsetX = Math.min(200, Math.max(-200, parseFloat(elements.bubbleOffsetX.value) || 0));
  const offsetY = Math.min(200, Math.max(-120, parseFloat(elements.bubbleOffsetY.value) || 0));
  return { scale, offsetX, offsetY };
}

/**
 * 保存宠物设置 + 余额气泡设置
 */
async function savePetConfig() {
  const config = {
    opacity: parseFloat(elements.petOpacity.value),
    scale: parseFloat(elements.petScale.value),
    autoStart: elements.petAutoStart.checked,
    confirmTrash: elements.petConfirmTrash.checked,
    ...readCropConfig()
  };

  const rawInterval = Number(elements.balanceInterval.value);
  const intervalMinutes = Number.isFinite(rawInterval) ? Math.min(1440, Math.max(0, Math.round(rawInterval))) : 30;
  const balanceConfig = {
    enabled: elements.balanceEnabled.checked,
    intervalMinutes
  };

  try {
    await window.settingsAPI.setPetConfig(config);
    await window.settingsAPI.setBalanceConfig(balanceConfig);
    await window.settingsAPI.setBubbleConfig(readBubbleConfig());
    elements.balanceInterval.value = intervalMinutes;
    showToast('✅ 宠物设置已保存');
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message);
  }
}

/**
 * 显示 Toast 提示
 */
function showToast(message) {
  // 移除已有的 toast
  const existing = document.querySelector('.settings-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'settings-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: rgba(30, 30, 50, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 13px;
    z-index: 1000;
    animation: toastIn 0.3s ease-out;
    backdrop-filter: blur(10px);
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 添加 toast 动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`;
document.head.appendChild(style);

// ====== 应用启动 ======
document.addEventListener('DOMContentLoaded', init);