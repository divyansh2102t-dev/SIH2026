/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Background Service Worker: Orchestrates Capture, Dynamic Injection, Offscreen Redaction & WebSockets
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

// ── 1. Dynamic Content Script Injection Helper ──

async function ensureContentScriptInjected(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: 'SCAN_PAGE_DOM' });
    if (ping && ping.success) return true;
  } catch (e) {
    // Content script not yet injected into this tab, inject dynamically
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
      // Short pause to let scripts initialize
      await new Promise(r => setTimeout(r, 150));
      return true;
    } catch (injectErr) {
      console.error('[Service Worker] Failed to dynamically inject content scripts:', injectErr);
      throw new Error(`Cannot access this tab (${injectErr.message}). If this is a chrome:// or new tab page, please navigate to a standard website first.`);
    }
  }
  return true;
}

// ── 2. Offscreen Document Lifecycle ──

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

// ── 3. WebSocket Connection Manager ──

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

// ── 4. Single Step: Capture → Sanitize → Transmit → Execute ──

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

// ── 5. Server Action Promise Resolver ──

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

// ── 6. Agent Control Functions ──

function startAgentLoop(goal, tabId) {
  isLoopRunning = true;
  currentGoal = goal;
  currentIteration = 0;
  previousActions = [];
  console.log(`[Agent] Starting loop for goal: "${goal}" on Tab ${tabId}`);
  connectWebSocket();
  runAgentStep(tabId);
}

function stopAgentLoop(reason = 'User stopped') {
  isLoopRunning = false;
  console.log(`[Agent] Stopped loop: ${reason}`);
  broadcastToPopup({ type: 'AGENT_STOPPED', reason });
}

// ── 7. Message Listener from Popup / Options ──

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AGENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const activeTab = tabs[0];
        if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://') || activeTab.url.startsWith('edge://'))) {
          sendResponse({ success: false, error: 'Cannot run agent on browser internal pages. Please open a regular website.' });
          return;
        }
        startAgentLoop(request.goal, activeTab.id);
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
