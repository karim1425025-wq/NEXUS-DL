const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const cron = require("node-cron");
const paths = require("../config/paths");
const { logSystem } = require("../utils/helpers");

// =================================================================
// 🛠️ AUTO MAINTENANCE CRON JOBS (WINDOWS COMPATIBLE) 🛠️
// =================================================================
function performCleanupAndUpdates() {
    logSystem("info", "Executing routine file cleanup & updates...");
    if (fs.existsSync(paths.downloadsDir)) {
        const files = fs.readdirSync(paths.downloadsDir); const now = Date.now();
        files.forEach((file) => {
            const filePath = path.join(paths.downloadsDir, file);
            if (now - fs.statSync(filePath).mtimeMs > 2 * 60 * 60 * 1000) fs.unlinkSync(filePath);
        });
    }
    exec("npm install youtube-dl-exec@latest", (err) => {
        if (err) logSystem("error", `Update failed: ${err.message}`);
        else logSystem("success", "Core updated successfully.");
    });
}

// تشغيل المهام لأول مرة وقت البدء + جدولتها يوميًا وكل ساعة
function scheduleMaintenanceJobs() {
    performCleanupAndUpdates();

    cron.schedule("0 * * * *", () => {
        if (!fs.existsSync(paths.downloadsDir)) return;
        const files = fs.readdirSync(paths.downloadsDir); const now = Date.now();
        files.forEach((file) => { const filePath = path.join(paths.downloadsDir, file); if (now - fs.statSync(filePath).mtimeMs > 2 * 60 * 60 * 1000) fs.unlinkSync(filePath); });
    });

    cron.schedule("0 4 * * *", () => {
        logSystem("info", "Executing daily core update.");
        exec("npm install youtube-dl-exec@latest", (err) => {
            if (err) logSystem("error", `Update failed: ${err.message}`);
            else logSystem("success", "Core updated successfully.");
        });
    });
}

module.exports = { performCleanupAndUpdates, scheduleMaintenanceJobs };
