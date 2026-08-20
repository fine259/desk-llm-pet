/**
 * LLM 对话窗口逻辑
 * 多对话管理、流式响应、复制、重命名/删除
 */

const state = {
  conversations: [],          // 所有对话 [{ id, title, createdAt, updatedAt, messages }]
  activeConvId: null,         // 当前活跃对话 ID
  messages: [],               // 当前对话的消息
  llmConfig: null,
  isStreaming: false,
  currentRequestId: null,
  streamingMessage: '',
  isMac: false,
  renameTargetId: null        // 正在重命名的对话 ID
};

const elements = {};

// ====== 初始化 ======
async function init() {
  cacheElements();
  state.isMac = navigator.userAgent.includes('Mac');
  document.body.className = state.isMac ? 'platform-mac' : 'platform-win';
  await loadConfig();
  await loadConversations();
  setupEventListeners();
  setupStreamListeners();
  renderConvList();
  renderMessages();
  console.log('💬 对话窗口就绪');
}

function cacheElements() {
  elements.messagesContainer = document.getElementById('messages-container');
  elements.messageInput = document.getElementById('message-input');
  elements.btnSend = document.getElementById('btn-send');
  elements.btnNewConv = document.getElementById('btn-new-conv');
  elements.btnMinimize = document.getElementById('btn-minimize');
  elements.btnClose = document.getElementById('btn-close');
  elements.convList = document.getElementById('conv-list');
  elements.currentModel = document.getElementById('current-model');
  elements.renameModal = document.getElementById('rename-modal');
  elements.renameInput = document.getElementById('rename-input');
  elements.btnRenameCancel = document.getElementById('btn-rename-cancel');
  elements.btnRenameConfirm = document.getElementById('btn-rename-confirm');
}

async function loadConfig() {
  try {
    state.llmConfig = await window.chatAPI.getLLMConfig();
    if (elements.currentModel) elements.currentModel.textContent = state.llmConfig?.model || '未配置';
  } catch (e) { console.error('加载配置失败:', e); }
}

async function loadConversations() {
  try {
    state.conversations = await window.chatAPI.getConversations() || [];
    const active = await window.chatAPI.getActiveConversation();
    if (active) {
      state.activeConvId = active.id;
      state.messages = active.messages || [];
    } else if (state.conversations.length > 0) {
      // 自动选择第一个对话
      await switchConversation(state.conversations[0].id);
    }
  } catch (e) { console.error('加载对话失败:', e); }
}

// ====== 事件监听 ======
function setupEventListeners() {
  elements.btnMinimize?.addEventListener('click', () => window.chatAPI.minimizeWindow());
  elements.btnClose?.addEventListener('click', () => window.chatAPI.closeWindow());
  elements.btnNewConv?.addEventListener('click', newConversation);
  elements.btnSend.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  elements.messageInput.addEventListener('input', autoResizeInput);

  // 重命名弹窗
  elements.btnRenameCancel.addEventListener('click', closeRenameModal);
  elements.btnRenameConfirm.addEventListener('click', confirmRename);
  elements.renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') closeRenameModal();
  });

  // 委托：快速操作 + 复制 + 对话操作
  document.addEventListener('click', (e) => {
    const quickBtn = e.target.closest('.quick-btn');
    if (quickBtn) { elements.messageInput.value = quickBtn.dataset.prompt; sendMessage(); return; }
    const copyBtn = e.target.closest('.message-action-btn');
    if (copyBtn) { copyMessageContent(copyBtn); return; }
    // 对话项点击
    const convItem = e.target.closest('.conv-item');
    if (convItem && !e.target.closest('.conv-action-btn')) {
      switchConversation(convItem.dataset.id);
      return;
    }
    // 重命名按钮
    const renameBtn = e.target.closest('.conv-action-btn.rename');
    if (renameBtn) { openRenameModal(renameBtn.closest('.conv-item').dataset.id); return; }
    // 删除按钮
    const delBtn = e.target.closest('.conv-action-btn.delete');
    if (delBtn) { deleteConversation(delBtn.closest('.conv-item').dataset.id); return; }
  });
}

function setupStreamListeners() {
  window.chatAPI.onStreamChunk(({ requestId, chunk }) => {
    if (requestId !== state.currentRequestId) return;
    state.streamingMessage += chunk;
    updateStreamingMessage();
  });
  window.chatAPI.onStreamDone(({ requestId }) => {
    if (requestId !== state.currentRequestId) return;
    finishStreaming();
  });
  window.chatAPI.onStreamError(({ requestId, error }) => {
    if (requestId !== state.currentRequestId) return;
    handleStreamError(error);
  });
}

// ====== 对话管理 ======

async function newConversation() {
  if (state.isStreaming) return;
  const conv = await window.chatAPI.createConversation('新对话');
  state.conversations.unshift(conv);
  state.activeConvId = conv.id;
  state.messages = [];
  renderConvList();
  renderMessages();
}

async function switchConversation(id) {
  if (state.isStreaming || id === state.activeConvId) return;
  const messages = await window.chatAPI.switchConversation(id);
  state.activeConvId = id;
  state.messages = messages || [];
  renderConvList();
  renderMessages();
}

async function deleteConversation(id) {
  if (state.isStreaming) return;
  await window.chatAPI.deleteConversation(id);
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.activeConvId === id) {
    if (state.conversations.length > 0) {
      await switchConversation(state.conversations[0].id);
    } else {
      state.activeConvId = null;
      state.messages = [];
      renderMessages();
    }
  }
  renderConvList();
}

function openRenameModal(id) {
  state.renameTargetId = id;
  const conv = state.conversations.find(c => c.id === id);
  if (conv) elements.renameInput.value = conv.title;
  elements.renameModal.classList.remove('hidden');
  elements.renameInput.focus();
  elements.renameInput.select();
}

function closeRenameModal() {
  elements.renameModal.classList.add('hidden');
  state.renameTargetId = null;
}

async function confirmRename() {
  const title = elements.renameInput.value.trim();
  if (!title || !state.renameTargetId) { closeRenameModal(); return; }
  await window.chatAPI.renameConversation(state.renameTargetId, title);
  const conv = state.conversations.find(c => c.id === state.renameTargetId);
  if (conv) conv.title = title;
  closeRenameModal();
  renderConvList();
}

function renderConvList() {
  const list = elements.convList;
  if (state.conversations.length === 0) {
    list.innerHTML = '<div class="conv-empty">暂无对话<br><small>点击上方按钮创建</small></div>';
    return;
  }
  list.innerHTML = state.conversations.map(c => `
    <div class="conv-item ${c.id === state.activeConvId ? 'active' : ''}" data-id="${c.id}">
      <span class="conv-item-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
      <div class="conv-item-actions">
        <button class="conv-action-btn rename" title="重命名">✏️</button>
        <button class="conv-action-btn delete" title="删除">🗑️</button>
      </div>
    </div>
  `).join('');
}

// ====== 消息发送 ======
async function sendMessage() {
  const content = elements.messageInput.value.trim();
  if (!content || state.isStreaming) return;
  elements.messageInput.value = '';
  autoResizeInput();

  // 如果没有活跃对话，自动创建
  if (!state.activeConvId) {
    await newConversation();
  }

  const welcome = document.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  addMessage('user', content);
  scrollToBottom();

  await loadConfig();
  if (!state.llmConfig?.apiKey) {
    handleStreamError('API Key 未配置');
    return;
  }

  setSending(true);
  const messages = [
    { role: 'system', content: '你是一个友好的桌面宠物助手，名字叫 DeskLLMPet。回答简洁、有趣、有帮助。' },
    ...state.messages.map(m => ({ role: m.role, content: m.content }))
  ];

  state.currentRequestId = 'req_' + Date.now();
  state.streamingMessage = '';
  addAssistantPlaceholder();
  window.chatAPI.sendStreamMessage(messages, state.llmConfig, state.currentRequestId);
}

function addMessage(role, content) {
  const msg = { role, content, timestamp: Date.now() };
  state.messages.push(msg);
  window.chatAPI.addChatMessage(msg);
  renderMessage(msg);
  // 更新侧边栏标题（自动使用第一条用户消息）
  renderConvList();
}

function addAssistantPlaceholder() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'streaming-message';
  div.innerHTML = '<div class="message-avatar">🤖</div><div class="message-content"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  elements.messagesContainer.appendChild(div);
  scrollToBottom();
}

function updateStreamingMessage() {
  const d = document.getElementById('streaming-message');
  if (!d) return;
  const c = d.querySelector('.message-content');
  if (c) c.innerHTML = renderMarkdown(state.streamingMessage);
  scrollToBottom();
}

async function finishStreaming() {
  state.isStreaming = false;
  document.getElementById('streaming-message')?.remove();
  if (state.streamingMessage) {
    addMessage('assistant', state.streamingMessage);
  }
  state.streamingMessage = '';
  state.currentRequestId = null;
  setSending(false);
}

function handleStreamError(error) {
  state.isStreaming = false;
  document.getElementById('streaming-message')?.remove();
  const d = document.createElement('div');
  d.className = 'message assistant';
  d.innerHTML = `<div class="message-avatar">⚠️</div><div class="message-content" style="color:var(--danger)">${escapeHtml(String(error))}<br><small>请检查 API 配置</small></div>`;
  elements.messagesContainer.appendChild(d);
  state.streamingMessage = '';
  state.currentRequestId = null;
  setSending(false);
}

// ====== 消息渲染 ======
function renderMessage(msg) {
  const d = document.createElement('div');
  d.className = `message ${msg.role}`;
  d.dataset.content = msg.content;
  const avatar = msg.role === 'user' ? '👤' : '🤖';
  const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  d.innerHTML = `<div class="message-avatar">${avatar}</div><div style="flex:1;min-width:0"><div class="message-content">${renderMarkdown(msg.content)}</div><div class="message-actions"><button class="message-action-btn" title="复制"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span></button><span class="message-time">${time}</span></div></div>`;
  elements.messagesContainer.appendChild(d);
}

function renderMessages() {
  elements.messagesContainer.innerHTML = '';
  if (!state.messages.length) {
    elements.messagesContainer.innerHTML = `<div class="welcome-message"><div class="welcome-icon">🐾</div><h2>欢迎使用 DeskLLMPet AI 对话</h2><p>点击左侧「新对话」开始聊天，历史对话会自动保存</p><div class="quick-actions"><button class="quick-btn" data-prompt="用一句话介绍你自己">👋 自我介绍</button><button class="quick-btn" data-prompt="写一首关于编程的短诗">✍️ 写首诗</button><button class="quick-btn" data-prompt="解释什么是机器学习">🧠 机器学习</button><button class="quick-btn" data-prompt="推荐一本好书">📚 推荐好书</button></div></div>`;
    return;
  }
  state.messages.forEach(m => renderMessage(m));
  scrollToBottom();
}

function copyMessageContent(btn) {
  const content = btn.closest('.message')?.dataset.content || '';
  navigator.clipboard.writeText(content).then(() => {
    btn.classList.add('copied'); btn.querySelector('span').textContent = '已复制';
    setTimeout(() => { btn.classList.remove('copied'); btn.querySelector('span').textContent = '复制'; }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = content; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    btn.classList.add('copied'); btn.querySelector('span').textContent = '已复制';
    setTimeout(() => { btn.classList.remove('copied'); btn.querySelector('span').textContent = '复制'; }, 2000);
  });
}

// ====== 工具函数 ======
function setSending(v) {
  state.isStreaming = v;
  elements.btnSend.disabled = v;
  elements.messageInput.disabled = v;
}

function autoResizeInput() {
  const i = elements.messageInput;
  i.style.height = 'auto';
  i.style.height = Math.min(i.scrollHeight, 150) + 'px';
}

function scrollToBottom() {
  setTimeout(() => { elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight; }, 50);
}

function renderMarkdown(text) {
  if (!text) return '';
  let h = escapeHtml(text);
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = String(text);
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);