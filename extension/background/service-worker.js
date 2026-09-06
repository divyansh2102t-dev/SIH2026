/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Background Service Worker: Universal Intent Routing, Domain-Switching Navigation & Privacy Pipeline
 */

importScripts('../lib/pii-regex.js', '../lib/payload-builder.js');

let ws = null;
let clientId = `client_${Math.random().toString(36).substring(2, 9)}`;
let isLoopRunning = false;
let currentGoal = '';
let currentIteration = 0;
let maxIterations = 10;
let previousActions = [];
let serverUrl = 'ws://127.0.0.1:8000/ws';

// ── 1. Smart Universal Search & Domain Switch Resolver ──

const POPULAR_DOMAINS = {
  leetcode: 'https://leetcode.com',
  github: 'https://github.com',
  google: 'https://www.google.com',
  wikipedia: 'https://www.wikipedia.org',
  youtube: 'https://www.youtube.com',
  sih: 'https://sih.gov.in',
  isro: 'https://www.isro.gov.in',
  amazon: 'https://www.amazon.in',
  makemytrip: 'https://www.makemytrip.com',
  irctc: 'https://www.irctc.co.in'
};

function resolveTargetUrlFromGoal(goal) {
  const g = goal.toLowerCase().trim();

  // 1. Explicit URL in goal
  const urlMatch = goal.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) return urlMatch[0];

  // 2. Demo portal shortcuts
  if (g.includes('citizen') || g.includes('flight booking') || g.includes('testbed') || g === 'demo') {
    return 'http://127.0.0.1:8000/demo/index.html';
  }

  // 3. Pure single-word domain command (e.g. "open leetcode", "go to youtube")
  const pureDomainMatch = g.match(/^(?:open|go to|visit|launch)\s+([a-z0-9]+)(?:\.com|\.org|\.in)?$/i);
  if (pureDomainMatch) {
    const domainName = pureDomainMatch[1].toLowerCase();
    if (POPULAR_DOMAINS[domainName]) return POPULAR_DOMAINS[domainName];
  }

  // 4. Clean search query for universal discovery
  const cleanQuery = goal
    .replace(/^(?:please\s+)?(?:open|search|find|lookup|look for|go to|navigate to)\s+/i, '')
    .trim();

  return `https://www.google.com/search?q=${encodeURIComponent(cleanQuery || goal)}`;
}

/**
 * Checks if the user's goal requests navigating away from the current page
 */
function shouldNavigateAway(goal, currentUrl) {
  if (!currentUrl) return true;
  const g = goal.toLowerCase().trim();
  const cUrl = currentUrl.toLowerCase();

  // If on internal / newtab page
  if (cUrl.startsWith('chrome://') || cUrl.startsWith('chrome-extension://') || cUrl.startsWith('edge://') || cUrl.startsWith('about:')) {
    return true;
  }

  // If goal explicitly starts with navigation command: "open ...", "go to ...", "visit ...", "search ..."
  if (/^(?:open|go to|visit|navigate to|search)\s+/i.test(g)) {
    // Check if user is asking for a platform they are NOT currently on
    for (const [key, domainUrl] of Object.entries(POPULAR_DOMAINS)) {
      if (g.includes(key) && !cUrl.includes(key)) {
        return true; // e.g. on github.com, but goal says "open leetcode..."
      }
    }

    // If goal says "search ..." and user is NOT on Google / search engine
    if (g.startsWith('search') && !cUrl.includes('google.com/search')) {
      return true;
    }
  }

  return false;
}

// ── 2. Robust Tab Readiness & Injection Helpers ──

async function waitForTabReady(tabId, maxWaitMs = 10000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        await new Promise(r => setTimeout(r, 400));
        return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  return true;
}

async function ensureContentScriptInjectedWithRetry(tabId, retries = 4) {
  await waitForTabReady(tabId);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { action: 'SCAN_PAGE_DOM' });
      if (ping && ping.success) return ping;
    } catch (e) {
      console.log(`[Service Worker] Injecting scripts into Tab ${tabId} (Attempt ${attempt}/${retries})...`);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [
            'lib/pii-regex.js',
            'content/dom-analyzer.js',
            'content/action-executor.js',
            'content/content-bridge.js'
          ]
        });
        await new Promise(r => setTimeout(r, 300 * attempt));
        
        const check = await chrome.tabs.sendMessage(tabId, { action: 'SCAN_PAGE_DOM' });
        if (check && check.success) return check;
      } catch (injectErr) {
        if (attempt === retries) {
          throw new Error(`Cannot attach agent to this page (${injectErr.message}).`);
        }
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }
  throw new Error('Tab communication timeout after page navigation.');
}

// ── 3. Offscreen Document Lifecycle ──

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['DOM_SCRAPING', 'USER_MEDIA', 'CLIPBOARD'],
    justification: 'Hardware-accelerated visual ML inference & canvas redaction'
  });
  console.log('[Service Worker] Offscreen document spawned.');
}

// ── 4. WebSocket Connection Manager ──

function connectWebSocket(url = serverUrl) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const endpoint = `${url}/${clientId}`;
  console.log('[Service Worker] Connecting to WebSocket:', endpoint);

  try {
    ws = new WebSocket(endpoint);

    ws.onopen = () => {
      console.log('[Service Worker] WebSocket connected successfully.');
      broadcastToPopup({ type: 'WS_STATUS', status: 'CONNECTED', clientId });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('[Service Worker] Error parsing server message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[Service Worker] WebSocket disconnected.');
      broadcastToPopup({ type: 'WS_STATUS', status: 'DISCONNECTED' });
      ws = null;
      setTimeout(() => {
        if (!ws && !isLoopRunning) connectWebSocket(url);
      }, 3000);
    };

    ws.onerror = (err) => {
      console.warn('[Service Worker] WebSocket error:', err);
      broadcastToPopup({ type: 'WS_STATUS', status: 'ERROR' });
    };
  } catch (err) {
    console.error('[Service Worker] Failed to init WebSocket:', err);
  }
}

function broadcastToPopup(data) {
  chrome.runtime.sendMessage(data).catch(() => {});
}

// ── 5. Single Step: Capture → Sanitize → Transmit → Execute ──

async function runAgentStep(tabId) {
  if (!isLoopRunning) return;
  currentIteration++;

  if (currentIteration > maxIterations) {
    console.log('[Agent Loop] Max iterations reached.');
    stopAgentLoop('Max iterations reached (10 steps)');
    return;
  }

  const stepStartTime = performance.now();
  broadcastToPopup({
    type: 'AGENT_STEP_START',
    iteration: currentIteration,
    goal: currentGoal
  });

  try {
    // A. Ensure tab is ready and content scripts are active
    const domResponse = await ensureContentScriptInjectedWithRetry(tabId);
    if (!domResponse || !domResponse.success) {
      throw new Error('Failed to extract DOM state from active tab');
    }

    // B. Capture Viewport Screenshot
    const rawScreenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    // C. Perform Offscreen Visual & Regex Redaction
    await ensureOffscreenDocument();
    const redactResponse = await chrome.runtime.sendMessage({
      target: 'OFFSCREEN',
      action: 'SANITIZE_SCREENSHOT',
      screenshotDataUrl: rawScreenshot,
      domPII: domResponse.domPII,
      textPII: domResponse.textPII,
      viewport: domResponse.viewport
    });

    if (!redactResponse || !redactResponse.success) {
      throw new Error(redactResponse?.error || 'Redaction engine failed');
    }

    const clientDuration = Math.round(performance.now() - stepStartTime);

    // Broadcast live preview & manifest to popup
    broadcastToPopup({
      type: 'REDACTION_COMPLETE',
      sanitizedScreenshot: redactResponse.sanitizedDataUrl,
      redactionCount: redactResponse.redactionCount,
      manifest: redactResponse.manifest,
      clientTimeMs: clientDuration
    });

    // D. Build Sanitized Payload with Cryptographic Nonce
    const payload = buildSanitizedPayload({
      sessionId: `sih_${clientId}`,
      userGoal: currentGoal,
      sanitizedScreenshot: redactResponse.sanitizedDataUrl,
      accessibilityTree: domResponse.accessibilityTree,
      redactionManifest: redactResponse.manifest,
      pageMetadata: {
        url: domResponse.url,
        title: domResponse.title,
        viewport: domResponse.viewport
      },
      iteration: currentIteration,
      previousActions: previousActions
    });

    // E. Transmit to Server via WebSocket
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
      await new Promise(r => setTimeout(r, 600));
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('Server WebSocket is not connected. Please ensure backend server is running on localhost:8000');
      }
    }

    const serverStartTime = performance.now();
    ws.send(JSON.stringify(payload));

    // Await server action response
    const actionCommand = await waitForServerAction(30000);
    const serverDuration = Math.round(performance.now() - serverStartTime);

    console.log('[Agent Loop] Received Action Command:', actionCommand);

    broadcastToPopup({
      type: 'ACTION_RECEIVED',
      action: actionCommand,
      serverTimeMs: serverDuration,
      totalE2ETimeMs: clientDuration + serverDuration
    });

    // F. Execute Action on Web Page
    let executionResult = null;
    try {
      executionResult = await chrome.tabs.sendMessage(tabId, {
        action: 'EXECUTE_AGENT_ACTION',
        command: actionCommand
      });
    } catch (execErr) {
      console.log('[Agent Loop] Action triggered page transition:', execErr.message);
      executionResult = { success: true, pageTransition: true };
    }

    previousActions.push({
      iteration: currentIteration,
      command: actionCommand,
      result: executionResult
    });

    // G. Check Completion Condition
    if (actionCommand.action === 'done' || executionResult?.complete) {
      stopAgentLoop(`Goal achieved: ${actionCommand.summary || 'Task Complete'}`);
      return;
    }

    // If action was navigation or link click, wait for page to settle
    if (actionCommand.action === 'navigate' || executionResult?.pageTransition) {
      await waitForTabReady(tabId, 6000);
    }

    // Schedule next step if still running
    if (isLoopRunning) {
      setTimeout(() => {
        runAgentStep(tabId);
      }, 1500);
    }

  } catch (err) {
    console.error('[Agent Loop] Error in step execution:', err);
    broadcastToPopup({ type: 'AGENT_ERROR', error: err.message });
    stopAgentLoop(`Error: ${err.message}`);
  }
}

// ── 6. Server Action Promise Resolver ──

let pendingActionResolver = null;
let pendingActionRejecter = null;

function waitForServerAction(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    pendingActionResolver = resolve;
    pendingActionRejecter = reject;

    setTimeout(() => {
      if (pendingActionRejecter) {
        pendingActionRejecter(new Error('Server action response timed out (30s)'));
        pendingActionResolver = null;
        pendingActionRejecter = null;
      }
    }, timeoutMs);
  });
}

function handleServerMessage(message) {
  if (message.action && pendingActionResolver) {
    pendingActionResolver(message);
    pendingActionResolver = null;
    pendingActionRejecter = null;
  }
}

// ── 7. Local 20-Search History Vault Manager ──

let currentSessionId = null;
let currentSessionPiiCount = 0;

async function recordSearchSessionStart(goal, tabUrl) {
  currentSessionId = `session_${Date.now()}`;
  currentSessionPiiCount = 0;

  try {
    const res = await chrome.storage.local.get(['searchHistory']);
    let history = Array.isArray(res.searchHistory) ? res.searchHistory : [];

    const newEntry = {
      id: currentSessionId,
      goal: goal,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
      status: 'In Progress',
      piiCount: 0,
      steps: 1,
      targetUrl: tabUrl || '',
      timeMs: Date.now()
    };

    // Prepend and cap strictly to latest 20 items
    history = [newEntry, ...history.filter(h => h.goal.trim() !== goal.trim())].slice(0, 20);
    await chrome.storage.local.set({ searchHistory: history });
  } catch (e) {
    console.warn('[Service Worker] Failed to save search history start:', e);
  }
}

async function recordSearchSessionEnd(statusMessage, isSuccess = false) {
  if (!currentSessionId) return;

  try {
    const res = await chrome.storage.local.get(['searchHistory']);
    let history = Array.isArray(res.searchHistory) ? res.searchHistory : [];

    history = history.map(item => {
      if (item.id === currentSessionId) {
        return {
          ...item,
          status: isSuccess || statusMessage.toLowerCase().includes('achieved') || statusMessage.toLowerCase().includes('complete') ? 'Completed' : 'Stopped',
          statusDetail: statusMessage,
          piiCount: currentSessionPiiCount,
          steps: currentIteration || 1
        };
      }
      return item;
    });

    await chrome.storage.local.set({ searchHistory: history.slice(0, 20) });
  } catch (e) {
    console.warn('[Service Worker] Failed to update search history end:', e);
  }
}

// ── 8. Agent Control Functions with Smart Domain Switching ──

async function startAgentLoop(goal, tabId, tabUrl = '') {
  isLoopRunning = true;
  currentGoal = goal;
  currentIteration = 0;
  previousActions = [];
  connectWebSocket();

  // Save to local 20-search history
  await recordSearchSessionStart(goal, tabUrl);

  // Check if we need to navigate away from the current page to the target destination
  if (shouldNavigateAway(goal, tabUrl)) {
    const targetUrl = resolveTargetUrlFromGoal(goal);
    console.log(`[Service Worker] Navigating Tab ${tabId} away from ${tabUrl} ➔ ${targetUrl}...`);
    broadcastToPopup({
      type: 'AGENT_STEP_START',
      iteration: 1,
      goal: `Navigating to ${targetUrl}...`
    });

    await chrome.tabs.update(tabId, { url: targetUrl });
    await waitForTabReady(tabId, 8000);
    setTimeout(() => {
      runAgentStep(tabId);
    }, 1000);
    return;
  }

  // Normal live execution on current page
  console.log(`[Agent] Starting loop for goal: "${goal}" on Tab ${tabId}`);
  runAgentStep(tabId);
}

function stopAgentLoop(reason = 'User stopped') {
  isLoopRunning = false;
  console.log(`[Agent] Stopped loop: ${reason}`);
  const isComplete = reason.toLowerCase().includes('achieved') || reason.toLowerCase().includes('complete');
  recordSearchSessionEnd(reason, isComplete);
  broadcastToPopup({ type: 'AGENT_STOPPED', reason });
}

// ── 9. Message Listener from Popup ──

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AGENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const activeTab = tabs[0];
        startAgentLoop(request.goal, activeTab.id, activeTab.url || '');
        sendResponse({ success: true, status: 'STARTED' });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }

  if (request.action === 'STOP_AGENT') {
    stopAgentLoop('Stopped via Popup UI');
    sendResponse({ success: true, status: 'STOPPED' });
    return true;
  }

  if (request.action === 'GET_STATUS') {
    sendResponse({
      isRunning: isLoopRunning,
      goal: currentGoal,
      iteration: currentIteration,
      wsConnected: ws && ws.readyState === WebSocket.OPEN,
      clientId: clientId
    });
    return true;
  }

  if (request.action === 'GET_SEARCH_HISTORY') {
    chrome.storage.local.get(['searchHistory'], (res) => {
      sendResponse({ success: true, history: res.searchHistory || [] });
    });
    return true;
  }

  if (request.action === 'CLEAR_SEARCH_HISTORY') {
    chrome.storage.local.set({ searchHistory: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'CONNECT_WS') {
    connectWebSocket(request.url || serverUrl);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// Auto-connect on startup
connectWebSocket();
