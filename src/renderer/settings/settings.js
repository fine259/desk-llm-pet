/**
 * 设置窗口逻辑
 * 处理 API 配置、动画选择、宠物设置等的可视化配置
 */

// ====== 状态管理 ======
const state = {
  config: {
    llm: {},
    animations: {},
    pet: {}
  },
  availableAnimations: { idle: [], click: [] },
  selectedIdle: [],
  selectedClick: []
};

// ====== DOM 元素 ======
const elements = {};

// ====== API 预设 ======
const API_PRESETS = {
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    maxTokens: 2048,
    temperature: 0.7
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4',
    maxTokens: 2048,
    temperature: 0.7
  },
  custom: {
    endpoint: '',
    model: '',
    maxTokens: 2048,
    temperature: 0.7
  }
};

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
  elements.apiModel = document.getElementById('api-model');
  elements.apiMaxTokens = document.getElementById('api-max-tokens');
  elements.apiTemperature = document.getElementById('api-temperature');
  elements.tempValue = document.getElementById('temp-value');
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
  elements.btnSavePet = document.getElementById('btn-save-pet');
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

  // API 温度滑块
  elements.apiTemperature.addEventListener('input', () => {
    elements.tempValue.textContent = parseFloat(elements.apiTemperature.value).toFixed(1);
  });

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
  elements.btnSaveApi.addEventListener('click', saveApiConfig);

  // 测试 API 连接
  elements.btnTestApi.addEventListener('click', testApiConnection);

  // 预设按钮
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      applyPreset(preset);
    });
  });

  // 宠物透明度
  elements.petOpacity.addEventListener('input', () => {
    elements.opacityValue.textContent = Math.round(elements.petOpacity.value * 100) + '%';
  });

  // 宠物大小
  elements.petScale.addEventListener('input', () => {
    elements.scaleValue.textContent = parseFloat(elements.petScale.value).toFixed(1) + 'x';
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
  const { llm, animations, pet } = state.config;

  // API 配置
  elements.apiEndpoint.value = llm.apiEndpoint || '';
  elements.apiKey.value = llm.apiKey || '';
  elements.apiModel.value = llm.model || '';
  elements.apiMaxTokens.value = llm.maxTokens || 2048;
  elements.apiTemperature.value = llm.temperature || 0.7;
  elements.tempValue.textContent = (llm.temperature || 0.7).toFixed(1);

  // 宠物设置
  elements.petOpacity.value = pet.opacity || 1;
  elements.opacityValue.textContent = Math.round((pet.opacity || 1) * 100) + '%';
  elements.petScale.value = pet.scale || 1;
  elements.scaleValue.textContent = (pet.scale || 1).toFixed(1) + 'x';
  elements.petAutoStart.checked = pet.autoStart === true;

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
 */
async function saveApiConfig() {
  const config = {
    apiEndpoint: elements.apiEndpoint.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    model: elements.apiModel.value.trim(),
    maxTokens: parseInt(elements.apiMaxTokens.value) || 2048,
    temperature: parseFloat(elements.apiTemperature.value) || 0.7
  };

  try {
    await window.settingsAPI.setLLMConfig(config);
    showToast('✅ API 配置已保存');
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message);
  }
}

/**
 * 测试 API 连接
 */
async function testApiConnection() {
  const resultEl = elements.apiTestResult;
  resultEl.classList.remove('hidden', 'success', 'error');
  resultEl.textContent = '⏳ 正在测试连接...';
  resultEl.className = 'test-result';

  // 先保存配置
  await saveApiConfig();

  try {
    const config = {
      apiEndpoint: elements.apiEndpoint.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      model: elements.apiModel.value.trim(),
      maxTokens: 50,
      temperature: 0.1
    };

    const response = await window.settingsAPI.testConnection(config);
    if (response && response.success) {
      resultEl.textContent = '✅ 连接成功！API 响应正常';
      resultEl.className = 'test-result success';
    } else {
      resultEl.textContent = '❌ 连接失败: ' + (response?.error || '未知错误');
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
 * 保存宠物设置
 */
async function savePetConfig() {
  const config = {
    opacity: parseFloat(elements.petOpacity.value),
    scale: parseFloat(elements.petScale.value),
    autoStart: elements.petAutoStart.checked
  };

  try {
    await window.settingsAPI.setPetConfig(config);
    showToast('✅ 宠物设置已保存');
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message);
  }
}

/**
 * 应用 API 预设
 */
function applyPreset(presetName) {
  const preset = API_PRESETS[presetName];
  if (!preset) return;

  if (preset.endpoint) elements.apiEndpoint.value = preset.endpoint;
  if (preset.model) elements.apiModel.value = preset.model;
  if (preset.maxTokens) elements.apiMaxTokens.value = preset.maxTokens;
  if (preset.temperature !== undefined) {
    elements.apiTemperature.value = preset.temperature;
    elements.tempValue.textContent = preset.temperature.toFixed(1);
  }

  // 对于自定义预设，清空端点
  if (presetName === 'custom') {
    elements.apiEndpoint.value = '';
    elements.apiModel.value = '';
  }

  showToast(`✅ 已应用 ${presetName} 预设`);
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