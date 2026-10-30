const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { summarizeUrl } = require('../src/summarize.cjs');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

let petWindow = null;

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = 440;
  const height = 680;
  petWindow = new BrowserWindow({
    width,
    height,
    x: Math.max(workArea.x + 20, workArea.x + workArea.width - width - 20),
    y: Math.max(workArea.y + 20, workArea.y + workArea.height - height - 20),
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  const shotIndex = process.argv.indexOf('--screenshot');
  const screenshotPath = shotIndex >= 0 ? process.argv[shotIndex + 1] : process.env.PET_SCREENSHOT;
  petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')).then(() => {
    if (process.argv.includes('--demo')) {
      const demo = {
        url: 'https://example.com/article',
        title: 'AI 产品开始从聊天框走向桌面',
        site: '示例科技',
        type: 'article',
        isVideo: false,
        provider: 'local',
        summary: {
          tldr: '越来越多 AI 产品把入口缩成一个小窗口，让用户不切换应用也能完成摘要、整理和提醒。',
          bullets: [
            '桌面宠物把拖拽链接和摘要合并成一个动作',
            '小窗口比完整应用更适合常驻',
            '视频摘要需要字幕或音频转写',
            '本地摘要保证没有 API Key 也能先用起来'
          ],
          longSummary: '桌面端 AI 助手正在变轻。\n\n过去要先打开网页、复制正文、再粘贴给模型。现在把链接拖进一个小窗口，抓取、清理和摘要可以在后台完成。\n\n视频场景更依赖字幕。有字幕时能按内容顺序整理，没有字幕时只能根据标题和简介判断，结果里必须把这条限制写清楚。'
        },
        warning: ''
      };
      petWindow.webContents.executeJavaScript('window.__codexPetDebug.renderResult(' + JSON.stringify(demo) + ')');
    }
    if (!screenshotPath) return;
    setTimeout(async () => {
      try {
        const image = await petWindow.webContents.capturePage();
        fs.writeFileSync(screenshotPath, image.toPNG());
        console.log('screenshot saved to ' + screenshotPath);
      } catch (error) {
        console.error('screenshot failed', error);
      }
      app.quit();
    }, 1600);
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('pet:summarize', async (_event, url) => {
  try {
    const data = await summarizeUrl(url);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : '读取失败' };
  }
});

ipcMain.handle('pet:open-external', async (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
  return true;
});

ipcMain.on('pet:close', () => {
  app.quit();
});

ipcMain.on('pet:set-ignore-mouse', (_event, ignore) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  }
});
