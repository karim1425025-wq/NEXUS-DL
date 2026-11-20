const fs = require("fs");
const https = require("https");
const http = require("http");
const paths = require("../config/paths");

// =================================================================
// 🔄 SHARED STATE (اتصالات الـ Progress + تذاكر الخزنة)
// -----------------------------------------------------------------
// كائنات مشتركة بين كل الملفات بنفس المرجع، فأي تعديل جواها
// بيتشاف في باقي الملفات.
// =================================================================
const clients = {};
const vaultTracker = {};

// =================================================================
// 📝 ENGLISH LOGGING SYSTEM
// =================================================================
function logSystem(type, message) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] [${type.toUpperCase()}] ${message}`;

    if (type === 'error') console.error(`🚨 ${logMsg}`);
    else if (type === 'warn') console.warn(`⚠️ ${logMsg}`);
    else if (type === 'success') console.log(`✅ ${logMsg}`);
    else console.log(`📡 ${logMsg}`);

    try { fs.appendFileSync(paths.logFile, logMsg + "\n"); } catch (e) { }
}

// =================================================================
// 🛡️ URL SAFETY CHECK
// =================================================================
function isSafeUrl(inputUrl) {
    if (!inputUrl || typeof inputUrl !== "string") return false;
    try {
        // 🛡️ فك الرموز الخاصة في الرابط قبل التحليل عشان لو فيه %23 أو %26 يتعامل معاها صح
        let decodedUrl = inputUrl;
        try { decodedUrl = decodeURIComponent(inputUrl); } catch (e) { /* لو الـ decode فشل، نستخدم الرابط الأصلي */ }

        const parsedUrl = new URL(decodedUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return false;
        const validDomains = ["youtube.com", "youtu.be", "twitter.com", "x.com", "facebook.com", "fb.watch", "instagram.com", "tiktok.com"];
        return validDomains.some((domain) => parsedUrl.hostname.endsWith(domain));
    } catch (e) { return false; }
}

// =================================================================
// 📏 FORMATTING
// =================================================================
function formatBytes(bytes, lang = "ar") {
    const unknownTxt = lang === "en" ? "Unknown" : "غير معروف";
    if (!bytes || bytes === 0) return unknownTxt;
    const k = 1024;
    if (bytes < k * k) return (bytes / k).toFixed(2) + " KB";
    return (bytes / (k * k)).toFixed(2) + " MB";
}

// =================================================================
// 🕵️‍♂️ SMART HELPERS (Facebook Resolver - Mobile Ninja Mode)
// =================================================================
async function resolveFacebookUrl(targetUrl) {
    if (!targetUrl.includes("facebook.com/share") && !targetUrl.includes("fb.watch")) return targetUrl;
    return new Promise((resolve) => {
        const client = targetUrl.startsWith("https") ? https : http;
        const req = client.get(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
            },
            timeout: 5000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(res.headers.location);
            } else {
                resolve(targetUrl);
            }
        });
        req.on("error", (err) => {
            logSystem("warn", "FB Resolver Error: " + err.message);
            resolve(targetUrl);
        });
        req.on("timeout", () => {
            req.destroy();
            resolve(targetUrl);
        });
    });
}

// =================================================================
// 📏 دالة فحص المساحة الفعلية بالبايت (HEAD Request)
// =================================================================
function getRealFileSize(fileUrl) {
    return new Promise((resolve) => {
        if (!fileUrl || !fileUrl.startsWith('http')) return resolve(0);
        const client = fileUrl.startsWith('https') ? https : http;
        const req = client.request(fileUrl, { method: 'HEAD', timeout: 2500 }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parseInt(res.headers['content-length'] || 0));
            } else {
                resolve(0);
            }
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.end();
    });
}

module.exports = {
    clients,
    vaultTracker,
    logSystem,
    isSafeUrl,
    formatBytes,
    resolveFacebookUrl,
    getRealFileSize
};
