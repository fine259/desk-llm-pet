/**
 * 桌宠窗口预加载脚本
 * 安全地暴露主进程 API 到渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// webUtils 在新版 Electron 中用于获取拖拽文件的真实路径（旧版本回退到 file.path）
let webUtils = null;
try { ({ webUtils } = require('electron')); } catch (e) { webUtils = null; }

contextBridge.exposeInMainWorld('petAPI', {
  // 获取配置
  getAnimationConfig: () => ipcRenderer.invoke('get-animation-config'),
  getAvailableAnimations: () => ipcRenderer.invoke('get-available-animations'),
  getPetConfig: () => ipcRenderer.invoke('get-pet-config'),
  getBalanceConfig: () => ipcRenderer.invoke('get-balance-config'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // API 余额
  getApiBalance: () => ipcRenderer.invoke('get-api-balance'),

  // 气泡（由独立的气泡窗口显示）
  showBubble: (payload) => ipcRenderer.invoke('pet-show-bubble', payload),

  // 窗口操作
  moveWindow: (payload) => ipcRenderer.send('move-pet-window', payload),
  openSettings: () => ipcRenderer.invoke('open-settings-window'),
  hidePet: () => ipcRenderer.invoke('hide-pet'),
  quitApp: () => ipcRenderer.invoke('quit-app'),

  // 文件拖拽 → 回收站
  trashItems: (paths) => ipcRenderer.invoke('trash-items', paths),
  // 拖拽诊断日志（打印到主进程终端，便于排查拖拽无响应）
  dndDebug: (stage, detail) => ipcRenderer.send('dnd-debug', { stage, detail }),
  // 获取拖拽文件的本地路径（Electron 29+ 用 webUtils，旧版直接用 file.path）
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file) || '';
      }
    } catch (e) { /* 回退到 file.path */ }
    try { return file && file.path ? file.path : ''; } catch (e) { return ''; }
  },

  // 监听：动画配置变更（设置页面保存后实时生效）
  onReloadAnimations: (callback) => {
    ipcRenderer.on('reload-animations', (event, config) => callback(config));
  },
  // 监听：宠物配置变更
  onConfigChanged: (callback) => {
    ipcRenderer.on('config-changed', (event, config) => callback(config));
  },
  // 监听：余额配置变更
  onBalanceConfigChanged: (callback) => {
    ipcRenderer.on('balance-config-changed', (event, config) => callback(config));
  },
  // 监听：手动触发余额展示（托盘菜单）
  onShowBalance: (callback) => {
    ipcRenderer.on('show-balance', () => callback());
  },
  // 监听：窗口移动
  onWindowMoved: (callback) => {
    ipcRenderer.on('window-moved', (event, pos) => callback(pos));
  },
  // 监听：主题变化
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (event, theme) => callback(theme));
  },
  // 监听：窗口尺寸/裁剪变化（气泡由主进程负责，这里仅保留主题与配置监听）
});
