/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Background Service Worker: Orchestrates Capture, Auto-Navigation, Dynamic Injection & WebSockets
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

// ── 1. Smart URL Resolver for Internal / New Tab Pages ──

const POPULAR_DOMAINS = {
  leetcode: 'https://leetcode.com',
  github: 'https://github.com',
  google: 'https://www.google.com',
  wikipedia: 'https://www.wikipedia.org',
  youtube: 'https://www.youtube.com',
  amazon: 'https://www.amazon.in',
  makemytrip: 'https://www.makemytrip.com',
  irctc: 'https://www.irctc.co.in',
  reddit: 'https://www.reddit.com',
  demo: 'http://127.0.0.1:8000/demo/index.html',
  citizen: 'http://127.0.0.1:8000/demo/index.html',
  flight: 'http://127.0.0.1:8000/demo/index.html'
};

function resolveTargetUrlFromGoal(goal) {
  const g = goal.toLowerCase().trim();

  // Check if explicit URL is in the goal
  const urlMatch = goal.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) return urlMatch[0];

  // Check popular domains mentioned in goal
  for (const [key, domainUrl] of Object.entries(POPULAR_DOMAINS)) {
    if (g.includes(key)) {
      return domainUrl;
    }
  }

  // Extract search term or fallback to Google Search
  const searchMatch = goal.match(/(?:search|find|lookup|for|open|go to)\s+(?:for\s+)?["']?([^"']+)["']?/i);
  const query = searchMatch ? searchMatch[1].trim() : goal.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// ── 2. Dynamic Content Script Injection Helper ──

async function ensureContentScriptInjected(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: 'SCAN_PAGE_DOM' });
    if (ping && ping.success) return true;
  } catch (e) {
    console.log(`[Service Worker] Injecting content scripts into Tab ${tabId}...`);
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
      await new Promise(r => setTimeout(r, 250));
      return true;
    } catch (injectErr) {
      console.error('[Service Worker] Failed to inject content scripts:', injectErr);
      throw new Error(`Cannot access this tab (${injectErr.message}).`);
    }
  }
  return true;
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
    // A. Ensure content scripts are active in tab
    await ensureContentScriptInjected(tabId);

    // B. Request DOM Analysis from Content Script
    const domResponse = await chrome.tabs.sendMessage(tabId, { action: 'SCAN_PAGE_DOM' });
    if (!domResponse || !domResponse.success) {
      throw new Error('Failed to extract DOM state from active tab');
    }

    // C. Capture Viewport Screenshot
    const rawScreenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    // D. Perform Offscreen Visual & Regex Redaction
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

    // E. Build Sanitized Payload
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

    // F. Transmit to Server via WebSocket
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Server WebSocket is not connected. Please ensure backend server is running on localhost:8000');
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

    // G. Execute Action on Web Page
    const executionResult = await chrome.tabs.sendMessage(tabId, {
      action: 'EXECUTE_AGENT_ACTION',
      command: actionCommand
    });

    previousActions.push({
      iteration: currentIteration,
      command: actionCommand,
      result: executionResult
    });

    // H. Check Completion Condition
    if (actionCommand.action === 'done' || executionResult?.complete) {
      stopAgentLoop(`Goal achieved: ${actionCommand.summary || 'Task Complete'}`);
      return;
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

// ── 7. Agent Control Functions with Auto-Navigation ──

async function startAgentLoop(goal, tabId, tabUrl = '') {
  isLoopRunning = true;
  currentGoal = goal;
  currentIteration = 0;
  previousActions = [];
  connectWebSocket();

  // Check if active tab is a browser internal / newtab page
  const isInternal = !tabUrl || 
                     tabUrl.startsWith('chrome://') || 
                     tabUrl.startsWith('chrome-extension://') || 
                     tabUrl.startsWith('edge://') || 
                     tabUrl.startsWith('about:');

  if (isInternal) {
    const targetUrl = resolveTargetUrlFromGoal(goal);
    console.log(`[Service Worker] Internal page detected. Auto-navigating Tab ${tabId} to ${targetUrl}...`);
    broadcastToPopup({
      type: 'AGENT_STEP_START',
      iteration: 1,
      goal: `Navigating to ${targetUrl}...`
    });

    // Navigate the tab
    await chrome.tabs.update(tabId, { url: targetUrl });

    // Wait for the tab to finish loading
    const onTabUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
        console.log(`[Service Worker] Tab ${tabId} finished loading. Starting perception loop...`);
        setTimeout(() => {
          runAgentStep(tabId);
        }, 1000); // 1s buffer for full DOM readiness
      }
    };
    chrome.tabs.onUpdated.addListener(onTabUpdated);

    // Timeout safety fallback (5s)
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      if (isLoopRunning && currentIteration === 0) {
        runAgentStep(tabId);
      }
    }, 5000);

    return;
  }

  // Normal live web page
  console.log(`[Agent] Starting loop for goal: "${goal}" on Tab ${tabId}`);
  runAgentStep(tabId);
}

function stopAgentLoop(reason = 'User stopped') {
  isLoopRunning = false;
  console.log(`[Agent] Stopped loop: ${reason}`);
  broadcastToPopup({ type: 'AGENT_STOPPED', reason });
}

// ── 8. Message Listener from Popup ──

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

  if (request.action === 'CONNECT_WS') {
    connectWebSocket(request.url || serverUrl);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// Auto-connect on startup
connectWebSocket();
