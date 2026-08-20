/**
 * LLM 对话窗口管理
 * 类似 DeepSeek 网页端的对话窗口
 * 根据平台自动选择标题栏样式
 */

const { BrowserWindow } = require('electron');
const path = require('path');

let chatWindow = null;

/** 当前平台 */
const isMac = process.platform === 'darwin';

/**
 * 创建对话窗口
 */
function createChatWindow() {
  // 如果已存在，则聚焦
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    return chatWindow;
  }

  // macOS: 使用 hiddenInset 保留原生红绿灯，但通过 trafficLightPosition 定位
  // Windows: 完全自定义标题栏
  const windowOpts = {
    width: 800,
    height: 600,
    minWidth: 500,
    minHeight: 400,
    title: 'DeskLLMPet - AI 对话',
    backgroundColor: '#1a1a2e',
    skipTaskbar: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'chat-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (isMac) {
    // macOS: 使用 hiddenInset 标题栏，红绿灯会自动浮在左上角
    windowOpts.titleBarStyle = 'hiddenInset';
    windowOpts.frame = true; // 保留原生边框
    windowOpts.vibrancy = 'under-window'; // 毛玻璃效果
    windowOpts.visualEffectState = 'active';
    // 让红绿灯和自定义标题对齐
    windowOpts.trafficLightPosition = { x: 12, y: 12 };
  } else {
    // Windows/Linux: 完全自定义标题栏
    windowOpts.frame = false;
    windowOpts.titleBarStyle = 'hidden';
  }

  chatWindow = new BrowserWindow(windowOpts);

  // 加载对话页面
  const chatHtmlPath = path.join(__dirname, '..', 'renderer', 'chat', 'chat.html');
  chatWindow.loadFile(chatHtmlPath);

  // 传递平台信息给渲染进程
  chatWindow.webContents.on('did-finish-load', () => {
    chatWindow.webContents.send('platform-info', { isMac });
  });

  // 窗口关闭时释放引用
  chatWindow.on('closed', () => {
    chatWindow = null;
  });

  return chatWindow;
}

/**
 * 获取对话窗口实例
 */
function getChatWindow() {
  return chatWindow;
}

module.exports = {
  createChatWindow,
  getChatWindow
};