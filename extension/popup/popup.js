/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Popup Script: Controls agent execution, renders live telemetry & manages local vault
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

  // Metrics
  const metricClientTime = document.getElementById('metricClientTime');
  const metricServerTime = document.getElementById('metricServerTime');
  const metricTotalTime = document.getElementById('metricTotalTime');
  const metricPiiCount = document.getElementById('metricPiiCount');

  // Vault Modal
  const openVaultBtn = document.getElementById('openVaultBtn');
  const closeVaultBtn = document.getElementById('closeVaultBtn');
  const vaultModal = document.getElementById('vaultModal');
  const saveVaultBtn = document.getElementById('saveVaultBtn');

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
    statusMessage.textContent = 'Initializing on-device perception & capturing frame...';

    chrome.runtime.sendMessage({ action: 'START_AGENT', goal: goal }, (res) => {
      if (!res || !res.success) {
        setRunningUI(false);
        statusMessage.textContent = `Failed to start: ${res?.error || 'Unknown error'}`;
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
        previewImg.src = msg.sanitizedScreenshot;
        previewImg.style.display = 'block';
        previewPlaceholder.style.display = 'none';
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

  // ── 6. Local Vault Management ──

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
});
