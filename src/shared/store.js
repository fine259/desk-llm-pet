/**
 * 持久化存储模块
 * 使用 electron-store 管理应用配置和对话历史
 */

const Store = require('electron-store');

const defaults = {
  llm: {
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKey: '',
    model: 'deepseek-chat',
    maxTokens: 2048,
    temperature: 0.7
  },
  animations: {
    idlePool: [],
    clickPool: [],
    currentIdleIndex: 0
  },
  pet: {
    opacity: 1.0,
    scale: 1.0,
    autoStart: false,
    theme: 'dark'
  },
  windowPosition: { petX: null, petY: null },
  // 多对话系统
  conversations: [],
  activeConversationId: null,
  firstRun: true
};

let _store = null;

function getStore() {
  if (!_store) _store = new Store({ defaults });
  return _store;
}

// ====== LLM 配置 ======
function getLLMConfig() { return getStore().get('llm'); }
function setLLMConfig(config) { getStore().set('llm', { ...getStore().get('llm'), ...config }); }

// ====== 动画配置 ======
function getAnimationConfig() { return getStore().get('animations'); }
function setAnimationConfig(config) { getStore().set('animations', { ...getStore().get('animations'), ...config }); }

// ====== 宠物设置 ======
function getPetConfig() { return getStore().get('pet'); }
function setPetConfig(config) { getStore().set('pet', { ...getStore().get('pet'), ...config }); }

// ====== 窗口位置 ======
function saveWindowPosition(x, y) { getStore().set('windowPosition', { petX: x, petY: y }); }
function getWindowPosition() { return getStore().get('windowPosition'); }

// ====== 所有配置 ======
function getAllConfig() {
  const s = getStore();
  return { llm: s.get('llm'), animations: s.get('animations'), pet: s.get('pet') };
}

// ====== 多对话管理 ======

/** 生成唯一 ID */
function genId() { return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

/** 获取所有对话 */
function getConversations() { return getStore().get('conversations') || []; }

/** 获取当前活跃对话 ID */
function getActiveConversationId() { return getStore().get('activeConversationId'); }

/** 设置活跃对话 ID */
function setActiveConversationId(id) { getStore().set('activeConversationId', id); }

/** 获取活跃对话 */
function getActiveConversation() {
  const id = getActiveConversationId();
  const convs = getConversations();
  return convs.find(c => c.id === id) || null;
}

/** 创建新对话 */
function createConversation(title) {
  const store = getStore();
  const convs = store.get('conversations') || [];
  const now = Date.now();
  const conv = {
    id: genId(),
    title: title || '新对话',
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  convs.unshift(conv);
  store.set('conversations', convs);
  store.set('activeConversationId', conv.id);
  return conv;
}

/** 删除对话 */
function deleteConversation(id) {
  const store = getStore();
  let convs = store.get('conversations') || [];
  convs = convs.filter(c => c.id !== id);
  store.set('conversations', convs);
  if (store.get('activeConversationId') === id) {
    store.set('activeConversationId', convs.length > 0 ? convs[0].id : null);
  }
}

/** 重命名对话 */
function renameConversation(id, title) {
  const store = getStore();
  const convs = store.get('conversations') || [];
  const idx = convs.findIndex(c => c.id === id);
  if (idx >= 0) {
    convs[idx].title = title;
    convs[idx].updatedAt = Date.now();
    store.set('conversations', convs);
  }
}

/** 给活跃对话添加消息 */
function addMessageToActiveConversation(message) {
  const store = getStore();
  const id = store.get('activeConversationId');
  if (!id) return null;
  const convs = store.get('conversations') || [];
  const idx = convs.findIndex(c => c.id === id);
  if (idx < 0) return null;
  convs[idx].messages.push({ ...message, timestamp: Date.now() });
  convs[idx].updatedAt = Date.now();
  // 自动设置标题：使用第一条用户消息的前 30 个字符
  if (convs[idx].title === '新对话' && message.role === 'user') {
    convs[idx].title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
  }
  store.set('conversations', convs);
  return convs[idx];
}

/** 清空活跃对话的消息 */
function clearActiveConversationMessages() {
  const store = getStore();
  const id = store.get('activeConversationId');
  if (!id) return;
  const convs = store.get('conversations') || [];
  const idx = convs.findIndex(c => c.id === id);
  if (idx >= 0) {
    convs[idx].messages = [];
    convs[idx].updatedAt = Date.now();
    store.set('conversations', convs);
  }
}

// ====== 兼容旧版 API ======
function getChatHistory() { const c = getActiveConversation(); return c ? c.messages : []; }
function addChatMessage(msg) { return addMessageToActiveConversation(msg); }
function clearChatHistory() { clearActiveConversationMessages(); }

module.exports = {
  getLLMConfig, setLLMConfig,
  getAnimationConfig, setAnimationConfig,
  getPetConfig, setPetConfig,
  saveWindowPosition, getWindowPosition,
  getAllConfig,
  // 对话管理
  getConversations, getActiveConversationId, setActiveConversationId,
  getActiveConversation, createConversation, deleteConversation,
  renameConversation, addMessageToActiveConversation, clearActiveConversationMessages,
  // 兼容
  getChatHistory, addChatMessage, clearChatHistory,
  getStore
};