// Drives Archify's own canonical PNG export out of a delivered artifact,
// with the Kiosk palette applied through the documented theme variables.
// Nothing here draws geometry; the SVG is entirely Archify's.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  findChrome,
  ChromeVisualBrowser,
} from '/Users/kamal/.agents/skills/archify/bin/visual-check.mjs';

const DIR = '/Users/kamal/Desktop/dorahacks/somnia/kiosk/diagrams';

const BASE_PALETTE = `
  --bg: #070c0a;
  --grid: #0f1613;
  --text: #e8e4dc;
  --text-muted: #8a8f88;
  --text-dim: #6d736c;
  --text-faint: #8a8f88;
  --panel: rgba(11, 17, 14, 0.6);
  --panel-border: #1c2520;
  --lane-fill: rgba(14, 21, 18, 0.4);
  --lane-stroke: #2a352f;
  --mask: #070c0a;
  --arrow: #737b74;
  --frontend-fill: rgba(232, 228, 220, 0.05);
  --frontend-stroke: #e8e4dc;
  --backend-fill: rgba(183, 191, 184, 0.04);
  --backend-stroke: #b7bfb8;
  --database-fill: rgba(153, 162, 155, 0.04);
  --database-stroke: #99a29b;
  --messagebus-fill: rgba(245, 165, 36, 0.13);
  --messagebus-stroke: #f5a524;
  --external-fill: rgba(77, 86, 79, 0.18);
  --external-stroke: #4d564f;
  --security-fill: rgba(153, 162, 155, 0.04);
  --security-stroke: #99a29b;
  --cloud-fill: rgba(153, 162, 155, 0.04);
  --cloud-stroke: #38443d;
`;

const TARGETS = [
  { name: 'problem', arrowEmphasis: '#e8e4dc', extra: '' },
  { name: 'solution', arrowEmphasis: '#e8e4dc', extra: '' },
  {
    name: 'moneypath',
    arrowEmphasis: '#f5a524',
    extra: `svg g[data-edge-id="host-share"] text { fill: #f5a524; }
svg g[data-node-id="cap"] text, svg g[data-node-id="builder"] text { fill: #6a736c; }`,
  },
];

function paletteCss(target) {
  return `html[data-theme="dark"], html[data-theme="dark"] svg {${BASE_PALETTE}
  --arrow-emphasis: ${target.arrowEmphasis};
}
svg .c-region { fill: rgba(232, 228, 220, 0.015); stroke: #38443d; }
svg [data-semantic-sigil] { display: none; }
svg text.t-messagebus { fill: #8a8f88; }
${target.extra}
`;
}

async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  }, sessionId, 60000);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'Runtime.evaluate failed');
  }
  return response.result?.value;
}

const chrome = findChrome();
if (!chrome) throw new Error('Chrome not found');
const browser = new ChromeVisualBrowser(chrome);
const sessionId = await browser.sessionPromise;

try {
  for (const target of TARGETS) {
    const artifact = path.join(DIR, `${target.name}.html`);
    const url = new URL(pathToFileURL(artifact).href);
    url.searchParams.set('theme', 'dark');

    await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false,
    }, sessionId);

    const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId);
    const navigation = await browser.cdp.send('Page.navigate', { url: url.href }, sessionId);
    if (navigation.errorText) throw new Error(`navigation failed: ${navigation.errorText}`);
    await loaded;

    const info = await evaluate(browser.cdp, sessionId, `(function () {
      var style = document.createElement('style');
      style.id = 'kiosk-palette';
      style.textContent = ${JSON.stringify(paletteCss(target))};
      document.head.appendChild(style);
      document.documentElement.setAttribute('data-motion', 'still');
      var panel = document.querySelector('.diagram-container');
      if (panel) panel.setAttribute('data-detail-level', 'read');
      var svg = document.querySelector('.diagram-container svg');
      var vb = svg.viewBox.baseVal;
      return {
        viewBox: [vb.width, vb.height],
        bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        theme: document.documentElement.getAttribute('data-theme')
      };
    })()`);

    const dataUrl = await evaluate(browser.cdp, sessionId, `(function () {
      var fontsReady = document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(function () {})
        : Promise.resolve();
      var captured = new Promise(function (resolve, reject) {
        var original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function (blob) {
          if (blob && blob.type === 'image/png') {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error('FileReader failed')); };
            reader.readAsDataURL(blob);
          }
          return original(blob);
        };
        setTimeout(function () { reject(new Error('PNG export timed out')); }, 45000);
      });
      return fontsReady.then(function () {
        return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      }).then(function () {
        var button = document.querySelector('.toolbar .export-menu button[data-format="png"]');
        if (!button) throw new Error('PNG export control not found');
        button.click();
        return captured;
      });
    })()`, true);

    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      throw new Error(`unexpected export payload for ${target.name}`);
    }
    const out = path.join(DIR, `${target.name}.png`);
    fs.writeFileSync(out, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
    console.log(`${target.name}: viewBox ${info.viewBox.join('x')} bg ${info.bg} theme ${info.theme} -> ${out} ${fs.statSync(out).size} bytes`);
  }
} finally {
  await browser.close();
}
