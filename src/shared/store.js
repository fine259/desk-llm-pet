/**
 * 持久化存储模块
 * 使用 electron-store 管理应用配置
 */

const Store = require('electron-store');

const defaults = {
  llm: {
    apiEndpoint: 'https://api.deepseek.com',
    balanceEndpoint: '',
    apiKey: ''
  },
  animations: {
    idlePool: [],
    clickPool: [],
    currentIdleIndex: 0
  },
  balance: {
    enabled: true,
    intervalMinutes: 30
  },
  pet: {
    opacity: 1.0,
    scale: 1.0,
    autoStart: false,
    theme: 'dark',
    // 窗口裁剪：窗口 = 300 * scale * crop，动画本身保持原大小，只裁掉周围背景
    crop: 0.55,
    cropOffsetX: 0,
    cropOffsetY: 0
  },
  // 气泡（独立悬浮窗口）设置
  bubble: {
    scale: 1.0,      // 气泡整体大小倍率
    offsetX: 0,      // 相对宠物中心的水平偏移（像素）
    offsetY: 0       // 相对默认位置（宠物正上方）的垂直偏移（像素，负值更靠上）
  },
  windowPosition: { petX: null, petY: null },
  firstRun: true
};

let _store = null;

function getStore() {
  if (!_store) _store = new Store({ defaults });
  return _store;
}

// ====== LLM 配置（仅用于余额查询） ======
function getLLMConfig() { return { ...defaults.llm, ...getStore().get('llm') }; }
function setLLMConfig(config) { getStore().set('llm', { ...getLLMConfig(), ...config }); }

// ====== 余额气泡配置 ======
function getBalanceConfig() { return { ...defaults.balance, ...getStore().get('balance') }; }
function setBalanceConfig(config) { getStore().set('balance', { ...getBalanceConfig(), ...config }); }

// ====== 动画配置 ======
function getAnimationConfig() { return { ...defaults.animations, ...getStore().get('animations') }; }
function setAnimationConfig(config) { getStore().set('animations', { ...getAnimationConfig(), ...config }); }

// ====== 宠物设置 ======
function getPetConfig() { return { ...defaults.pet, ...getStore().get('pet') }; }
function setPetConfig(config) { getStore().set('pet', { ...getPetConfig(), ...config }); }

// ====== 气泡设置 ======
function getBubbleConfig() { return { ...defaults.bubble, ...getStore().get('bubble') }; }
function setBubbleConfig(config) { getStore().set('bubble', { ...getBubbleConfig(), ...config }); }

// ====== 窗口位置 ======
function saveWindowPosition(x, y) { getStore().set('windowPosition', { petX: x, petY: y }); }
function getWindowPosition() { return getStore().get('windowPosition'); }

// ====== 所有配置 ======
function getAllConfig() {
  return {
    llm: getLLMConfig(),
    animations: getAnimationConfig(),
    balance: getBalanceConfig(),
    pet: getPetConfig(),
    bubble: getBubbleConfig()
  };
}

module.exports = {
  getLLMConfig, setLLMConfig,
  getBalanceConfig, setBalanceConfig,
  getAnimationConfig, setAnimationConfig,
  getPetConfig, setPetConfig,
  getBubbleConfig, setBubbleConfig,
  saveWindowPosition, getWindowPosition,
  getAllConfig,
  getStore
};
