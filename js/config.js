/* ===== config.js — الثوابت وروابط السيرفر + الترجمات + اللغة والثيم الحاليين ===== */
        const BASE_SERVER = "http://localhost:3000";

        const BACKEND_URL = BASE_SERVER + "/api/info";
        const DOWNLOAD_URL = BASE_SERVER + "/api/download";
        const CONVERT_URL = BASE_SERVER + "/api/convert";
        const PROXY_URL = BASE_SERVER + "/api/proxy";
        const VAULT_URL = BASE_SERVER + "/api/vault";

        const translations = {
            ar: {
                langBtn: "English", title: "تحميل الفيديوهات", subtitle: "حمل فيديوهاتك المفضلة بسرعة وبأعلى جودة",
                placeholder: "الصق الرابط هنا...", btnAnalyze: "تحليل الرابط", analyzing: "جاري فك التشفير...",
                msgEmpty: "يرجى إدخال الرابط أولاً!", msgError: "عذراً، الرابط غير صالح.",
                thQuality: "الجودة", thFormat: "الحجم", thAction: "إجراء", dlBtn: "تحميل",
                sourceYT: "يوتيوب", sourceTK: "تيك توك", sourceIG: "انستجرام", sourceFB: "فيسبوك", sourceX: "إكس (تويتر)", sourceUnknown: "فيديو",
                convertBtn: "تحويل MP3", converting: "جاري التحويل...", dlThumbBtn: "تحميل الصورة",
                historyTitle: "سجل التحميلات", historyBtn: "السجل", trimStart: "بداية (مثال: 7)", trimEnd: "نهاية (مثال: 12)",
                playAudioMP3: "صوت MP3", playVideoHD: "فيديو عالي الدقة", playVideoSD: "فيديو جودة عادية", emptyHistory: "لا توجد تحميلات سابقة.",
                min: "دقائق", sec: "ثواني",
                vaultTitle: `<i class="fas fa-lock"></i> خزنة الملفات`, vaultDesc: "لو قفلت الصفحة بالغلط، اكتب رقم تذكرتك هنا واستلم ملفك الجاهز.",
                vaultInput: "مثال: Ticket_123456", vaultBtn: `<i class="fas fa-box-open"></i> استرجاع الملف`,
                ticketLabel: "تذكرتك (انسخها لو هتقفل):", terms: "شروط الاستخدام وإخلاء المسؤولية",
                vidTitlePh: "اسم الفيديو...", vidTitleTooltip: "يمكنك تعديل اسم الملف قبل التحميل",
                trimFrom: "قص من", trimTo: "قص إلى", progressPrep: "جاري التجهيز... ", progressDone: "اكتمل! جاري حفظ الملف...",
                progressDL: "جاري التحميل... ", noFormats: "لا توجد جودات متاحة", alertVault: "أدخل رقم التذكرة أولاً!",
                alertConv: "حدث خطأ أثناء التحويل", vidReady: "فيديو جاهز", defaultName: "Nexus_Media",
                langLabel: "لغة الفيديو:", captionLabel: "تحميل مع كابشن", captionLangLabel: "لغة الكابشن:",
                allLangs: "الكل", noLangs: "غير متاح",
                btnDownloadOnlySub: "تحميل الكابشن",
                btnDownloadOnlyLRC: "تحميل الكلمات (LRC)",
                historyTooltip: "سجل التحميلات",
                convertTooltip: "تحويل فيديو لصوت من الجهاز",
                dlCaptionBtn: "تنزيل الكابشن/الكلمات",
                captionLabelShort: "كابشن",
                tabPrefix: "تب ",
                addTabTitle: "فتح تب جديد"
            },
            en: {
                langBtn: "عربي", title: "Video Downloader", subtitle: "Download your favorite videos fast and in high quality",
                placeholder: "Paste URL here...", btnAnalyze: "Analyze", analyzing: "Decrypting...",
                msgEmpty: "Please enter a valid URL!", msgError: "Sorry, link invalid.",
                thQuality: "Quality", thFormat: "Size", thAction: "Action", dlBtn: "Download",
                sourceYT: "YouTube", sourceTK: "TikTok", sourceIG: "Instagram", sourceFB: "Facebook", sourceX: "X (Twitter)", sourceUnknown: "Video",
                convertBtn: "Convert MP3", converting: "Converting...", dlThumbBtn: "Cover Image",
                historyTitle: "Download History", historyBtn: "History", trimStart: "Start (ex: 7)", trimEnd: "End (ex: 12)",
                playAudioMP3: "Audio MP3", playVideoHD: "Video HD", playVideoSD: "Video SD", emptyHistory: "No download history found.",
                min: "Mins", sec: "Secs",
                vaultTitle: `<i class="fas fa-lock"></i> File Vault`, vaultDesc: "If you closed the page by mistake, enter your ticket ID here to get your file.",
                vaultInput: "Example: Ticket_123456", vaultBtn: `<i class="fas fa-box-open"></i> Restore File`,
                ticketLabel: "Your Ticket (copy it if you leave):", terms: "Terms of Use & Disclaimer",
                vidTitlePh: "Video Name...", vidTitleTooltip: "You can edit the file name before downloading",
                trimFrom: "Trim From", trimTo: "Trim To", progressPrep: "Preparing... ", progressDone: "Completed! Saving file...",
                progressDL: "Downloading... ", noFormats: "No formats available", alertVault: "Enter ticket ID first!",
                alertConv: "Error during conversion", vidReady: "Video Ready", defaultName: "Nexus_Media",
                langLabel: "Video Language:", captionLabel: "Download with Captions", captionLangLabel: "Caption Language:",
                allLangs: "All", noLangs: "N/A",
                btnDownloadOnlySub: "Download Caption",
                btnDownloadOnlyLRC: "Download Lyrics (LRC)",
                historyTooltip: "Download History",
                convertTooltip: "Convert local video to audio",
                dlCaptionBtn: "Download Captions/Lyrics",
                captionLabelShort: "Caption",
                tabPrefix: "Tab ",
                addTabTitle: "Open New Tab"
            }
        };

        let currentLang = localStorage.getItem('nexus_lang') || 'ar';
        let currentTheme = localStorage.getItem('nexus_theme') || 'dark';

