// v1.2.0 — le SOMBRE n'applique RIEN. Compare (styles calculés ET pixels) « extension désinstallée » (requêtes bloquées) à :
// Désactivé / Forcer Sombre / Auto (système sombre) / Clair → retour Sombre, sur une approximation de « iMessage Dark »
// où #top-bar est transparent et #form_sheld noir. Capture dans /workspace/st-test-shots/fld3-*.png
// Usage: node fld3.mjs [--v110]   (--v110 : sert l'ancien index.js 1.1.0 pour prouver que le test détecte la régression)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { launch, wait, loadChat } from './lib.mjs';
const SH = '/workspace/st-test-shots/';
const V110 = process.argv.includes('--v110');
const R = []; const ok = (n, c, d = '') => { R.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, c ? '' : d); };
const TAG = V110 ? 'fld3-v110' : 'fld3';
// Approximation de « iMessage Dark » : barre du haut TRANSPARENTE, barre d'envoi NOIRE/transparente, champ sombre, tiroirs #1c1c1e
const CSS = `
html, body { background:#000 !important; }
body, #sheld, #chat, #bg1, #bg_custom { background:#000 !important; background-image:none !important; }
#top-bar { background:transparent !important; border:0 !important; box-shadow:none !important; }
#top-settings-holder { background:transparent !important; backdrop-filter:none !important; }
.drawer-content { background:#1c1c1e !important; color:#f2f2f7 !important; border:1px solid rgba(255,255,255,.12) !important; box-shadow:0 0 14px rgba(0,0,0,.6) !important; }
.popup, .options-content, .list-group { background:#1c1c1e !important; color:#f2f2f7 !important; }
html body #chat:not(#z1):not(#z2) .mes { background:transparent !important; border:0 !important; box-shadow:none !important; }
html body #chat:not(#z1):not(#z2) .mes .mes_text { display:inline-block; border-radius:18px !important; padding:8px 14px !important; color:#f2f2f7 !important; background:#262628 !important; }
html body #chat:not(#z1):not(#z2) .mes[is_user="true"] .mes_text { background:#0a84ff !important; color:#fff !important; }
#form_sheld { position:fixed !important; bottom:0 !important; left:0; right:0; background:#000 !important; border:0 !important; box-shadow:none !important; }
#send_form { background:transparent !important; border:0 !important; box-shadow:none !important; backdrop-filter:none !important; }
#nonQRFormItems { background:transparent !important; border:0 !important; }
html body #send_textarea:not(#z1) { background:#000 !important; color:#fff !important; border:1px solid #38383a !important; border-radius:18px !important; }
html, body { height:100dvh !important; }
`;
const VARS = { '--SmartThemeBodyColor': 'rgb(242, 242, 247)', '--SmartThemeEmColor': 'rgb(145, 145, 145)', '--SmartThemeQuoteColor': 'rgb(255, 214, 10)', '--SmartThemeBorderColor': 'rgba(255, 255, 255, 0.2)', '--SmartThemeShadowColor': 'rgba(0, 0, 0, 0.5)', '--SmartThemeBlurTintColor': 'rgb(0, 0, 0)', '--SmartThemeFastUIBGColor': 'rgb(0, 0, 0)' };
var PAINT = /(color|background|border-(top|right|bottom|left|block|inline|image|style|radius)|shadow|filter|opacity|outline|fill|stroke|mask|text-decoration|text-fill|caret|accent|scrollbar|mix-blend|^content$|^--SmartTheme|^--fld|^--black|^--white|^--grey|^--crimson|^--fast|^--bg|^--cl)/i;
var GEOM = /^(--fs-|--doc-height|--topBar|--bottomForm|--sheldWidth)/;
const ROOTS = ['html', 'body', '#sheld', '#top-bar', '#top-settings-holder', '#form_sheld', '#send_form', '#nonQRFormItems', '#send_textarea', '#leftSendForm', '#rightSendForm', '#chat'];

// NB : WebKit renvoie, pour les éléments display:none (jamais affichés), un style calculé PÉRIMÉ après le retrait d'une feuille de style
// (reproduit SANS l'extension, en injectant/retirant à la main le même CSS : voir README). On force donc un recalcul identique des deux côtés.
const forceRecalc = (page) => page.evaluate((ROOTS) => {
  for (const sel of ROOTS) { const root = document.querySelector(sel); if (!root) continue;
    for (const el of [root, ...root.querySelectorAll('*')]) { if (el.getClientRects().length === 0 && el.nodeType === 1 && !el.closest('#fld_settings')) { const d = el.style.getPropertyValue('display'); const pr = el.style.getPropertyPriority('display'); el.style.setProperty('display', 'block', 'important'); void el.offsetHeight; if (d) el.style.setProperty('display', d, pr); else el.style.removeProperty('display'); if (el.getAttribute('style') === '') el.removeAttribute('style'); } } }
}, ROOTS);
const measure = async (page) => { await forceRecalc(page); return measure0(page); };
const measure0 = (page) => page.evaluate((ROOTS) => {
  const skip = (el) => (el.id && el.id.startsWith('fld')) || el.closest('#fld_settings, #fld_wand_button, .fld-fab') || el.tagName === 'OPTION' || el.tagName === 'OPTGROUP';
  const out = {};
  const path = (el, root) => { const p = []; for (let e = el; e && e !== root; e = e.parentElement) p.push(e.tagName + (Array.from(e.parentElement.children).filter(c => !skip(c)).indexOf(e))); return p.reverse().join('>'); };
  const PAINT_RE = new RegExp(window.__PAINT.source, 'i'), GEOM_RE = new RegExp(window.__GEOM.source); const dump = (c) => { const o = []; for (let k = 0; k < c.length; k++) { const p = c[k]; if ((PAINT_RE.test(p) && !GEOM_RE.test(p) && !/-width$|^border-image-(width|outset|slice|repeat)/.test(p)) || p.startsWith('--Smart') || p.startsWith('--fld')) o.push(p + ':' + c.getPropertyValue(p)); } return o.join(';'); };
  for (const sel of ROOTS) {
    const root = document.querySelector(sel); if (!root) { out[sel] = 'ABSENT'; continue; }
    // #chat : seulement le conteneur lui-même (les bulles ont leur propre test) ; html/body/#sheld : l'élément seul
    const els = (sel === 'html' || sel === 'body' || sel === '#sheld' || sel === '#chat') ? [root] : [root, ...root.querySelectorAll('*')];
    for (const el of els) {
      if (skip(el)) continue;
      const key = sel + '|' + path(el, root);
      out[key] = dump(getComputedStyle(el)) + '|B:' + ['::before', '::after'].map(ps => { const c = getComputedStyle(el, ps); return ['content', 'backgroundColor', 'color', 'borderTopColor', 'boxShadow'].map(p => c[p]).join(','); }).join('/');
    }
  }
  const ta = document.getElementById('send_textarea'); out['placeholder'] = ta ? ['color', 'opacity', 'webkitTextFillColor'].map(p => getComputedStyle(ta, '::placeholder')[p]).join(',') : 'ABSENT';
  // variables --SmartTheme* vues depuis chaque conteneur
  for (const sel of ['html', 'body', '#sheld', '#top-bar', '#form_sheld', '#chat', '#chat .mes .mes_text']) { const e = document.querySelector(sel); if (e) out['vars ' + sel] = Object.keys(window.__V).map(k => k + '=' + getComputedStyle(e).getPropertyValue(k).trim()).join(';'); }
  const g = (e, p) => getComputedStyle(e)[p];
  out['KEY'] = JSON.stringify(Object.fromEntries(['#top-bar', '#top-settings-holder', '#form_sheld', '#send_form', '#send_textarea', 'body', '#sheld'].map(s => { const e = document.querySelector(s); return [s, ['backgroundColor', 'backgroundImage', 'borderTopColor', 'borderBottomColor', 'color', 'boxShadow', 'backdropFilter', 'colorScheme'].map(p => g(e, p)).join(' | ')]; })));
  return out;
}, ROOTS);
// Propriétés « de peinture » (couleurs, fonds, bordures, ombres, filtres, opacité, color-scheme, variables --SmartTheme/--fld…) : comparées STRICTEMENT.
// Les propriétés de GÉOMÉTRIE (hauteur, marges, display, --fs-h…) dépendent de la synchronisation entre extensions tierces du ST de test
// (fixed-sendbar, RossAscends…) : elles bougent aussi entre deux sessions SANS notre extension (témoin REF2) ; comptées à part.
const parseSet = (str) => Object.fromEntries(str.split(';').map(x => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
const diff = (a, b, kind = 'paint') => { const d = []; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (a[k] === b[k]) continue; if (typeof a[k] !== 'string' || typeof b[k] !== 'string' || k === 'placeholder' || k.startsWith('vars') || k === 'KEY') { if (kind === 'paint') d.push(`${k}: ${String(a[k]).slice(0, 120)} -> ${String(b[k]).slice(0, 120)}`); continue; } const split = (x) => x.split('|B:'); const [A0, A1] = split(a[k]); const [B0, B1] = split(b[k] || ''); const A = parseSet(A0); const B = parseSet(B0); for (const p of Object.keys({ ...A, ...B })) { if (A[p] === B[p]) continue; if (kind === 'paint') d.push(`${k} ${p}: ${A[p]} -> ${B[p]}`); } if (kind === 'paint' && A1 !== B1) d.push(`${k} pseudo: ${A1} -> ${B1}`); } return d; };
const pxDiff = (f1, f2) => execSync(`python3 -W ignore -c "
from PIL import Image, ImageChops
a=Image.open('${f1}').convert('RGB'); b=Image.open('${f2}').convert('RGB')
if a.size!=b.size: print('SIZE', a.size, b.size)
else:
    d=ImageChops.difference(a,b); bb=d.getbbox(); n=sum(1 for p in d.getdata() if p!=(0,0,0)); import warnings; print('DIFFPX', n, bb)
"`).toString().trim();
const shot = async (page, name) => { const f = `${SH}${TAG}-${name}.png`; await page.screenshot({ path: f, animations: 'disabled', caret: 'hide' }); return f; };

async function session(label, { blocked, scheme = 'dark' }) {
  const { b, ctx, page, errs } = await launch({ scheme });
  if (blocked) await ctx.route('**/third-party/force-light-dark/**', r => r.abort());
  else if (V110) { const old110 = execSync('git -C /workspace/force-light-dark show 22e6d6f:index.js').toString(); await ctx.route('**/third-party/force-light-dark/index.js', r => r.fulfill({ contentType: 'text/javascript', body: old110 })); }
  await page.addInitScript(([V, P, G]) => { window.__V = V; window.__PAINT = { source: P }; window.__GEOM = { source: G }; }, [VARS, PAINT.source, GEOM.source]);
  await page.goto('http://localhost:8000/'); await wait(page, 6500);
  await page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); });
  await loadChat(page);
  await page.evaluate(([css, vars]) => { document.querySelectorAll('#chat .mes .timestamp, #chat .mes .mesIDDisplay, #chat .mes .mes_timer, #chat .mes .tokenCounterDisplay').forEach(e => e.textContent = ''); const s = document.createElement('style'); s.id = 'user-theme-sim'; s.textContent = css; document.head.appendChild(s); for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v); }, [CSS, VARS]);
  await page.evaluate((V110) => { const S = SillyTavern.getContext().extensionSettings['force-light-dark']; if (S) { S.colors = { light: { bg: '#ffffff', panel: '#f2f2f7', text: '#000000', em: '#6e6e73' }, ...(V110 ? { dark: { bg: '#000000', text: '#f2f2f7', em: '#919191' } } : {}) }; S.mode = 'off'; } if (window.ForceLightDark) ForceLightDark.reapply(); }, V110);
  await wait(page, 800);
  return { b, ctx, page, errs };
}
const openDrawer = async (page) => { await page.evaluate(() => document.querySelector('#leftNavDrawerIcon').click()); await wait(page, 900); };
const closeDrawer = async (page) => { await page.evaluate(() => document.querySelector('#leftNavDrawerIcon').click()); await wait(page, 900); };
async function grab(page, name) { // vue principale + tiroir ouvert
  await wait(page, 500);
  const m = await measure(page); const f = await shot(page, name);
  await openDrawer(page); const m2 = await measure(page);
  m2['drawer'] = await page.evaluate(() => { const d = document.querySelector('#left-nav-panel'); if (!d) return 'ABSENT'; return JSON.stringify([d, ...d.querySelectorAll('*')].slice(0, 400).map(e => { const c = getComputedStyle(e); return ['backgroundColor', 'color', 'borderTopColor', 'boxShadow', 'backdropFilter'].map(p => c[p]).join(','); })); });
  const f2 = await shot(page, name + '-tiroir'); await closeDrawer(page);
  return { m, m2, f, f2 };
}

// ---------- Séquence identique jouée dans 2 sessions : RÉFÉRENCE (extension désinstallée : requêtes bloquées, aucune action)
// et AVEC extension (mode changé à chaque étape). On compare étape par étape (même historique d'ouverture de tiroir, etc.).
const STEPS = [
  ['desactive', (ref) => ref || ForceLightDark.setMode('off')],
  ['sombre', (ref) => ref || ForceLightDark.setMode('dark')],
  ['auto-sombre', (ref) => ref || ForceLightDark.setMode('auto')],
  ['clair', (ref) => ref || ForceLightDark.setMode('light')],
  ['retour-sombre', (ref) => ref || ForceLightDark.setMode('dark')],
  ['retour-desactive', (ref) => ref || ForceLightDark.setMode('off')],
];
async function run(isRef, pfx = 'ref-') {
  const t = await session(isRef ? 'ref' : 'ext', { blocked: isRef });
  const { page } = t; const res = {};
  if (!isRef) await page.evaluate(() => { SillyTavern.getContext().extensionSettings['force-light-dark'].transition = false; });
  res.metaStart = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
  for (const [name, fn] of STEPS) {
    await page.evaluate(`(${fn.toString()})(${isRef})`); await wait(page, 900);
    if (name === 'auto-sombre') { await page.emulateMedia({ colorScheme: 'dark' }); await wait(page, 600); }
    const G = await grab(page, (isRef ? pfx : '') + name);
    G.meta = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
    G.st = await page.evaluate(() => ({ style: !!document.getElementById('fld-style'), active: document.documentElement.classList.contains('fld-active'), inlineVars: document.documentElement.style.cssText.includes('--fld'), scheme: document.documentElement.style.colorScheme, fldVarsOnBars: ['#top-bar', '#form_sheld'].map(s => getComputedStyle(document.querySelector(s)).getPropertyValue('--fld-bg')), ext: typeof window.ForceLightDark !== 'undefined' }));
    if (!isRef && name === 'sombre') {
      G.realBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.evaluate(() => { const s = document.createElement('style'); s.id = 'bgtest'; s.textContent = 'html, body { background:#102030 !important; }'; document.head.appendChild(s); ForceLightDark.reapply(); });
      G.tcOther = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
      await page.evaluate(() => { document.getElementById('bgtest').remove(); ForceLightDark.reapply(); });
    }
    if (!isRef && name === 'clair') G.lt = await page.evaluate(() => ({ tc: document.querySelector('meta[name="theme-color"]').content, scheme: getComputedStyle(document.documentElement).colorScheme, pos: getComputedStyle(document.getElementById('form_sheld')).position, bubbleBg: getComputedStyle(document.querySelector('#chat .mes[is_user="false"] .mes_text')).backgroundColor, userBg: getComputedStyle(document.querySelector('#chat .mes[is_user="true"] .mes_text')).backgroundColor }));
    res[name] = G;
  }
  return { t, res };
}
const REF = await run(true);
const kref = JSON.parse(REF.res.desactive.m.KEY);
ok('(sanity) référence : #top-bar et #form_sheld noirs/transparents comme dans le thème simulé (pas de gris anthracite)', /^rgba?\(0, 0, 0(, 0)?\)/.test(kref['#top-bar']) && /^rgb\(0, 0, 0\)/.test(kref['#form_sheld']) && /^rgb\(0, 0, 0\)/.test(kref['#send_form']), JSON.stringify(kref));
ok('(sanity) la référence n\'a PAS l\'extension', !REF.res.desactive.st.ext);
console.log('KEY ref:', REF.res.desactive.m.KEY);
await REF.t.b.close();
const REF2 = await run(true, 'ref2-'); await REF2.t.b.close();
const EXT = await run(false);
const { page } = EXT.t; const t = EXT.t;
ok('l\'extension est chargée', EXT.res.desactive.st.ext);
for (const [name] of STEPS) {
  const B = REF.res[name], G = EXT.res[name];
  if (name === 'clair') continue;
  const d1 = diff(B.m, G.m), d2 = diff(B.m2, G.m2);
  const c1 = diff(B.m, REF2.res[name].m).length + diff(B.m2, REF2.res[name].m2).length;
  console.log(`  ${name}: écarts de peinture entre 2 sessions SANS extension (témoin): ${c1}`);
  const n = Object.keys(G.m).length + Object.keys(G.m2).length;
  ok(`${name}: propriétés de PEINTURE (toutes les couleurs/fonds/bordures/ombres/filtres/opacité/variables) de #top-bar, #top-settings-holder, #form_sheld, #send_form, #send_textarea, body, #sheld + tous les descendants (${n} sondes × toutes propriétés + ::before/::after/::placeholder + variables, vue principale) IDENTIQUES à « extension désinstallée »`, d1.length === 0, d1.slice(0, 6).join(' | '));
  ok(`${name}: idem tiroir ouvert (#left-nav-panel)`, d2.length === 0, d2.slice(0, 6).join(' | '));
  ok(`${name}: background-color/image, border, color, box-shadow, backdrop-filter, color-scheme des 7 éléments clés identiques`, G.m.KEY === B.m.KEY, G.m.KEY);
  const p1 = pxDiff(B.f, G.f), p2 = pxDiff(B.f2, G.f2);
  ok(`${name}: captures PIXEL pour pixel identiques (vue principale: ${p1.replace('DIFFPX ', 'diff=')} ; tiroir: ${p2.replace('DIFFPX ', 'diff=')})`, /DIFFPX 0 /.test(p1) && /DIFFPX 0 /.test(p2), `${p1} / ${p2}`);
  ok(`${name}: aucun <style fld-style>, pas de .fld-active, pas de --fld-*, pas de color-scheme posé`, !G.st.style && !G.st.active && !G.st.inlineVars && G.st.scheme === '' && G.st.fldVarsOnBars.every(v => v === ''), JSON.stringify(G.st));
  console.log(`  ${name}: theme-color = ${G.meta}  (référence sans extension : ${B.meta})`);
}
ok('Désactivé / retour-Désactivé: theme-color d\'origine restauré', EXT.res.desactive.meta === REF.res.desactive.meta && EXT.res['retour-desactive'].meta === REF.res['retour-desactive'].meta, `${EXT.res.desactive.meta} ${EXT.res['retour-desactive'].meta}`);
ok('Sombre: theme-color = fond RÉEL de la page lu dans le DOM (body = ' + EXT.res.sombre.realBg + ' → #000000)', EXT.res.sombre.realBg === 'rgb(0, 0, 0)' && EXT.res.sombre.meta === '#000000', `${EXT.res.sombre.realBg} ${EXT.res.sombre.meta}`);
ok('Sombre: si le thème a un autre fond (#102030), theme-color le suit (donc pas codé en dur)', EXT.res.sombre.tcOther === '#102030', EXT.res.sombre.tcOther);
ok('Auto (système sombre) / retour-Sombre: theme-color = fond réel #000000', EXT.res['auto-sombre'].meta === '#000000' && EXT.res['retour-sombre'].meta === '#000000');
{ const L = EXT.res.clair; const lk = JSON.parse(L.m.KEY); console.log('KEY clair:', L.m.KEY);
  const lum = (s) => { const m = s.match(/[\d.]+/g).map(Number); return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]); };
  const f = (s, i) => lk[s].split(' | ')[i];
  ok('Clair: body blanc, #top-bar/#top-settings-holder/#form_sheld/#send_form clairs (#f2f2f7), champ blanc, texte sombre, pas de backdrop/ombre', f('body', 0) === 'rgb(255, 255, 255)' && ['#top-bar', '#top-settings-holder', '#form_sheld', '#send_form'].every(s => f(s, 0) === 'rgb(242, 242, 247)') && f('#send_textarea', 0) === 'rgb(255, 255, 255)' && lum(f('#send_textarea', 4)) < 60, L.m.KEY);
  ok('Clair: theme-color #ffffff, color-scheme light, #form_sheld toujours fixed', L.lt.tc === '#ffffff' && L.lt.scheme === 'light' && L.lt.pos === 'fixed', JSON.stringify(L.lt));
  ok('Clair: bulles non touchées (bot #262628, user #0a84ff comme dans le thème)', L.lt.bubbleBg === 'rgb(38, 38, 40)' && L.lt.userBg === 'rgb(10, 132, 255)', JSON.stringify(L.lt));
  ok('Clair: <style fld-style> présent, .fld-active', L.st.style && L.st.active); 
  ok('Clair: captures différentes de la référence (le Clair s\'applique bien)', !/DIFFPX 0 /.test(pxDiff(REF.res.desactive.f, L.f))); }
await EXT.t.page.evaluate(() => ForceLightDark.setMode('auto')); await EXT.t.page.emulateMedia({ colorScheme: 'light' }); await wait(page, 800);
{ const sl = await page.evaluate(() => ({ m: document.documentElement.getAttribute('data-fld-mode'), bg: getComputedStyle(document.body).backgroundColor }));
  ok('Auto + système clair → Clair appliqué', sl.m === 'light' && sl.bg === 'rgb(255, 255, 255)', JSON.stringify(sl)); }
await page.emulateMedia({ colorScheme: 'dark' }); await wait(page, 800);
{ const sd = await page.evaluate(() => ({ s: !!document.getElementById('fld-style'), bg: getComputedStyle(document.body).backgroundColor, bar: getComputedStyle(document.getElementById('form_sheld')).backgroundColor }));
  ok('Auto: système repasse sombre → <style> retiré, thème intact', !sd.s && sd.bg === 'rgb(0, 0, 0)' && sd.bar === 'rgb(0, 0, 0)', JSON.stringify(sd)); }
// Sombre après rechargement (settings persistés + cache localStorage) : comparé à l'étape de référence « sombre »
await page.evaluate(() => ForceLightDark.setMode('dark')); await wait(page, 2000);
await page.reload(); await wait(page, 7500);
await loadChat(page);
await page.evaluate(([css, vars]) => { document.querySelectorAll('#chat .mes .timestamp, #chat .mes .mesIDDisplay, #chat .mes .mes_timer, #chat .mes .tokenCounterDisplay').forEach(e => e.textContent = ''); const s = document.createElement('style'); s.id = 'user-theme-sim'; s.textContent = css; document.head.appendChild(s); for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v); window.__V = vars; }, [CSS, VARS]);
await wait(page, 1500);
{ const G = await grab(page, 'rechargement-sombre'); const B = REF.res.desactive; const d = diff(B.m, G.m);
  ok('Sombre après rechargement: styles identiques à la référence', d.length === 0, d.slice(0, 5).join(' | '));
  const p = pxDiff(B.f, G.f); ok(`Sombre après rechargement: pixels identiques (${p})`, /DIFFPX 0 /.test(p), p); }
// ---------- migration 1.1.x
const SETF = '/workspace/st-test/data/default-user/settings.json';
await page.evaluate(() => ForceLightDark.setMode('off')); await wait(page, 2500);
{ const j = JSON.parse(fs.readFileSync(SETF, 'utf8')); j.extension_settings['force-light-dark'] = { schema: 2, mode: 'dark', intensity: 'total', autoSource: 'system', lightFrom: '08:00', darkFrom: '21:30', transition: false, hideBg: true, themeColorMeta: true, wandEntry: true, toast: true, fabShow: false, fabX: 100, fabY: 40, fabSize: 44, colors: { light: { bg: '#fafafa', text: '#111111', em: '#555555' }, dark: { bg: '#050505', text: '#e0e0e0', em: '#919191' } } }; fs.writeFileSync(SETF, JSON.stringify(j, null, 4)); }
await page.evaluate(() => localStorage.removeItem('fld_cache_v1'));
await page.reload(); await wait(page, 9000);
const mig = JSON.parse(fs.readFileSync(SETF, 'utf8')).extension_settings['force-light-dark'];
const migMem = await page.evaluate(() => JSON.parse(JSON.stringify(SillyTavern.getContext().extensionSettings['force-light-dark'])));
ok('migration 1.1.x: colors.dark SUPPRIMÉ (mémoire + settings.json serveur), schema=3', !('dark' in migMem.colors) && !('dark' in mig.colors) && mig.schema === 3 && migMem.schema === 3, JSON.stringify(mig.colors));
ok('migration 1.1.x: couleurs Clair conservées (bg/text/em) + panel par défaut #f2f2f7, mode dark conservé', mig.colors.light.bg === '#fafafa' && mig.colors.light.text === '#111111' && mig.colors.light.em === '#555555' && mig.colors.light.panel === '#f2f2f7' && mig.mode === 'dark' && mig.lightFrom === '08:00', JSON.stringify(mig));
ok('migration: le mode sombre migré n\'applique aucun <style>', await page.evaluate(() => !document.getElementById('fld-style')));
const panel = await page.evaluate(() => { document.querySelector('#extensions-settings-button .drawer-toggle').click(); return new Promise(r => setTimeout(() => r({ dark: !!document.querySelector('#fld_settings [id^="fld_c_dark"]'), light: document.querySelectorAll('#fld_settings [id^="fld_c_light"]').length, resetDark: !!document.getElementById('fld_reset_dark'), txt: document.getElementById('fld_settings').textContent.includes('votre thème tel quel') }), 600)); });
ok('panneau: 4 couleurs Clair, AUCUNE couleur Sombre, note « votre thème tel quel »', !panel.dark && panel.light === 4 && !panel.resetDark && panel.txt, JSON.stringify(panel));
await page.evaluate(() => { const d = document.querySelector('#fld_settings .inline-drawer-toggle'); d.scrollIntoView(); d.click(); }); await wait(page, 600);
await shot(page, 'panneau');
await page.evaluate(() => document.querySelector('#extensions-settings-button .drawer-toggle').click());
// remise à zéro des réglages de test
await page.evaluate(() => { const S = SillyTavern.getContext().extensionSettings['force-light-dark']; S.colors = { light: { bg: '#ffffff', panel: '#f2f2f7', text: '#000000', em: '#6e6e73' } }; ForceLightDark.setMode('off'); }); await wait(page, 2500);
const e = [...t.errs].filter(x => !/interactive-widget/.test(x));
ok('aucune erreur console / pageerror', e.length === 0, JSON.stringify(e));
await t.b.close();
console.log('\n' + R.filter(x => !x).length + ' échec(s) /', R.length);
process.exit(R.some(x => !x) ? 1 : 0);
