/**
 * Force Light Dark — extension SillyTavern (v1.0.0)
 *
 * FORCE le mode clair ou sombre PAR-DESSUS le thème, même quand celui-ci écrit des couleurs sombres en dur avec
 * !important (ex. thème « iMessage Dark » : `#chat .mes .mes_text { background: #262628 !important }`).
 *
 * Mécanisme :
 *  - <style id="fld-style"> toujours DERNIER dans <head> (MutationObserver + garde-fou anti-boucle) ;
 *  - sélecteurs préfixés par `html.fld-active[data-fld-mode="…"]:not(#fld_x):not(#fld_y)` (= 2 ids de spécificité en plus),
 *    donc plus forts que n'importe quelle règle de thème à !important égal, quel que soit l'ordre ;
 *  - surcharge des variables --SmartTheme* sur :root ET des vraies règles (bulles, barre d'envoi, barre du haut, tiroirs,
 *    popups, champs, liens, barres de défilement…) ;
 *  - color-scheme, <meta name="theme-color">, classe + attributs sur <html> pour votre propre CSS ;
 *  - AUCUN transform / filter / position posé sur un ancêtre : la barre d'envoi fixe n'est pas touchée (couleurs seulement).
 *
 * Application la plus tôt possible : au chargement du script, depuis le cache localStorage (synchrone), puis depuis les
 * réglages enregistrés dans extension_settings.
 */
import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

const NAME = 'force-light-dark';
const LOG = '[Force Light Dark]';
const STYLE_ID = 'fld-style';
const CACHE_KEY = 'fld_cache_v1';
const MODES = ['off', 'light', 'dark', 'auto'];
const MODE_LABEL = { off: 'Désactivé', light: 'Forcer Clair', dark: 'Forcer Sombre', auto: 'Auto' };
const MODE_ICON = { off: '○', light: '☀️', dark: '🌙', auto: '🌗' };
const COLOR_KEYS = ['bg', 'bot', 'user', 'text', 'userText', 'em'];
const COLOR_LABEL = {
    bg: 'Fond', bot: 'Bulle reçue', user: 'Bulle envoyée', text: 'Texte', userText: 'Texte (bulle envoyée)', em: 'Italique (em/i)',
};

const DEFAULT_COLORS = Object.freeze({
    light: Object.freeze({ bg: '#ffffff', bot: '#e9e9eb', user: '#0a84ff', text: '#000000', userText: '#ffffff', em: '#6e6e73' }),
    dark: Object.freeze({ bg: '#000000', bot: '#262628', user: '#0a84ff', text: '#f2f2f7', userText: '#ffffff', em: '#919191' }),
});

const DEFAULTS = Object.freeze({
    mode: 'off',            // off | light | dark | auto
    intensity: 'total',     // total | soft
    autoSource: 'system',   // system | schedule
    lightFrom: '07:00',
    darkFrom: '20:00',
    transition: false,
    hideBg: true,           // masque l'image de fond de SillyTavern quand on force (mode Total)
    paint: 'mes_text',      // mes_text | mes_block | mes | auto | none : élément qui porte le fond des bulles
    themeColorMeta: true,
    wandEntry: true,
    toast: true,
    fabShow: false,
    fabX: 100,              // 0-100 % (gauche → droite)
    fabY: 40,               // 0-100 % (haut → bas)
    fabSize: 44,            // px
});

// ---------------------------------------------------------------------------------------------------------------
// Utilitaires couleurs
// ---------------------------------------------------------------------------------------------------------------
const HEX_RE = /^#[0-9a-f]{6}$/i;
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hexToRgb(a); const B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const luminance = (h) => { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** Déduit la palette complète d'un mode à partir des 6 couleurs réglables. */
export function buildPalette(mode, c) {
    const dark = mode === 'dark';
    const panel = dark ? mix(c.bg, '#ffffff', 0.10) : mix(c.bg, '#000000', 0.045);
    const input = dark ? mix(c.bg, '#ffffff', 0.14) : mix(c.bg, '#000000', 0.07);
    return {
        mode, scheme: dark ? 'dark' : 'light',
        bg: c.bg, bot: c.bot, user: c.user, text: c.text, userText: c.userText, em: c.em,
        userEm: mix(c.userText, c.user, 0.22),
        panel, input,
        border: dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.16)',
        shadow: dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.18)',
        quote: dark ? '#8ecbff' : '#0a58b5',
        link: dark ? '#64b5ff' : '#0a6cff',
        codeBg: dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.07)',
        scroll: dark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.28)',
        rgb: hexToRgb(c.text),
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------------------------------------------
function sanitize(s) {
    const d = DEFAULTS;
    if (!MODES.includes(s.mode)) s.mode = d.mode;
    if (!['total', 'soft'].includes(s.intensity)) s.intensity = d.intensity;
    if (!['system', 'schedule'].includes(s.autoSource)) s.autoSource = d.autoSource;
    for (const k of ['lightFrom', 'darkFrom']) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s[k]))) s[k] = d[k];
    for (const k of ['transition', 'hideBg', 'themeColorMeta', 'wandEntry', 'toast', 'fabShow']) s[k] = typeof s[k] === 'boolean' ? s[k] : d[k];
    if (!['mes_text', 'mes_block', 'mes', 'auto', 'none'].includes(s.paint)) s.paint = d.paint;
    const num = (v, lo, hi, def) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def; };
    s.fabX = num(s.fabX, 0, 100, d.fabX); s.fabY = num(s.fabY, 0, 100, d.fabY); s.fabSize = num(s.fabSize, 32, 72, d.fabSize);
    if (!s.colors || typeof s.colors !== 'object') s.colors = {};
    for (const m of ['light', 'dark']) {
        const cur = (s.colors[m] && typeof s.colors[m] === 'object') ? s.colors[m] : {};
        s.colors[m] = {};
        for (const k of COLOR_KEYS) s.colors[m][k] = HEX_RE.test(String(cur[k])) ? String(cur[k]).toLowerCase() : DEFAULT_COLORS[m][k];
    }
    return s;
}

let S = null;
function readCache() {
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(S)); } catch { /* stockage indisponible */ }
}
/** Charge les réglages : extension_settings (vérité) sinon cache localStorage sinon défauts. */
function loadSettings() {
    let src = null;
    try { src = extension_settings && extension_settings[NAME]; } catch { /* ignore */ }
    if (!src || typeof src !== 'object') src = readCache() || {};
    S = sanitize(Object.assign({}, DEFAULTS, src));
    try { if (extension_settings) extension_settings[NAME] = S; } catch { /* ignore */ }
    return S;
}
function save() {
    writeCache();
    try { saveSettingsDebounced(); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------------------------
// Mode effectif
// ---------------------------------------------------------------------------------------------------------------
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : { matches: true, addEventListener() {}, addListener() {} };
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function scheduleMode(now = new Date()) {
    const n = now.getHours() * 60 + now.getMinutes();
    const a = toMin(S.lightFrom); const b = toMin(S.darkFrom);
    if (a === b) return 'light';
    const light = a < b ? (n >= a && n < b) : (n >= a || n < b);
    return light ? 'light' : 'dark';
}

/** @returns {null|'light'|'dark'} null = désactivé */
export function effectiveMode() {
    if (!S || S.mode === 'off') return null;
    if (S.mode === 'light' || S.mode === 'dark') return S.mode;
    return S.autoSource === 'schedule' ? scheduleMode() : (mq.matches ? 'dark' : 'light');
}

// ---------------------------------------------------------------------------------------------------------------
// Génération du CSS
// ---------------------------------------------------------------------------------------------------------------
const BOOST = ':not(#fld_x):not(#fld_y)';

function paintTarget() {
    if (S.paint !== 'auto') return S.paint;
    return detectPaint() || 'mes_text';
}

/** Détecte quel élément porte le fond des bulles dans le thème courant (style désactivé le temps de la mesure). */
let paintCache = null;
function detectPaint() {
    try {
        const mes = document.querySelector('#chat .mes[is_system="false"], #chat .mes');
        if (!mes) return paintCache;
        const el = document.getElementById(STYLE_ID);
        const wasDisabled = el ? el.disabled : false;
        if (el) el.disabled = true;
        const alpha = (node) => {
            if (!node) return 0;
            const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
            return m ? (m.length > 3 ? Number(m[3]) : 1) : 0;
        };
        let res = 'none';
        if (alpha(mes.querySelector('.mes_text')) > 0.05) res = 'mes_text';
        else if (alpha(mes.querySelector('.mes_block')) > 0.05) res = 'mes_block';
        else if (alpha(mes) > 0.05) res = 'mes';
        if (el) el.disabled = wasDisabled;
        paintCache = res;
        return res;
    } catch { return paintCache; }
}

export function buildCss(p, s) {
    const H = `html.fld-active[data-fld-mode="${p.mode}"]${BOOST}`;
    const [tr, tg, tb] = p.rgb;
    const out = [];
    // 1) Variables SillyTavern + variables propres (toujours, même en mode Doux)
    out.push(`${H} {
  color-scheme: ${p.scheme} !important;
  --SmartThemeBodyColor: ${p.text} !important;
  --SmartThemeEmColor: ${p.em} !important;
  --SmartThemeUnderlineColor: ${p.text} !important;
  --SmartThemeQuoteColor: ${p.quote} !important;
  --SmartThemeBlurTintColor: ${p.panel} !important;
  --SmartThemeChatTintColor: ${p.bg} !important;
  --SmartThemeUserMesBlurTintColor: ${p.user} !important;
  --SmartThemeBotMesBlurTintColor: ${p.bot} !important;
  --SmartThemeBorderColor: ${p.border} !important;
  --SmartThemeShadowColor: ${p.shadow} !important;
  --SmartThemeFastUIBGColor: ${p.bg} !important;
  --SmartThemeCheckboxBgColorR: ${tr} !important;
  --SmartThemeCheckboxBgColorG: ${tg} !important;
  --SmartThemeCheckboxBgColorB: ${tb} !important;
  --fld-bg: ${p.bg}; --fld-panel: ${p.panel}; --fld-input: ${p.input}; --fld-text: ${p.text};
  --fld-bot: ${p.bot}; --fld-user: ${p.user}; --fld-user-text: ${p.userText}; --fld-em: ${p.em};
}`);
    if (s.intensity !== 'total') return out.join('\n');

    // 2) Mode Total : on écrase aussi les règles en dur du thème
    const paint = paintTarget();
    const USER = `#chat .mes[is_user="true"]`;
    const BOT = `#chat .mes[is_user="false"]`;
    const sel = (list, tail = '') => list.map((x) => `${H} ${x}${tail}`).join(',\n');

    // Page
    out.push(`${H},\n${H} body {\n  background-color: ${p.bg} !important;\n  color: ${p.text} !important;\n  color-scheme: ${p.scheme} !important;\n}`);
    out.push(`${H} #preloader {\n  background-color: ${p.bg} !important;\n  color: ${p.text} !important;\n}`);
    if (s.hideBg) out.push(`${sel(['#bg1', '#bg_custom'])} {\n  background-image: none !important;\n  background-color: ${p.bg} !important;\n}`);
    out.push(`${sel(['#sheld', '#chat'])} {\n  background-color: ${s.hideBg ? p.bg : 'transparent'} !important;\n  color: ${p.text} !important;\n}`);

    // Texte hors bulle
    out.push(`${sel(['#chat .mes', '#chat .mes .name_text', '#chat .mes .ch_name', '#chat .mes .mes_timer', '#chat .mes .mesIDDisplay', '#chat .mes .tokenCounterDisplay', '#chat .mes .mes_buttons', '#chat .mes .extraMesButtons'])} {\n  color: ${p.text} !important;\n}`);

    // Bulles : la cible porte le fond, les deux autres niveaux sont transparents (comme dans iMessage Dark)
    if (paint !== 'none') {
        const levels = { mes_text: '.mes_text', mes_block: '.mes_block', mes: '' };
        const mine = levels[paint] ?? '.mes_text';
        const others = Object.entries(levels).filter(([k]) => k !== paint).map(([, v]) => v);
        const at = (base, lvl) => `${base} ${lvl}`.trim();
        out.push(`${sel([at(USER, mine)])} {\n  background-color: ${p.user} !important;\n  color: ${p.userText} !important;\n}`);
        out.push(`${sel([at(BOT, mine)])} {\n  background-color: ${p.bot} !important;\n  color: ${p.text} !important;\n}`);
        const transp = [];
        for (const o of others) transp.push(at('#chat .mes', o));
        if (transp.length) out.push(`${sel(transp)} {\n  background-color: transparent !important;\n  box-shadow: none !important;\n}`);
    }

    // Texte DANS les bulles
    const inUser = (t) => `${USER} .mes_text ${t}`;
    const inBot = (t) => `${BOT} .mes_text ${t}`;
    const blocks = ['p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'u', 'td', 'th', 'summary'];
    out.push(`${sel([inBot(''), ...blocks.map(inBot)])} {\n  color: ${p.text} !important;\n}`);
    out.push(`${sel([inUser(''), ...blocks.map(inUser)])} {\n  color: ${p.userText} !important;\n}`);
    out.push(`${sel([inBot('em'), inBot('i'), inBot('em *'), inBot('i *'), inBot('q em'), inBot('q i')])} {\n  color: ${p.em} !important;\n}`);
    out.push(`${sel([inUser('em'), inUser('i'), inUser('em *'), inUser('i *'), inUser('q em'), inUser('q i')])} {\n  color: ${p.userEm} !important;\n}`);
    out.push(`${sel([inBot('q'), inBot('q *')])} {\n  color: ${p.quote} !important;\n}`);
    out.push(`${sel([inUser('q'), inUser('q *')])} {\n  color: ${p.userText} !important;\n}`);
    out.push(`${sel([inBot('a'), inBot('a *')])} {\n  color: ${p.link} !important;\n}`);
    out.push(`${sel([inUser('a'), inUser('a *')])} {\n  color: ${p.userText} !important;\n  text-decoration: underline !important;\n}`);
    out.push(`${sel(['#chat .mes .mes_text blockquote', '#chat .mes .mes_text pre', '#chat .mes .mes_text code'])} {\n  background-color: ${p.codeBg} !important;\n  border-color: ${p.border} !important;\n}`);
    out.push(`${sel(['#chat .mes .mes_text blockquote'])} {\n  border-left-color: ${p.quote} !important;\n}`);
    out.push(`${sel(['#chat .mes .mes_text hr'])} {\n  border-color: ${p.border} !important;\n}`);

    // Barre d'envoi (couleurs UNIQUEMENT : ni position, ni transform, ni filter, ni hauteur)
    out.push(`${sel(['#form_sheld', '#send_form', '#nonQRFormItems', '#qr--bar', '#qr--bar .qr--buttons'])} {\n  background-color: ${p.bg} !important;\n  border-color: ${p.border} !important;\n  color: ${p.text} !important;\n}`);
    out.push(`${sel(['#send_textarea'])} {\n  background-color: ${p.input} !important;\n  color: ${p.text} !important;\n  caret-color: ${p.user} !important;\n  border-color: ${p.border} !important;\n  -webkit-text-fill-color: ${p.text} !important;\n}`);
    out.push(`${sel(['#send_textarea'], '::placeholder')} {\n  color: ${p.em} !important;\n  -webkit-text-fill-color: ${p.em} !important;\n  opacity: 1 !important;\n}`);
    out.push(`${sel(['#leftSendForm', '#rightSendForm', '#leftSendForm > *', '#rightSendForm > *', '#options_button', '#send_but', '#mes_continue', '#mes_impersonate', '#extensionsMenuButton', '#rightSendForm .interactable'])} {\n  color: ${p.text} !important;\n}`);

    // Barre du haut, tiroirs, panneaux, menus, popups
    out.push(`${sel(['#top-bar', '#top-settings-holder'])} {\n  background-color: ${p.panel} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n}`);
    out.push(`${sel(['#top-settings-holder .drawer-icon', '#top-bar .drawer-icon', '.drawer-icon', '#top-settings-holder .drawer-toggle'])} {\n  color: ${p.text} !important;\n}`);
    out.push(`${sel(['.drawer-content', '.options-content', '.list-group', '#extensionsMenu', '#options', '.popup', '.popup-content', '.popup-body', '.dialogue_popup', '.ui-widget-content', '.ui-menu', '.select2-dropdown', '.select2-container--default .select2-results__options', '#character_popup', '.shadow_popup', '.wi-card-entry', '.inline-drawer-content'])} {\n  background-color: ${p.panel} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n}`);
    out.push(`${sel(['.popup', '.drawer-content', '.options-content', '.list-group'])} {\n  box-shadow: 0 0 14px ${p.shadow} !important;\n}`);
    const txt = ['label', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'b', 'strong', 'summary', 'li', 'td', 'th', 'small:not(.opacity50)', '.title_restorable', '.inline-drawer-header b'];
    out.push(`${sel(['.drawer-content', '.popup', '.options-content', '.list-group'].flatMap((c) => txt.map((t) => `${c} ${t}`)))} {\n  color: ${p.text} !important;\n}`);
    out.push(`${sel(['.drawer-content a:not(.menu_button)', '.popup a:not(.menu_button)', '.options-content a'])} {\n  color: ${p.link} !important;\n}`);
    out.push(`${sel(['.list-group-item:hover', '.options-content a:hover', '.options-content .list-group-item:hover'])} {\n  background-color: ${p.input} !important;\n}`);

    // Champs et boutons
    const fields = ['.text_pole', 'textarea:not(#send_textarea)', 'select', 'input[type="text"]', 'input[type="search"]', 'input[type="number"]', 'input[type="password"]', 'input[type="time"]', 'input[type="url"]', 'input[type="email"]', '.select2-selection', '.select2-search__field', '.select2-selection__rendered'];
    out.push(`${sel(fields)} {\n  background-color: ${p.input} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n  -webkit-text-fill-color: ${p.text} !important;\n}`);
    out.push(`${sel(['.text_pole', 'textarea:not(#send_textarea)', 'input[type="text"]', 'input[type="search"]'], '::placeholder')} {\n  color: ${p.em} !important;\n  opacity: 1 !important;\n}`);
    out.push(`${sel(['.menu_button', '.menu_button.interactable', 'button.menu_button'])} {\n  background-color: ${p.input} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n}`);
    out.push(`${sel(['hr', '.inline-drawer-header', '.inline-drawer-toggle'])} {\n  border-color: ${p.border} !important;\n}`);

    // Barres de défilement
    out.push(`${H} * {\n  scrollbar-color: ${p.scroll} transparent;\n}`);
    out.push(`${H} ::-webkit-scrollbar-thumb,\n${H} ::-webkit-scrollbar-thumb:vertical {\n  background-color: ${p.scroll} !important;\n}`);
    out.push(`${H} ::-webkit-scrollbar-track,\n${H} ::-webkit-scrollbar-corner {\n  background: transparent !important;\n}`);
    out.push(`${H} ::selection {\n  background: ${rgba(p.user, 0.35)} !important;\n}`);
    return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Application au document
// ---------------------------------------------------------------------------------------------------------------
const root = () => document.documentElement;
let applying = false;
let lastApplied = null;          // { mode, bg, scheme }
let origThemeColor = null;       // contenu d'origine de <meta name="theme-color"> (avant forçage)
let origAldMode;                 // data-ald-mode d'origine (undefined = pas mesuré)
let headObserver = null;
let rootObserver = null;
let metaObserver = null;
let lastReappend = 0;
let reappendTimer = null;
let reappendBurst = 0;
let burstStart = 0;

const aldDetected = () => !!document.getElementById('ald_style') || !!(extension_settings && extension_settings.autolightdark);

function getMeta(create) {
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m && create) { m = document.createElement('meta'); m.name = 'theme-color'; (document.head || root()).appendChild(m); }
    return m;
}
function getStatusMeta(create) {
    let m = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!m && create) { m = document.createElement('meta'); m.name = 'apple-mobile-web-app-status-bar-style'; (document.head || root()).appendChild(m); }
    return m;
}
let origStatus = null;

function ensureStyleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) { el = document.createElement('style'); el.id = STYLE_ID; }
    if (document.head && document.head.lastElementChild !== el) document.head.appendChild(el);
    return el;
}

function setInlineVars(p) {
    // Utile seulement face à autolightdark, qui pose ses variables en style inline !important (plus fort qu'une feuille de style).
    const st = root().style;
    const v = {
        '--SmartThemeBodyColor': p.text, '--SmartThemeEmColor': p.em, '--SmartThemeBlurTintColor': p.panel,
        '--SmartThemeChatTintColor': p.bg, '--SmartThemeUserMesBlurTintColor': p.user, '--SmartThemeBotMesBlurTintColor': p.bot,
        '--SmartThemeBorderColor': p.border, '--SmartThemeShadowColor': p.shadow, '--SmartThemeQuoteColor': p.quote,
        '--SmartThemeUnderlineColor': p.text,
    };
    for (const [k, val] of Object.entries(v)) { if (st.getPropertyValue(k) !== val || st.getPropertyPriority(k) !== 'important') st.setProperty(k, val, 'important'); }
    st.setProperty('color-scheme', p.scheme, 'important');
}
function clearInlineVars() {
    const st = root().style;
    ['--SmartThemeBodyColor', '--SmartThemeEmColor', '--SmartThemeBlurTintColor', '--SmartThemeChatTintColor',
        '--SmartThemeUserMesBlurTintColor', '--SmartThemeBotMesBlurTintColor', '--SmartThemeBorderColor',
        '--SmartThemeShadowColor', '--SmartThemeQuoteColor', '--SmartThemeUnderlineColor', 'color-scheme'].forEach((k) => st.removeProperty(k));
}

let inlineSet = false;
function apply(opts = {}) {
    if (!S || typeof document === 'undefined' || !root()) return;
    applying = true;
    try {
        const eff = effectiveMode();
        const r = root();
        if (!eff) { // Désactivé : on rend la main au thème
            document.getElementById(STYLE_ID)?.remove();
            r.classList.remove('fld-active', 'fld-light', 'fld-dark');
            r.removeAttribute('data-fld-mode');
            r.setAttribute('data-fld-setting', S.mode);
            if (inlineSet) { clearInlineVars(); inlineSet = false; }
            const ald = document.getElementById('ald_style'); if (ald) ald.disabled = false;
            if (origAldMode !== undefined) {
                if (origAldMode === null) r.removeAttribute('data-ald-mode'); else r.setAttribute('data-ald-mode', origAldMode);
                origAldMode = undefined;
                document.dispatchEvent(new Event('visibilitychange')); // autolightdark se recalcule
            }
            if (origThemeColor !== null) { const m = getMeta(false); if (m && origThemeColor !== undefined) m.setAttribute('content', origThemeColor); origThemeColor = null; }
            if (origStatus !== null) { const m = getStatusMeta(false); if (m) { if (origStatus === '') m.remove(); else m.setAttribute('content', origStatus); } origStatus = null; }
            lastApplied = null;
            stopObservers();
            return;
        }
        const p = buildPalette(eff, S.colors[eff]);
        if (opts.fade && S.transition) {
            r.classList.add('fld-fade');
            clearTimeout(apply._t); apply._t = setTimeout(() => root().classList.remove('fld-fade'), 600);
        }
        // CSS (en dernier dans <head>)
        const el = ensureStyleEl();
        const css = buildCss(p, S);
        if (el.textContent !== css) el.textContent = css;
        // Classes / attributs pour le CSS de l'utilisateur
        r.classList.add('fld-active');
        r.classList.toggle('fld-light', eff === 'light');
        r.classList.toggle('fld-dark', eff === 'dark');
        if (r.getAttribute('data-fld-mode') !== eff) r.setAttribute('data-fld-mode', eff);
        if (r.getAttribute('data-fld-setting') !== S.mode) r.setAttribute('data-fld-setting', S.mode);
        // Compatibilité autolightdark : on réécrit html[data-ald-mode] avec NOTRE mode, on neutralise son <style>
        const ald = document.getElementById('ald_style');
        const hasAld = !!ald || r.hasAttribute('data-ald-mode') || aldDetected();
        if (ald) ald.disabled = true;
        if (hasAld) {
            if (origAldMode === undefined) origAldMode = r.getAttribute('data-ald-mode');
            if (r.getAttribute('data-ald-mode') !== eff) r.setAttribute('data-ald-mode', eff);
            setInlineVars(p); inlineSet = true;
        } else if (inlineSet) { clearInlineVars(); inlineSet = false; }
        // theme-color + barre d'état
        if (S.themeColorMeta) {
            const m = getMeta(true);
            if (origThemeColor === null) origThemeColor = m.hasAttribute('content') ? m.getAttribute('content') : undefined;
            if (m.getAttribute('content') !== p.bg) m.setAttribute('content', p.bg);
            const sm = getStatusMeta(true);
            if (origStatus === null) origStatus = sm.hasAttribute('content') ? sm.getAttribute('content') : '';
            const sv = eff === 'dark' ? 'black' : 'default';
            if (sm.getAttribute('content') !== sv) sm.setAttribute('content', sv);
        } else if (origThemeColor !== null) {
            const m = getMeta(false); if (m && origThemeColor !== undefined) m.setAttribute('content', origThemeColor); origThemeColor = null;
        }
        lastApplied = { mode: eff, bg: p.bg, scheme: p.scheme };
        startObservers();
    } catch (e) {
        console.warn(LOG, 'apply()', e);
    } finally {
        applying = false;
        refreshUi();
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Observateurs : rester dernier dans <head>, ré-affirmer attributs / meta (autres scripts, autolightdark, thème ST)
// ---------------------------------------------------------------------------------------------------------------
function reappend() {
    reappendTimer = null;
    const el = document.getElementById(STYLE_ID);
    if (!el || document.head.lastElementChild === el) return;
    const now = Date.now();
    if (now - burstStart > 3000) { burstStart = now; reappendBurst = 0; }
    if (++reappendBurst > 6) { // un autre script se bat pour la dernière place : on abandonne 60 s (la spécificité renforcée suffit déjà)
        reappendTimer = setTimeout(() => { reappendBurst = 0; burstStart = Date.now(); reappend(); }, 60000);
        return;
    }
    lastReappend = now;
    applying = true; document.head.appendChild(el); applying = false;
}
function onHeadMutation() {
    if (!lastApplied) return;
    const el = document.getElementById(STYLE_ID);
    if (!el) { apply(); return; }
    if (document.getElementById('ald_style') && !document.getElementById('ald_style').disabled) apply();
    if (document.head.lastElementChild === el) return;
    const wait = 150 - (Date.now() - lastReappend);
    if (wait <= 0) reappend(); else if (!reappendTimer) reappendTimer = setTimeout(reappend, wait);
}
function onRootMutation() {
    if (applying || !lastApplied) return;
    const r = root();
    if (r.getAttribute('data-fld-mode') !== lastApplied.mode || !r.classList.contains('fld-active')
        || (r.hasAttribute('data-ald-mode') && r.getAttribute('data-ald-mode') !== lastApplied.mode)
        || (inlineSet && r.style.getPropertyValue('--SmartThemeBodyColor') !== buildPalette(lastApplied.mode, S.colors[lastApplied.mode]).text)) {
        apply();
    }
}
function onMetaMutation() {
    if (applying || !lastApplied || !S.themeColorMeta) return;
    const m = getMeta(false);
    if (m && m.getAttribute('content') !== lastApplied.bg) { applying = true; m.setAttribute('content', lastApplied.bg); applying = false; }
}
function startObservers() {
    if (typeof MutationObserver === 'undefined') return;
    if (!headObserver && document.head) { headObserver = new MutationObserver(onHeadMutation); headObserver.observe(document.head, { childList: true }); }
    if (!rootObserver) { rootObserver = new MutationObserver(onRootMutation); rootObserver.observe(root(), { attributes: true, attributeFilter: ['data-fld-mode', 'data-ald-mode', 'class', 'style'] }); }
    if (!metaObserver) {
        const m = getMeta(false);
        if (m) { metaObserver = new MutationObserver(onMetaMutation); metaObserver.observe(m, { attributes: true, attributeFilter: ['content'] }); }
    }
}
function stopObservers() {
    headObserver?.disconnect(); rootObserver?.disconnect(); metaObserver?.disconnect();
    headObserver = rootObserver = metaObserver = null;
    clearTimeout(reappendTimer); reappendTimer = null;
}

// ---------------------------------------------------------------------------------------------------------------
// Changement de mode (bouton rapide, entrée du menu, panneau)
// ---------------------------------------------------------------------------------------------------------------
function setMode(mode, { notify = false } = {}) {
    if (!MODES.includes(mode)) return;
    S.mode = mode;
    save();
    apply({ fade: true });
    if (notify) toast();
}
function cycleMode() {
    setMode(MODES[(MODES.indexOf(S.mode) + 1) % MODES.length], { notify: true });
}
function describe() {
    const eff = effectiveMode();
    if (S.mode === 'auto') return `${MODE_ICON.auto} Auto → ${eff === 'dark' ? 'Sombre' : 'Clair'}${S.autoSource === 'schedule' ? ' (horaire)' : ' (système)'}`;
    return `${MODE_ICON[S.mode]} ${MODE_LABEL[S.mode]}`;
}
function toast() {
    if (!S.toast) return;
    try { if (window.toastr) { window.toastr.clear(); window.toastr.info(describe(), 'Force Light Dark', { timeOut: 1400, preventDuplicates: false }); } } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------------------------
// Bouton flottant + entrée du menu baguette
// ---------------------------------------------------------------------------------------------------------------
function placeFab() {
    let fab = document.getElementById('fld_fab');
    if (!S.fabShow) { fab?.remove(); return; }
    if (!fab) {
        fab = document.createElement('div');
        fab.id = 'fld_fab'; fab.className = 'fld-fab'; fab.setAttribute('role', 'button'); fab.setAttribute('tabindex', '0');
        fab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cycleMode(); });
        fab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleMode(); } });
        document.body.appendChild(fab);
    }
    const sz = S.fabSize;
    fab.style.setProperty('--fld-fab-size', `${sz}px`);
    fab.style.left = `calc((100vw - ${sz}px) * ${S.fabX / 100})`;
    fab.style.top = `calc((100vh - ${sz}px) * ${S.fabY / 100})`;
    fab.style.setProperty('top', `calc((100dvh - ${sz}px) * ${S.fabY / 100})`);
    fab.textContent = MODE_ICON[S.mode];
    fab.title = `Force Light Dark : ${describe()} (toucher pour changer)`;
    fab.setAttribute('aria-label', fab.title);
    fab.dataset.mode = S.mode;
}
function placeWandEntry() {
    let item = document.getElementById('fld_wand_button');
    if (!S.wandEntry) { item?.remove(); return; }
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (!item) {
        item = document.createElement('div');
        item.id = 'fld_wand_button';
        item.className = 'list-group-item flex-container flexGap5';
        item.innerHTML = '<div class="extensionsMenuExtensionButton fld-wand-icon"></div><span class="fld-wand-label"></span>';
        item.addEventListener('click', () => cycleMode());
        menu.appendChild(item);
    }
    item.querySelector('.fld-wand-icon').textContent = MODE_ICON[S.mode];
    item.querySelector('.fld-wand-label').textContent = `Force Light Dark : ${MODE_LABEL[S.mode]}`;
    return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Panneau de réglages
// ---------------------------------------------------------------------------------------------------------------
const $id = (id) => document.getElementById(id);

function panelHtml() {
    const opt = (v, t) => `<option value="${v}">${t}</option>`;
    const colorRows = (m) => COLOR_KEYS.map((k) => `<label class="fld-row" for="fld_c_${m}_${k}"><span>${COLOR_LABEL[k]}</span><input type="color" id="fld_c_${m}_${k}" data-mode="${m}" data-key="${k}"></label>`).join('');
    const preview = (m) => `<div class="fld-prev" id="fld_prev_${m}"><div class="fld-prev-bot">Salut ! <em>*sourit*</em> <q>« Comment ça va ? »</q></div><div class="fld-prev-user">Très bien, merci 🙂</div></div>`;
    return `<div id="fld_settings" class="fld-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>Force Light Dark</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div id="fld_status" class="fld-status"></div>
      <label for="fld_mode">Mode</label>
      <select id="fld_mode" class="text_pole">${opt('off', '○ Désactivé (aucun changement)')}${opt('light', '☀️ Forcer Clair')}${opt('dark', '🌙 Forcer Sombre')}${opt('auto', '🌗 Auto (suit le système)')}</select>
      <div id="fld_quick" class="fld-quick">
        <div id="fld_cycle" class="menu_button">Changer de mode</div>
      </div>
      <label for="fld_intensity">Intensité du forçage</label>
      <select id="fld_intensity" class="text_pole">${opt('total', 'Total (écrase aussi le CSS du thème)')}${opt('soft', 'Doux (variables ST seulement)')}</select>
      <div id="fld_autobox">
        <label for="fld_autosrc">Source du mode Auto</label>
        <select id="fld_autosrc" class="text_pole">${opt('system', 'Système (iOS : clair / sombre, en direct)')}${opt('schedule', 'Horaire')}</select>
        <div id="fld_schedbox" class="fld-sched">
          <label class="fld-row" for="fld_lightfrom"><span>☀️ Clair à partir de</span><input type="time" id="fld_lightfrom" class="text_pole"></label>
          <label class="fld-row" for="fld_darkfrom"><span>🌙 Sombre à partir de</span><input type="time" id="fld_darkfrom" class="text_pole"></label>
        </div>
      </div>
      <label class="checkbox_label" for="fld_hidebg"><input type="checkbox" id="fld_hidebg"><span>Masquer l'image de fond (mode Total)</span></label>
      <label class="checkbox_label" for="fld_transition"><input type="checkbox" id="fld_transition"><span>Transition en fondu entre les modes</span></label>
      <label class="checkbox_label" for="fld_meta"><input type="checkbox" id="fld_meta"><span>Mettre à jour theme-color / barre d'état</span></label>
      <label class="checkbox_label" for="fld_toast"><input type="checkbox" id="fld_toast"><span>Notification au changement rapide</span></label>
      <label for="fld_paint">Élément portant le fond des bulles</label>
      <select id="fld_paint" class="text_pole">${opt('mes_text', '.mes_text (thème type iMessage)')}${opt('mes_block', '.mes_block')}${opt('mes', '.mes (thème ST classique)')}${opt('auto', 'Détection automatique')}${opt('none', 'Ne pas peindre les bulles')}</select>
      <hr>
      <b>Bouton rapide</b>
      <label class="checkbox_label" for="fld_wand"><input type="checkbox" id="fld_wand"><span>Entrée dans le menu baguette ✨ (☀️/🌙)</span></label>
      <label class="checkbox_label" for="fld_fabshow"><input type="checkbox" id="fld_fabshow"><span>Bouton flottant</span></label>
      <div id="fld_fabbox">
        <label class="fld-row" for="fld_fabx"><span>Position horizontale</span><input type="range" id="fld_fabx" min="0" max="100" step="1"></label>
        <label class="fld-row" for="fld_faby"><span>Position verticale</span><input type="range" id="fld_faby" min="0" max="100" step="1"></label>
        <label class="fld-row" for="fld_fabsize"><span>Taille</span><input type="range" id="fld_fabsize" min="32" max="72" step="2"></label>
      </div>
      <hr>
      <b>Couleurs — Clair</b>
      ${preview('light')}
      <div class="fld-colors">${colorRows('light')}</div>
      <div id="fld_reset_light" class="menu_button">Couleurs Clair par défaut</div>
      <b>Couleurs — Sombre</b>
      ${preview('dark')}
      <div class="fld-colors">${colorRows('dark')}</div>
      <div id="fld_reset_dark" class="menu_button">Couleurs Sombre par défaut</div>
      <hr>
      <div id="fld_reset" class="menu_button">Tout réinitialiser</div>
      <small class="opacity50">Pour votre CSS : <code>html[data-fld-mode="light"]</code>, <code>html.fld-dark</code>… (et <code>html[data-ald-mode]</code> est aligné). Si <i>autolightdark</i> est aussi installé, Force Light Dark prend le dessus tant qu'il n'est pas « Désactivé ».</small>
    </div>
  </div>
</div>`;
}

function refreshUi() {
    if (!$id('fld_settings')) return;
    const set = (id, v) => { const e = $id(id); if (e && e.value !== String(v)) e.value = v; };
    const chk = (id, v) => { const e = $id(id); if (e) e.checked = !!v; };
    set('fld_mode', S.mode); set('fld_intensity', S.intensity); set('fld_autosrc', S.autoSource);
    set('fld_lightfrom', S.lightFrom); set('fld_darkfrom', S.darkFrom); set('fld_paint', S.paint);
    chk('fld_hidebg', S.hideBg); chk('fld_transition', S.transition); chk('fld_meta', S.themeColorMeta);
    chk('fld_toast', S.toast); chk('fld_wand', S.wandEntry); chk('fld_fabshow', S.fabShow);
    set('fld_fabx', S.fabX); set('fld_faby', S.fabY); set('fld_fabsize', S.fabSize);
    $id('fld_autobox').style.display = S.mode === 'auto' ? '' : 'none';
    $id('fld_schedbox').style.display = S.autoSource === 'schedule' ? '' : 'none';
    $id('fld_fabbox').style.display = S.fabShow ? '' : 'none';
    for (const m of ['light', 'dark']) {
        const p = buildPalette(m, S.colors[m]);
        for (const k of COLOR_KEYS) { const e = $id(`fld_c_${m}_${k}`); if (e && e.value !== S.colors[m][k]) e.value = S.colors[m][k]; }
        const pv = $id(`fld_prev_${m}`);
        if (pv) {
            pv.style.setProperty('--p-bg', p.bg); pv.style.setProperty('--p-bot', p.bot); pv.style.setProperty('--p-user', p.user);
            pv.style.setProperty('--p-text', p.text); pv.style.setProperty('--p-usertext', p.userText); pv.style.setProperty('--p-em', p.em);
            pv.style.setProperty('--p-border', p.border);
        }
    }
    const eff = effectiveMode();
    let st = `Mode actif : <b>${describe()}</b>`;
    if (eff && aldDetected()) st += '<br><span class="opacity50">autolightdark détecté : Force Light Dark est prioritaire (son style est neutralisé).</span>';
    if (!eff) st += '<br><span class="opacity50">Aucun changement n\'est appliqué au thème.</span>';
    $id('fld_status').innerHTML = st;
    placeFab(); placeWandEntry();
}

function bindUi() {
    const on = (id, ev, fn) => $id(id)?.addEventListener(ev, fn);
    const upd = (fn, fade) => () => { fn(); save(); apply({ fade }); };
    on('fld_mode', 'change', (e) => setMode(e.target.value));
    on('fld_cycle', 'click', () => cycleMode());
    on('fld_intensity', 'change', upd(() => { S.intensity = $id('fld_intensity').value; }));
    on('fld_autosrc', 'change', upd(() => { S.autoSource = $id('fld_autosrc').value; }, true));
    on('fld_lightfrom', 'change', upd(() => { S.lightFrom = $id('fld_lightfrom').value || DEFAULTS.lightFrom; sanitize(S); }, true));
    on('fld_darkfrom', 'change', upd(() => { S.darkFrom = $id('fld_darkfrom').value || DEFAULTS.darkFrom; sanitize(S); }, true));
    on('fld_paint', 'change', upd(() => { S.paint = $id('fld_paint').value; }));
    on('fld_hidebg', 'change', upd(() => { S.hideBg = $id('fld_hidebg').checked; }));
    on('fld_transition', 'change', upd(() => { S.transition = $id('fld_transition').checked; }));
    on('fld_meta', 'change', upd(() => { S.themeColorMeta = $id('fld_meta').checked; }));
    on('fld_toast', 'change', upd(() => { S.toast = $id('fld_toast').checked; }));
    on('fld_wand', 'change', upd(() => { S.wandEntry = $id('fld_wand').checked; }));
    on('fld_fabshow', 'change', upd(() => { S.fabShow = $id('fld_fabshow').checked; }));
    for (const [id, key] of [['fld_fabx', 'fabX'], ['fld_faby', 'fabY'], ['fld_fabsize', 'fabSize']]) {
        on(id, 'input', upd(() => { S[key] = Number($id(id).value); sanitize(S); }));
    }
    document.querySelectorAll('#fld_settings input[type="color"]').forEach((e) => {
        e.addEventListener('input', () => { S.colors[e.dataset.mode][e.dataset.key] = e.value.toLowerCase(); save(); apply(); });
    });
    for (const m of ['light', 'dark']) {
        on(`fld_reset_${m}`, 'click', () => { S.colors[m] = { ...DEFAULT_COLORS[m] }; save(); apply(); });
    }
    on('fld_reset', 'click', () => {
        if (!confirm('Réinitialiser tous les réglages de Force Light Dark ?')) return;
        const fresh = sanitize(JSON.parse(JSON.stringify(DEFAULTS)));
        for (const k of Object.keys(S)) delete S[k];
        Object.assign(S, fresh);
        save(); apply({ fade: true });
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------------------------------------------
let timer = null;
function scheduleTick() {
    clearInterval(timer); timer = null;
    timer = setInterval(() => { if (S.mode === 'auto' && S.autoSource === 'schedule') apply({ fade: true }); }, 20000);
}
function onSystemChange() { if (S.mode === 'auto' && S.autoSource === 'system') apply({ fade: true }); }
function revisit() { if (S.mode === 'auto') apply(); }

// 1) le plus tôt possible : cache localStorage / extension_settings, de façon synchrone
try {
    loadSettings();
    apply();
} catch (e) { console.warn(LOG, 'init précoce', e); }

// écouteurs globaux (immédiats)
try { mq.addEventListener ? mq.addEventListener('change', onSystemChange) : mq.addListener(onSystemChange); } catch { /* ignore */ }
document.addEventListener('visibilitychange', revisit);
window.addEventListener('pageshow', revisit);
window.addEventListener('focus', revisit);
scheduleTick();

function waitFor(fn, tries = 60, every = 250) {
    let n = 0;
    const t = setInterval(() => { n++; if (fn() === true || n >= tries) clearInterval(t); }, every);
}

jQuery(async () => {
    try {
        loadSettings(); // extension_settings est maintenant chargé (vérité)
        apply();
        const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (host) {
            host.insertAdjacentHTML('beforeend', panelHtml());
            bindUi();
            refreshUi();
        }
        waitFor(() => (S.wandEntry ? placeWandEntry() === true : true));
        try {
            eventSource.on(event_types.SETTINGS_UPDATED, () => { loadSettings(); apply(); });
            eventSource.on(event_types.CHAT_CHANGED, () => { if (S.paint === 'auto') apply(); });
        } catch { /* événements indisponibles */ }
        // rattrapage : d'autres extensions / le thème peuvent injecter leur CSS après nous
        setTimeout(() => apply(), 1500);
        setTimeout(() => apply(), 4000);
        console.log(LOG, 'chargé —', describe());
    } catch (e) {
        console.error(LOG, 'initialisation', e);
    }
});

// petite API pour tests / CSS / autres extensions
window.ForceLightDark = Object.freeze({
    getMode: () => S.mode,
    getEffective: () => effectiveMode(),
    setMode: (m) => setMode(m),
    cycle: () => cycleMode(),
    reapply: () => apply(),
});

export const __test = { buildPalette, buildCss, sanitize, scheduleMode };
