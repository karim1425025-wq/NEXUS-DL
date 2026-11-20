const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

// ⚡ تحسين أداء البرنامج - تقليل استهلاك الموارد
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('enable-zero-copy'); // تسريع الرسم

app.on('ready', () => {
    // 1️⃣ افتح النافذة فوراً بدون انتظار السيرفر
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false, // مخفية لحد ما تكون جاهزة تماماً (يمنع الوميض الأبيض)
        backgroundColor: '#0a0a12', // نفس لون الخلفية عشان ميبانش أبيض
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // اعرض النافذة لما تكون جاهزة (بيمنع الـ white flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 2️⃣ حمّل الصفحة فوراً
    mainWindow.loadFile('2 local disc vs code .html');

    // 3️⃣ شغّل السيرفر (من فولدر server) في process منفصل في الخلفية
    // مع asar:false كل الملفات حقيقية و __dirname شغّال صح في كل الحالات
    try {
        serverProcess = fork(path.join(__dirname, 'server', 'server.js'), [], {
            silent: false,
            detached: false,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
        });

        serverProcess.on('error', (err) => {
            dialog.showErrorBox('🔥 خطأ في السيرفر', 'السيرفر مقدرش يشتغل والسبب:\n' + err.message);
        });

        serverProcess.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                dialog.showErrorBox('🔥 السيرفر وقف', `السيرفر وقف بكود: ${code}`);
            }
        });
    } catch (error) {
        dialog.showErrorBox('🔥 خطأ في تشغيل السيرفر', error.message);
    }
});

// لما الـ app يتقفل، اقفل السيرفر معاه
app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
});
