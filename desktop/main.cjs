'use strict';
const { app, BrowserWindow, Menu, session, dialog, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// The portable build keeps its cache beside the executable, including media and recovery.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const data = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'SocratesVideoPro-data');
  fs.mkdirSync(data, { recursive: true }); app.setPath('userData', data);
}
const smoke = process.argv.includes('--smoke-test');
if (smoke) { app.setPath('userData', path.join(app.getPath('temp'), 'socrates-smoke-' + process.pid)); app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); }
let win;
async function createWindow() {
  const entry = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  win = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1000, minHeight: 700, show: !smoke, backgroundColor: '#10131b', icon: path.join(__dirname, '..', 'assets', 'icon.ico'), webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (url !== entry) event.preventDefault(); });
  win.webContents.on('will-prevent-unload', event => {
    if (smoke || dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Keep editing', 'Discard and close'], defaultId: 0, cancelId: 0, message: 'Close without saving your project file?', detail: 'Save your project before closing if you need a portable backup.' }) === 1) event.preventDefault();
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === win.webContents && ['media', 'display-capture', 'fullscreen'].includes(permission));
  session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback) => {
    if (contents !== win.webContents || !['media', 'display-capture', 'fullscreen'].includes(permission)) return callback(false);
    if (permission === 'fullscreen') return callback(true);
    const result = await dialog.showMessageBox(win, { type: 'question', buttons: ['Allow', 'Cancel'], defaultId: 1, cancelId: 1, message: permission === 'media' ? 'Allow camera or microphone for recording?' : 'Allow screen capture?' }); callback(result.response === 0);
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (request.frame.url !== entry) return callback({});
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const result = await dialog.showMessageBox(win, { title: 'Choose what to record', message: 'Choose a screen or window to share', buttons: [...sources.map(s => s.name), 'Cancel'], cancelId: sources.length, defaultId: sources.length });
      callback(result.response < sources.length ? { video: sources[result.response] } : {});
    } catch { callback({}); }
  }, { useSystemPicker: true });
  await win.loadURL(entry);
  if (smoke) {
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const result = await win.webContents.executeJavaScript(`(async () => {
        if (document.body.classList.contains('booting')) throw Error('Boot failed');
        if (typeof require !== 'undefined') throw Error('Renderer Node integration enabled');
        Cmd.addGenerated('shape'); Cmd.cropCanvas({x:100,y:100,width:1000,height:800}); Cmd.centerClip();
        const cv=document.createElement('canvas');cv.width=1000;cv.height=800;Compositor.renderFrame(cv.getContext('2d'),0);
        const pixel=cv.getContext('2d').getImageData(500,400,1,1).data;
        if (pixel[3] !== 255 || !History.canUndo()) throw Error('Render/history failed');
        state.dirty=false;return {width:state.project.width,height:state.project.height,webCodecs:typeof VideoEncoder!=='undefined',sandboxed:typeof require==='undefined'};
      })()`);
      console.log('DESKTOP_SMOKE_PASS ' + JSON.stringify(result)); app.exit(0);
    } catch (e) { console.error(e); app.exit(1); }
  }
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
