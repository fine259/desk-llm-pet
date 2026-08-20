/**
 * 桌宠窗口预加载脚本
 * 安全地暴露主进程 API 到渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // 获取配置
  getAnimationConfig: () => ipcRenderer.invoke('get-animation-config'),
  getAvailableAnimations: () => ipcRenderer.invoke('get-available-animations'),
  getPetConfig: () => ipcRenderer.invoke('get-pet-config'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // 窗口操作
  moveWindow: (payload) => ipcRenderer.send('move-pet-window', payload),
  openChat: () => ipcRenderer.invoke('open-chat-window'),
  openSettings: () => ipcRenderer.invoke('open-settings-window'),
  hidePet: () => ipcRenderer.invoke('hide-pet'),
  quitApp: () => ipcRenderer.invoke('quit-app'),

  // 监听：动画配置变更（设置页面保存后实时生效）
  onReloadAnimations: (callback) => {
    ipcRenderer.on('reload-animations', (event, config) => callback(config));
  },
  // 监听：宠物配置变更
  onConfigChanged: (callback) => {
    ipcRenderer.on('config-changed', (event, config) => callback(config));
  },
  // 监听：窗口移动
  onWindowMoved: (callback) => {
    ipcRenderer.on('window-moved', (event, pos) => callback(pos));
  },
  // 监听：主题变化
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (event, theme) => callback(theme));
  },
  // 监听：缩放变化
  onScaleChanged: (callback) => {
    ipcRenderer.on('scale-changed', (event, scale) => callback(scale));
  }
});