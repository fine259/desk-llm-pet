/**
 * 系统托盘管理
 * - 单击：直接显示/隐藏桌宠
 * - 右键/Ctrl+单击：弹出菜单
 * - 双击：显示桌宠
 */

const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const { togglePetWindow, getPetWindow } = require('./pet-window');
const { createSettingsWindow } = require('./settings-window');

let tray = null;
const isMac = process.platform === 'darwin';

/**
 * 构建菜单（用于右键弹出）
 */
function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: '显示/隐藏桌宠',
      click: () => togglePetWindow()
    },
    {
      label: '立即查看 API 余额',
      click: () => {
        const petWin = getPetWindow();
        if (!petWin) return;
        if (!petWin.isVisible()) petWin.show();
        petWin.webContents.send('show-balance');
      }
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: '关于 DeskLLMPet',
      click: () => {
        const { dialog, shell } = require('electron');
        dialog.showMessageBox({
          type: 'info',
          title: '关于 DeskLLMPet',
          message: 'DeskLLMPet v1.0.0',
          detail: '一款支持 API 余额气泡、文件拖拽回收的交互式桌面宠物应用。\n\n基于 Electron 构建，支持 Windows 和 macOS。\n\n🔗 GitHub: https://github.com/isKage/desk-llm-pet',
          buttons: ['确定', '访问 GitHub'],
          defaultId: 0,
          cancelId: 0
        }).then(({ response }) => {
          if (response === 1) {
            shell.openExternal('https://github.com/isKage/desk-llm-pet');
          }
        });
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ]);
}

/**
 * 创建系统托盘
 */
function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  const fs = require('fs');

  if (fs.existsSync(iconPath)) {
    tray = new Tray(iconPath);
  } else {
    tray = new Tray(createDefaultIcon());
  }

  tray.setToolTip('DeskLLMPet - 桌面宠物 | 单击切换 | 右键菜单');

  if (isMac) {
    // macOS：左键单击 → 切换桌宠显示
    tray.on('click', () => {
      const petWin = getPetWindow();
      if (petWin && petWin.isVisible()) {
        petWin.hide();
      } else if (petWin) {
        petWin.show();
      }
    });
    // 右键 → 弹出菜单
    tray.on('right-click', () => {
      tray.popUpContextMenu(buildMenu());
    });
  } else {
    // Windows/Linux：设置右键菜单，左键单击切换
    tray.setContextMenu(buildMenu());
    tray.on('click', () => {
      const petWin = getPetWindow();
      if (petWin && petWin.isVisible()) {
        petWin.hide();
      } else if (petWin) {
        petWin.show();
      }
    });
  }

  // 双击托盘 → 显示桌宠
  tray.on('double-click', () => {
    const petWin = getPetWindow();
    if (petWin && !petWin.isVisible()) {
      petWin.show();
    }
  });

  return tray;
}

/**
 * 生成默认托盘图标
 */
function createDefaultIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = size / 2, cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < size / 2 - 1) {
        buffer[idx] = 138;
        buffer[idx + 1] = 43;
        buffer[idx + 2] = 226;
        buffer[idx + 3] = 255;
      } else {
        buffer[idx + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function getTray() { return tray; }

module.exports = { createTray, getTray };