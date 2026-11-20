/* ===== analyze.js — تحليل الرابط وبناء جدول الجودات ===== */
        // ==========================================
        // 📥 ANALYZE & DOWNLOAD ENGINE
        // ==========================================
        async function analyzeTabUrl(tabId) {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;

            const urlInput = document.getElementById(`videoUrl-${tabId}`);
            const rawUrl = urlInput ? urlInput.value.trim() : "";
            const t = translations[currentLang];
            const errorMsg = document.getElementById(`errorMsg-${tabId}`);
            const analyzeBtn = document.getElementById(`btnAnalyze-${tabId}`);
            const resultArea = document.getElementById(`resultArea-${tabId}`);
            const singleVideoArea = document.getElementById(`singleVideoArea-${tabId}`);
            const playlistArea = document.getElementById(`playlistArea-${tabId}`);

            document.getElementById(`progressContainer-${tabId}`).style.display = 'none';

            if (!rawUrl || !rawUrl.includes('http')) {
                errorMsg.innerText = t.msgEmpty;
                errorMsg.style.display = 'block';
                return;
            }

            errorMsg.style.display = 'none';
            resultArea.style.display = 'none';
            tab.url = rawUrl;

            const originalBtnHtml = analyzeBtn.innerHTML;
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t.analyzing}</span>`;

            try {
                const response = await fetch(BACKEND_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: tab.url, lang: currentLang })
                });
                const data = await response.json();

                if (data.success) {
                    // Update tab label
                    const tabTitle = data.title ? (data.title.length > 15 ? data.title.substring(0, 15) + '...' : data.title) : `${t.tabPrefix}${tabId}`;
                    tab.title = tabTitle;
                    const tabLabel = document.getElementById(`tab-label-${tabId}`);
                    if (tabLabel) tabLabel.innerText = tabTitle;

                    if (data.isPlaylist) {
                        singleVideoArea.style.display = 'none';
                        playlistArea.style.display = 'block';
                        buildPlaylistUI(tabId, data.entries, data.title);
                    } else {
                        playlistArea.style.display = 'none';
                        singleVideoArea.style.display = 'block';

                        const fallbackImage = "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=500&auto=format&fit=crop";
                        const finalImgSrc = data.thumbnail ? `${PROXY_URL}?url=${encodeURIComponent(data.thumbnail)}` : fallbackImage;

                        const thumbImg = document.getElementById(`videoThumb-${tabId}`);
                        const downloadThumbBtn = document.getElementById(`downloadThumbBtn-${tabId}`);
                        thumbImg.src = finalImgSrc;
                        downloadThumbBtn.href = finalImgSrc;
                        thumbImg.onerror = function () { this.src = fallbackImage; downloadThumbBtn.href = fallbackImage; };

                        document.getElementById(`videoTitle-${tabId}`).value = data.title || t.vidReady;
                        updateSourceText(tabId, tab.url);
                        tab.formats = data.formats || [];
                        buildTabTable(tabId);

                        // 🌍 Multi-language Audio
                        const langRow = document.getElementById(`languageRow-${tabId}`);
                        const langSelect = document.getElementById(`videoLangSelect-${tabId}`);
                        tab.availableLanguages = data.availableLanguages || [];
                        if (tab.availableLanguages.length > 1) {
                            langRow.style.display = 'flex';
                            langSelect.innerHTML = '';
                            tab.availableLanguages.forEach(langObj => {
                                langSelect.innerHTML += `<option value="${langObj.code}">${langObj.label}</option>`;
                            });
                        } else {
                            langRow.style.display = 'none';
                        }

                        // 📝 Captions & Lyrics
                        const captionRow = document.getElementById(`captionRow-${tabId}`);
                        const onlyCaptionRow = document.getElementById(`onlyCaptionRow-${tabId}`);
                        const captionLangSelect = document.getElementById(`captionLangSelect-${tabId}`);
                        const captionCheck = document.getElementById(`captionCheck-${tabId}`);
                        tab.subtitles = data.availableSubtitles || [];

                        // Always display Lyrics button for any video/song
                        if (onlyCaptionRow) onlyCaptionRow.style.display = 'flex';

                        if (tab.subtitles.length > 0) {
                            captionRow.style.display = 'flex';
                            captionCheck.checked = false;
                            captionLangSelect.style.display = 'none';
                            captionLangSelect.innerHTML = '';
                            tab.subtitles.forEach(sub => {
                                captionLangSelect.innerHTML += `<option value="${sub.code}">${sub.label}</option>`;
                            });
                        } else {
                            captionRow.style.display = 'none';
                        }
                    }
                    resultArea.style.display = 'block';
                } else {
                    throw new Error(data.error);
                }
            } catch (err) {
                errorMsg.innerText = err.message || t.msgError;
                errorMsg.style.display = 'block';
            } finally {
                analyzeBtn.innerHTML = originalBtnHtml;
                analyzeBtn.disabled = false;
            }
        }

        function updateSourceText(tabId, url) {
            const t = translations[currentLang];
            let sourceName = t.sourceUnknown;
            if (url.includes('youtu')) sourceName = t.sourceYT;
            else if (url.includes('tiktok')) sourceName = t.sourceTK;
            else if (url.includes('instagram')) sourceName = t.sourceIG;
            else if (url.includes('facebook') || url.includes('fb')) sourceName = t.sourceFB;
            else if (url.includes('x.com') || url.includes('twitter')) sourceName = t.sourceX;
            const el = document.getElementById(`videoSource-${tabId}`);
            if (el) el.innerHTML = `<i class="fas fa-check-circle"></i> ` + sourceName;
        }

        function buildTabTable(tabId) {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;

            const tbody = document.getElementById(`tableBody-${tabId}`);
            const t = translations[currentLang];
            tbody.innerHTML = '';

            if (!tab.formats || tab.formats.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">${t.noFormats}</td></tr>`;
                return;
            }

            tab.formats.forEach((f, index) => {
                const isAudio = f.type === 'audio';
                const iconClass = isAudio ? 'fas fa-music' : 'fas fa-video';
                const nameClass = isAudio ? 'q-name audio' : 'q-name';
                const btnClass = isAudio ? 'btn-dl-small audio-btn' : 'btn-dl-small video-btn';

                let qLabel = f.quality;
                if (isAudio) {
                    const match = f.quality.match(/\((\d+kbps)\)/);
                    const kbps = match ? match[1] : '';
                    if (f.quality.includes('High Quality') || f.quality.includes('جودة عالية')) {
                        qLabel = currentLang === 'en' ? `High Quality Audio (${kbps})` : `صوت (جودة عالية) (${kbps})`;
                    } else if (f.quality.includes('Low') || f.quality.includes('منخفض')) {
                        qLabel = currentLang === 'en' ? `Low Audio (${kbps})` : `صوت منخفض (${kbps})`;
                    } else {
                        qLabel = currentLang === 'en' ? `Audio (${kbps})` : `صوت (${kbps})`;
                    }
                } else {
                    const match = f.quality.match(/\d+p/);
                    const res = match ? match[0] : '';
                    qLabel = currentLang === 'en' ? `Video ${res} MP4` : `فيديو ${res} MP4`;
                }

                let btnHtml = `
                    <button class="${btnClass}" onclick="fetchMergedDownload(${tabId}, ${index}, this)">
                        <i class="fas fa-download"></i> <span class="t-dlBtnText">${t.dlBtn}</span>
                    </button>
                `;

                tbody.innerHTML += `
                    <tr>
                        <td><div class="${nameClass}"><i class="${iconClass}"></i> ${qLabel}</div></td>
                        <td><span class="q-format">${translateSize(f.size, currentLang)}</span></td>
                        <td>${btnHtml}</td>
                    </tr>
                `;
            });
        }

