/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Sanitized Payload Builder: Assembles safe multi-modal transmission packets
 */

function buildSanitizedPayload({
  sessionId,
  userGoal,
  sanitizedScreenshot,
  accessibilityTree = [],
  redactionManifest = [],
  pageMetadata = {},
  iteration = 1,
  previousActions = []
}) {
  return {
    sessionId: sessionId || `session_${Date.now()}`,
    timestamp: Date.now(),
    iteration: iteration,
    userGoal: userGoal,
    // Sanitized visual frame (all PII replaced with placeholder tokens)
    redactedScreenshot: sanitizedScreenshot,
    // Interactive element structural graph
    accessibilityTree: accessibilityTree,
    // Metadata describing what was redacted and where (no raw values)
    redactionLog: redactionManifest.map(m => ({
      method: m.method,
      token: m.token,
      source: m.source,
      bounds: m.bounds
    })),
    pageMetadata: {
      url: pageMetadata.url || '',
      title: pageMetadata.title || '',
      viewport: pageMetadata.viewport || { width: 1280, height: 800 }
    },
    previousActions: previousActions.slice(-5) // Last 5 steps for context
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildSanitizedPayload };
}
