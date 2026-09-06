const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });

  const sizes = [16, 48, 128];
  for (const size of sizes) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size });
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <body style="margin:0; padding:0; background:transparent; display:flex; align-items:center; justify-content:center; width:${size}px; height:${size}px;">
        <div style="width:${size}px; height:${size}px; background:linear-gradient(135deg, #0f172a, #2563eb); border-radius:${Math.floor(size*0.22)}px; display:flex; align-items:center; justify-content:center; color:#fbbf24; font-family:Arial,sans-serif; font-weight:900; font-size:${Math.floor(size*0.48)}px; box-shadow:inset 0 0 ${Math.floor(size*0.1)}px rgba(255,255,255,0.3);">
          🛡️
        </div>
      </body>
      </html>
    `);

    const outPath = path.join(__dirname, '..', 'extension', 'icons', `icon${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
    console.log(`Generated icon: ${outPath}`);
    await page.close();
  }

  await browser.close();
})();
