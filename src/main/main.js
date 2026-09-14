/**
 * Electron 主进程入口
 * 管理应用生命周期、窗口创建和 IPC 通信
 */

const { app, BrowserWindow, ipcMain, nativeTheme, nativeImage } = require('electron');
const path = require('path');
const {
  createPetWindow, getPetWindow, setPetGeometryListener
} = require('./pet-window');
const { createSettingsWindow, getSettingsWindow } = require('./settings-window');
const { createBubbleWindow, positionBubble, hideBubble } = require('./bubble-window');
const { createTray } = require('./tray');
const { registerIpcHandlers } = require('./ipc-handlers');

// 开发模式标记
const isDev = process.argv.includes('--dev');
// 代码目录与启动参数，方便确认「跑的是哪份代码」
const CODE_ROOT = path.join(__dirname, '..', '..');

// 设置应用名称（开发模式下 Dock/任务栏显示的名称）
app.setName('DeskLLMPet');

// macOS: 修复 secure coding 警告
if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'DeskLLMPet',
    applicationVersion: '1.0.0',
    credits: '基于 Electron 构建的桌面宠物应用'
  });
}

// 禁止应用多开
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 用户尝试打开第二个实例时，聚焦已有窗口
    console.warn('');
    console.warn('⚠️  已经有一个 DeskLLMPet 在运行，本次启动被单实例锁拦截并已退出。');
    console.warn('    如果你刚改了代码，请先在托盘菜单点「退出」关掉旧实例，再重新启动，');
    console.warn('    否则跑的还是旧代码，改动不会生效。');
    console.warn('');
    const petWin = getPetWindow();
    if (petWin) {
      petWin.show();
      petWin.focus();
    }
  });
}

/**
 * 应用初始化
 */
async function initApp() {
  console.log(`🚀 DeskLLMPet 启动 v${app.getVersion()} | 代码目录: ${CODE_ROOT} | 参数: ${process.argv.slice(1).join(' ') || '(无)'}`);

  // 注册所有 IPC 处理器
  registerIpcHandlers();

  // 创建桌宠窗口
  await createPetWindow(isDev);

  // 气泡窗口（隐藏，用到时才显示）
  createBubbleWindow();

  // 桌宠移动 / 缩放 / 显隐时，气泡跟着走
  setPetGeometryListener(() => {
    const petWin = getPetWindow();
    if (!petWin || !petWin.isVisible()) {
      hideBubble();
      return;
    }
    positionBubble();
  });

  // 创建系统托盘（Windows 和 macOS 都可用）
  createTray();

  // macOS: 设置 Dock 图标并确保可见
  if (process.platform === 'darwin') {
    // 设置 Dock 图标（开发模式用 PNG，打包后用 icns）
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock?.setIcon(dockIcon);
      }
    } catch (e) {
      // 图标文件不存在时静默忽略，使用默认图标
    }
    app.dock?.show();
  }

  // 监听主题变化
  nativeTheme.on('updated', () => {
    const petWin = getPetWindow();
    if (petWin) {
      petWin.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  });
}

// 应用就绪
app.whenReady().then(initApp);

// 所有窗口关闭时（macOS 不退出）
app.on('window-all-closed', () => {
  // macOS 下保持应用在 Dock 中运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 激活应用时（点击 Dock 图标）
app.on('activate', () => {
  const petWin = getPetWindow();
  if (petWin) {
    petWin.show();
  } else {
    createPetWindow(isDev);
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  // 保存状态等清理工作
});