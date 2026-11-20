/* ===== download.js — التحميل والدمج + الكابشن/LRC + الـ Playlist ===== */
        function formatTrimTime(val, unit) {
            if (!val) return '';
            val = val.trim();
            if (val.includes(':')) return val;
            if (!isNaN(val)) {
                if (unit === 'min') return val + ':00';
                if (unit === 'sec') return val;
            }
            return val;
        }

        function fetchMergedDownload(tabId, index, btnElement) {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;

            const formatInfo = tab.formats[index];
            const t = translations[currentLang];
            const originalHtml = btnElement.innerHTML;
            const customTitle = document.getElementById(`videoTitle-${tabId}`).value.trim() || t.defaultName;
            const unit = document.getElementById(`trimUnit-${tabId}`).value;
            const trimStart = formatTrimTime(document.getElementById(`trimStart-${tabId}`).value, unit);
            const trimEnd = formatTrimTime(document.getElementById(`trimEnd-${tabId}`).value, unit);
            const clientId = Date.now().toString() + '_' + tabId;
            const ticketId = 'Ticket_' + Date.now() + '_' + tabId;

            // Captions
            const captionEnabled = document.getElementById(`captionCheck-${tabId}`) ? document.getElementById(`captionCheck-${tabId}`).checked : false;
            const captionLang = document.getElementById(`captionLangSelect-${tabId}`) ? document.getElementById(`captionLangSelect-${tabId}`).value : '';

            saveToHistory(customTitle, tab.url, document.getElementById(`videoThumb-${tabId}`).src);

            btnElement.disabled = true;
            btnElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 0%`;

            const progContainer = document.getElementById(`progressContainer-${tabId}`);
            const ticketDisp = document.getElementById(`ticketDisplay-${tabId}`);
            const progFill = document.getElementById(`progressFill-${tabId}`);
            const progText = document.getElementById(`progressText-${tabId}`);

            progContainer.style.display = 'block';
            ticketDisp.innerText = ticketId;
            progFill.style.width = '0%';
            progText.innerText = t.progressPrep + '0%';

            if (tab.eventSource) {
                try { tab.eventSource.close(); } catch (e) { }
            }

            const evtSource = new EventSource(`${BACKEND_URL.replace('/info', '/progress')}?id=${clientId}`);
            tab.eventSource = evtSource;

            evtSource.onmessage = function (e) {
                if (e.data === 'DONE' || e.data === 'DONE_SUBS') {
                    if (e.data === 'DONE_SUBS') {
                        const subUrl = `${BASE_SERVER}/api/subtitle?ticketId=${ticketId}&customName=${encodeURIComponent(customTitle)}`;
                        progText.innerHTML = `${t.progressDone} <br><a href="${subUrl}" target="_blank" class="btn-dl-small" style="display:inline-flex; width:auto; margin-top:10px; padding: 10px 15px;"><i class="fas fa-file-alt"></i> ${t.dlCaptionBtn}</a>`;
                    } else {
                        progText.innerText = t.progressDone;
                    }
                    btnElement.innerHTML = `<i class="fas fa-check"></i>`;
                    btnElement.disabled = false;
                    progFill.style.width = '100%';
                    evtSource.close();
                    setTimeout(() => { btnElement.innerHTML = originalHtml; }, 3000);
                } else {
                    const percent = e.data;
                    btnElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${percent}%`;
                    progFill.style.width = `${percent}%`;
                    progText.innerText = t.progressDL + percent + '%';
                }
            };
            evtSource.onerror = function () { evtSource.close(); };

            let dlUrl = `${DOWNLOAD_URL}?url=${encodeURIComponent(tab.url)}&format_id=${formatInfo.format_id || formatInfo.id}&type=${formatInfo.type}&needsMerge=${formatInfo.needsMerge}&customName=${encodeURIComponent(customTitle)}&clientId=${clientId}&ticketId=${ticketId}&height=${formatInfo.height || 0}&abr=${formatInfo.abr || 0}`;
            if (trimStart) dlUrl += `&trimStart=${encodeURIComponent(trimStart)}`;
            if (trimEnd) dlUrl += `&trimEnd=${encodeURIComponent(trimEnd)}`;
            if (captionEnabled && formatInfo.type === 'video') {
                dlUrl += `&withSubs=true`;
                if (captionLang) dlUrl += `&subLang=${encodeURIComponent(captionLang)}`;
            }

            const selectedAudioLang = document.getElementById(`videoLangSelect-${tabId}`) ? document.getElementById(`videoLangSelect-${tabId}`).value : '';
            if (selectedAudioLang && selectedAudioLang !== 'orig') {
                dlUrl += `&audioLang=${encodeURIComponent(selectedAudioLang)}`;
            }

            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = dlUrl;
            document.body.appendChild(iframe);
        }

        async function downloadOnlySubtitles(tabId, mode) {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;

            const subLangSelect = document.getElementById(`captionLangSelect-${tabId}`);
            const customTitle = document.getElementById(`videoTitle-${tabId}`).value.trim() || translations[currentLang].defaultName;
            const isLRC = (mode === 'lrc');
            const subLang = isLRC ? 'orig,.*orig,en' : (subLangSelect ? subLangSelect.value : 'en');
            const convertFormat = isLRC ? 'lrc' : 'vtt';

            const btnId = isLRC ? `btnDownloadOnlyLRC-${tabId}` : `btnDownloadOnlySub-${tabId}`;
            const btn = document.getElementById(btnId);
            const originalHtml = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${currentLang === 'ar' ? 'جاري التحميل...' : 'Downloading...'}`;

            const dlUrl = `${BASE_SERVER}/api/download-subtitles?url=${encodeURIComponent(tab.url)}&subLang=${encodeURIComponent(subLang)}&convertSubs=${convertFormat}&customName=${encodeURIComponent(customTitle)}&songTitle=${encodeURIComponent(customTitle)}`;

            try {
                const response = await fetch(dlUrl);

                if (response.status === 404) {
                    const errMsg = isLRC
                        ? (currentLang === 'ar' ? 'عذراً، لم يتم العثور على كلمات لهذه الأغنية.' : 'Sorry, no lyrics found for this song.')
                        : (currentLang === 'ar' ? 'عذراً، هذا الفيديو لا يحتوي على ملف ترجمة (كابشن).' : 'Sorry, no subtitles found for this video.');
                    alert(errMsg);
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    return;
                }

                if (!response.ok) throw new Error(`Server error ${response.status}`);

                const blob = await response.blob();
                const ext = convertFormat === 'lrc' ? '.lrc' : '.vtt';
                const safeFileName = customTitle.replace(/[^\w\s\u0600-\u06FF-]/g, '').trim().substring(0, 60) || 'Nexus_Lyrics';
                const finalFileName = safeFileName + ext;

                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                a.download = finalFileName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(blobUrl);
                a.remove();

                btn.innerHTML = `<i class="fas fa-check"></i> ${currentLang === 'ar' ? 'تم!' : 'Done!'}`;
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }, 2000);
            } catch (err) {
                console.error('Subtitle download error:', err);
                alert(currentLang === 'ar' ? 'فشل التحميل، حاول مرة تانية.' : 'Download failed, please try again.');
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        }

        function buildPlaylistUI(tabId, entries, title) {
            document.getElementById(`playlistTitleDisplay-${tabId}`).innerText = `🎵 ${title || 'Playlist'}`;
            const container = document.getElementById(`playlistItems-${tabId}`);
            container.innerHTML = '';
            const t = translations[currentLang];
            const fallbackImg = "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=500&auto=format&fit=crop";

            entries.forEach((entry, idx) => {
                const thumbSrc = entry.thumbnail ? `${PROXY_URL}?url=${encodeURIComponent(entry.thumbnail)}` : fallbackImg;
                const inputId = `pl_name_${tabId}_${idx}`;
                const selectId = `pl_fmt_${tabId}_${idx}`;
                const clientId = `pl_${tabId}_${idx}_${Date.now()}`;

                container.innerHTML += `
                <div class="playlist-item">
                    <img src="${thumbSrc}" onerror="this.src='${fallbackImg}'" alt="thumb">
                    <div class="playlist-info">
                        <input type="text" class="video-title-input" id="${inputId}" value="${entry.title || ''}" style="font-size: 0.9rem;">
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${entry.duration ? Math.floor(entry.duration / 60) + ':' + String(entry.duration % 60).padStart(2, '0') : ''}</div>
                    </div>
                    <div class="playlist-actions">
                        <select id="${selectId}" class="playlist-select glass-select">
                            <option value="bestvideo+bestaudio/best">${t.playVideoHD}</option>
                            <option value="worst">${t.playVideoSD}</option>
                            <option value="bestaudio/best">${t.playAudioMP3}</option>
                        </select>
                        <button class="btn-dl-small" onclick="downloadPlaylistItem(${tabId}, this, '${entry.url}', '${inputId}', '${selectId}', '${clientId}')">
                            <i class="fas fa-download"></i> ${t.dlBtn}
                        </button>
                    </div>
                </div>`;
            });
        }

        function downloadPlaylistItem(tabId, btnElement, url, inputId, selectId, clientId) {
            const t = translations[currentLang];
            const customTitle = document.getElementById(inputId).value.trim() || t.defaultName;
            const formatVal = document.getElementById(selectId).value;
            const isAudio = formatVal.includes('audio') && !formatVal.includes('video');
            const type = isAudio ? 'audio' : 'video';
            const needsMerge = isAudio ? 'false' : 'true';
            const originalHtml = btnElement.innerHTML;

            btnElement.disabled = true;
            btnElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 0%`;
            const ticketId = 'Ticket_' + Date.now() + '_' + tabId;

            const evtSource = new EventSource(`${BACKEND_URL.replace('/info', '/progress')}?id=${clientId}`);
            evtSource.onmessage = function (e) {
                if (e.data === 'DONE' || e.data === 'DONE_SUBS') {
                    if (e.data === 'DONE_SUBS') {
                        const subUrl = `${BASE_SERVER}/api/subtitle?ticketId=${ticketId}&customName=${encodeURIComponent(customTitle)}`;
                        btnElement.innerHTML = `<a href="${subUrl}" target="_blank" style="color: inherit; text-decoration: none; width:100%; height:100%; display:inline-block;"><i class="fas fa-file-alt"></i> ${t.captionLabelShort}</a>`;
                        btnElement.disabled = false;
                    } else {
                        btnElement.innerHTML = `<i class="fas fa-check"></i>`;
                        btnElement.disabled = false;
                    }
                    evtSource.close();
                    setTimeout(() => { if (e.data !== 'DONE_SUBS') btnElement.innerHTML = originalHtml; }, 3000);
                } else {
                    btnElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${e.data}%`;
                }
            };
            evtSource.onerror = function () { evtSource.close(); };

            let dlUrl = `${DOWNLOAD_URL}?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(formatVal)}&type=${type}&needsMerge=${needsMerge}&customName=${encodeURIComponent(customTitle)}&clientId=${clientId}&ticketId=${ticketId}`;
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = dlUrl;
            document.body.appendChild(iframe);
        }

