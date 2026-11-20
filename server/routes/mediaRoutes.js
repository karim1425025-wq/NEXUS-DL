const express = require("express");
const router = express.Router();
const youtubedl = require("youtube-dl-exec");
const ffmpeg = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { exec } = require("child_process");
const https = require("https");
const http = require("http");
const paths = require("../config/paths");
const {
    clients,
    vaultTracker,
    logSystem,
    isSafeUrl,
    formatBytes,
    resolveFacebookUrl,
    getRealFileSize
} = require("../utils/helpers");
const { ensureCompatibleMedia } = require("../services/mediaService");

const upload = multer({ dest: paths.downloadsDir, limits: { fileSize: 1024 * 1024 * 1024 } });

// =================================================================
// 📡 ROUTE: Download Progress (Server-Sent Events)
// =================================================================
router.get("/api/progress", (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).send("Missing ID");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    clients[id] = res;
    req.on("close", () => { if (clients[id]) { clients[id].end(); delete clients[id]; } });
});

// =================================================================
// 🖼️ ROUTE: Image Proxy
// =================================================================
router.get("/api/proxy", (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send("No image URL provided");

    try {
        const parsedImg = new URL(imageUrl);
        const h = parsedImg.hostname;
        const isPrivate = h === "localhost" || h === "127.0.0.1" || /^10\./.test(h) || /^192\.168\./.test(h) || !imageUrl.startsWith("http");
        if (isPrivate) return res.status(403).send("Forbidden Proxy Target");

        const client = imageUrl.startsWith("https") ? https : http;
        client.get(imageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                Referer: "https://www.instagram.com/", Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
            },
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && !req.query.redirected) {
                return res.redirect(`/api/proxy?url=${encodeURIComponent(response.headers.location)}&redirected=true`);
            }
            res.setHeader("Content-Type", response.headers["content-type"] || "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=86400");
            response.pipe(res);
        }).on("error", (err) => { res.redirect("https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=500&auto=format&fit=crop"); });
    } catch (e) { res.status(400).send("Invalid URL"); }
});

// =================================================================
// ℹ️ ROUTE: Video Info Extraction (Smart Size & FB Fixed)
// =================================================================
router.post("/api/info", async (req, res) => {
    let { url, lang = "ar" } = req.body;

    if (!isSafeUrl(url)) {
        return res.status(400).json({ success: false, error: lang === "en" ? "Invalid URL." : "الرابط غير صالح." });
    }

    logSystem("info", `Fetching details for: ${url}`);

    // 👈 فك طلاسم فيسبوك
    url = await resolveFacebookUrl(url);

    // تحديد نوع المنصة عشان نعامل كل واحدة بظروفها
    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
    const isFacebook = url.includes("facebook.com") || url.includes("fb.watch") || url.includes("fb.com");
    const isTwitter = url.includes("twitter.com") || url.includes("x.com");

    try {
        const ytOptions = {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            formatSort: "res,ext:mp4:m4a,vcodec:h264",
            ignoreErrors: true,
            extractorArgs: "twitter:api=syndication",
            flatPlaylist: true,
            socketTimeout: 30,
            writeSubs: true,        // 🎯 جلب قائمة الترجمات
            writeAutoSubs: true,    // 🎯 جلب الترجمات التلقائية
            skipDownload: true      // 🎯 مش هننزل الفيديو هنا، بس عايزين المعلومات
        };

        if (fs.existsSync(paths.cookiesPath)) ytOptions.cookies = paths.cookiesPath;

        const output = await youtubedl(url, ytOptions);
        if (!output) throw new Error("No data found.");

        if (output._type === "playlist" || (output.entries && output.entries.length > 0)) {
            const entries = output.entries.map((e) => ({
                id: e.id, title: e.title, url: e.url || `https://www.youtube.com/watch?v=${e.id}`, duration: e.duration, thumbnail: e.thumbnails ? e.thumbnails[e.thumbnails.length - 1].url : null,
            })).filter((e) => e.title && e.url);
            return res.json({ success: true, isPlaylist: true, title: output.title, entries });
        }

        let finalThumbnail = output.thumbnail || (output.thumbnails && output.thumbnails.length > 0 ? output.thumbnails[output.thumbnails.length - 1].url : null);

        let formats = [];
        let addedQualities = new Set();
        let hasAudioOption = false;

        const txtAudio = lang === "en" ? "Audio" : "صوت";
        const txtVideo = lang === "en" ? "Video" : "فيديو";
        const txtHQ = lang === "en" ? "High Quality Audio" : "صوت (جودة عالية)";

        let bestAudioSize = 0;
        if (output.formats) {
            const audios = output.formats.filter(f => f.acodec !== "none" && f.vcodec === "none" && (!f.protocol || !f.protocol.includes("m3u8")));
            if (audios.length > 0) {
                const bestA = audios.reduce((p, c) => ((p.abr || 0) > (c.abr || 0) ? p : c));
                bestAudioSize = bestA.filesize || bestA.filesize_approx || 0;
                if (!bestAudioSize && (bestA.abr || bestA.tbr) && output.duration) {
                    bestAudioSize = Math.round(((bestA.abr || bestA.tbr) * 1000 / 8) * output.duration);
                }
            }
        }

        // بناء قاموس اللغات
        const langNames = {
            "en": "English", "ar": "العربية", "fr": "Français", "es": "Español",
            "de": "Deutsch", "it": "Italiano", "pt": "Português", "ru": "Русский",
            "ja": "日本語", "ko": "한국어", "zh": "中文", "zh-Hans": "中文(简体)",
            "zh-Hant": "中文(繁體)", "hi": "हिन्दी", "tr": "Türkçe", "nl": "Nederlands",
            "pl": "Polska", "sv": "Svenska", "id": "Bahasa Indonesia", "th": "ไทย",
            "vi": "Tiếng Việt", "uk": "Українська", "cs": "Čeština", "ro": "Română",
            "el": "Ελληνικά", "hu": "Magyar", "da": "Dansk", "fi": "Suomi",
            "no": "Norsk", "he": "עברית", "ms": "Bahasa Melayu", "fil": "Filipino",
            "en-US": "English (US)", "en-GB": "English (UK)", "pt-BR": "Português (BR)",
            "es-419": "Español (LA)", "zh-CN": "中文(简体)", "zh-TW": "中文(繁體)",
        };

        // =======================================================
        // 🌍 استخراج اللغات المتاحة للفيديو (الصوت المدبلج)
        // =======================================================
        let availableLanguages = [];
        if (output.formats) {
            const langSet = new Set();
            output.formats.forEach(f => {
                if (f.acodec !== "none" && f.language && f.language !== "und" && f.language !== "none") {
                    langSet.add(f.language);
                }
            });
            const audioLangs = Array.from(langSet);
            for (const langCode of audioLangs) {
                const displayName = langNames[langCode] || langCode;
                availableLanguages.push({
                    code: langCode,
                    name: displayName,
                    label: lang === "en" ? `${displayName} Audio` : `صوت ${displayName}`
                });
            }
            if (availableLanguages.length > 0) {
                availableLanguages.unshift({
                    code: "orig",
                    name: "Original",
                    label: lang === "en" ? "Original Audio (Default)" : "الصوت الأصلي (الافتراضي)"
                });
            }
            availableLanguages.sort((a, b) => {
                if (a.code === 'orig') return -1;
                if (b.code === 'orig') return 1;
                if (a.code === 'ar') return -1;
                if (b.code === 'ar') return 1;
                if (a.code.startsWith('en')) return -1;
                if (b.code.startsWith('en')) return 1;
                return a.name.localeCompare(b.name);
            });
        }

        // =======================================================
        // 📝 استخراج الكابشنز/الترجمات المتاحة
        // =======================================================
        let availableSubtitles = [];
        const subsObj = output.subtitles || {};
        const autoSubsObj = output.automatic_captions || {};
        const allSubLangs = new Set();

        // كابشنز أصلية (مرفوعة يدوي)
        for (const langCode of Object.keys(subsObj)) {
            allSubLangs.add(langCode);
        }
        // كابشنز تلقائية (من جوجل)
        for (const langCode of Object.keys(autoSubsObj)) {
            // تجاهل الترجمات التلقائية المزدوجة (مثل en-ar) لتخفيف الضغط
            if (!/-[a-z]{2,3}$/.test(langCode)) {
                allSubLangs.add(langCode);
            }
        }

        // تم نقل قاموس اللغات للأعلى

        for (const langCode of allSubLangs) {
            const isOriginal = !!subsObj[langCode];
            const displayName = langNames[langCode] || langCode;
            availableSubtitles.push({
                code: langCode,
                name: displayName,
                isOriginal: isOriginal,
                label: isOriginal
                    ? (lang === "en" ? `${displayName} (Original)` : `${displayName} (أصلي)`)
                    : (lang === "en" ? `${displayName} (Auto)` : `${displayName} (تلقائي)`)
            });
        }

        // ترتيب: الأصلي أولاً، ثم العربي والإنجليزي
        availableSubtitles.sort((a, b) => {
            if (a.isOriginal && !b.isOriginal) return -1;
            if (!a.isOriginal && b.isOriginal) return 1;
            if (a.code === 'ar') return -1;
            if (b.code === 'ar') return 1;
            if (a.code.startsWith('en')) return -1;
            if (b.code.startsWith('en')) return 1;
            return a.name.localeCompare(b.name);
        });

        if (output.formats) {
            const hasDirectStreams = output.formats.some(f => f.vcodec !== "none" && (!f.protocol || (!f.protocol.includes("m3u8") && !f.protocol.includes("hls") && !f.protocol.includes("http_dash_segments"))));

            // تصفية التنسيقات بحيث لا نختار ملفات الـ m3u8/hls إذا كانت روابط البث المباشر متوفرة
            const candidateFormats = output.formats.filter(f => {
                if (hasDirectStreams && f.protocol && (f.protocol.includes("m3u8") || f.protocol.includes("hls") || f.protocol.includes("http_dash_segments"))) {
                    return false;
                }
                return true;
            });

            // ترتيب التنسيقات لاختيار الأفضل والأعلى مساحة وجودة لكل دقة
            candidateFormats.sort((a, b) => {
                const hA = a.height || 0;
                const hB = b.height || 0;
                if (hB !== hA) return hB - hA;
                const sizeA = a.filesize || a.filesize_approx || ((a.vbr || a.tbr || 0) * 1000) || 0;
                const sizeB = b.filesize || b.filesize_approx || ((b.vbr || b.tbr || 0) * 1000) || 0;
                return sizeB - sizeA;
            });

            candidateFormats.forEach((f) => {
                let vHeight = f.height || 0;
                let aAbr = Math.round(f.abr || 0);

                let fileSizeBytes = f.filesize || f.filesize_approx || 0;
                if (!fileSizeBytes && (f.vbr || f.tbr) && output.duration) {
                    const rate = f.vbr || f.tbr;
                    fileSizeBytes = Math.round((rate * 1000 / 8) * output.duration);
                }

                if (f.acodec !== "none" && f.vcodec === "none") {
                    hasAudioOption = true;
                } else if (f.vcodec !== "none" && f.height) {
                    const hasAudio = f.acodec !== "none";

                    if (isYouTube && !hasAudio && fileSizeBytes > 0 && bestAudioSize > 0) {
                        fileSizeBytes += bestAudioSize;
                    }

                    let displaySize = fileSizeBytes > 0 ? formatBytes(fileSizeBytes, lang) : (lang === "en" ? "Unknown" : "غير معروف");
                    const resLabel = `${f.height}p`;

                    if (!addedQualities.has(resLabel)) {
                        addedQualities.add(resLabel);
                        const qLabel = `${txtVideo} ${resLabel} MP4`;
                        formats.push({ type: "video", quality: qLabel, size: displaySize, url: f.url, format_id: f.format_id, sortWeight: f.height * 1000 + (hasAudio ? 100 : 0), needsMerge: !hasAudio ? "true" : "false", isAllowed: true, height: vHeight, abr: aAbr });
                    }
                }
            });
        }

        if (hasAudioOption || (output.formats && output.formats.length > 0)) {
            const audioQualities = [320, 256, 128, 64];
            let dur = output.duration || 180;
            audioQualities.forEach((qaAbr) => {
                let estimatedSize = dur * (qaAbr * 1000) / 8;

                let qLabel = `${txtHQ} (${qaAbr}kbps)`;
                if (qaAbr === 128) qLabel = `${txtAudio} (${qaAbr}kbps)`;
                if (qaAbr === 64) qLabel = lang === "en" ? `Low Audio (64kbps)` : `صوت منخفض (64kbps)`;

                if (!addedQualities.has(qaAbr + "a")) {
                    addedQualities.add(qaAbr + "a");
                    formats.push({ type: "audio", quality: qLabel, size: formatBytes(estimatedSize, lang), url: output.original_url || url, format_id: "bestaudio/best", sortWeight: qaAbr, needsMerge: "false", isAllowed: true, height: 0, abr: qaAbr });
                }
            });
        }
        // =======================================================
        // 🚀 الفحص الفعلي لمساحات تويتر والروابط المجهولة (مع استثناء يوتيوب لتجنب خطأ 403 أو روابط المانفيست)
        // =======================================================
        await Promise.all(formats.map(async (fmt) => {
            if (!isYouTube && (isTwitter || fmt.size === "غير معروف" || fmt.size === "Unknown")) {
                const realBytes = await getRealFileSize(fmt.url);

                if (realBytes > 0) {
                    let totalBytes = realBytes;
                    fmt.size = formatBytes(totalBytes, lang);
                } else if (isTwitter) {
                    fmt.size = lang === "en" ? "Unknown" : "غير معروف";
                }
            }
        }));
        // =======================================================
        formats.sort((a, b) => b.sortWeight - a.sortWeight);
        logSystem("success", `Info fetched successfully. ${availableLanguages.length} languages, ${availableSubtitles.length} subtitle tracks found.`);
        res.json({
            success: true,
            isPlaylist: false,
            title: output.title,
            thumbnail: finalThumbnail,
            formats: formats,
            availableLanguages: availableLanguages,
            availableSubtitles: availableSubtitles
        });

    } catch (error) {
        logSystem("error", `Info fetch failed: ${error.message}`);
        let userErrorMsg = lang === "en" ? "Could not fetch details." : "لم يتم العثور على بيانات.";
        res.status(500).json({ success: false, error: userErrorMsg });
    }
});

// =================================================================
// ⬇️ ROUTE: Core Download Engine
// =================================================================
router.get("/api/download", async (req, res) => {
    req.setTimeout(0); res.setTimeout(0);
    const { url, format_id, type, needsMerge, customName, clientId, trimStart, trimEnd, height, abr, withSubs, subLang, audioLang } = req.query;

    if (!isSafeUrl(url)) return res.status(400).send("الرابط غير صالح.");

    logSystem("info", `Started download process for: ${url}`);

    try {
        let safeName = customName ? customName : "Nexus_Media";
        safeName = safeName.replace(/[^\w\s\u0600-\u06FF-]/g, "").trim().substring(0, 60);
        if (!safeName) safeName = "Nexus_Media";

        const ticketId = req.query.ticketId || `Ticket_${Date.now()}`;
        vaultTracker[ticketId] = "downloading";

        let ytDlpOptions = {
            output: path.join(paths.downloadsDir, `${ticketId}_${safeName.replace(/\s+/g, "_")}.%(ext)s`),
            ffmpegLocation: ffmpeg, noCheckCertificates: true, ignoreErrors: true, noPart: true, extractorArgs: "twitter:api=syndication",
        };

        if (fs.existsSync(paths.cookiesPath)) ytDlpOptions.cookies = paths.cookiesPath;

        if (trimStart && trimEnd) { ytDlpOptions.downloadSections = `*${trimStart}-${trimEnd}`; ytDlpOptions.forceKeyframesAtCuts = true; }

        // ==========================================
        // 🚀 Smart Format Selection & Audio/Video Handling
        // ==========================================
        const numHeight = parseInt(height, 10) || 0;
        const isHighRes = numHeight > 1080;

        if (!isHighRes) {
            ytDlpOptions.formatSort = "res,ext:mp4:m4a,vcodec:h264";
        } else {
            ytDlpOptions.formatSort = "res,ext:mp4:m4a";
        }

        if (type === "audio") {
            const requestedAbr = abr || "128";
            // هنسحب الـ m4a كـ مصدر أساسي لأنه أفضل في التحويل لـ mp3 من الـ opus
            let audioFormatStr = "bestaudio[ext=m4a]/bestaudio/best";
            if (audioLang && audioLang !== "orig") {
                audioFormatStr = `bestaudio[language=${audioLang}][ext=m4a]/bestaudio[language=${audioLang}]/${audioFormatStr}`;
            }
            ytDlpOptions.format = format_id && format_id !== "undefined" && format_id !== "best" ? `${format_id}/${audioFormatStr}` : audioFormatStr;
            ytDlpOptions.extractAudio = true;
            ytDlpOptions.audioFormat = "mp3";
            ytDlpOptions.audioQuality = `${requestedAbr}K`;
            ytDlpOptions.embedThumbnail = true;
            ytDlpOptions.embedMetadata = true;
            // ✅ إجبار 44100Hz + ستيريو عشان يشتغل على واتساب ستوري والسماعة البلوتوث
            ytDlpOptions.postprocessorArgs = { ffmpeg: ["-ar", "44100", "-ac", "2", "-id3v2_version", "3"] };
            ytDlpOptions.writeAutoSubs = true;
            ytDlpOptions.writeSubs = true;
            ytDlpOptions.convertSubs = "lrc";
            ytDlpOptions.subLangs = "orig,.*orig,en,ar";
        } else if (needsMerge === "true") {
            let audioFormatStr = "bestaudio[acodec^=mp4a][ext=m4a]/bestaudio[ext=m4a]/bestaudio/best";
            if (audioLang && audioLang !== "orig") {
                audioFormatStr = `bestaudio[language=${audioLang}][acodec^=mp4a][ext=m4a]/bestaudio[language=${audioLang}]/${audioFormatStr}`;
            }
            const baseVideo = format_id && format_id !== "undefined" && format_id !== "best" ? format_id : "bestvideo";

            if (isHighRes) {
                // للجودات الفائقة 1440p و 4K (اليوتيوب بيوفرها فقط VP9 أو AV1 بدون avc1)
                ytDlpOptions.format = `${baseVideo}+${audioFormatStr}/${baseVideo}+bestaudio/best`;
                ytDlpOptions.mergeOutputFormat = "mp4";
                ytDlpOptions.postprocessorArgs = { ffmpeg: ["-movflags", "+faststart"] };
            } else {
                // للجودات 1080p وما دون: نسيب yt-dlp يختار أحسن كوديك (VP9 أو avc1)
                // الأولوية للـ format_id المحدد كما هو، ثم fallback لـ avc1 عند الفشل
                ytDlpOptions.format = `${baseVideo}+${audioFormatStr}/${baseVideo}+bestaudio/${baseVideo}[vcodec^=avc1]+${audioFormatStr}/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best`;
                ytDlpOptions.mergeOutputFormat = "mp4";
                ytDlpOptions.postprocessorArgs = { ffmpeg: ["-movflags", "+faststart"] };
            }

            // 📝 دعم تنزيل الكابشن مع الفيديو
            if (withSubs === "true") {
                ytDlpOptions.writeSubs = true;
                ytDlpOptions.writeAutoSubs = true;
                // تم إيقاف embedSubs لمنع الكراش
                if (subLang) {
                    ytDlpOptions.subLangs = subLang;
                } else {
                    ytDlpOptions.subLangs = "en,ar";
                }
                ytDlpOptions.convertSubs = "srt";
            }
        } else {
            const baseVideo = format_id && format_id !== "undefined" && format_id !== "best" ? format_id : "bestvideo";
            if (isHighRes) {
                ytDlpOptions.format = `${baseVideo}/best`;
                ytDlpOptions.mergeOutputFormat = "mp4";
                ytDlpOptions.postprocessorArgs = { ffmpeg: ["-movflags", "+faststart"] };
            } else {
                // نسيب yt-dlp يختار أحسن كوديك متاح (بدون إجبار avc1)
                ytDlpOptions.format = `${baseVideo}/${baseVideo}[vcodec^=avc1]/bestvideo/best`;
                ytDlpOptions.mergeOutputFormat = "mp4";
                ytDlpOptions.postprocessorArgs = { ffmpeg: ["-movflags", "+faststart"] };
            }

            // 📝 دعم تنزيل الكابشن مع الفيديو
            if (withSubs === "true") {
                ytDlpOptions.writeSubs = true;
                ytDlpOptions.writeAutoSubs = true;
                // تم إيقاف embedSubs لمنع الكراش
                if (subLang) {
                    ytDlpOptions.subLangs = subLang;
                } else {
                    ytDlpOptions.subLangs = "en,ar";
                }
                ytDlpOptions.convertSubs = "srt";
            }
        }
        // ==========================================

        const subprocess = youtubedl.exec(url, ytDlpOptions);

        subprocess.stdout.on("data", (data) => {
            const output = data.toString();
            const match = output.match(/\[download\]\s+([\d\.]+)%/);
            if (match && clientId && clients[clientId]) clients[clientId].write(`data: ${match[1]}\n\n`);
        });

        try { await subprocess; vaultTracker[ticketId] = "done"; logSystem("success", `[Ticket: ${ticketId}] Download subprocess finished.`); }
        catch (err) { logSystem("warn", `[Ticket: ${ticketId}] Warning: ${err.message}`); vaultTracker[ticketId] = "error"; }

        const downloadedFiles = fs.readdirSync(paths.downloadsDir);
        // 🛡️ تجاهل ملفات الترجمة والكلمات والصور المصغرة عشان نختار الملف الأساسي (mp3/mp4)
        const subtitleExts = ['.vtt', '.srt', '.ass', '.ssa', '.lrc', '.ttml'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
        const actualFile = downloadedFiles.find((f) => f.startsWith(ticketId) && !f.endsWith(".part") && !f.endsWith(".ytdl") && !subtitleExts.some(ext => f.toLowerCase().endsWith(ext)) && !imageExts.some(ext => f.toLowerCase().endsWith(ext)));
        const hasSubs = downloadedFiles.some((f) => f.startsWith(ticketId) && !f.endsWith(".part") && subtitleExts.some(ext => f.toLowerCase().endsWith(ext)));

        if (clientId && clients[clientId]) {
            clients[clientId].write(`data: ${hasSubs ? 'DONE_SUBS' : 'DONE'}\n\n`);
            clients[clientId].end();
            delete clients[clientId];
        }

        if (actualFile) {
            vaultTracker[ticketId] = "done";
            let actualFilePath = path.join(paths.downloadsDir, actualFile);

            // ✅ Make the file playable on WhatsApp status & USB/party speakers
            try {
                actualFilePath = await ensureCompatibleMedia(actualFilePath, type === "audio" ? "audio" : "video", { abr });
            } catch (compatErr) {
                logSystem("warn", `Compatibility pass skipped (${compatErr.message.split("\n")[0]}). Sending original file.`);
            }

            const ext = path.extname(actualFilePath).toLowerCase();
            let mimeType = "video/mp4";
            if (ext === ".mp3") mimeType = "audio/mpeg";
            else if (ext === ".m4a") mimeType = "audio/mp4";
            const finalFileName = `${safeName}${ext}`;

            res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`);
            res.setHeader("Content-Type", mimeType);

            const fileStream = fs.createReadStream(actualFilePath);
            fileStream.on("error", (err) => logSystem("error", `File Stream Error: ${err.message}`));
            if (!res.destroyed) fileStream.pipe(res);
            logSystem("success", `File ${finalFileName} delivered successfully.`);
        } else {
            logSystem("error", `File not found after download completion for ticket: ${ticketId}`);
            if (!res.headersSent) res.status(500).send("فشل التحميل. الملف لم يكتمل."); else res.end();
        }
    } catch (error) {
        logSystem("error", `Critical Download Error: ${error.message}`);
        if (!res.headersSent) res.status(500).send("حدث خطأ غير متوقع."); else res.end();
    }
});

// =================================================================
// 🔄 ROUTE: File Conversion
// =================================================================
router.post("/api/convert", (req, res) => {
    req.setTimeout(0); res.setTimeout(0);
    upload.single("video")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") return res.status(413).send("الملف كبير أوي! الحد الأقصى 1 جيجا.");
            logSystem("error", `File upload error: ${err.message}`); return res.status(400).send("خطأ في رفع الملف.");
        }
        if (!req.file) return res.status(400).send("لم يتم رفع أي ملف.");

        const quality = req.body.quality || "128k";
        const safeQuality = ["32k", "48k", "64k", "128k", "320k"].includes(quality) ? quality : "128k";
        const inputPath = req.file.path;
        const originalName = path.parse(req.file.originalname).name.replace(/[^\w\s\u0600-\u06FF-]/g, "").trim().substring(0, 50);
        const outputFileName = `Audio_${Date.now()}_${originalName || "Converted"}.mp3`;
        const outputPath = path.join(paths.downloadsDir, outputFileName);

        const command = `"${ffmpeg}" -y -hide_banner -loglevel error -i "${inputPath}" -vn -map 0:a:0 -c:a libmp3lame -b:a ${safeQuality} -ar 44100 -ac 2 -id3v2_version 3 -write_id3v1 1 "${outputPath}"`;

        exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
            if (error) { logSystem("error", `Conversion failed: ${error.message}`); if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); return res.status(500).send("فشل التحويل."); }
            res.download(outputPath, outputFileName, () => { logSystem("success", `Conversion successful: ${outputFileName}`); if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); });
        });
    });
});

// =================================================================
// 🔐 ROUTE: File Vault
// =================================================================
router.get("/api/vault", (req, res) => {
    const { ticketId } = req.query; if (!ticketId) return res.status(400).send("Ticket ID is required.");
    const files = fs.readdirSync(paths.downloadsDir); const foundFile = files.find((f) => f.includes(ticketId) && !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (foundFile) { res.download(path.join(paths.downloadsDir, foundFile), foundFile); } else { res.status(404).send("الملف لسه بيجهز، أو رقم التذكرة غلط، أو عدى عليه ساعتين واتمسح."); }
});

router.get("/api/vault/status", (req, res) => {
    const { ticketId } = req.query; if (!ticketId) return res.json({ ready: false });
    if (vaultTracker[ticketId] === "done") return res.json({ ready: true });
    if (vaultTracker[ticketId] === "downloading") return res.json({ ready: false });
    if (fs.existsSync(paths.downloadsDir)) { const files = fs.readdirSync(paths.downloadsDir); const foundFile = files.find((f) => f.includes(ticketId) && !f.endsWith(".part") && !f.endsWith(".ytdl")); if (foundFile) return res.json({ ready: true }); }
    res.json({ ready: false });
});

module.exports = router;
