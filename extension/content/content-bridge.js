/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Content Script Bridge: Listens for background worker messages and executes DOM scans & actions
 */

(function () {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return false;

    switch (request.action) {
      case 'SCAN_PAGE_DOM': {
        const domPII = window.SIH_DOM_ANALYZER ? window.SIH_DOM_ANALYZER.getDOMElementsPII() : [];
        const textPII = window.SIH_DOM_ANALYZER ? window.SIH_DOM_ANALYZER.getTextNodePII() : [];
        const a11yTree = window.SIH_DOM_ANALYZER ? window.SIH_DOM_ANALYZER.getAccessibilityTree() : [];
        const viewport = window.SIH_DOM_ANALYZER ? window.SIH_DOM_ANALYZER.getViewport() : { width: window.innerWidth, height: window.innerHeight };

        sendResponse({
          success: true,
          domPII: domPII,
          textPII: textPII,
          accessibilityTree: a11yTree,
          viewport: viewport,
          url: window.location.href.split('?')[0], // Strip query params for privacy
          title: document.title
        });
        return true;
      }

      case 'EXECUTE_AGENT_ACTION': {
        if (window.SIH_ACTION_EXECUTOR) {
          window.SIH_ACTION_EXECUTOR.execute(request.command).then(result => {
            sendResponse(result);
          }).catch(err => {
            sendResponse({ success: false, error: err.message });
          });
          return true; // async sendResponse
        } else {
          sendResponse({ success: false, error: 'Action executor not available' });
        }
        break;
      }

      case 'AUTO_FILL_FORM_PAGE': {
        if (window.SIH_ACTION_EXECUTOR && typeof window.SIH_ACTION_EXECUTOR.autoFill === 'function') {
          window.SIH_ACTION_EXECUTOR.autoFill(request.vault).then(result => {
            sendResponse(result);
          }).catch(err => {
            sendResponse({ success: false, error: err.message });
          });
          return true;
        } else {
          sendResponse({ success: false, error: 'AutoFill executor not available' });
        }
        break;
      }

      case 'UPDATE_HUD_STATUS': {
        if (window.SIH_ACTION_EXECUTOR) {
          window.SIH_ACTION_EXECUTOR.updateHUD(request.message, request.status || 'active');
        }
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unhandled action: ${request.action}` });
    }

    return true;
  });

  console.log('[SIH 26171] Content Script loaded and initialized.');
})();
