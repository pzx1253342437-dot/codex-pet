const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { summarizeUrl } = require('../src/summarize.cjs');

let window = null;

function createWindow() {
  window = new BrowserWindow({
    width: 440,
    height: 680,
    show: true,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
}

app.whenReady().then(async () => {
  ipcMain.handle('pet:summarize', async (_event, url) => {
    try {
      return { ok: true, data: await summarizeUrl(url) };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : '读取失败' };
    }
  });

  createWindow();
  await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 400));

  await window.webContents.executeJavaScript(
    "(() => {" +
    "const data = new DataTransfer();" +
    "data.setData('text/uri-list', 'https://example.com');" +
    "document.getElementById('petWrap').dispatchEvent(new DragEvent('drop', {" +
    "bubbles: true, cancelable: true, dataTransfer: data" +
    "}));" +
    "})()"
  );

  await new Promise((resolve) => setTimeout(resolve, 4000));
  const state = await window.webContents.executeJavaScript(
    "({" +
    "title: document.getElementById('resultTitle').textContent," +
    "tldr: document.getElementById('resultTldr').textContent," +
    "resultVisible: !document.getElementById('result').classList.contains('hidden')," +
    "error: document.getElementById('errorText').textContent," +
    "bodyClass: document.body.className" +
    "})"
  );
  console.log(JSON.stringify(state, null, 2));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'pet-live.png'), image.toPNG());
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
