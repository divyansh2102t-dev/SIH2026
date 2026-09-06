/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Offscreen Message Listener: Executes Visual ML Redaction on Raw Viewport Screenshots
 */

const canvasEngine = new RedactionCanvasEngine();
const visionDetector = new OnDeviceVisionDetector();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'OFFSCREEN') return false;

  if (request.action === 'SANITIZE_SCREENSHOT') {
    const startTime = performance.now();
    const rawDataUrl = request.screenshotDataUrl;
    const domPII = request.domPII || [];
    const textPII = request.textPII || [];
    const viewport = request.viewport || { width: 1280, height: 800 };

    canvasEngine.loadScreenshot(rawDataUrl).then(({ width, height }) => {
      // Scale factor if devicePixelRatio > 1 (e.g. Retina or HiDPI displays)
      const scaleFactor = width / (viewport.width || width);

      // Merge DOM & Text PII
      const allDetections = [...domPII, ...textPII];

      // Run Visual Detector
      visionDetector.detectVisualPII(canvasEngine.canvas, allDetections).then(visualFindings => {
        // Combine all items with deduplication
        const combined = [...allDetections, ...visualFindings];
        
        // Apply Canvas Redactions
        canvasEngine.processAllRedactions(combined, scaleFactor);

        const sanitizedDataUrl = canvasEngine.getSanitizedDataUrl(0.82);
        const manifest = canvasEngine.getManifest();
        const duration = Math.round(performance.now() - startTime);

        sendResponse({
          success: true,
          sanitizedDataUrl: sanitizedDataUrl,
          manifest: manifest,
          redactionCount: manifest.length,
          clientProcessingTimeMs: duration,
          imageDimensions: { width, height }
        });
      });
    }).catch(err => {
      console.error('[Offscreen] Redaction error:', err);
      sendResponse({ success: false, error: err.message });
    });

    return true; // Keep message channel open for async response
  }

  return false;
});

console.log('[SIH 26171] Offscreen Inference Worker active and listening.');
