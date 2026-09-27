#!/usr/bin/env node
/**
 * 渲染进程冒烟测试（真实 Electron，不带界面）
 * ============================================================================
 * 用真实的 preload / IPC / 插件宿主把三个页面各加载一次，确认：
 *   1. 桌宠页面能拿到插件贡献的右键菜单项
 *   2. 设置页面能动态渲染出插件的设置面板
 *   3. AI 对话插件窗口能打开，preload 桥可用，且「未配置 API Key」能在
 *      「渲染进程 → 主进程 → 渲染进程」整条链路上正确回报
 *   4. 全程没有渲染进程报错（console.error / preload 异常 / 加载失败）
 *
 * 用法：npm run check:renderer
 * 若所在环境的 Chromium 沙箱不可用，可追加 --no-sandbox
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');

// 把 userData 放到工作区内，避免污染真实配置；每次运行前清空，保证结果可复现
const SMOKE_USER_DATA = path.join(__dirname, '..', '.smoke-userdata');
fs.rmSync(SMOKE_USER_DATA, { recursive: true, force: true });
app.setPath('userData', SMOKE_USER_DATA);

const ROOT = path.join(__dirname, '..');
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `\n     ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** 收集页面错误（console.error / preload 异常 / 加载失败） */
function watchPage(win, label) {
  const errors = [];
  win.webContents.on('console-message', (event, level, message) => {
    if (Number(level) >= 3) errors.push(`${label} console.error: ${message}`);
  });
  win.webContents.on('preload-error', (event, preloadPath, error) => {
    errors.push(`${label} preload 异常 (${path.basename(preloadPath)}): ${error.message}`);
  });
  win.webContents.on('did-fail-load', (event, code, desc, url, isMainFrame) => {
    if (isMainFrame) errors.push(`${label} 加载失败 ${code} ${desc}: ${url}`);
  });
  win.webContents.on('render-process-gone', (event, details) => {
    errors.push(`${label} 渲染进程退出: ${details.reason}`);
  });
  return errors;
}

/**
 * 等待页面加载完成
 * 用轮询而不是事件：插件窗口是在命令里同步开始加载的，
 * 事件可能在监听器挂上之前就已经触发过
 */
async function waitUntilLoaded(win, label, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (win.isDestroyed()) throw new Error(`${label} 窗口已关闭`);
    if (!win.webContents.isLoading() && win.webContents.getURL()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} 加载超时`);
}

function createPage(htmlRel, preloadRel, label) {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, preloadRel),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const errors = watchPage(win, label);
  return { win, errors, load: () => win.loadFile(path.join(ROOT, htmlRel)) };
}

async function main() {
  const { registerIpcHandlers } = require('../src/main/ipc-handlers');
  const { createPluginManager } = require('../src/plugins/plugin-manager');

  registerIpcHandlers();

  const host = createPluginManager({
    electron: { app, ipcMain, BrowserWindow, shell, dialog },
    logger: console,
    hostServices: {
      getSharedLLMConfig: () => null,   // 保证「未配置」分支可复现
      openSettings: () => true
    }
  });
  const reports = await host.loadAll();
  record('插件加载', reports.every((r) => r.status !== 'error'),
    reports.map((r) => `${r.id}:${r.status}`).join(', '));

  const allErrors = [];

  // ---------- 1. 桌宠页面 ----------
  const pet = createPage('src/renderer/pet/pet.html', 'src/preload/pet-preload.js', '桌宠');
  await pet.load();
  await new Promise((r) => setTimeout(r, 800));   // 等 init() 完成

  const petMenu = await pet.win.webContents.executeJavaScript(
    `(async () => {
       const items = await window.petAPI.getPluginMenuItems();
       return {
         api: items.length,
         dom: document.querySelectorAll('#plugin-menu-items .menu-item').length,
         label: (document.querySelector('#plugin-menu-items .menu-item span:last-child') || {}).textContent || ''
       };
     })()`
  ).catch((e) => ({ error: e.message }));

  record('桌宠页面：插件右键菜单已注入',
    petMenu.api === 1 && petMenu.dom === 1,
    `API=${petMenu.api} DOM=${petMenu.dom} 文案=${petMenu.label}`);

  // ---------- 2. 设置页面 ----------
  const settings = createPage('src/renderer/settings/settings.html', 'src/preload/settings-preload.js', '设置');
  await settings.load();
  await new Promise((r) => setTimeout(r, 800));   // 等插件面板渲染

  const settingsPanel = await settings.win.webContents.executeJavaScript(
    `(() => {
       const btn = document.querySelector('#tab-nav .tab-btn[data-tab="plugin-llm-chat"]');
       const panel = document.getElementById('tab-plugin-llm-chat');
       const group = panel && panel.querySelector('[data-plugin-id="llm-chat"]');
       return {
         tab: !!btn,
         tabText: btn ? btn.textContent.trim() : '',
         panel: !!panel,
         fields: group ? group.querySelectorAll('[data-field-key]').length : 0,
         saveBtn: group ? !!group.querySelector('[data-plugin-save]') : false,
         actions: group ? group.querySelectorAll('[data-plugin-action]').length : 0,
         modelValue: group ? (group.querySelector('[data-field-key="model"]') || {}).value : ''
       };
     })()`
  ).catch((e) => ({ error: e.message }));

  record('设置页面：插件设置面板已动态生成',
    settingsPanel.tab && settingsPanel.panel && settingsPanel.fields >= 7 &&
    settingsPanel.saveBtn && settingsPanel.actions >= 1 && settingsPanel.modelValue === 'deepseek-chat',
    JSON.stringify(settingsPanel));

  // ---------- 3. AI 对话插件窗口 ----------
  const before = BrowserWindow.getAllWindows().length;
  const command = await host.runCommand('llm-chat', 'open-chat', { source: 'smoke' });
  const chatWin = BrowserWindow.getAllWindows().find((w) => w !== pet.win && w !== settings.win && !w.isDestroyed());
  chatWin?.hide();   // 冒烟测试不打扰桌面

  const chatWindowOk = command.success && !!chatWin && BrowserWindow.getAllWindows().length === before + 1;
  record('AI 对话窗口由插件命令创建', chatWindowOk, command.error || '');

  let chatResult = { error: '窗口未创建' };
  if (chatWin) {
    const errors = watchPage(chatWin, '对话');
    try {
      await waitUntilLoaded(chatWin, '对话');
      chatWin.hide();
      await new Promise((r) => setTimeout(r, 600));
      chatResult = await chatWin.webContents.executeJavaScript(
        `(async () => {
           const config = await window.chatAPI.getConfig();
           const list = await window.chatAPI.listConversations();

           // 走真实 UI 路径：填输入框 → 点发送按钮
           document.getElementById('message-input').value = '你好';
           document.getElementById('btn-send').click();

           // 等错误气泡出现（未配置 API Key）
           const start = Date.now();
           while (Date.now() - start < 8000) {
             if (document.querySelector('.message.assistant.error')) break;
             await new Promise((resolve) => setTimeout(resolve, 100));
           }

           return {
             bridge: typeof window.chatAPI.sendMessage === 'function',
             modal: config.model,
             endpoint: config.endpoint,
             hasApiKey: config.hasApiKey,
             listCount: Array.isArray(list) ? list.length : -1,
             welcomeGone: !document.querySelector('.welcome-message'),
             userBubbles: document.querySelectorAll('.message.user').length,
             errorBubbles: document.querySelectorAll('.message.assistant.error').length,
             errorText: (document.querySelector('.message.assistant.error .message-content') || {}).textContent || '',
             sendButtonReset: !document.getElementById('btn-send').classList.contains('stop'),
             sidebarItems: document.querySelectorAll('.conv-item').length
           };
         })()`
      );
    } catch (e) {
      chatResult = { error: e.message };
    }
    allErrors.push(...errors);
  }

  record('对话页面：preload 桥与首屏渲染正常',
    chatResult.bridge === true && chatResult.modal === 'deepseek-chat' && chatResult.listCount === 0,
    JSON.stringify({ bridge: chatResult.bridge, model: chatResult.modal, endpoint: chatResult.endpoint }));

  record('对话页面：点击发送后 UI 与错误链路都正确',
    chatResult.welcomeGone === true && chatResult.userBubbles === 1 && chatResult.errorBubbles === 1 &&
    /API Key/.test(chatResult.errorText || '') && chatResult.sendButtonReset === true,
    JSON.stringify({
      welcomeGone: chatResult.welcomeGone,
      userBubbles: chatResult.userBubbles,
      errorBubbles: chatResult.errorBubbles,
      errorText: chatResult.errorText,
      sendButtonReset: chatResult.sendButtonReset
    }));

  // 会话应当已落库
  const persisted = await chatWin?.webContents.executeJavaScript('window.chatAPI.listConversations()').catch(() => null);
  record('对话页面：发送后会话已持久化',
    Array.isArray(persisted) && persisted.length === 1 && persisted[0].messageCount === 1,
    JSON.stringify(persisted));

  // ---------- 4. 页面错误 ----------
  allErrors.push(...pet.errors, ...settings.errors);
  record('三个页面均无渲染错误', allErrors.length === 0, allErrors.join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(failed.length === 0
    ? `✅ 渲染进程冒烟测试通过：${results.length} 项`
    : `❌ 渲染进程冒烟测试失败：${failed.length}/${results.length} 项`);
  app.exit(failed.length === 0 ? 0 : 1);
}

app.whenReady()
  .then(main)
  .catch((e) => {
    console.error('❌ 冒烟测试异常:', e && e.stack ? e.stack : e);
    app.exit(1);
  });
