/* ===== tabs.js — نظام التابات (إنشاء/تبديل/غلق) ===== */
        // ==========================================
        // 📑 TAB MANAGEMENT SYSTEM
        // ==========================================
        let tabs = [];
        let tabCounter = 0;
        let activeTabId = null;

        class TabInstance {
            constructor(id) {
                this.id = id;
                this.title = `${translations[currentLang].tabPrefix}${id}`;
                this.url = "";
                this.formats = [];
                this.subtitles = [];
                this.availableLanguages = [];
                this.activeTicket = null;
                this.eventSource = null;
            }
        }

        function addNewTab(initialUrl = "") {
            tabCounter++;
            const tabId = tabCounter;
            const tab = new TabInstance(tabId);
            tabs.push(tab);

            // 1. Create Tab Button in Bar
            const tabBar = document.getElementById('tabBar');
            const addBtn = document.getElementById('btnAddTab');

            const tabBtn = document.createElement('button');
            tabBtn.className = 'tab-btn';
            tabBtn.id = `tab-btn-${tabId}`;
            tabBtn.onclick = (e) => {
                if (!e.target.classList.contains('tab-close') && !e.target.parentElement.classList.contains('tab-close')) {
                    switchTab(tabId);
                }
            };

            const tabLabel = document.createElement('span');
            tabLabel.className = 'tab-label';
            tabLabel.id = `tab-label-${tabId}`;
            tabLabel.innerText = tab.title;
            tabBtn.appendChild(tabLabel);

            const closeBtn = document.createElement('span');
            closeBtn.className = 'tab-close';
            closeBtn.title = currentLang === 'ar' ? 'إغلاق التاب' : 'Close Tab';
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                closeTab(tabId);
            };
            tabBtn.appendChild(closeBtn);

            tabBar.insertBefore(tabBtn, addBtn);

            // 2. Create Tab Panel DOM
            const tabPanels = document.getElementById('tabPanels');
            const panel = document.createElement('div');
            panel.className = 'tab-panel';
            panel.id = `tab-panel-${tabId}`;

            const t = translations[currentLang];

            panel.innerHTML = `
                <div class="input-group">
                    <i class="fas fa-link link-icon"></i>
                    <input type="text" id="videoUrl-${tabId}" placeholder="${t.placeholder}" autocomplete="off">
                    <i class="fas fa-times clear-icon" id="clearUrlBtn-${tabId}" onclick="clearTabUrl(${tabId})" title="مسح"></i>
                </div>

                <button class="btn-analyze" id="btnAnalyze-${tabId}" onclick="analyzeTabUrl(${tabId})">
                    <i class="fas fa-magic"></i> <span id="t-btnAnalyze-${tabId}">${t.btnAnalyze}</span>
                </button>

                <div class="status-msg status-error" id="errorMsg-${tabId}"></div>

                <div class="result-area" id="resultArea-${tabId}">
                    <div id="singleVideoArea-${tabId}">
                        <div class="video-preview">
                            <div class="thumb-container">
                                <img src="" alt="Thumbnail" class="video-thumb" id="videoThumb-${tabId}">
                                <a id="downloadThumbBtn-${tabId}" href="#" target="_blank" class="btn-dl-small" style="width: 100%; text-decoration: none;" download="Thumbnail.jpg">
                                    <i class="fas fa-image"></i> <span class="t-dlThumb">${t.dlThumbBtn}</span>
                                </a>
                            </div>
                            <div class="video-info">
                                <input type="text" class="video-title-input" id="videoTitle-${tabId}" placeholder="${t.vidTitlePh}" title="${t.vidTitleTooltip}">
                                
                                <div class="trim-group">
                                    <input type="text" class="trim-input" id="trimStart-${tabId}" placeholder="${t.trimStart}" title="${t.trimFrom}">
                                    <input type="text" class="trim-input" id="trimEnd-${tabId}" placeholder="${t.trimEnd}" title="${t.trimTo}">
                                    <select id="trimUnit-${tabId}" class="trim-input glass-select" style="max-width: 90px; cursor: pointer;">
                                        <option value="min">${t.min}</option>
                                        <option value="sec">${t.sec}</option>
                                    </select>
                                </div>

                                <!-- 🌍 اختيار لغة الفيديو -->
                                <div class="options-row" id="languageRow-${tabId}" style="display: none;">
                                    <span class="option-label"><i class="fas fa-language"></i> <span class="t-langLabel">${t.langLabel}</span></span>
                                    <select id="videoLangSelect-${tabId}" class="option-select glass-select"></select>
                                </div>

                                <!-- 📝 اختيار الكابشن مع الفيديو -->
                                <div class="options-row" id="captionRow-${tabId}" style="display: none;">
                                    <div class="caption-toggle">
                                        <input type="checkbox" id="captionCheck-${tabId}" onchange="toggleTabCaptionSelect(${tabId})">
                                        <label for="captionCheck-${tabId}" class="t-captionLabel">${t.captionLabel}</label>
                                    </div>
                                    <select id="captionLangSelect-${tabId}" class="option-select glass-select" style="display: none;"></select>
                                </div>

                                <!-- 📝 تحميل الكابشن منفصلاً + كلمات LRC -->
                                <div class="options-row" id="onlyCaptionRow-${tabId}" style="display: none; gap: 10px; flex-wrap: wrap;">
                                    <button class="btn-dl-small" id="btnDownloadOnlySub-${tabId}" onclick="downloadOnlySubtitles(${tabId}, 'sub')" style="width: auto; padding: 8px 15px; background: rgba(0, 170, 255, 0.1); border-color: #00aaff; color: #00aaff;">
                                        <i class="fas fa-file-signature"></i> <span class="t-btnDownloadOnlySub">${t.btnDownloadOnlySub}</span>
                                    </button>
                                    <button class="btn-dl-small" id="btnDownloadOnlyLRC-${tabId}" onclick="downloadOnlySubtitles(${tabId}, 'lrc')" style="width: auto; padding: 8px 15px; background: rgba(188, 19, 254, 0.1); border-color: #bc13fe; color: #bc13fe;">
                                        <i class="fas fa-music"></i> <span class="t-btnDownloadOnlyLRC">${t.btnDownloadOnlyLRC}</span>
                                    </button>
                                </div>

                                <div class="video-source" id="videoSource-${tabId}">مصدر الفيديو</div>
                                
                                <div id="progressContainer-${tabId}" class="progress-container">
                                    <div class="t-ticketLabel" style="color: var(--text-muted); font-size: 0.9rem;">${t.ticketLabel}</div>
                                    <div id="ticketDisplay-${tabId}" class="ticket-display">--</div>
                                    <div id="progressText-${tabId}" style="font-weight: bold;">جاري التحميل... 0%</div>
                                    <div class="progress-bar-bg">
                                        <div id="progressFill-${tabId}" class="progress-bar-fill"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <table class="qualities-table" id="downloadTable-${tabId}">
                            <thead>
                                <tr>
                                    <th class="th-quality">${t.thQuality}</th>
                                    <th class="th-format">${t.thFormat}</th>
                                    <th class="th-action">${t.thAction}</th>
                                </tr>
                            </thead>
                            <tbody id="tableBody-${tabId}"></tbody>
                        </table>
                    </div>

                    <div id="playlistArea-${tabId}" style="display: none;">
                        <h3 style="margin-bottom: 20px; color: var(--neon-blue);" id="playlistTitleDisplay-${tabId}"></h3>
                        <div id="playlistItems-${tabId}"></div>
                    </div>
                </div>
            `;

            tabPanels.appendChild(panel);

            // Bind URL input events
            const urlInput = document.getElementById(`videoUrl-${tabId}`);
            const clearBtn = document.getElementById(`clearUrlBtn-${tabId}`);

            urlInput.addEventListener('input', function () {
                clearBtn.style.display = this.value.trim() !== '' ? 'block' : 'none';
            });

            urlInput.addEventListener('click', async function () {
                if (this.value === '') {
                    try {
                        const text = await navigator.clipboard.readText();
                        if (text && (text.includes('http://') || text.includes('https://'))) {
                            this.value = text;
                            clearBtn.style.display = 'block';
                        }
                    } catch (err) { }
                }
            });

            urlInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') analyzeTabUrl(tabId);
            });

            switchTab(tabId);

            if (initialUrl) {
                urlInput.value = initialUrl;
                clearBtn.style.display = 'block';
                analyzeTabUrl(tabId);
            }
        }

        function switchTab(tabId) {
            activeTabId = tabId;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

            const activeBtn = document.getElementById(`tab-btn-${tabId}`);
            const activePanel = document.getElementById(`tab-panel-${tabId}`);
            if (activeBtn) activeBtn.classList.add('active');
            if (activePanel) activePanel.classList.add('active');
        }

        function closeTab(tabId) {
            if (tabs.length <= 1) {
                // If only 1 tab, simply reset it
                resetTab(tabId);
                return;
            }

            const tabIndex = tabs.findIndex(t => t.id === tabId);
            if (tabIndex === -1) return;

            const tab = tabs[tabIndex];
            if (tab.eventSource) {
                try { tab.eventSource.close(); } catch (e) { }
            }

            // Remove DOM elements
            const btn = document.getElementById(`tab-btn-${tabId}`);
            const panel = document.getElementById(`tab-panel-${tabId}`);
            if (btn) btn.remove();
            if (panel) panel.remove();

            tabs.splice(tabIndex, 1);

            if (activeTabId === tabId) {
                const nextTab = tabs[Math.max(0, tabIndex - 1)];
                if (nextTab) switchTab(nextTab.id);
            }
        }

        function clearTabUrl(tabId) {
            const urlInput = document.getElementById(`videoUrl-${tabId}`);
            const clearBtn = document.getElementById(`clearUrlBtn-${tabId}`);
            if (urlInput) {
                urlInput.value = '';
                clearBtn.style.display = 'none';
                urlInput.focus();
            }
        }

        function toggleTabCaptionSelect(tabId) {
            const check = document.getElementById(`captionCheck-${tabId}`);
            const select = document.getElementById(`captionLangSelect-${tabId}`);
            if (check && select) {
                select.style.display = check.checked ? 'block' : 'none';
            }
        }

        function resetTab(tabId) {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;
            tab.url = "";
            tab.formats = [];
            tab.subtitles = [];
            tab.availableLanguages = [];
            tab.title = `${translations[currentLang].tabPrefix}${tabId}`;

            const label = document.getElementById(`tab-label-${tabId}`);
            if (label) label.innerText = tab.title;

            const urlInput = document.getElementById(`videoUrl-${tabId}`);
            if (urlInput) urlInput.value = '';

            const clearBtn = document.getElementById(`clearUrlBtn-${tabId}`);
            if (clearBtn) clearBtn.style.display = 'none';

            const resultArea = document.getElementById(`resultArea-${tabId}`);
            if (resultArea) resultArea.style.display = 'none';

            const errorMsg = document.getElementById(`errorMsg-${tabId}`);
            if (errorMsg) errorMsg.style.display = 'none';

            const prog = document.getElementById(`progressContainer-${tabId}`);
            if (prog) prog.style.display = 'none';
        }

        function resetAppView() {
            if (activeTabId) {
                resetTab(activeTabId);
            }
        }

