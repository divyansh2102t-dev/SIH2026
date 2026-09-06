/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Popup Script: Controls agent execution, renders live telemetry & full-resolution frame enlarger
 */

document.addEventListener('DOMContentLoaded', () => {
  const goalInput = document.getElementById('goalInput');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const wsDot = document.getElementById('wsDot');
  const wsText = document.getElementById('wsText');
  const statusMessage = document.getElementById('statusMessage');
  const stepCounter = document.getElementById('stepCounter');
  const previewImg = document.getElementById('previewImg');
  const previewPlaceholder = document.getElementById('previewPlaceholder');
  const previewContainer = document.getElementById('previewContainer');
  const previewHoverBadge = document.getElementById('previewHoverBadge');
  const enlargeBtn = document.getElementById('enlargeBtn');

  // Metrics
  const metricClientTime = document.getElementById('metricClientTime');
  const metricServerTime = document.getElementById('metricServerTime');
  const metricTotalTime = document.getElementById('metricTotalTime');
  const metricPiiCount = document.getElementById('metricPiiCount');

  // Image Enlargement Modal
  const imageModal = document.getElementById('imageModal');
  const enlargedImg = document.getElementById('enlargedImg');
  const closeImageModalBtn = document.getElementById('closeImageModalBtn');
  const downloadSanitizedBtn = document.getElementById('downloadSanitizedBtn');
  const imageMetaText = document.getElementById('imageMetaText');

  // Vault Modal
  const openVaultBtn = document.getElementById('openVaultBtn');
  const closeVaultBtn = document.getElementById('closeVaultBtn');
  const vaultModal = document.getElementById('vaultModal');
  const saveVaultBtn = document.getElementById('saveVaultBtn');

  let currentSanitizedDataUrl = '';

  // ── 1. Query Initial State from Service Worker ──

  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (res) => {
    if (res) {
      updateWSStatus(res.wsConnected ? 'CONNECTED' : 'DISCONNECTED');
      if (res.isRunning) {
        setRunningUI(true, res.goal, res.iteration);
      }
    }
  });

  // ── 2. WebSocket & UI Status Updates ──

  function updateWSStatus(status) {
    if (status === 'CONNECTED') {
      wsDot.className = 'status-dot connected';
      wsText.textContent = 'Server Online';
    } else {
      wsDot.className = 'status-dot disconnected';
      wsText.textContent = 'Server Offline';
    }
  }

  function setRunningUI(isRunning, goal = '', iteration = 0) {
    if (isRunning) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
      goalInput.disabled = true;
      if (goal) goalInput.value = goal;
      stepCounter.textContent = `Step ${iteration} / 10`;
    } else {
      startBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
      goalInput.disabled = false;
    }
  }

  // ── 3. Preset Chips ──

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      goalInput.value = chip.getAttribute('data-goal');
    });
  });

  // ── 4. Control Buttons ──

  startBtn.addEventListener('click', () => {
    const goal = goalInput.value.trim();
    if (!goal) {
      alert('Please enter an objective or task goal for the privacy agent.');
      return;
    }

    setRunningUI(true, goal, 1);
    statusMessage.textContent = 'Scanning tab & applying on-device visual redactions...';

    chrome.runtime.sendMessage({ action: 'START_AGENT', goal: goal }, (res) => {
      if (!res || !res.success) {
        setRunningUI(false);
        statusMessage.textContent = `Error: ${res?.error || 'Failed to start agent on this tab'}`;
      }
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_AGENT' }, () => {
      setRunningUI(false);
      statusMessage.textContent = 'Agent stopped by user.';
    });
  });

  // ── 5. Runtime Message Listener (Live Telemetry & Frames) ──

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;

    if (msg.type === 'WS_STATUS') {
      updateWSStatus(msg.status);
    }

    if (msg.type === 'AGENT_STEP_START') {
      stepCounter.textContent = `Step ${msg.iteration} / 10`;
      statusMessage.textContent = `Step ${msg.iteration}: Scanning DOM & running on-device redactions...`;
    }

    if (msg.type === 'REDACTION_COMPLETE') {
      metricClientTime.textContent = `${msg.clientTimeMs} ms`;
      metricPiiCount.textContent = msg.redactionCount;
      statusMessage.textContent = `Redacted ${msg.redactionCount} PII elements locally. Transmitting to server...`;

      if (msg.sanitizedScreenshot) {
        currentSanitizedDataUrl = msg.sanitizedScreenshot;
        previewImg.src = msg.sanitizedScreenshot;
        previewImg.style.display = 'block';
        previewPlaceholder.style.display = 'none';
        enlargeBtn.style.display = 'block';
        if (previewHoverBadge) previewHoverBadge.style.display = 'block';
        
        // Update enlarged modal if already open
        if (enlargedImg && imageModal.style.display === 'flex') {
          enlargedImg.src = msg.sanitizedScreenshot;
          imageMetaText.textContent = `Masked ${msg.redactionCount} items · Client latency: ${msg.clientTimeMs}ms`;
        }
      }
    }

    if (msg.type === 'ACTION_RECEIVED') {
      metricServerTime.textContent = `${msg.serverTimeMs} ms`;
      metricTotalTime.textContent = `${msg.totalE2ETimeMs} ms`;
      
      const cmd = msg.action;
      const desc = cmd.reasoning || cmd.description || `${cmd.action.toUpperCase()} ${cmd.selector || ''}`;
      statusMessage.innerHTML = `<strong>Server Action:</strong> ${desc}`;
    }

    if (msg.type === 'AGENT_STOPPED') {
      setRunningUI(false);
      statusMessage.textContent = msg.reason || 'Agent finished.';
    }

    if (msg.type === 'AGENT_ERROR') {
      setRunningUI(false);
      statusMessage.textContent = `Error: ${msg.error}`;
    }
  });

  // ── 6. Image Enlargement Lightbox Modal ──

  function openEnlargedModal() {
    if (!currentSanitizedDataUrl) return;
    enlargedImg.src = currentSanitizedDataUrl;
    imageMetaText.textContent = `Sanitized Frame (Zero PII Transmitted to Server)`;
    imageModal.style.display = 'flex';
  }

  function closeEnlargedModal() {
    imageModal.style.display = 'none';
  }

  if (enlargeBtn) enlargeBtn.addEventListener('click', openEnlargedModal);
  if (previewContainer) previewContainer.addEventListener('click', openEnlargedModal);
  if (closeImageModalBtn) closeImageModalBtn.addEventListener('click', closeEnlargedModal);

  // Close modals on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEnlargedModal();
      vaultModal.style.display = 'none';
    }
  });

  if (downloadSanitizedBtn) {
    downloadSanitizedBtn.addEventListener('click', () => {
      if (!currentSanitizedDataUrl) return;
      const a = document.createElement('a');
      a.href = currentSanitizedDataUrl;
      a.download = `sanitized_frame_${Date.now()}.jpg`;
      a.click();
    });
  }

  // ── 7. Local Search & Task History Management (Last 20) ──

  const openHistoryBtn = document.getElementById('openHistoryBtn');
  const quickRecentBtn = document.getElementById('quickRecentBtn');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const historyModal = document.getElementById('historyModal');
  const historyListContainer = document.getElementById('historyListContainer');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  function openHistoryModal() {
    renderSearchHistory();
    historyModal.style.display = 'flex';
  }

  function closeHistoryModal() {
    historyModal.style.display = 'none';
  }

  function renderSearchHistory() {
    chrome.storage.local.get(['searchHistory'], (res) => {
      const history = Array.isArray(res.searchHistory) ? res.searchHistory : [];
      historyListContainer.innerHTML = '';

      if (history.length === 0) {
        historyListContainer.innerHTML = `
          <div class="history-empty">
            <span>No search history yet.<br>Your last 20 tasks will be securely saved locally on this machine.</span>
          </div>
        `;
        return;
      }

      history.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.title = 'Click to use this goal';

        const statusClass = (item.status || '').toLowerCase().replace(/\s+/g, '-');
        const statusLabel = item.status || 'Completed';

        card.innerHTML = `
          <div class="history-goal-row">
            <div class="history-goal-text">${escapeHtml(item.goal || '')}</div>
            <button class="history-use-btn">⚡ Use</button>
          </div>
          <div class="history-meta-row">
            <span>🕒 ${item.date || ''} ${item.timestamp || ''} · ${item.steps || 1} step${(item.steps || 1) > 1 ? 's' : ''}</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              ${item.piiCount ? `<span style="color: #38bdf8;">🛡️ ${item.piiCount} PII</span>` : ''}
              <span class="history-badge ${statusClass}">${statusLabel}</span>
            </div>
          </div>
        `;

        card.addEventListener('click', () => {
          goalInput.value = item.goal;
          closeHistoryModal();
          goalInput.focus();
        });

        historyListContainer.appendChild(card);
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  if (openHistoryBtn) openHistoryBtn.addEventListener('click', openHistoryModal);
  if (quickRecentBtn) quickRecentBtn.addEventListener('click', openHistoryModal);
  if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', closeHistoryModal);

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear your local search history?')) {
        chrome.storage.local.set({ searchHistory: [] }, () => {
          renderSearchHistory();
        });
      }
    });
  }

  // ── 8. Local Vault Management ──

  openVaultBtn.addEventListener('click', () => {
    chrome.storage.local.get(['userVault'], (res) => {
      const vault = res.userVault || {};
      if (vault.fullName) document.getElementById('vaultFullName').value = vault.fullName;
      if (vault.email) document.getElementById('vaultEmail').value = vault.email;
      if (vault.phone) document.getElementById('vaultPhone').value = vault.phone;
      if (vault.aadhaar) document.getElementById('vaultAadhaar').value = vault.aadhaar;
      if (vault.pan) document.getElementById('vaultPan').value = vault.pan;
    });
    vaultModal.style.display = 'flex';
  });

  closeVaultBtn.addEventListener('click', () => {
    vaultModal.style.display = 'none';
  });

  saveVaultBtn.addEventListener('click', () => {
    const vault = {
      fullName: document.getElementById('vaultFullName').value.trim(),
      email: document.getElementById('vaultEmail').value.trim(),
      phone: document.getElementById('vaultPhone').value.trim(),
      aadhaar: document.getElementById('vaultAadhaar').value.trim(),
      pan: document.getElementById('vaultPan').value.trim()
    };

    chrome.storage.local.set({ userVault: vault }, () => {
      alert('Local vault saved securely on your device.');
      vaultModal.style.display = 'none';
    });
  });

  // Modal ESC key listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEnlargedModal();
      closeHistoryModal();
      vaultModal.style.display = 'none';
    }
  });
});
