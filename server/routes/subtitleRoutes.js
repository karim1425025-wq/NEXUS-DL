const express = require("express");
const router = express.Router();
const youtubedl = require("youtube-dl-exec");
const ffmpeg = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const paths = require("../config/paths");
const { isSafeUrl, logSystem } = require("../utils/helpers");
const {
    getAccurateLyrics,
    extractFirstLrcTimestamp,
    adjustLrcTimestampOffset,
    formatLrcContent
} = require("../services/lyricsService");

// =================================================================
// 📝 ROUTE: Subtitle / Lyrics Download (Enhanced LRC Formatting)
// =================================================================
router.get("/api/subtitle", (req, res) => {
    const { ticketId, customName } = req.query;
    if (!ticketId) return res.status(400).send("Ticket ID required");

    const subtitleExts = ['.vtt', '.srt', '.ass', '.ssa', '.lrc', '.ttml'];
    if (!fs.existsSync(paths.downloadsDir)) return res.status(404).send("Not found");
    const files = fs.readdirSync(paths.downloadsDir);

    // جلب كل ملفات الترجمة التابعة لهذه التذكرة
    const subFiles = files.filter((f) => f.startsWith(ticketId) && !f.endsWith(".part") && subtitleExts.some(ext => f.toLowerCase().endsWith(ext)));

    if (subFiles.length > 0) {
        // اختيار أفضل ملف (أصلي > إنجليزي > عربي)
        let subFile = subFiles.find(f => f.match(/\.orig\.(lrc|vtt|srt|ass|ssa|ttml)$/i)) ||
            subFiles.find(f => f.match(/\.en\.(lrc|vtt|srt|ass|ssa|ttml)$/i)) ||
            subFiles.find(f => f.match(/\.ar\.(lrc|vtt|srt|ass|ssa|ttml)$/i)) ||
            subFiles.find(f => f.includes('orig')) ||
            subFiles.find(f => f.includes('en')) ||
            subFiles.find(f => f.includes('ar')) ||
            subFiles[0];

        let safeName = customName ? customName : "Nexus_Lyrics";
        safeName = safeName.replace(/[^\w\s\u0600-\u06FF-]/g, "").trim().substring(0, 60);
        if (!safeName) safeName = "Nexus_Lyrics";

        const ext = path.extname(subFile).toLowerCase();
        const finalFileName = `${safeName}${ext}`;

        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");

        const actualFilePath = path.join(paths.downloadsDir, subFile);

        try {
            let content = fs.readFileSync(actualFilePath, 'utf8');

            if (ext === '.lrc') {
                content = formatLrcContent(content);
            } else if (ext === '.srt' || ext === '.vtt') {
                // إزالة الأقواس والإيموجي من الكابشن عشان يبقى بيور
                content = content.replace(/\[.*?\]/g, '').replace(/[\u200B-\u200D\uFEFF\u00A0♪♫🎶]/g, '');
            }

            // إضافة BOM عشان الويندوز يقراه UTF-8 بشكل سليم
            res.send('\uFEFF' + content);

            // مسح جميع ملفات الترجمة بعد إرسال الأفضل منها
            for (const file of subFiles) {
                try { fs.unlinkSync(path.join(paths.downloadsDir, file)); } catch (e) { }
            }
        } catch (error) {
            logSystem("error", `Sub Stream Error: ${error.message}`);
            if (!res.headersSent) res.status(500).send("Error reading subtitle");
        }
    } else {
        res.status(404).send("Subtitle not found");
    }
});

// =================================================================
// 📝 ROUTE: Direct Subtitles & Lyrics Downloader (Smart DB + Auto-Alignment)
// =================================================================
router.get("/api/download-subtitles", async (req, res) => {
    req.setTimeout(0); res.setTimeout(0);
    const { url, subLang, customName, convertSubs, songTitle } = req.query;
    if (!isSafeUrl(url)) return res.status(400).send("الرابط غير صالح.");

    logSystem("info", `Started lyrics/subtitles download for: ${url} (format: ${convertSubs || 'auto'})`);

    let safeName = customName ? customName : "Nexus_Lyrics";
    safeName = safeName.replace(/[^\w\s\u0600-\u06FF-]/g, "").trim().substring(0, 60);
    if (!safeName) safeName = "Nexus_Lyrics";

    const isLRC = (convertSubs === 'lrc');
    const searchTarget = songTitle || customName || "";

    // Step 1: Search Accurate Lyrics Database (LRCLIB + Genius) ONLY when requesting song lyrics (LRC)
    let accurateResult = null;
    if (isLRC && searchTarget) {
        try {
            accurateResult = await getAccurateLyrics(searchTarget, true);
        } catch (lyricsErr) {
            logSystem("warn", `Accurate lyrics search error: ${lyricsErr.message}`);
        }
    }

    // Step 2: Extract YouTube native subtitle for exact video timing / fallback
    const ticketId = `Ticket_Sub_${Date.now()}`;
    const ytDlpOptions = {
        skipDownload: true,
        writeSubs: true,
        writeAutoSubs: true,
        subLangs: subLang ? `${subLang},${subLang}-.*,orig` : "all,orig,en,ar",
        convertSubs: isLRC ? "lrc" : (convertSubs || "vtt"),
        output: path.join(paths.downloadsDir, `${ticketId}_%(title)s.%(ext)s`),
        ffmpegLocation: ffmpeg,
        noCheckCertificates: true,
        ignoreErrors: true,
    };
    if (fs.existsSync(paths.cookiesPath)) ytDlpOptions.cookies = paths.cookiesPath;

    let ytContent = null;
    let ytExt = null;
    let subFiles = [];

    try {
        const subprocess = youtubedl.exec(url, ytDlpOptions);
        await subprocess;

        const files = fs.readdirSync(paths.downloadsDir);
        const subtitleExts = ['.vtt', '.srt', '.ass', '.ssa', '.lrc', '.ttml'];
        subFiles = files.filter(f => f.startsWith(ticketId) && subtitleExts.some(ext => f.toLowerCase().endsWith(ext)));

        if (subFiles.length > 0) {
            const subFile = subFiles.find(f => f.match(/\.orig\.(lrc|vtt|srt|ass|ssa|ttml)$/i)) ||
                subFiles.find(f => f.match(new RegExp(`\\.${subLang}\\.(lrc|vtt|srt|ass|ssa|ttml)$`, 'i'))) ||
                subFiles.find(f => f.includes('orig')) ||
                subFiles.find(f => f.includes(subLang)) ||
                subFiles[0];

            ytExt = path.extname(subFile).toLowerCase();
            const actualFilePath = path.join(paths.downloadsDir, subFile);
            ytContent = fs.readFileSync(actualFilePath, 'utf8');
        }
    } catch (err) {
        logSystem("warn", `YouTube subtitle extraction: ${err.message}`);
    }

    // Cleanup extracted temp files
    for (const file of subFiles) {
        try { fs.unlinkSync(path.join(paths.downloadsDir, file)); } catch (e) { }
    }

    // Step 3: Smart Alignment or Best Match Selection
    if (accurateResult && accurateResult.content) {
        let finalContent = accurateResult.content;
        const finalFileName = `${safeName}${accurateResult.ext}`;

        // 🎯 Smart Auto-Alignment: Align LRCLIB studio timestamps with YouTube video audio intro
        if (accurateResult.isSynced && ytContent) {
            const tYt = extractFirstLrcTimestamp(ytContent);
            const tLrc = extractFirstLrcTimestamp(finalContent);
            if (tYt !== null && tLrc !== null && Math.abs(tYt - tLrc) < 30) {
                const offset = tYt - tLrc;
                logSystem("success", `Auto-aligning lyrics timestamps by offset: ${offset > 0 ? '+' : ''}${offset.toFixed(2)}s`);
                finalContent = adjustLrcTimestampOffset(finalContent, offset);
            }
        }

        if (accurateResult.ext === '.lrc' && accurateResult.isSynced) {
            finalContent = formatLrcContent(finalContent);
        }

        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.send('\uFEFF' + finalContent);
    }

    // If no database lyrics, use YouTube subtitle
    if (ytContent) {
        let content = ytContent;
        const finalFileName = `${safeName}${ytExt || '.lrc'}`;

        if (ytExt === '.lrc') {
            content = formatLrcContent(content);
        } else if (ytExt === '.srt' || ytExt === '.vtt') {
            content = content.replace(/\[.*?\]/g, '').replace(/[\u200B-\u200D\uFEFF\u00A0♪♫🎶]/g, '');
        }

        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.send('\uFEFF' + content);
    }

    // If nothing found anywhere
    res.status(404).send(isLRC ? "Lyrics not found" : "Subtitles not found for this video");
});

module.exports = router;
