/**
 * 对话窗口预加载脚本
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatAPI', {
  // LLM 配置
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),

  // 对话管理
  getConversations: () => ipcRenderer.invoke('get-conversations'),
  createConversation: (title) => ipcRenderer.invoke('create-conversation', title),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),
  renameConversation: (id, title) => ipcRenderer.invoke('rename-conversation', { id, title }),
  switchConversation: (id) => ipcRenderer.invoke('switch-conversation', id),
  getActiveConversation: () => ipcRenderer.invoke('get-active-conversation'),

  // 消息（兼容旧接口）
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  addChatMessage: (message) => ipcRenderer.invoke('add-chat-message', message),
  clearChatHistory: () => ipcRenderer.invoke('clear-chat-history'),

  // 发送消息
  sendMessage: (messages, config) => ipcRenderer.invoke('chat-send', { messages, config }),
  sendStreamMessage: (messages, config, requestId) => {
    ipcRenderer.send('chat-send-stream', { messages, config, requestId });
  },

  // 流式响应
  onStreamChunk: (cb) => ipcRenderer.on('chat-stream-chunk', (e, d) => cb(d)),
  onStreamDone: (cb) => ipcRenderer.on('chat-stream-done', (e, d) => cb(d)),
  onStreamError: (cb) => ipcRenderer.on('chat-stream-error', (e, d) => cb(d)),
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('chat-stream-chunk');
    ipcRenderer.removeAllListeners('chat-stream-done');
    ipcRenderer.removeAllListeners('chat-stream-error');
  },

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-chat-window'),
  closeWindow: () => ipcRenderer.invoke('close-chat-window')
});