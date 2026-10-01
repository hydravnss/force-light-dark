import { webkit, devices } from 'playwright';
// APPROXIMATION du thème « iMessage Dark » (pas le vrai CSS). Les règles qui lisent des variables --SmartTheme* DANS les bulles
// rendent le test sensible : si l'extension posait ces variables sur :root, les bulles changeraient.
export const USER_CSS = `
/* approximation de « iMessage Dark » */
html, body { background:#000 !important; }
body, #sheld, #chat, #bg1, #bg_custom { background:#000 !important; background-image:none !important; }
#top-bar, #top-settings-holder { background:#000 !important; }
.drawer-content, .popup, .options-content, .list-group { background:#1c1c1e !important; color:#f2f2f7 !important; }
html body #chat:not(#z1):not(#z2) .mes, #chat .mes .mes_block { background:transparent !important; border:0 !important; box-shadow:none !important; }
html body #chat:not(#z1):not(#z2) .mes .mes_text { display:inline-block; border-radius:18px !important; padding:8px 14px !important; color:#f2f2f7 !important; background:#262628 !important; border:1px solid var(--SmartThemeBorderColor) !important; box-shadow:0 1px 3px var(--SmartThemeShadowColor) !important; }
html body #chat:not(#z1):not(#z2) .mes[is_user="true"] .mes_text { background:#0a84ff !important; color:#fff !important; }
html body #chat:not(#z1):not(#z2) .mes .mes_text em, #chat .mes .mes_text i { color:#919191 !important; }
#chat .mes .mes_text q { color: var(--SmartThemeQuoteColor) !important; }
#chat .mes .mes_text strong { color: var(--SmartThemeBodyColor); }
#chat .mes .mes_text u { text-decoration-color: var(--SmartThemeUnderlineColor); }
#chat .mes .name_text { color: var(--SmartThemeBodyColor); }
#form_sheld { position:fixed !important; bottom:0 !important; left:0; right:0; background:#000 !important; }
#send_form { background:#000 !important; border:0 !important; }
html body #send_textarea:not(#z1) { background:#1c1c1e !important; color:#fff !important; border-radius:18px !important; }
#tjxv3p { transform: translateY(-12px); }
html, body { height:100dvh !important; }
`;
// variables posées en inline sur :root comme le fait ST quand un thème est appliqué
export const THEME_VARS = { '--SmartThemeBodyColor': 'rgb(242, 242, 247)', '--SmartThemeEmColor': 'rgb(145, 145, 145)', '--SmartThemeQuoteColor': 'rgb(255, 214, 10)', '--SmartThemeUnderlineColor': 'rgb(10, 132, 255)', '--SmartThemeBorderColor': 'rgba(255, 255, 255, 0.2)', '--SmartThemeShadowColor': 'rgba(0, 0, 0, 0.5)', '--SmartThemeUserMesBlurTintColor': 'rgb(10, 132, 255)', '--SmartThemeBotMesBlurTintColor': 'rgb(38, 38, 40)', '--SmartThemeChatTintColor': 'rgb(0, 0, 0)' };
export async function launch({ scheme='dark', init, blockBubbleColors=false } = {}) {
  const b = await webkit.launch();
  const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], colorScheme: scheme });
  if (blockBubbleColors) await ctx.route('**/third-party/bubble-colors/**', r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 300)); if (/Force Light Dark/.test(m.text()) && m.type()==='warning') errs.push('WARN '+m.text().slice(0,300)); });
  if (init) await page.addInitScript(init);
  return { b, ctx, page, errs };
}
export const inject = (page, vars = THEME_VARS) => page.evaluate(([css, vars]) => {
  const s = document.createElement('style'); s.id = 'user-theme-sim'; s.textContent = css; document.head.appendChild(s);
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
}, [USER_CSS, vars]);
// Mesures NON-bulles (le reste doit changer)
export const snap = (page) => page.evaluate(() => {
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const f = document.getElementById('form_sheld').getBoundingClientRect();
  const m = document.querySelector('meta[name="theme-color"]');
  const head = document.head;
  return {
    mode: document.documentElement.getAttribute('data-fld-mode'),
    cls: document.documentElement.className,
    bodyBg: cs(document.body, 'backgroundColor'), scheme: cs(document.documentElement, 'colorScheme'),
    chatBg: cs(document.getElementById('chat'), 'backgroundColor'),
    taBg: cs(document.getElementById('send_textarea'), 'backgroundColor'), taFg: cs(document.getElementById('send_textarea'), 'color'),
    formBg: cs(document.getElementById('form_sheld'), 'backgroundColor'), topBg: cs(document.getElementById('top-bar'), 'backgroundColor'),
    formPos: cs(document.getElementById('form_sheld'), 'position'), formRect: [Math.round(f.left), Math.round(f.top), Math.round(f.width), Math.round(f.height), Math.round(f.bottom)],
    meta: m && m.content, lastHead: head.lastElementChild && (head.lastElementChild.id || head.lastElementChild.tagName),
    nBot: document.querySelectorAll('#chat .mes[is_user="false"]').length, nUser: document.querySelectorAll('#chat .mes[is_user="true"]').length,
  };
});
const PROBE = [
  ['bot .mes_text', '#chat .mes[is_user="false"] .mes_text'], ['user .mes_text', '#chat .mes[is_user="true"] .mes_text'],
  ['bot .mes', '#chat .mes[is_user="false"]'], ['user .mes', '#chat .mes[is_user="true"]'],
  ['bot .mes_block', '#chat .mes[is_user="false"] .mes_block'], ['user .mes_block', '#chat .mes[is_user="true"] .mes_block'],
  ['bot em', '#chat .mes[is_user="false"] .mes_text em'], ['bot i', '#chat .mes[is_user="false"] .mes_text i'],
  ['user em', '#chat .mes[is_user="true"] .mes_text em'], ['bot q', '#chat .mes[is_user="false"] .mes_text q'],
  ['bot strong', '#chat .mes[is_user="false"] .mes_text strong'], ['bot a', '#chat .mes[is_user="false"] .mes_text a'],
  ['bot p', '#chat .mes[is_user="false"] .mes_text p'], ['bot name', '#chat .mes[is_user="false"] .name_text'],
];
const PROPS = ['backgroundColor', 'backgroundImage', 'color', 'borderTopColor', 'borderTopWidth', 'borderTopStyle', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderRadius', 'boxShadow', 'textDecorationColor', 'webkitTextFillColor', 'opacity', 'colorScheme', 'scrollbarColor', 'textShadow', 'outlineColor'];
// Mesure ciblée (.mes_text bot/user, .mes, .mes_block, em/i/q/strong/a/p/nom) + variables --SmartTheme* vues depuis .mes_text
export const bubbleProbe = (page) => page.evaluate(([probe, props]) => {
  const out = {};
  for (const [label, sel] of probe) {
    const el = document.querySelector(sel);
    if (!el) { out[label] = 'ABSENT'; continue; }
    const c = getComputedStyle(el); const o = {};
    for (const p of props) o[p] = c[p];
    out[label] = o;
  }
  const t = getComputedStyle(document.querySelector('#chat .mes[is_user="false"] .mes_text'));
  out['vars@bot .mes_text'] = Object.fromEntries(['BodyColor','EmColor','QuoteColor','UnderlineColor','BorderColor','ShadowColor','BlurTintColor','UserMesBlurTintColor','BotMesBlurTintColor','ChatTintColor'].map(k => ['--SmartTheme'+k, t.getPropertyValue('--SmartTheme'+k)]));
  return out;
}, [PROBE, PROPS]);
// Mesure EXHAUSTIVE : TOUTES les propriétés calculées de TOUS les éléments dans #chat .mes (sous-arbre complet)
export const chatDeepProbe = (page) => page.evaluate(() => {
  const res = {}; let n = 0;
  document.querySelectorAll('#chat .mes').forEach((mes, mi) => {
    const all = [mes, ...mes.querySelectorAll('*')];
    all.forEach((el, i) => {
      const c = getComputedStyle(el); const o = [];
      for (let k = 0; k < c.length; k++) { const p = c[k]; o.push(p + ':' + c.getPropertyValue(p)); }
      res[`${mi}/${i}/${el.tagName}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 40)}`] = o.join(';'); n++;
    });
  });
  return { n, res };
});
export const diffProbe = (a, b) => {
  const d = [];
  for (const k of Object.keys(a)) {
    if (typeof a[k] !== 'object') { if (a[k] !== b[k]) d.push(`${k}: ${a[k]} -> ${b[k]}`); continue; }
    for (const p of Object.keys(a[k])) if (a[k][p] !== (b[k] || {})[p]) d.push(`${k}.${p}: ${a[k][p]} -> ${b[k] && b[k][p]}`);
  }
  return d;
};
export const diffDeep = (a, b) => {
  const d = [];
  for (const k of Object.keys(a.res)) {
    if (a.res[k] === b.res[k]) continue;
    const A = Object.fromEntries(a.res[k].split(';').map(x => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
    const B = Object.fromEntries((b.res[k] || '').split(';').map(x => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
    for (const p of Object.keys(A)) if (A[p] !== B[p]) d.push(`${k} ${p}: ${A[p]} -> ${B[p]}`);
  }
  return d;
};
export const wait = (page, ms) => page.waitForTimeout(ms);
export async function loadChat(page) {
  await page.evaluate(async () => {
    const c = SillyTavern.getContext();
    await c.selectCharacterById(1);
    await new Promise(r => setTimeout(r, 2000));
    const x = SillyTavern.getContext();
    x.chat.length = 0; document.querySelector('#chat').innerHTML = '';
    const add = (m) => { x.chat.push(m); x.addOneMessage(m); };
    add({ name: x.name2, is_user: false, is_system: false, send_date: Date.now(), mes: 'Salut ! *sourit doucement* "Comment ça va ?" Un [lien](https://example.com) et du **gras**, <i>italique html</i> et <u>souligné</u>.' });
    add({ name: 'Moi', is_user: true, is_system: false, send_date: Date.now(), mes: 'Très bien, merci ! *je souris* "et toi ?" **oui**' });
    add({ name: x.name2, is_user: false, is_system: false, send_date: Date.now(), mes: '*Elle hoche la tête.* Parfait, on continue alors.' });
  });
  await page.waitForTimeout(600);
}
