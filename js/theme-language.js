/* ===== theme-language.js — إدارة الثيم واللغة ===== */
        // ==========================================
        // 🌐 THEME & LANGUAGE MANAGEMENT
        // ==========================================
        function initApp() {
            document.documentElement.setAttribute('data-theme', currentTheme);
            updateThemeIcon();
            applyLanguage(currentLang);
            renderHistory();
            addNewTab(); // Create initial Tab 1
        }

        function toggleTheme() {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            localStorage.setItem('nexus_theme', currentTheme);
            updateThemeIcon();
        }

        function updateThemeIcon() {
            const icon = document.getElementById('themeIcon');
            if (icon) icon.className = currentTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }

        function toggleLanguage() {
            currentLang = currentLang === 'ar' ? 'en' : 'ar';
            localStorage.setItem('nexus_lang', currentLang);
            applyLanguage(currentLang);
            renderHistory();
        }

        function translateSize(sizeStr, lang) {
            if (!sizeStr) return "";
            if (sizeStr.includes("غير معروف") || sizeStr.includes("Unknown")) {
                return lang === "ar" ? "غير معروف" : "Unknown";
            }
            return sizeStr;
        }

        function applyLanguage(lang) {
            document.documentElement.lang = lang;
            document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
            const t = translations[lang];

            if (document.getElementById('langText')) document.getElementById('langText').innerText = t.langBtn;
            if (document.getElementById('t-title')) document.getElementById('t-title').innerText = t.title;
            if (document.getElementById('t-subtitle')) document.getElementById('t-subtitle').innerText = t.subtitle;
            if (document.getElementById('btnHistory')) document.getElementById('btnHistory').title = t.historyTooltip;
            if (document.getElementById('t-history')) document.getElementById('t-history').innerText = t.historyBtn;
            if (document.getElementById('t-historyTitle')) document.getElementById('t-historyTitle').innerText = t.historyTitle;
            if (document.getElementById('convertText')) document.getElementById('convertText').innerText = t.convertBtn;
            if (document.getElementById('convertToggle')) document.getElementById('convertToggle').title = t.convertTooltip;
            if (document.getElementById('t-vaultTitle')) document.getElementById('t-vaultTitle').innerHTML = t.vaultTitle;
            if (document.getElementById('t-vaultDesc')) document.getElementById('t-vaultDesc').innerText = t.vaultDesc;
            if (document.getElementById('vaultTicketInput')) document.getElementById('vaultTicketInput').placeholder = t.vaultInput;
            if (document.getElementById('t-vaultBtn')) document.getElementById('t-vaultBtn').innerHTML = t.vaultBtn;
            if (document.getElementById('btnAddTab')) document.getElementById('btnAddTab').title = t.addTabTitle;

            // Re-translate all open tabs
            tabs.forEach(tab => {
                const id = tab.id;
                const urlInput = document.getElementById(`videoUrl-${id}`);
                if (urlInput) urlInput.placeholder = t.placeholder;

                const analyzeBtnSpan = document.getElementById(`t-btnAnalyze-${id}`);
                if (analyzeBtnSpan) analyzeBtnSpan.innerText = t.btnAnalyze;

                const startInput = document.getElementById(`trimStart-${id}`);
                if (startInput) { startInput.placeholder = t.trimStart; startInput.title = t.trimFrom; }

                const endInput = document.getElementById(`trimEnd-${id}`);
                if (endInput) { endInput.placeholder = t.trimEnd; endInput.title = t.trimTo; }

                const trimUnit = document.getElementById(`trimUnit-${id}`);
                if (trimUnit && trimUnit.options.length >= 2) {
                    trimUnit.options[0].text = t.min;
                    trimUnit.options[1].text = t.sec;
                }

                const titleInput = document.getElementById(`videoTitle-${id}`);
                if (titleInput) { titleInput.placeholder = t.vidTitlePh; titleInput.title = t.vidTitleTooltip; }

                const panel = document.getElementById(`tab-panel-${id}`);
                if (panel) {
                    panel.querySelectorAll('.t-dlThumb').forEach(el => el.innerText = t.dlThumbBtn);
                    panel.querySelectorAll('.t-langLabel').forEach(el => el.innerText = t.langLabel);
                    panel.querySelectorAll('.t-captionLabel').forEach(el => el.innerText = t.captionLabel);
                    panel.querySelectorAll('.t-btnDownloadOnlySub').forEach(el => el.innerText = t.btnDownloadOnlySub);
                    panel.querySelectorAll('.t-btnDownloadOnlyLRC').forEach(el => el.innerText = t.btnDownloadOnlyLRC);
                    panel.querySelectorAll('.t-ticketLabel').forEach(el => el.innerText = t.ticketLabel);
                    panel.querySelectorAll('.th-quality').forEach(el => el.innerText = t.thQuality);
                    panel.querySelectorAll('.th-format').forEach(el => el.innerText = t.thFormat);
                    panel.querySelectorAll('.th-action').forEach(el => el.innerText = t.thAction);
                }

                if (tab.url) updateSourceText(id, tab.url);
                if (tab.formats && tab.formats.length > 0) buildTabTable(id);
            });
        }

