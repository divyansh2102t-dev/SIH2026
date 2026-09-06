/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Visual Redaction Canvas Engine: Multi-Method Privacy Filtering & Placeholder Token Ingestion
 */

class RedactionCanvasEngine {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.img = null;
    this.redactionManifest = [];
  }

  /**
   * Load base64 image onto the offscreen canvas
   */
  async loadScreenshot(base64DataUrl) {
    this.redactionManifest = [];
    return new Promise((resolve, reject) => {
      this.img = new Image();
      this.img.onload = () => {
        this.canvas.width = this.img.naturalWidth || this.img.width;
        this.canvas.height = this.img.naturalHeight || this.img.height;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.img, 0, 0);
        resolve({ width: this.canvas.width, height: this.canvas.height });
      };
      this.img.onerror = reject;
      this.img.src = base64DataUrl;
    });
  }

  /**
   * Dilate bounding box with 10% safety margin
   */
  _dilateBounds(bounds, marginFactor = 0.1) {
    const marginX = Math.round(bounds.w * marginFactor);
    const marginY = Math.round(bounds.h * marginFactor);
    const x = Math.max(0, bounds.x - marginX);
    const y = Math.max(0, bounds.y - marginY);
    const w = Math.min(this.canvas.width - x, bounds.w + marginX * 2);
    const h = Math.min(this.canvas.height - y, bounds.h + marginY * 2);
    return { x, y, w, h };
  }

  /**
   * Method 1: Solid Blackout with Semantic Injected Token
   */
  applyBlackout(bounds, tokenLabel = '[REDACTED_PII]', source = 'DOM') {
    const dilated = this._dilateBounds(bounds, 0.08);
    const { x, y, w, h } = dilated;

    // Draw solid black rectangle
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(x, y, w, h);

    // Draw subtle border
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, w, h);

    // Draw high-contrast semantic token label
    const fontSize = Math.min(13, Math.max(9, Math.floor(h * 0.55)));
    this.ctx.font = `bold ${fontSize}px "Consolas", "Courier New", monospace`;
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.textBaseline = 'middle';
    
    // Fit text inside bounding box
    const labelText = tokenLabel.length > 22 && w < 120 ? '[PII_MASK]' : tokenLabel;
    this.ctx.fillText(labelText, x + 4, y + h / 2);

    this.redactionManifest.push({
      method: 'blackout',
      token: tokenLabel,
      source: source,
      bounds: dilated
    });
  }

  /**
   * Method 2: High-Performance Gaussian Downscale Blur (for Faces/Avatars)
   */
  applyBlur(bounds, tokenLabel = '[USER_AVATAR]', intensity = 20, source = 'VISION_MODEL') {
    const dilated = this._dilateBounds(bounds, 0.12);
    const { x, y, w, h } = dilated;
    if (w <= 0 || h <= 0) return;

    // Fast GPU-friendly downscale-upscale bilinear blur trick
    const smallW = Math.max(1, Math.floor(w / intensity));
    const smallH = Math.max(1, Math.floor(h / intensity));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = smallW;
    tempCanvas.height = smallH;
    const tempCtx = tempCanvas.getContext('2d');

    // Downsample
    tempCtx.drawImage(this.canvas, x, y, w, h, 0, 0, smallW, smallH);

    // Upsample over original region (browser bilinear filter smooths it out)
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, x, y, w, h);

    // Draw token badge overlay
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    const badgeH = Math.min(22, Math.max(14, Math.floor(h * 0.3)));
    this.ctx.fillRect(x, y + h - badgeH, w, badgeH);

    this.ctx.font = `bold 10px monospace`;
    this.ctx.fillStyle = '#fbbf24';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(tokenLabel, x + 4, y + h - badgeH / 2);

    this.redactionManifest.push({
      method: 'blur',
      token: tokenLabel,
      source: source,
      bounds: dilated
    });
  }

  /**
   * Method 3: Pixelation Filter (for ID Cards & Documents)
   */
  applyPixelate(bounds, tokenLabel = '[PII_GOVT_ID]', blockSize = 12, source = 'VISION_MODEL') {
    const dilated = this._dilateBounds(bounds, 0.08);
    const { x, y, w, h } = dilated;
    if (w <= 0 || h <= 0) return;

    try {
      const imgData = this.ctx.getImageData(x, y, w, h);
      const data = imgData.data;

      for (let by = 0; by < h; by += blockSize) {
        for (let bx = 0; bx < w; bx += blockSize) {
          const pixelIndex = (by * w + bx) * 4;
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];

          for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
            for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
              const i = ((by + dy) * w + (bx + dx)) * 4;
              data[i] = r;
              data[i + 1] = g;
              data[i + 2] = b;
            }
          }
        }
      }

      this.ctx.putImageData(imgData, x, y);

      // Top token banner
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      this.ctx.fillRect(x, y, w, 18);
      this.ctx.font = 'bold 10px monospace';
      this.ctx.fillStyle = '#a855f7';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(tokenLabel, x + 4, y + 9);

      this.redactionManifest.push({
        method: 'pixelate',
        token: tokenLabel,
        source: source,
        bounds: dilated
      });
    } catch (err) {
      // Fallback to blackout if getImageData hits CORS restrictions on tainted canvas
      this.applyBlackout(bounds, tokenLabel, source);
    }
  }

  /**
   * Batch process all detected PII items
   */
  processAllRedactions(detectedItems = [], scaleFactor = 1.0) {
    detectedItems.forEach(item => {
      const scaledBounds = {
        x: Math.round(item.bounds.x * scaleFactor),
        y: Math.round(item.bounds.y * scaleFactor),
        w: Math.round(item.bounds.w * scaleFactor),
        h: Math.round(item.bounds.h * scaleFactor)
      };

      const redactionType = item.redactionType || 'blackout';
      const label = item.placeholder || `[PII_${item.category || 'REDACTED'}]`;

      if (redactionType === 'blur') {
        this.applyBlur(scaledBounds, label, 20, item.source || 'DOM');
      } else if (redactionType === 'pixelate') {
        this.applyPixelate(scaledBounds, label, 12, item.source || 'DOM');
      } else {
        this.applyBlackout(scaledBounds, label, item.source || 'DOM');
      }
    });
  }

  /**
   * Export sanitized image as base64 JPEG
   */
  getSanitizedDataUrl(quality = 0.82) {
    return this.canvas.toDataURL('image/jpeg', quality);
  }

  getManifest() {
    return this.redactionManifest;
  }
}

if (typeof window !== 'undefined') {
  window.RedactionCanvasEngine = RedactionCanvasEngine;
}
