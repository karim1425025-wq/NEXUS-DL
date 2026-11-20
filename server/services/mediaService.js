const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const ffmpeg = require("ffmpeg-static");
const { logSystem } = require("../utils/helpers");

// =================================================================
// ✅ MEDIA COMPATIBILITY LAYER (WhatsApp stories / USB speakers / car)
// -----------------------------------------------------------------
// WhatsApp status and most flash-drive players (party speakers, car
// radios) are picky:
//   video -> MP4 container + H.264 video + AAC audio + faststart
//   audio -> MP3, 44.1 kHz, stereo
// Files with VP9 / AV1 / HEVC / Opus play fine on a PC but those
// devices refuse to open them. We normalize the final file only when
// it is not already compatible, and never touch the original flow.
// =================================================================

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 * 16, windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stderr || "");
        });
    });
}

async function probeMedia(filePath) {
    let output = "";
    try {
        // ffmpeg with no output prints stream info to stderr then exits with code 1
        output = await runFfmpeg(["-hide_banner", "-i", filePath]);
    } catch (err) {
        output = err.message;
    }
    const video = output.match(/Video: ([a-zA-Z0-9_]+)/);
    const audio = output.match(/Audio: ([a-zA-Z0-9_]+)/);
    const pixel = output.match(/Video: [^\n]*?,\s*(yuv\w+|nv\d+|rgb\w*|gbrp\w*)/);
    const rate = output.match(/Audio:[^\n]*?,\s*(\d{4,6}) Hz/);
    const layout = output.match(/Audio:[^\n]*?Hz,\s*([a-z0-9.()]+)/i);
    // ffmpeg prints the average bitrate of each stream, e.g. "... 2504 kb/s"
    const videoBitrate = output.match(/Video:[^\n]*?,\s*(\d+(?:\.\d+)?) kb\/s/);
    const audioBitrate = output.match(/Audio:[^\n]*?,\s*(\d+(?:\.\d+)?) kb\/s/);
    const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const duration = durationMatch
        ? parseInt(durationMatch[1], 10) * 3600 + parseInt(durationMatch[2], 10) * 60 + parseFloat(durationMatch[3])
        : 0;
    return {
        hasVideo: !!video,
        hasAudio: !!audio,
        vcodec: video ? video[1].toLowerCase() : "",
        acodec: audio ? audio[1].toLowerCase() : "",
        pixFmt: pixel ? pixel[1].toLowerCase() : "",
        sampleRate: rate ? parseInt(rate[1], 10) : 0,
        layout: layout ? layout[1].toLowerCase() : "",
        videoBitrate: videoBitrate ? Math.round(parseFloat(videoBitrate[1])) : 0,
        audioBitrate: audioBitrate ? Math.round(parseFloat(audioBitrate[1])) : 0,
        duration
    };
}

// MP4 faststart puts the "moov" index before the media data, which is what
// phones/social apps need to start playback before the file is fully read.
function hasFastStart(filePath) {
    try {
        const fd = fs.openSync(filePath, "r");
        const size = fs.fstatSync(fd).size;
        const length = Math.min(size, 2 * 1024 * 1024);
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, 0);
        fs.closeSync(fd);
        const moov = buffer.indexOf(Buffer.from("moov"));
        const mdat = buffer.indexOf(Buffer.from("mdat"));
        if (moov === -1) return false;
        return mdat === -1 || moov < mdat;
    } catch (err) {
        return false;
    }
}

function replaceFile(sourcePath, targetPath) {
    if (fs.existsSync(targetPath)) { try { fs.unlinkSync(targetPath); } catch (e) { } }
    fs.renameSync(sourcePath, targetPath);
    return targetPath;
}

async function ensureCompatibleMedia(filePath, kind, options = {}) {
    const parsed = path.parse(filePath);
    const ext = parsed.ext.toLowerCase();
    const info = await probeMedia(filePath);
    const originalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    const asAudio = kind === "audio" || !info.hasVideo;

    // 🛡️ حماية من كبر الحجم: لو التحويل هينتج ملف أكبر بكتير من الأصلي،
    // نمسحه ونرجّع الملف الأصلي (مفيش حاجة تكبر من غير سبب).
    // الملفات الصغيرة جداً معفية من الحماية لأن الفرق المطلق فيها مش مهم.
    const isTooBig = (candidate) => originalSize > 2 * 1024 * 1024 && fs.existsSync(candidate) &&
        fs.statSync(candidate).size > originalSize * 1.35;

    // ---------- AUDIO: USB players / party speakers / WhatsApp ----------
    if (asAudio) {
        if (!info.hasAudio) return filePath; // nothing to convert
        const alreadyOk = ext === ".mp3" && info.acodec === "mp3" &&
            info.sampleRate === 44100 && info.layout === "stereo";
        if (alreadyOk) return filePath;

        const bitrate = (parseInt(options.abr, 10) || 128) + "k";
        const tempPath = path.join(parsed.dir, `${parsed.name}.compat.mp3`);
        try {
            await runFfmpeg([
                "-y", "-hide_banner", "-loglevel", "error",
                "-i", filePath,
                "-map", "0:a:0", "-vn",
                "-c:a", "libmp3lame", "-b:a", bitrate,
                "-ar", "44100", "-ac", "2",
                "-id3v2_version", "3", "-write_id3v1", "1",
                "-map_metadata", "0",
                tempPath
            ]);
            if (isTooBig(tempPath)) {
                const outSize = fs.statSync(tempPath).size;
                try { fs.unlinkSync(tempPath); } catch (e) { }
                logSystem("warn", `Audio normalization skipped: output bigger (${(outSize / 1048576).toFixed(1)} MB vs ${(originalSize / 1048576).toFixed(1)} MB). Original kept.`);
                return filePath;
            }
            const finalPath = replaceFile(tempPath, path.join(parsed.dir, `${parsed.name}.mp3`));
            if (finalPath !== filePath && fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (e) { } }
            logSystem("info", `Audio normalized for playback devices: ${path.basename(finalPath)} (${bitrate}, 44.1 kHz, stereo)`);
            return finalPath;
        } catch (err) {
            try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) { }
            throw err;
        }
    }

    // ---------- VIDEO: WhatsApp status / phones ----------
    // ffmpeg بيسماهم h264 / avc1 (H.264) و aac / mp4a (AAC)
    const isH264 = /^(h264|avc1)$/.test(info.vcodec);
    const isAac = /^(aac|mp4a)$/.test(info.acodec);
    const alreadyOk = ext === ".mp4" && isH264 && (!info.hasAudio || isAac) &&
        (info.pixFmt === "yuv420p" || info.pixFmt === "yuvj420p");
    if (alreadyOk && hasFastStart(filePath)) return filePath;

    const tempPath = path.join(parsed.dir, `${parsed.name}.compat.mp4`);
    try {
        if (alreadyOk) {
            // تعديل خفيف بس: إعادة بناء الحاوية (faststart) من غير أي إعادة_encode
            await runFfmpeg([
                "-y", "-hide_banner", "-loglevel", "error",
                "-i", filePath,
                "-map", "0:v:0", "-map", "0:a:0?",
                "-c", "copy",
                "-movflags", "+faststart",
                tempPath
            ]);
        } else {
            // تحويل حقيقي: H.264 + AAC. نحسب معدل بت مستهدف من حجم الملف
            // الأصلي ومدته عشان الحجم يفضل قريب من الأصلي ومينفعش يضاعف.
            const audioOut = Math.max(64, Math.min(128, Math.round((info.audioBitrate || 128) * 1.1)));
            let targetKbps = 0;
            if (info.duration > 0) {
                targetKbps = Math.round((originalSize / 1024) * 8 / info.duration * 1.15);
            }
            // لو مدة الملف مش معروفة، نرجع لمعدل البت الموجود في الملف
            if (!targetKbps) targetKbps = Math.round((info.videoBitrate || 4000) * 1.1);
            // الهدف ده إجمالي (فيديو + صوت)، فنطرح منه الصوت عشان منعدّيش مرتين
            targetKbps = Math.max(250, Math.min(targetKbps, 12000));
            const videoTarget = Math.max(250, targetKbps - audioOut);
            await runFfmpeg([
                "-y", "-hide_banner", "-loglevel", "error",
                "-i", filePath,
                "-map", "0:v:0", "-map", "0:a:0?",
                "-c:v", "libx264", "-preset", "veryfast",
                "-b:v", `${videoTarget}k`, "-maxrate", `${videoTarget}k`, "-bufsize", `${videoTarget * 2}k`,
                "-profile:v", "main", "-pix_fmt", "yuv420p",
                "-vf", "scale=1920:1920:force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-c:a", "aac", "-b:a", `${audioOut}k`, "-ac", "2",
                "-movflags", "+faststart",
                tempPath
            ]);
            logSystem("info", `Transcode target bitrate: ${targetKbps} kbps total (video ${videoTarget} + audio ${audioOut}) for ${(originalSize / 1048576).toFixed(2)} MB / ${info.duration.toFixed(1)}s.`);
        }

        if (isTooBig(tempPath)) {
            const outSize = fs.statSync(tempPath).size;
            try { fs.unlinkSync(tempPath); } catch (e) { }
            logSystem("warn", `Video normalization skipped: output bigger (${(outSize / 1048576).toFixed(1)} MB vs ${(originalSize / 1048576).toFixed(1)} MB). Original kept.`);
            return filePath;
        }

        const finalPath = replaceFile(tempPath, path.join(parsed.dir, `${parsed.name}.mp4`));
        if (finalPath !== filePath && fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (e) { } }
        logSystem("info", `Video normalized for WhatsApp/phones: ${path.basename(finalPath)} (H.264 + AAC${alreadyOk ? ", faststart" : ""})`);
        return finalPath;
    } catch (err) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) { }
        throw err;
    }
}

module.exports = {
    runFfmpeg,
    probeMedia,
    hasFastStart,
    replaceFile,
    ensureCompatibleMedia
};
