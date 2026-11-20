const path = require("path");
const fs = require("fs");

// =================================================================
// 📁 UNIFIED PATHS
// -----------------------------------------------------------------
// السيرفر جوه فولدر server، والملف ده جوه فولدر server/config.
// بنطلع مستويين بالظبط عشان المسارات تفضل شغالة سواء شغّلت
// السيرفر من جوه فولدر server أو من جذر المشروع:
//   __dirname = <project>/server/config
//   ..        = <project>/server
//   ../..     = <project>   (جذر المشروع)
// وكل حاجة (downloads / system_logs.txt / cookies.txt) بتفضل في
// جذر المشروع زي ما هي.
// =================================================================

const SERVER_DIR = path.resolve(__dirname, "..");        // <project>/server
const PROJECT_ROOT = path.resolve(SERVER_DIR, "..");     // <project>

const paths = {
    serverDir: SERVER_DIR,
    projectRoot: PROJECT_ROOT,
    downloadsDir: path.join(PROJECT_ROOT, "downloads"),
    logFile: path.join(PROJECT_ROOT, "system_logs.txt"),
    cookiesPath: path.join(PROJECT_ROOT, "cookies.txt"),
};

// إنشاء فولدر التحميلات لو مش موجود (نفس سلوك الكود القديم)
if (!fs.existsSync(paths.downloadsDir)) fs.mkdirSync(paths.downloadsDir, { recursive: true });

module.exports = paths;
