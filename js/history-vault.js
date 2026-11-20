/* ===== history-vault.js — السجل + تحويل الملفات المحلية + استرجاع الخزنة ===== */
        // ==========================================
        // 💾 LOCAL FILE CONVERSION & FILE VAULT & HISTORY
        // ==========================================
        function toggleHistory() {
            const modal = document.getElementById('historyModal');
            modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
        }

        function deleteHistoryItem(url) {
            let history = JSON.parse(localStorage.getItem('nexus_history')) || [];
            history = history.filter(item => item.url !== url);
            localStorage.setItem('nexus_history', JSON.stringify(history));
            renderHistory();
        }

        function saveToHistory(title, url, thumb) {
            let history = JSON.parse(localStorage.getItem('nexus_history')) || [];
            history = history.filter(item => item.url !== url);
            let safeThumb = thumb;
            if (thumb && thumb.startsWith('http') && !thumb.includes('/api/proxy')) {
                safeThumb = `${PROXY_URL}?url=${encodeURIComponent(thumb)}`;
            }
            history.unshift({ title, url, thumb: safeThumb });
            if (history.length > 20) history.pop();
            localStorage.setItem('nexus_history', JSON.stringify(history));
            renderHistory();
        }

        function renderHistory() {
            const t = translations[currentLang];
            const list = document.getElementById('historyList');
            let history = JSON.parse(localStorage.getItem('nexus_history')) || [];
            if (history.length === 0) {
                list.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding: 20px;">${t.emptyHistory}</p>`;
                return;
            }
            list.innerHTML = '';
            const fallbackImg = "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=500&auto=format&fit=crop";
            history.forEach(item => {
                let imgSrc = item.thumb || fallbackImg;
                list.innerHTML += `
                <div class="history-item">
                    <img src="${imgSrc}" onerror="this.src='${fallbackImg}'" alt="thumb">
                    <div class="history-info">${item.title}</div>
                    <div class="history-actions">
                        <a href="#" class="dl-btn" title="تحميل" onclick="loadHistoryInTab('${item.url}')"><i class="fas fa-download"></i></a>
                        <a href="#" class="del-btn" title="حذف" onclick="deleteHistoryItem('${item.url}')"><i class="fas fa-trash"></i></a>
                    </div>
                </div>`;
            });
        }

        function loadHistoryInTab(url) {
            toggleHistory();
            if (!activeTabId) {
                addNewTab(url);
            } else {
                const urlInput = document.getElementById(`videoUrl-${activeTabId}`);
                const clearBtn = document.getElementById(`clearUrlBtn-${activeTabId}`);
                if (urlInput) {
                    urlInput.value = url;
                    if (clearBtn) clearBtn.style.display = 'block';
                    analyzeTabUrl(activeTabId);
                }
            }
        }

        async function handleLocalConversion(input) {
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];
            const t = translations[currentLang];
            const quality = document.getElementById('audioQuality').value;
            const btn = document.getElementById('convertToggle');
            const originalHtml = btn.innerHTML;

            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t.converting}</span>`;
            btn.disabled = true;

            const formData = new FormData();
            formData.append('video', file);
            formData.append('quality', quality);

            try {
                const response = await fetch(CONVERT_URL, { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Conversion failed');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = file.name.replace(/\.[^/.]+$/, "") + ".mp3";
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                btn.innerHTML = `<i class="fas fa-check"></i>`;
                setTimeout(() => { btn.innerHTML = originalHtml; btn.disabled = false; }, 2000);
            } catch (error) {
                alert(t.alertConv);
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            } finally {
                input.value = '';
            }
        }

        let vaultInterval = null;
        async function restoreFromVault() {
            const ticketInput = document.getElementById('vaultTicketInput').value.trim();
            const t = translations[currentLang];
            const btn = document.getElementById('t-vaultBtn');
            const msgLabel = document.getElementById('vaultMsg');

            if (!ticketInput) return alert(t.alertVault);
            if (vaultInterval) clearInterval(vaultInterval);

            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${currentLang === 'ar' ? 'جاري الفحص...' : 'Checking...'}`;
            msgLabel.style.display = 'block';
            msgLabel.style.color = '#ffaa00';
            msgLabel.innerText = currentLang === 'ar' ? 'جاري فحص الخزنة...' : 'Checking vault...';

            try {
                const res = await fetch(`${BASE_SERVER}/api/vault/status?ticketId=${encodeURIComponent(ticketInput)}`);
                if (!res.ok) throw new Error("Server Error");
                const data = await res.json();

                if (data && data.ready === true) {
                    btn.disabled = false;
                    btn.innerHTML = t.vaultBtn;
                    msgLabel.style.color = 'var(--neon-blue)';
                    msgLabel.innerText = currentLang === 'ar' ? 'الملف جاهز! جاري التحميل...' : 'Ready! Downloading...';
                    window.location.href = `${VAULT_URL}?ticketId=${encodeURIComponent(ticketInput)}`;
                } else {
                    msgLabel.innerText = currentLang === 'ar' ? 'الملف لسه بيتحمل في السيرفر! خليك فاتح الصفحة وهينزل لوحده.' : 'File is still processing! Keep this page open.';
                    vaultInterval = setInterval(async () => {
                        try {
                            const pollRes = await fetch(`${BASE_SERVER}/api/vault/status?ticketId=${encodeURIComponent(ticketInput)}`);
                            if (!pollRes.ok) return;
                            const pollData = await pollRes.json();
                            if (pollData && pollData.ready === true) {
                                clearInterval(vaultInterval);
                                btn.disabled = false;
                                btn.innerHTML = t.vaultBtn;
                                msgLabel.style.color = 'var(--neon-blue)';
                                msgLabel.innerText = currentLang === 'ar' ? 'الملف جاهز! جاري التحميل...' : 'Ready! Downloading...';
                                window.location.href = `${VAULT_URL}?ticketId=${encodeURIComponent(ticketInput)}`;
                            }
                        } catch (e) { console.error("Polling error", e); }
                    }, 5000);
                }
            } catch (error) {
                btn.disabled = false;
                btn.innerHTML = t.vaultBtn;
                msgLabel.style.color = '#ff3366';
                msgLabel.innerText = currentLang === 'ar' ? 'عذراً، التذكرة غلط أو الملف اتمسح.' : 'Invalid ticket or file expired.';
            }
        }

