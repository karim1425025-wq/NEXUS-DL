const https = require("https");
const { logSystem } = require("../utils/helpers");

// =================================================================
// 🎤 SMART ACCURATE LYRICS ENGINE (LRCLIB + GENIUS + AUTO-CLEANING)
// =================================================================
function httpsGetContent(url) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(url);
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US,en;q=0.9'
                },
                timeout: 10000
            };
            const req = https.request(options, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return resolve(httpsGetContent(res.headers.location));
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error("Request Timeout")); });
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

function cleanSongTitleForLyrics(raw) {
    if (!raw) return '';
    return raw
        .replace(/\[.*?\]|\(.*?\)|【.*?】|\|.*?$/g, ' ')
        .replace(/official\s*(music)?\s*(video|audio)?/gi, '')
        .replace(/lyric\s*video|lyrics|فيديو\s*كليب|كليب|حصرياً|كلمات|أغنية|اغنية/gi, '')
        .replace(/prod\.\s*[\w\u0600-\u06FF]+/gi, '')
        .replace(/feat\.?\s*[\w\u0600-\u06FF]+|ft\.?\s*[\w\u0600-\u06FF]+/gi, '')
        .replace(/4k|hd|hq|1080p|720p/gi, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchFromGenius(query) {
    try {
        const searchUrl = 'https://genius.com/api/search/multi?per_page=5&q=' + encodeURIComponent(query);
        const searchRaw = await httpsGetContent(searchUrl);
        const searchJson = JSON.parse(searchRaw);
        const hits = searchJson.response?.sections?.find(s => s.type === 'song')?.hits || [];
        if (!hits.length) return null;

        const songUrl = hits[0].result?.url;
        if (!songUrl) return null;

        const pageHtml = await httpsGetContent(songUrl);
        const regex = /<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g;
        let match, lyrics = '';
        while ((match = regex.exec(pageHtml)) !== null) {
            lyrics += match[1].replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]+>/g, '') + '\n';
        }
        lyrics = lyrics
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;|&#039;/g, "'")
            .replace(/^\d+\s*Contributors?.*?\n/is, '')
            .replace(/^Translations[^\n]*\n?/i, '')
            .replace(/^.*?Lyrics\s*\n/is, '')
            .replace(/\d+Embed$/i, '')
            .replace(/Embed$/i, '')
            .replace(/You might also like/gi, '')
            .trim();

        return lyrics || null;
    } catch (e) {
        return null;
    }
}

async function fetchFromLrcLib(query) {
    try {
        const searchUrl = 'https://lrclib.net/api/search?q=' + encodeURIComponent(query);
        const searchRaw = await httpsGetContent(searchUrl);
        const searchJson = JSON.parse(searchRaw);
        if (!Array.isArray(searchJson) || !searchJson.length) return null;
        return searchJson[0];
    } catch (e) {
        return null;
    }
}

async function getAccurateLyrics(query, preferSynced = true) {
    const cleaned = cleanSongTitleForLyrics(query);
    if (!cleaned) return null;

    logSystem("info", `Searching accurate lyrics database for: "${cleaned}"`);

    // 1. Try LRCLIB for Synced LRC first
    if (preferSynced) {
        const lrcResult = await fetchFromLrcLib(cleaned);
        if (lrcResult && lrcResult.syncedLyrics) {
            logSystem("success", `Found synced lyrics on LRCLIB for "${cleaned}"`);
            return {
                content: lrcResult.syncedLyrics,
                ext: '.lrc',
                isSynced: true,
                source: 'LRCLIB'
            };
        }
    }

    // 2. Try Genius for 100% verified accurate lyrics (especially Arabic songs)
    const geniusLyrics = await fetchFromGenius(cleaned);
    if (geniusLyrics && geniusLyrics.length > 20) {
        logSystem("success", `Found verified lyrics on Genius for "${cleaned}"`);
        return {
            content: geniusLyrics,
            ext: preferSynced ? '.lrc' : '.txt',
            isSynced: false,
            source: 'Genius'
        };
    }

    // 3. Fallback to LRCLIB plain lyrics if available
    const lrcPlain = await fetchFromLrcLib(cleaned);
    if (lrcPlain && lrcPlain.plainLyrics) {
        logSystem("success", `Found plain lyrics on LRCLIB for "${cleaned}"`);
        return {
            content: lrcPlain.plainLyrics,
            ext: '.txt',
            isSynced: false,
            source: 'LRCLIB'
        };
    }

    return null;
}

function extractFirstLrcTimestamp(lrcContent) {
    if (!lrcContent) return null;
    const lines = lrcContent.split('\n');
    for (const line of lines) {
        if (line.match(/^\[(ti|ar|al|by|offset|length|re|ve):/i)) continue;
        const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
        if (m) {
            const text = m[3].replace(/\[.*?\]/g, '').replace(/[\u200B-\u200D\uFEFF\u00A0♪♫🎶\(\)]/g, '').trim();
            if (text.length > 0) {
                return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
            }
        }
    }
    return null;
}

function adjustLrcTimestampOffset(lrcContent, offsetSeconds) {
    if (!offsetSeconds || isNaN(offsetSeconds) || Math.abs(offsetSeconds) < 0.05) return lrcContent;
    return lrcContent.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, (match, min, sec) => {
        let total = parseInt(min, 10) * 60 + parseFloat(sec) + offsetSeconds;
        if (total < 0) total = 0;
        const m = Math.floor(total / 60);
        const s = (total % 60).toFixed(2);
        return `[${String(m).padStart(2, '0')}:${(parseFloat(s) < 10 ? '0' : '') + s}]`;
    });
}

// =================================================================
// 🎵 دالة تنسيق ملف LRC بالشكل المطلوب (بدون تكرار + [Music])
// =================================================================
function formatLrcContent(rawContent) {
    const lines = rawContent.split('\n');
    let parsedEntries = [];

    // تحليل كل سطر واستخراج التوقيت والنص
    for (let line of lines) {
        // تجاهل أسطر الميتاداتا
        const metaMatch = line.match(/^\[(re|ve|ti|ar|al|by|offset|length):.*\]$/i);
        if (metaMatch) continue;

        const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const ms = parseInt(match[3].padEnd(3, '0'));
            const totalMs = (minutes * 60 + seconds) * 1000 + ms;
            let text = match[4].replace(/\[.*?\]/g, '').replace(/[\u200B-\u200D\uFEFF\u00A0♪♫🎶]/g, '').trim();
            const timestamp = `[${match[1]}:${match[2]}.${match[3]}]`;

            if (text) {
                parsedEntries.push({ totalMs, timestamp, text });
            }
        }
    }

    if (parsedEntries.length === 0) return rawContent;

    // ============================
    // المرحلة 1: استخراج النص الجديد فقط من كل سطر
    // يوتيوب بيعمل rolling text: كل سطر = السطر اللي قبله + كلام جديد
    // ============================
    let cleanEntries = [];
    for (let i = 0; i < parsedEntries.length; i++) {
        const entry = parsedEntries[i];
        let newText = entry.text;

        if (i > 0) {
            const prevText = parsedEntries[i - 1].text;
            // لو السطر الحالي بيبدأ بنفس نص السطر اللي قبله، ناخد الجديد بس
            if (entry.text.startsWith(prevText)) {
                newText = entry.text.substring(prevText.length).trim();
            } else {
                // لو السطر الحالي فيه جزء من السطر اللي قبله في الآخر
                // نشوف أكبر overlap بين نهاية السطر القديم وبداية الجديد
                let overlapLen = 0;
                const maxCheck = Math.min(prevText.length, entry.text.length);
                for (let len = maxCheck; len >= 3; len--) {
                    const endOfPrev = prevText.substring(prevText.length - len);
                    if (entry.text.startsWith(endOfPrev)) {
                        overlapLen = len;
                        break;
                    }
                }
                if (overlapLen > 0) {
                    newText = entry.text.substring(overlapLen).trim();
                }
            }
        }

        if (newText) {
            cleanEntries.push({ totalMs: entry.totalMs, timestamp: entry.timestamp, text: newText });
        }
    }

    // ============================
    // المرحلة 2: تجميع الكلمات المتقاربة في أسطر واحدة
    // لو الفرق بين كلمتين أقل من 4 ثواني ندمجهم في سطر واحد
    // ============================
    let grouped = [];
    for (let i = 0; i < cleanEntries.length; i++) {
        const entry = cleanEntries[i];

        if (grouped.length > 0) {
            const last = grouped[grouped.length - 1];
            const timeDiff = entry.totalMs - last.totalMs;
            const combinedLen = (last.text + ' ' + entry.text).length;

            // ندمج لو الفرق أقل من 4 ثواني والسطر مش هيبقى طويل أوي
            if (timeDiff < 4000 && timeDiff >= 0 && combinedLen < 80) {
                last.text += ' ' + entry.text;
                continue;
            }
        }

        grouped.push({ ...entry });
    }

    // ============================
    // المرحلة 3: إزالة أي تكرار متتابع متبقي
    // ============================
    let finalEntries = [];
    for (let i = 0; i < grouped.length; i++) {
        if (finalEntries.length > 0) {
            const lastText = finalEntries[finalEntries.length - 1].text;
            if (grouped[i].text === lastText) continue;
            // تجاهل لو السطر الجديد هو جزء صغير جداً من اللي قبله
            if (grouped[i].text.length < 3) continue;
        }
        finalEntries.push(grouped[i]);
    }

    // ============================
    // المرحلة 4: بناء الملف النهائي
    // ============================
    let outputLines = [];
    outputLines.push('[re:Lavf60.16.100]');
    outputLines.push('[ve:60.16.100]');
    outputLines.push('');

    for (const entry of finalEntries) {
        outputLines.push(`${entry.timestamp}${entry.text}`);
    }

    return outputLines.join('\n');
}

module.exports = {
    httpsGetContent,
    cleanSongTitleForLyrics,
    fetchFromGenius,
    fetchFromLrcLib,
    getAccurateLyrics,
    extractFirstLrcTimestamp,
    adjustLrcTimestampOffset,
    formatLrcContent
};
