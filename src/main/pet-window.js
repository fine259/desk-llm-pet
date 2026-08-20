/**
 * 桌宠窗口管理
 * 透明、无边框、置顶、所有桌面显示
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getWindowPosition, saveWindowPosition, getPetConfig } = require('../shared/store');

let petWindow = null;

async function createPetWindow(isDev = false) {
  const savedPosition = getWindowPosition();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
  const petConfig = getPetConfig();
  const savedScale = Number(petConfig.scale) || 1;
  const windowSize = Math.round(300 * savedScale);
  const isMac = process.platform === 'darwin';

  const defaultX = savedPosition?.petX ?? screenWidth - windowSize - 40;
  const defaultY = savedPosition?.petY ?? screenHeight - windowSize - 40;

  petWindow = new BrowserWindow({
    width: windowSize,
    height: windowSize,
    x: defaultX,
    y: defaultY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      transparent: true
    }
  });

  await petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pet', 'pet.html'));

  // macOS: screen-saver 级别置顶，覆盖全屏应用
  // Windows: floating 级别
  petWindow.setAlwaysOnTop(true, isMac ? 'screen-saver' : 'floating');

  // 启动时应用保存的透明度
  const savedOpacity = Number(petConfig.opacity);
  if (!isNaN(savedOpacity) && savedOpacity > 0) {
    petWindow.setOpacity(savedOpacity);
  }

  if (isDev) {
    petWindow.webContents.openDevTools({ mode: 'detach' });
  }

  petWindow.on('moved', () => {
    if (petWindow) {
      const [x, y] = petWindow.getPosition();
      saveWindowPosition(x, y);
    }
  });

  petWindow.on('closed', () => { petWindow = null; });

  return petWindow;
}

function getPetWindow() { return petWindow; }

function togglePetWindow() {
  if (!petWindow) return;
  if (petWindow.isVisible()) petWindow.hide();
  else petWindow.show();
}

function setPetScale(scale) {
  if (!petWindow) return;
  const s = Number(scale) || 1;
  petWindow.setSize(Math.round(300 * s), Math.round(300 * s));
  petWindow.webContents.send('scale-changed', s);
}

function setPetOpacity(opacity) {
  if (!petWindow) return;
  petWindow.setOpacity(Number(opacity) || 1);
}

module.exports = {
  createPetWindow, getPetWindow, togglePetWindow,
  setPetScale, setPetOpacity
};