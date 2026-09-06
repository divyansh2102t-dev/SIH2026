/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Client-Side Action Executor: Executes Agent Commands with Human-Like Events & Visual HUD
 */

(function () {
  let hudElement = null;
  let highlightElement = null;

  let isMinimized = false;
  let lastMessage = '';
  let lastStatus = 'active';
  let minimizeTimeout = null;

  /**
   * Initializes or updates the in-page Floating Agent HUD with Auto-Minimizing on Task Completion
   */
  function updateAgentHUD(message, status = 'active') {
    lastMessage = message;
    lastStatus = status;

    if (!hudElement) {
      hudElement = document.createElement('div');
      hudElement.id = 'sih-privacy-agent-hud';
      hudElement.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f8fafc;
        padding: 10px 14px;
        border-radius: 10px;
        box-shadow: 0 10px 30px -5px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
        cursor: default;
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
      `;
      document.body.appendChild(hudElement);
    }

    if (minimizeTimeout) {
      clearTimeout(minimizeTimeout);
      minimizeTimeout = null;
    }

    isMinimized = false;
    renderHUDContent();

    // Auto-minimize when task completes or on success
    if (status === 'success' || message.toLowerCase().includes('complete') || message.toLowerCase().includes('achieved')) {
      minimizeTimeout = setTimeout(() => {
        minimizeHUD();
      }, 1800);
    }
  }

  function renderHUDContent() {
    if (!hudElement) return;

    const statusColors = {
      active: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };

    if (isMinimized) {
      hudElement.style.padding = '6px 12px';
      hudElement.style.borderRadius = '20px';
      hudElement.style.cursor = 'pointer';
      hudElement.style.opacity = '0.92';
      hudElement.style.transform = 'scale(0.95)';
      hudElement.title = 'Click to expand ISRO Agent Status';

      hudElement.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 7px; height: 7px; border-radius: 50%; background: ${statusColors[lastStatus] || '#10b981'}; box-shadow: 0 0 8px ${statusColors[lastStatus] || '#10b981'};"></div>
          <span style="font-size: 10px; font-weight: 700; color: #ffffff; letter-spacing: 0.3px;">ISRO Agent · ${lastStatus === 'success' ? 'Done ✓' : 'Active'}</span>
          <span id="sih-hud-expand-btn" style="font-size: 10px; color: #94a3b8; margin-left: 4px; padding: 2px 4px; border-radius: 4px; background: rgba(255,255,255,0.08);">⤢</span>
          <span id="sih-hud-close-btn" style="font-size: 11px; color: #64748b; margin-left: 2px; padding: 0 3px; cursor: pointer;" title="Close HUD">✕</span>
        </div>
      `;

      hudElement.onclick = (e) => {
        if (e.target && e.target.id === 'sih-hud-close-btn') {
          e.stopPropagation();
          hudElement.remove();
          hudElement = null;
          return;
        }
        expandHUD();
      };
    } else {
      hudElement.style.padding = '10px 14px';
      hudElement.style.borderRadius = '10px';
      hudElement.style.cursor = 'default';
      hudElement.style.opacity = '1';
      hudElement.style.transform = 'scale(1)';
      hudElement.title = '';
      hudElement.onclick = null;

      hudElement.innerHTML = `
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColors[lastStatus] || '#3b82f6'}; box-shadow: 0 0 8px ${statusColors[lastStatus] || '#3b82f6'}; flex-shrink: 0;"></div>
        <div style="flex: 1; max-width: 320px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; font-weight: 700;">ISRO Privacy Agent</div>
            <div style="display: flex; gap: 6px;">
              <span id="sih-hud-min-btn" style="cursor: pointer; font-size: 11px; color: #94a3b8; padding: 0 3px;" title="Minimize HUD">−</span>
              <span id="sih-hud-close-btn" style="cursor: pointer; font-size: 11px; color: #64748b; padding: 0 3px;" title="Close HUD">✕</span>
            </div>
          </div>
          <div style="color: #ffffff; font-weight: 600; margin-top: 2px; font-size: 11.5px; word-break: break-word;">${lastMessage}</div>
        </div>
      `;

      const minBtn = hudElement.querySelector('#sih-hud-min-btn');
      if (minBtn) minBtn.onclick = (e) => { e.stopPropagation(); minimizeHUD(); };
      const closeBtn = hudElement.querySelector('#sih-hud-close-btn');
      if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); hudElement.remove(); hudElement = null; };
    }
  }

  function minimizeHUD() {
    isMinimized = true;
    renderHUDContent();
  }

  function expandHUD() {
    isMinimized = false;
    renderHUDContent();
  }

  /**
   * Highlights the target element on the web page before executing an action
   */
  function highlightTarget(el, actionName) {
    if (!el) return;
    if (!highlightElement) {
      highlightElement = document.createElement('div');
      highlightElement.id = 'sih-agent-target-highlight';
      highlightElement.style.cssText = `
        position: fixed;
        border: 2px solid #3b82f6;
        background: rgba(59, 130, 246, 0.15);
        border-radius: 4px;
        pointer-events: none;
        z-index: 2147483646;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
      `;
      document.body.appendChild(highlightElement);
    }

    const rect = el.getBoundingClientRect();
    highlightElement.style.left = `${rect.left - 4}px`;
    highlightElement.style.top = `${rect.top - 4}px`;
    highlightElement.style.width = `${rect.width + 8}px`;
    highlightElement.style.height = `${rect.height + 8}px`;
    highlightElement.style.display = 'block';

    // Auto-scroll target into view if outside
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearHighlight() {
    if (highlightElement) {
      highlightElement.style.display = 'none';
    }
  }

  /**
   * Resolves an element using CSS selector, XPath, or text fallback
   */
  function findElement(selector) {
    if (!selector) return null;
    try {
      if (selector.startsWith('//') || selector.startsWith('xpath=')) {
        const cleanXPath = selector.replace('xpath=', '');
        const res = document.evaluate(cleanXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return res.singleNodeValue;
      }
      return document.querySelector(selector);
    } catch (e) {
      console.warn('[Action Executor] Selector lookup failed:', selector, e);
      return null;
    }
  }

  /**
   * Execute Action Command Dispatcher
   */
  async function executeAction(command) {
    if (!command || !command.action) {
      return { success: false, error: 'Invalid command object' };
    }

    const action = command.action.toLowerCase();
    const selector = command.selector;
    const text = command.text || '';
    const desc = command.reasoning || command.description || `${action.toUpperCase()} ${selector || ''}`;

    updateAgentHUD(`Executing: ${desc}`, 'active');

    const targetEl = selector ? findElement(selector) : null;
    if (targetEl) {
      highlightTarget(targetEl, action);
      await new Promise(r => setTimeout(r, 250)); // Brief pause for visual confirmation
    }

    try {
      switch (action) {
        case 'click': {
          if (!targetEl) return { success: false, error: `Element not found: ${selector}` };
          
          targetEl.focus();
          targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          targetEl.click();
          
          clearHighlight();
          updateAgentHUD(`Clicked ${selector}`, 'success');
          return { success: true, executed: 'click', selector };
        }

        case 'type': {
          if (!targetEl) return { success: false, error: `Element not found: ${selector}` };
          
          targetEl.focus();
          targetEl.value = '';
          
          // Character-by-character input dispatch for React/Vue reactive state updates
          for (let i = 0; i < text.length; i++) {
            const char = text[i];
            targetEl.value += char;
            targetEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: char }));
            targetEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: char }));
          }
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));

          clearHighlight();
          updateAgentHUD(`Typed "${text}" into ${selector}`, 'success');
          return { success: true, executed: 'type', selector, textLength: text.length };
        }

        case 'fill_local': {
          // Zero-Trust Local Credential Fill:
          // Fetches sensitive key directly from local chrome.storage
          if (!targetEl) return { success: false, error: `Element not found: ${selector}` };
          const dataKey = command.local_data_key || 'email';
          
          return new Promise(resolve => {
            chrome.storage.local.get(['userVault'], (res) => {
              const vault = res.userVault || {
                email: 'user.citizen@isro.gov.in',
                phone: '9876543210',
                fullName: 'Aditya Sharma',
                aadhaar: '2345 6789 0123',
                pan: 'ABCDE1234F'
              };

              const secretVal = vault[dataKey] || vault[dataKey.toLowerCase()] || `[Vault_${dataKey}]`;
              
              targetEl.focus();
              targetEl.value = secretVal;
              targetEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: secretVal }));
              targetEl.dispatchEvent(new Event('change', { bubbles: true }));

              clearHighlight();
              updateAgentHUD(`Zero-Trust Local Fill: ${dataKey}`, 'success');
              resolve({ success: true, executed: 'fill_local', dataKey });
            });
          });
        }

        case 'scroll': {
          const direction = command.direction || 'down';
          const amount = command.amount || 350;
          const scrollY = direction === 'down' ? amount : -amount;
          window.scrollBy({ top: scrollY, behavior: 'smooth' });
          updateAgentHUD(`Scrolled ${direction} ${amount}px`, 'success');
          return { success: true, executed: 'scroll', direction, amount };
        }

        case 'select': {
          if (!targetEl) return { success: false, error: `Element not found: ${selector}` };
          targetEl.value = command.value || text;
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));
          clearHighlight();
          updateAgentHUD(`Selected option in ${selector}`, 'success');
          return { success: true, executed: 'select', value: targetEl.value };
        }

        case 'navigate': {
          if (command.url) {
            updateAgentHUD(`Navigating to ${command.url}...`, 'active');
            window.location.href = command.url;
            return { success: true, executed: 'navigate', url: command.url };
          }
          return { success: false, error: 'Missing url in navigate command' };
        }

        case 'wait': {
          const ms = command.duration_ms || 1000;
          updateAgentHUD(`Waiting ${ms}ms...`, 'active');
          await new Promise(r => setTimeout(r, ms));
          return { success: true, executed: 'wait', ms };
        }

        case 'done': {
          clearHighlight();
          updateAgentHUD(`Task Complete: ${command.summary || 'Goal Achieved!'}`, 'success');
          return { success: true, executed: 'done', complete: true, summary: command.summary };
        }

        default:
          return { success: false, error: `Unknown action type: ${action}` };
      }
    } catch (err) {
      console.error('[Action Executor] Error executing action:', err);
      updateAgentHUD(`Error: ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  }

  window.SIH_ACTION_EXECUTOR = {
    execute: executeAction,
    updateHUD: updateAgentHUD,
    clearHighlight: clearHighlight
  };
})();
