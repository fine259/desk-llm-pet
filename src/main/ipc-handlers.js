/**
 * IPC 通信处理
 * 处理渲染进程与主进程之间的通信
 */

const { ipcMain, dialog, app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  getLLMConfig, setLLMConfig,
  getAnimationConfig, setAnimationConfig,
  getPetConfig, setPetConfig,
  getChatHistory, addChatMessage, clearChatHistory,
  getAllConfig,
  getConversations, createConversation, deleteConversation,
  renameConversation, getActiveConversationId, setActiveConversationId,
  getActiveConversation
} = require('../shared/store');
const { chatCompletion } = require('../shared/llm-client');
const { createChatWindow } = require('./chat-window');
const { createSettingsWindow } = require('./settings-window');
const {
  togglePetWindow, setPetScale, setPetOpacity,
  getPetWindow
} = require('./pet-window');

/**
 * 向桌宠窗口发送消息（安全检查）
 */
function sendToPet(channel, data) {
  const win = getPetWindow();
  if (win && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

/**
 * 注册所有 IPC 处理器
 */
function registerIpcHandlers() {
  // ====== LLM 相关 ======

  ipcMain.handle('get-llm-config', () => getLLMConfig());

  ipcMain.handle('set-llm-config', (event, config) => {
    setLLMConfig(config);
    return { success: true };
  });

  ipcMain.handle('chat-send', async (event, payload) => {
    try {
      const { messages, config } = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload : { messages: payload, config: null };
      const llmConfig = config || getLLMConfig();
      const response = await chatCompletion(llmConfig, messages);
      return { success: true, content: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.on('chat-send-stream', async (event, payload) => {
    const { messages, config, requestId } = payload || {};
    const llmConfig = (config && config.apiEndpoint) ? config : getLLMConfig();
    try {
      await chatCompletion(llmConfig, messages, (chunk) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('chat-stream-chunk', { requestId, chunk });
        }
      });
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('chat-stream-done', { requestId });
      }
    } catch (e) {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('chat-stream-error', { requestId, error: e.message });
      }
    }
  });

  // ====== 对话历史 ======

  ipcMain.handle('get-chat-history', () => getChatHistory());
  ipcMain.handle('add-chat-message', (event, message) => addChatMessage(message));
  ipcMain.handle('clear-chat-history', () => { clearChatHistory(); return { success: true }; });

  // ====== 多对话管理 ======

  ipcMain.handle('get-conversations', () => getConversations());

  ipcMain.handle('create-conversation', (event, title) => {
    return createConversation(title);
  });

  ipcMain.handle('delete-conversation', (event, id) => {
    deleteConversation(id);
    return { success: true };
  });

  ipcMain.handle('rename-conversation', (event, { id, title }) => {
    renameConversation(id, title);
    return { success: true };
  });

  ipcMain.handle('switch-conversation', (event, id) => {
    setActiveConversationId(id);
    const conv = getActiveConversation();
    return conv ? conv.messages : [];
  });

  ipcMain.handle('get-active-conversation', () => {
    const conv = getActiveConversation();
    return conv || null;
  });

  // ====== 动画配置 ======

  ipcMain.handle('get-animation-config', () => getAnimationConfig());

  // 更新动画配置时，通知桌宠窗口实时重载动画
  ipcMain.handle('set-animation-config', (event, config) => {
    setAnimationConfig(config);
    // 通知桌宠窗口重载动画
    sendToPet('reload-animations', config);
    return { success: true };
  });

  ipcMain.handle('get-available-animations', () => scanAnimationFiles());

  // ====== 宠物设置 ======

  ipcMain.handle('get-pet-config', () => getPetConfig());

  ipcMain.handle('set-pet-config', (event, config) => {
    if (config && typeof config === 'object') {
      setPetConfig(config);
      if (config.scale !== undefined) setPetScale(Number(config.scale));
      if (config.opacity !== undefined) setPetOpacity(Number(config.opacity));
      // 通知桌宠配置变更
      sendToPet('config-changed', config);
    }
    return { success: true };
  });

  ipcMain.handle('get-all-config', () => getAllConfig());

  // ====== 窗口操作 ======

  ipcMain.handle('open-chat-window', () => { createChatWindow(); return { success: true }; });
  ipcMain.handle('open-settings-window', () => { createSettingsWindow(); return { success: true }; });
  ipcMain.handle('hide-pet', () => { togglePetWindow(); return { success: true }; });

  // 移动桌宠窗口
  ipcMain.on('move-pet-window', (event, payload) => {
    const petWin = getPetWindow();
    if (!petWin) return;
    let deltaX, deltaY;
    if (payload && typeof payload === 'object') {
      deltaX = Math.round(Number(payload.deltaX) || 0);
      deltaY = Math.round(Number(payload.deltaY) || 0);
    }
    if (isNaN(deltaX) || isNaN(deltaY)) return;
    const [x, y] = petWin.getPosition();
    petWin.setPosition(x + deltaX, y + deltaY);
  });

  ipcMain.handle('quit-app', () => { app.quit(); return { success: true }; });

  // 窗口控制
  ipcMain.handle('minimize-chat-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });
  ipcMain.handle('maximize-chat-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });
  ipcMain.handle('close-chat-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
  ipcMain.handle('close-settings-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  // 打开外部链接
  ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle('select-animation-file', async () => {
    return await dialog.showOpenDialog({
      title: '选择动画文件',
      filters: [
        { name: 'WebM 视频', extensions: ['webm'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    });
  });

  ipcMain.handle('get-app-path', () => ({
    userData: app.getPath('userData'),
    appData: app.getPath('appData'),
    assets: path.join(__dirname, '..', '..', 'assets', 'animations'),
    projectRoot: path.join(__dirname, '..', '..')
  }));

  ipcMain.handle('test-api-connection', async (event, config) => {
    try {
      const result = await chatCompletion(config, [{ role: 'user', content: '你好，请简短回复' }]);
      return { success: true, content: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

/**
 * 扫描动画文件目录
 */
function scanAnimationFiles() {
  const projectRoot = path.join(__dirname, '..', '..');
  const result = { idle: [], click: [] };

  const scanDirs = [
    { idle: path.join(projectRoot, 'assets', 'animations', 'idle'), click: path.join(projectRoot, 'assets', 'animations', 'click') },
    { idle: path.join(projectRoot, 'assets', 'thumb'), click: null }
  ];

  for (const dirs of scanDirs) {
    if (dirs.idle && fs.existsSync(dirs.idle)) {
      const files = fs.readdirSync(dirs.idle).filter(f => f.endsWith('.webm'));
      for (const f of files) {
        const isClickReaction = /点击回应|被吓|被鼠标|拖拽|炸毛|害羞|生气|开心跃动|傲娇/i.test(f);
        const category = isClickReaction ? 'click' : 'idle';
        const relativePath = path.relative(projectRoot, path.join(dirs.idle, f));
        result[category].push({ name: f, path: relativePath.replace(/\\/g, '/') });
      }
    }
    if (dirs.click && fs.existsSync(dirs.click)) {
      const files = fs.readdirSync(dirs.click).filter(f => f.endsWith('.webm'));
      for (const f of files) {
        const relativePath = path.relative(projectRoot, path.join(dirs.click, f));
        result.click.push({ name: f, path: relativePath.replace(/\\/g, '/') });
      }
    }
  }

  result.idle = deduplicateByName(result.idle);
  result.click = deduplicateByName(result.click);
  console.log(`📁 扫描动画: ${result.idle.length} 个闲置, ${result.click.length} 个点击反应`);
  return result;
}

function deduplicateByName(list) {
  const seen = new Set();
  return list.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

module.exports = { registerIpcHandlers };