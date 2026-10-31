/**
 * Shadow Lamp Studio — stock tool engine driven by our original glass UI.
 * The engine (viewports, contour tracer, STL export, wall projection) runs
 * verbatim in-document; the stock sidebar is carried hidden (every id the
 * engine reads stays alive) and our dock drives it through a small bridge.
 */

export interface ToolBridge {
  /** The tool's right column (viewports + flow) for portaling our cards into. */
  column: HTMLElement;
  /** Set a stock input's value and fire input+change so the engine recalculates. */
  set: (id: string, value: string | number | boolean) => void;
  get: (id: string) => string;
  click: (id: string) => void;
  text: (id: string) => string;
}

export async function mountShadowTool(
  container: HTMLElement,
  onReady: (bridge: ToolBridge) => void,
): Promise<void> {
  container.id = 'stan-tool';
  const html = await (await fetch('/shadow-tool.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1. Styles, scoped under the container and layered below our skin.
  const styleText = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n');
  const styleEl = document.createElement('style');
  styleEl.id = 'stan-tool-base';
  styleEl.textContent = `@layer stan-base { ${scopeCss(styleText, '#stan-tool')} }`;
  document.head.appendChild(styleEl);

  // 2. DOM: viewports + modals + busy. The stock sidebar and header are never
  //    shown — the sidebar moves into a hidden carrier so the engine keeps
  //    reading its inputs by id.
  const domRoot = document.createElement('div');
  domRoot.className = 'stan-tool-dom';
  const main = doc.querySelector('.main') as HTMLElement | null;
  if (main) domRoot.appendChild(main);
  doc.querySelectorAll('.modal').forEach((m) => domRoot.appendChild(m));
  const busy = doc.getElementById('busy');
  if (busy) domRoot.appendChild(busy);
  domRoot.querySelectorAll('details').forEach((d) => d.remove());
  container.appendChild(domRoot);

  // Rescue the stock header CTAs: the engine binds their handlers at boot.
  // They are pinned as a glass pill row inside the tool's right column.
  const ctaRow = document.createElement('div');
  ctaRow.className = 'stan-cta-row';
  const headerDlOpen = doc.getElementById('dlOpen');
  const headerOrderBtn = doc.getElementById('orderBtn');
  if (headerDlOpen) ctaRow.appendChild(headerDlOpen);
  if (headerOrderBtn) ctaRow.appendChild(headerOrderBtn);

  const side = domRoot.querySelector('.side') as HTMLElement | null;
  if (side) {
    // The stock sidebar stays in the DOM (the engine reads its inputs by id)
    // but is inline-hidden — bulletproof against any CSS cascade.
    side.classList.add('stan-side-carrier');
    side.style.display = 'none';
    domRoot.appendChild(side);
  }
  // The stock telemetry tiles are mirrored into our build-data card.
  const stats = domRoot.querySelector('.stats') as HTMLElement | null;
  const statusEl = document.getElementById('status');
  if (stats) stats.style.display = 'none';
  if (statusEl) statusEl.style.display = 'none';

  // The right column hosts the viewports; our build-data card portals below.
  const column = domRoot.querySelector('.main > div:last-child') as HTMLElement | null;

  if (column) column.appendChild(ctaRow);

  // 3. CDN libraries in stock order, then the stock engine scripts.
  const loadScriptSrc = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });

  // Engine boot with retries: a flaky CDN fetch must not leave the tool dead.
  // Vendored locally (public/vendor/) — no network dependency at load time.
  const CDN = [
    '/vendor/three.min.js',
    '/vendor/OrbitControls.js',
    '/vendor/d3-array.min.js',
    '/vendor/d3-contour.min.js',
  ];
  const inlineScripts = Array.from(doc.querySelectorAll('script'))
    .filter((s) => {
      const t = (s.getAttribute('type') || '').toLowerCase();
      return (!t || t === 'text/javascript' || t === 'module') && (s.textContent ?? '').trim().length > 0;
    })
    .map((s) => s.textContent ?? '');
  const bootEngine = async (): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        for (const src of CDN) await loadScriptSrc(src);
        // Engine-scoped hooks for the checkout snapshot and the admin
        // production rebuild. Defined inside the engine's own script scope so
        // the closures resolve its top-level lexical bindings directly.
        const hooks = [
          'window.__stanLoadSvg = function (text, name) {',
          "  try { if (typeof useSvg === 'function') return useSvg(String(text), String(name || 'design.svg')); } catch (e) {}",
          '};',
          'window.__stanLoadPlate = function (text, name) {',
          "  try { if (typeof usePlateText === 'function') return usePlateText(String(text), String(name || 'plate.svg')); } catch (e) {}",
          '};',
          'window.__stanOrderZip = function () {',
          "  try { if (typeof buildOrderZip === 'function') return buildOrderZip(); return null; } catch (e) { return null; }",
          '};',
        ];
        const wrapper = [
          '(function(){',
          'try {',
          ...inlineScripts,
          // Recovery appended INSIDE the same try scope: init3d/useSvg are
          // declared in the engine code's own scope, so they resolve here.
          // Engine-scoped snapshot hook: params()/lastSvg/plSrc are top-level
          // lexical bindings (never on window); the checkout reads them through
          // this closure defined in the engine code's own script scope.
          '  window.__stanSnapshot = function () {',
          '    try {',
          '      return {',
          "        recipe: (typeof params === 'function') ? params() : {},",
          "        designSvg: (typeof lastSvg !== 'undefined' && lastSvg && lastSvg.text) || '',",
          "        designName: (typeof lastSvg !== 'undefined' && lastSvg && lastSvg.name) || 'design.svg',",
          "        plateSvg: (typeof plSrc !== 'undefined' && plSrc) ? String(plSrc) : null",
          '      };',
          '    } catch (e) { return null; }',
          '  };',
          ...hooks,
          "  const __stanEl = document.getElementById('view3d');",
          "  if (__stanEl) __stanEl.innerHTML = '';",
          '  init3d();',
          "  useSvg(SAMPLE_SVG, 'Sample (swordsman)');",
          '  const __pc = document.getElementById(\'plClear\');',
          '  if (__pc) __pc.click();   // default floor picture off — plain box',
          '  window.__stanPlateCleared = true;',
          '} catch (e) {',
          '  window.__stanToolError = (e && e.stack) || String(e);',
          '  try {',
          "    window.__stanSnapshot = function () {",
          '      try {',
          '        return {',
          "          recipe: (typeof params === 'function') ? params() : {},",
          "          designSvg: (typeof lastSvg !== 'undefined' && lastSvg && lastSvg.text) || '',",
          "          designName: (typeof lastSvg !== 'undefined' && lastSvg && lastSvg.name) || 'design.svg',",
          "          plateSvg: (typeof plSrc !== 'undefined' && plSrc) ? String(plSrc) : null",
          '        };',
          '      } catch (e4) { return null; }',
          '    };',
          ...hooks,
          "    init3d(); useSvg(SAMPLE_SVG, 'Sample (swordsman)');",
          '  } catch (e2) {}',
          '}',
          '})();',
        ].join('\n');
        const s = document.createElement('script');
        s.textContent = wrapper;
        document.body.appendChild(s);
        return;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  };
  await bootEngine();

  // 4. Bridge for our UI: drive stock inputs, read stock readouts.
  onReady({
    column: column as HTMLElement,
    set: (id, value) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) return;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = value === true || value === 1 || value === '1';
      } else {
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    get: (id) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '',
    click: (id) => (document.getElementById(id) as HTMLElement | null)?.click(),
    text: (id) => document.getElementById(id)?.textContent ?? '',
  });
}

/** Prefix every top-level selector with the scope id; remap body/html/:root. */
function scopeCss(css: string, scope: string): string {
  let out = '';
  let i = 0;
  const remap = (raw: string): string => {
    const t = raw.trim();
    if (!t) return '';
    if (t === 'body' || t === 'html' || t === 'html body' || t === ':root') return scope;
    return `${scope} ${t}`;
  };
  while (i < css.length) {
    const at = css.indexOf('{', i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    const selector = css.slice(i, at);
    let depth = 1;
    let j = at + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(at + 1, j - 1);
    const head = selector.trim();
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      out += `${selector}{${scopeCss(body, scope)}}`;
    } else if (head.startsWith('@keyframes') || head.startsWith('@-webkit-keyframes') || head.startsWith('@font-face')) {
      out += `${selector}{${body}}`;
    } else if (head.startsWith('@')) {
      out += `${selector}{${body}}`;
    } else {
      const prefixed = selector
        .split(',')
        .map((s) => remap(s))
        .filter(Boolean)
        .join(',');
      out += `${prefixed}{${body}}`;
    }
    i = j;
  }
  return out;
}
