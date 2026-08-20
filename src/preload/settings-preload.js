/**
 * 设置窗口预加载脚本
 * 安全地暴露主进程 API 到渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  // 获取所有配置
  getAllConfig: () => ipcRenderer.invoke('get-all-config'),
  // 获取 LLM 配置
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),
  // 更新 LLM 配置
  setLLMConfig: (config) => ipcRenderer.invoke('set-llm-config', config),
  // 获取动画配置
  getAnimationConfig: () => ipcRenderer.invoke('get-animation-config'),
  // 更新动画配置
  setAnimationConfig: (config) => ipcRenderer.invoke('set-animation-config', config),
  // 获取可用动画列表
  getAvailableAnimations: () => ipcRenderer.invoke('get-available-animations'),
  // 获取宠物设置
  getPetConfig: () => ipcRenderer.invoke('get-pet-config'),
  // 更新宠物设置
  setPetConfig: (config) => ipcRenderer.invoke('set-pet-config', config),
  // 选择动画文件
  selectAnimationFile: () => ipcRenderer.invoke('select-animation-file'),
  // 测试 API 连接
  testConnection: (config) => ipcRenderer.invoke('test-api-connection', config),
  // 获取应用路径
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // 窗口控制
  closeWindow: () => ipcRenderer.invoke('close-settings-window'),

  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});