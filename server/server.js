const express = require("express");
const cors = require("cors");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

const paths = require("./config/paths");
const { logSystem } = require("./utils/helpers");
const mediaRoutes = require("./routes/mediaRoutes");
const subtitleRoutes = require("./routes/subtitleRoutes");
const { scheduleMaintenanceJobs } = require("./jobs/maintenance");

const app = express();

// 🚀 Fix 429 Too Many Requests in cloud hosts 🚀
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

// =================================================================
// 🍪 Cookies Decoding 🍪
// =================================================================
if (process.env.COOKIES_BASE64) {
    try {
        const decodedCookies = Buffer.from(process.env.COOKIES_BASE64, "base64").toString("utf-8");
        fs.writeFileSync(paths.cookiesPath, decodedCookies);
        logSystem("success", "Cookies file decoded and initialized successfully!");
    } catch (e) { logSystem("error", "Failed to decode cookies!"); }
}

// =================================================================
// 🛡️ RATE LIMITING (قبل الـ routes عشان يتطبق على نفس المسارات)
// =================================================================
const downloadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 200,
    message: { error: "Too many requests in a short time! Please wait 5 minutes." },
    standardHeaders: true, legacyHeaders: false,
});
app.use("/api/download", downloadLimiter);
app.use("/api/info", downloadLimiter);

// =================================================================
// 🔗 ROUTES
// =================================================================
app.use(mediaRoutes);
app.use(subtitleRoutes);

// =================================================================
// 🛠️ MAINTENANCE JOBS
// =================================================================
scheduleMaintenanceJobs();

// =================================================================
// 🚀 تشغيل السيرفر بذكاء (تجنب مشكلة البورت المشغول)
// =================================================================
const START_PORT = 3000;

function startServer(port) {
    app.listen(port, () => {
        console.log("==========================================");
        console.log(`🚀 server is starting ${port}`);
        console.log("==========================================");
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ بورت ${port} مشغول، هنجرب البورت اللي بعده...`);
            startServer(port + 1);
        } else {
            console.error("🔥 خطأ غير متوقع:", err);
        }
    });
}

startServer(START_PORT);
