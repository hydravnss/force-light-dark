/**
 * Force Light Dark — extension SillyTavern (v1.2.0)
 *
 * ☀️ Ne fait QUE forcer le mode CLAIR par-dessus le thème. Le mode sombre, c'est VOTRE thème, tel quel.
 *
 * ⛔ SOMBRE = AUCUNE MODIFICATION (depuis la 1.2.0) : en « Forcer Sombre », en « Désactivé » et en « Auto » quand le système
 * est sombre, l'extension ne pose AUCUN <style>, AUCUNE variable, AUCUN fond (ni page, ni barre du haut, ni barre d'envoi,
 * ni tiroirs), AUCUN color-scheme. Votre thème (ex. « iMessage Dark », noir OLED) reste exactement comme il est. Le seul
 * geste possible (réglage « theme-color », activé par défaut) : la <meta name="theme-color"> prend la couleur de fond RÉELLE
 * de la page, lue dans le DOM (getComputedStyle), jamais une valeur codée en dur.
 *
 * ⛔ LES BULLES DE CHAT NE SONT JAMAIS TOUCHÉES (depuis la 1.1.0) : aucune règle sur `.mes`, `.mes_block`, `.mes_text`
 * (fond, couleur, bordure), ni sur em / i / q / strong / a dans les messages. En Clair, les variables --SmartTheme* ne sont
 * posées que sur les conteneurs HORS #chat (`body > :not(#sheld)` et `#sheld > :not(#chat)`), jamais sur :root.
 *
 * Mécanisme (mode Clair seulement) :
 *  - <style id="fld-style"> DERNIER dans <head> (MutationObserver + garde-fou anti-boucle), RETIRÉ dès qu'on quitte le Clair
 *    (le retour au sombre est donc exact) ;
 *  - sélecteurs préfixés par `html.fld-active[data-fld-mode="light"]:not(#fld_x):not(#fld_y)` (spécificité renforcée) ;
 *  - color-scheme, <meta name="theme-color">, classe + attributs sur <html> pour votre propre CSS ;
 *  - AUCUN transform / filter / position posé : la barre d'envoi fixe n'est pas touchée (couleurs seulement).
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
const SCHEMA = 3;
const MODES = ['off', 'light', 'dark', 'auto'];
const MODE_LABEL = { off: 'Désactivé', light: 'Forcer Clair', dark: 'Forcer Sombre', auto: 'Auto' };
const MODE_ICON = { off: '○', light: '☀️', dark: '🌙', auto: '🌗' };
const COLOR_KEYS = ['bg', 'panel', 'text', 'em'];
const COLOR_LABEL = { bg: 'Fond de page / champs', panel: 'Barre du haut, barre d\'envoi, panneaux', text: 'Texte (interface)', em: 'Texte atténué (placeholder…)' };

// Couleurs réglables du mode CLAIR uniquement. Il n'existe AUCUNE couleur sombre : le sombre, c'est votre thème tel quel.
const DEFAULT_COLORS = Object.freeze({
    light: Object.freeze({ bg: '#ffffff', panel: '#f2f2f7', text: '#000000', em: '#6e6e73' }),
});

const DEFAULTS = Object.freeze({
    schema: SCHEMA,
    mode: 'off',            // off | light | dark | auto
    intensity: 'total',     // total | soft
    autoSource: 'system',   // system | schedule
    lightFrom: '07:00',
    darkFrom: '20:00',
    transition: false,
    hideBg: true,           // masque l'image de fond de SillyTavern quand on force (mode Total)
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

/** Palette du mode CLAIR (seul mode qui applique quelque chose). Renvoie null pour tout autre mode. Aucune couleur de bulle. */
export function buildPalette(mode, c) {
    if (mode !== 'light') return null;
    const input = mix(c.panel, '#000000', 0.03);
    return {
        mode, scheme: 'light',
        bg: c.bg, panel: c.panel, text: c.text, em: c.em,
        accent: '#0a84ff',
        field: c.bg, input,
        border: 'rgba(0, 0, 0, 0.16)',
        shadow: 'rgba(0, 0, 0, 0.18)',
        quote: '#0a58b5',
        link: '#0a6cff',
        scroll: 'rgba(0, 0, 0, 0.28)',
        rgb: hexToRgb(c.text),
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------------------------------------------
/**
 * Normalise les réglages ET migre les anciennes versions : (≤ 1.0.x) clés de bulles supprimées ; (≤ 1.1.x) TOUTES les couleurs
 * sombres (colors.dark) supprimées, fond / texte / em Clair conservés. Renvoie un NOUVEL objet (clés inconnues retirées).
 */
function sanitize(src) {
    const d = DEFAULTS;
    const o = (src && typeof src === 'object') ? src : {};
    const s = {};
    s.schema = SCHEMA;
    s.mode = MODES.includes(o.mode) ? o.mode : d.mode;
    s.intensity = ['total', 'soft'].includes(o.intensity) ? o.intensity : d.intensity;
    s.autoSource = ['system', 'schedule'].includes(o.autoSource) ? o.autoSource : d.autoSource;
    for (const k of ['lightFrom', 'darkFrom']) s[k] = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(o[k])) ? String(o[k]) : d[k];
    for (const k of ['transition', 'hideBg', 'themeColorMeta', 'wandEntry', 'toast', 'fabShow']) s[k] = typeof o[k] === 'boolean' ? o[k] : d[k];
    const num = (v, lo, hi, def) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def; };
    s.fabX = num(o.fabX, 0, 100, d.fabX); s.fabY = num(o.fabY, 0, 100, d.fabY); s.fabSize = num(o.fabSize, 32, 72, d.fabSize);
    const oc = (o.colors && typeof o.colors === 'object') ? o.colors : {};
    s.colors = {};
    {
        const cur = (oc.light && typeof oc.light === 'object') ? oc.light : {};
        s.colors.light = {};
        for (const k of COLOR_KEYS) s.colors.light[k] = HEX_RE.test(String(cur[k])) ? String(cur[k]).toLowerCase() : DEFAULT_COLORS.light[k];
    }
    return s;
}

let S = null;
let migrated = false; // des réglages ≤ 1.0.x ont été nettoyés et restent à enregistrer
function readCache() {
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(S)); } catch { /* stockage indisponible */ }
}
/** Charge les réglages : extension_settings (vérité) sinon cache localStorage sinon défauts. */
function loadSettings(persistMigration = false) {
    let src = null;
    try { src = extension_settings && extension_settings[NAME]; } catch { /* ignore */ }
    if (!src || typeof src !== 'object') src = readCache() || {};
    const old = src.schema !== SCHEMA || 'paint' in src || (src.colors && ('dark' in src.colors || Object.values(src.colors).some((c) => c && ('bot' in c || 'user' in c || 'userText' in c))));
    S = sanitize(src);
    try { if (extension_settings) extension_settings[NAME] = S; } catch { /* ignore */ }
    if (old) { migrated = true; writeCache(); } // ancienne version : le cache est réécrit sans réglages de bulles ni couleurs sombres
    if (migrated && persistMigration) { migrated = false; save(); } // et la version nettoyée est enregistrée côté serveur (une fois ST chargé)
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

/**
 * Conteneurs HORS #chat qui reçoivent les variables --SmartTheme* et color-scheme :
 *  - les enfants directs de <body> sauf #sheld (barre du haut, tiroirs, popups, menus, toasts…) ;
 *  - les enfants de #sheld sauf #chat (en-tête, barre d'envoi…).
 * Rien n'est posé sur :root / <body> / #sheld / #chat : les messages héritent donc EXACTEMENT des valeurs d'origine.
 */
const SCOPES = (H) => [`${H} body > :not(#sheld)`, `${H} #sheld > :not(#chat)`];
const NOCHAT = ':not(#chat *)';

export function buildCss(p, s) {
    if (!p || p.mode !== 'light') return ''; // sombre / désactivé : AUCUN CSS
    const H = `html.fld-active[data-fld-mode="${p.mode}"]${BOOST}`;
    const [tr, tg, tb] = p.rgb;
    const out = [];
    const scopes = SCOPES(H).join(',\n');
    // 1) Variables SillyTavern + color-scheme, uniquement hors #chat (toujours, même en mode Doux)
    out.push(`${scopes} {
  color-scheme: ${p.scheme} !important;
  color: ${p.text} !important;
  --SmartThemeBodyColor: ${p.text} !important;
  --SmartThemeEmColor: ${p.em} !important;
  --SmartThemeUnderlineColor: ${p.text} !important;
  --SmartThemeQuoteColor: ${p.quote} !important;
  --SmartThemeBlurTintColor: ${p.panel} !important;
  --SmartThemeBorderColor: ${p.border} !important;
  --SmartThemeShadowColor: ${p.shadow} !important;
  --SmartThemeFastUIBGColor: ${p.bg} !important;
  --SmartThemeCheckboxBgColorR: ${tr} !important;
  --SmartThemeCheckboxBgColorG: ${tg} !important;
  --SmartThemeCheckboxBgColorB: ${tb} !important;
}`);
    // Variables propres (API pour votre CSS) + color-scheme du document (canevas, barre de défilement racine)
    out.push(`${H} {
  color-scheme: ${p.scheme} !important;
  --fld-bg: ${p.bg}; --fld-panel: ${p.panel}; --fld-input: ${p.input}; --fld-text: ${p.text}; --fld-em: ${p.em};
}`);
    if (s.intensity !== 'total') return out.join('\n');

    // 2) Mode Total : on écrase aussi les règles en dur du thème (JAMAIS les bulles / messages)
    const sel = (list, tail = '') => list.map((x) => `${H} ${x}${tail}`).join(',\n');

    // Page
    out.push(`${H},\n${H} body {\n  background-color: ${p.bg} !important;\n}`);
    out.push(`${H} #preloader {\n  background-color: ${p.bg} !important;\n  color: ${p.text} !important;\n}`);
    if (s.hideBg) out.push(`${sel(['#bg1', '#bg_custom'])} {\n  background-image: none !important;\n  background-color: ${p.bg} !important;\n}`);
    out.push(`${sel(['#sheld', '#chat'])} {\n  background-color: ${s.hideBg ? p.bg : 'transparent'} !important;\n}`);

    // Barre d'envoi (couleurs UNIQUEMENT : ni position, ni transform, ni filter, ni hauteur)
    out.push(`${sel(['#form_sheld', '#send_form', '#nonQRFormItems', '#qr--bar', '#qr--bar .qr--buttons'])} {\n  background-color: ${p.panel} !important;\n  border-color: ${p.border} !important;\n  color: ${p.text} !important;\n}`);
    out.push(`${sel(['#send_textarea'])} {\n  background-color: ${p.field} !important;\n  color: ${p.text} !important;\n  caret-color: ${p.accent} !important;\n  border-color: ${p.border} !important;\n  -webkit-text-fill-color: ${p.text} !important;\n}`);
    out.push(`${sel(['#send_textarea'], '::placeholder')} {\n  color: ${p.em} !important;\n  -webkit-text-fill-color: ${p.em} !important;\n  opacity: 1 !important;\n}`);
    out.push(`${sel(['#leftSendForm', '#rightSendForm', '#leftSendForm > *', '#rightSendForm > *', '#options_button', '#send_but', '#mes_continue', '#mes_impersonate', '#extensionsMenuButton', '#rightSendForm .interactable'])} {\n  color: ${p.text} !important;\n}`);

    // Barre du haut, tiroirs, panneaux, menus, popups
    out.push(`${sel(['#top-bar', '#top-settings-holder'])} {\n  background-color: ${p.panel} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n}`);
    out.push(`${sel(['#top-settings-holder .drawer-icon', '#top-bar .drawer-icon', '.drawer-icon', '#top-settings-holder .drawer-toggle'])} {\n  color: ${p.text} !important;\n}`);
    out.push(`${sel(['.drawer-content', '.options-content', '.list-group', '#extensionsMenu', '#options', '.popup', '.popup-content', '.popup-body', '.dialogue_popup', '.ui-widget-content', '.ui-menu', '.select2-dropdown', '.select2-container--default .select2-results__options', '#character_popup', '.shadow_popup', '.wi-card-entry', '.inline-drawer-content'].map((x) => x + NOCHAT))} {\n  background-color: ${p.panel} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n}`);
    out.push(`${sel(['.popup', '.drawer-content', '.options-content', '.list-group'])} {\n  box-shadow: 0 0 14px ${p.shadow} !important;\n}`);
    const txt = ['label', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'b', 'strong', 'summary', 'li', 'td', 'th', 'small:not(.opacity50)', '.title_restorable', '.inline-drawer-header b'];
    out.push(`${sel(['.drawer-content', '.popup', '.options-content', '.list-group'].flatMap((c) => txt.map((t) => `${c} ${t}`)).map((x) => x + NOCHAT))} {\n  color: ${p.text} !important;\n}`);
    out.push(`${sel(['.drawer-content a:not(.menu_button)', '.popup a:not(.menu_button)', '.options-content a'].map((x) => x + NOCHAT))} {\n  color: ${p.link} !important;\n}`);
    out.push(`${sel(['.list-group-item:hover', '.options-content a:hover', '.options-content .list-group-item:hover'])} {\n  background-color: ${p.input} !important;\n}`);

    // Champs et boutons (hors messages : le textarea d'édition d'un message est dans .mes_text, on n'y touche pas)
    const fields = ['.text_pole', 'textarea:not(#send_textarea)', 'select', 'input[type="text"]', 'input[type="search"]', 'input[type="number"]', 'input[type="password"]', 'input[type="time"]', 'input[type="url"]', 'input[type="email"]', '.select2-selection', '.select2-search__field', '.select2-selection__rendered'].map((x) => x + NOCHAT);
    out.push(`${sel(fields)} {\n  background-color: ${p.input} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n  -webkit-text-fill-color: ${p.text} !important;\n}`);
    out.push(`${sel(['.text_pole', 'textarea:not(#send_textarea)', 'input[type="text"]', 'input[type="search"]'].map((x) => x + NOCHAT), '::placeholder')} {\n  color: ${p.em} !important;\n  opacity: 1 !important;\n}`);
    out.push(`${sel(['.menu_button', '.menu_button.interactable', 'button.menu_button'].map((x) => x + NOCHAT))} {\n  background-color: ${p.input} !important;\n  color: ${p.text} !important;\n  border-color: ${p.border} !important;\n}`);
    out.push(`${sel(['hr', '.inline-drawer-header', '.inline-drawer-toggle'].map((x) => x + NOCHAT))} {\n  border-color: ${p.border} !important;\n}`);

    // Barres de défilement (pas à l'intérieur des messages)
    // scrollbar-color est HÉRITÉ : on l'évite sur html / body / #sheld / #chat pour qu'il n'atteigne jamais les messages
    out.push(`${sel(['*:not(body):not(#sheld):not(#chat)' + NOCHAT])} {\n  scrollbar-color: ${p.scroll} transparent;\n}`);
    out.push(`${sel([NOCHAT + '::-webkit-scrollbar-thumb', NOCHAT + '::-webkit-scrollbar-thumb:vertical'])} {\n  background-color: ${p.scroll} !important;\n}`);
    out.push(`${sel([NOCHAT + '::-webkit-scrollbar-track', NOCHAT + '::-webkit-scrollbar-corner'])} {\n  background: transparent !important;\n}`);
    out.push(`${SCOPES(H).map((x) => `${x} ::selection`).join(',\n')} {\n  background: ${rgba(p.accent, 0.35)} !important;\n}`);
    return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Application au document
// ---------------------------------------------------------------------------------------------------------------
const root = () => document.documentElement;
let applying = false;
let lastApplied = null;          // { mode, bg, scheme } — seulement en Clair (observateurs actifs)
let metaState = null;            // { existed, orig } de <meta name="theme-color"> avant tout geste de l'extension
let statusState = null;          // idem pour apple-mobile-web-app-status-bar-style
let headObserver = null;
let rootObserver = null;
let metaObserver = null;
let lastReappend = 0;
let reappendTimer = null;
let reappendBurst = 0;
let burstStart = 0;

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
function setMetaContent(getter, state, value) {
    let m = getter(false);
    if (!state.v) state.v = { existed: !!m, orig: m && m.hasAttribute('content') ? m.getAttribute('content') : null };
    if (!m) m = getter(true);
    if (m.getAttribute('content') !== value) m.setAttribute('content', value);
}
function restoreMeta(getter, state) {
    const st = state.v; if (!st) return;
    const m = getter(false);
    if (m) { if (!st.existed) m.remove(); else if (st.orig === null) m.removeAttribute('content'); else m.setAttribute('content', st.orig); }
    state.v = null;
}
const themeColorRef = { get v() { return metaState; }, set v(x) { metaState = x; } };
const statusRef = { get v() { return statusState; }, set v(x) { statusState = x; } };

/** Couleur de fond RÉELLE de la page, lue dans le DOM (body, sinon html) ; null si aucune couleur opaque. */
function pageBackground() {
    for (const el of [document.body, root()]) {
        if (!el) continue;
        const m = (getComputedStyle(el).backgroundColor || '').match(/[\d.]+/g);
        if (!m || m.length < 3) continue;
        const [r, g, b] = m.map(Number); const a = m.length > 3 ? Number(m[3]) : 1;
        if (a >= 0.99) return rgbToHex([r, g, b]);
    }
    return null;
}

function ensureStyleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) { el = document.createElement('style'); el.id = STYLE_ID; }
    if (document.head && document.head.lastElementChild !== el) document.head.appendChild(el);
    return el;
}

function apply(opts = {}) {
    if (!S || typeof document === 'undefined' || !root()) return;
    applying = true;
    try {
        const eff = effectiveMode();
        const r = root();
        const wasLight = lastApplied && lastApplied.mode === 'light';
        if (eff !== 'light') {
            // Désactivé OU sombre : on rend la main au thème. Rien n'est posé : ni <style>, ni variables, ni fonds, ni color-scheme.
            stopObservers();
            lastApplied = null;
            document.getElementById(STYLE_ID)?.remove();
            r.classList.remove('fld-active', 'fld-light');
            restoreMeta(getStatusMeta, statusRef);
            if (eff === 'dark') {
                r.classList.add('fld-dark');
                if (r.getAttribute('data-fld-mode') !== 'dark') r.setAttribute('data-fld-mode', 'dark');
                // seul geste (réglage « theme-color », actif par défaut) : couleur de fond RÉELLE de la page, lue dans le DOM
                const bg = S.themeColorMeta ? pageBackground() : null;
                if (bg) setMetaContent(getMeta, themeColorRef, bg); else restoreMeta(getMeta, themeColorRef);
            } else {
                r.classList.remove('fld-dark');
                r.removeAttribute('data-fld-mode');
                restoreMeta(getMeta, themeColorRef);
            }
            r.setAttribute('data-fld-setting', S.mode);
            if (wasLight && opts.fade && S.transition) {
                r.classList.add('fld-fade');
                clearTimeout(apply._t); apply._t = setTimeout(() => root().classList.remove('fld-fade'), 600);
            }
            return;
        }
        const p = buildPalette('light', S.colors.light);
        if (opts.fade && S.transition) {
            r.classList.add('fld-fade');
            clearTimeout(apply._t); apply._t = setTimeout(() => root().classList.remove('fld-fade'), 600);
        }
        // CSS (en dernier dans <head>)
        const el = ensureStyleEl();
        const css = buildCss(p, S);
        if (el.textContent !== css) el.textContent = css;
        // Classes / attributs pour le CSS de l'utilisateur
        r.classList.add('fld-active', 'fld-light');
        r.classList.remove('fld-dark');
        if (r.getAttribute('data-fld-mode') !== 'light') r.setAttribute('data-fld-mode', 'light');
        if (r.getAttribute('data-fld-setting') !== S.mode) r.setAttribute('data-fld-setting', S.mode);
        // theme-color + barre d'état
        if (S.themeColorMeta) {
            setMetaContent(getMeta, themeColorRef, p.bg);
            setMetaContent(getStatusMeta, statusRef, 'default');
        } else { restoreMeta(getMeta, themeColorRef); restoreMeta(getStatusMeta, statusRef); }
        lastApplied = { mode: 'light', bg: p.bg, scheme: p.scheme };
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
    if (document.head.lastElementChild === el) return;
    const wait = 150 - (Date.now() - lastReappend);
    if (wait <= 0) reappend(); else if (!reappendTimer) reappendTimer = setTimeout(reappend, wait);
}
function onRootMutation() {
    if (applying || !lastApplied) return;
    const r = root();
    if (r.getAttribute('data-fld-mode') !== lastApplied.mode || !r.classList.contains('fld-active')) apply();
}
function onMetaMutation() {
    if (applying || !lastApplied || !S.themeColorMeta) return;
    const m = getMeta(false);
    if (m && m.getAttribute('content') !== lastApplied.bg) { applying = true; m.setAttribute('content', lastApplied.bg); applying = false; }
}
function startObservers() {
    if (typeof MutationObserver === 'undefined') return;
    if (!headObserver && document.head) { headObserver = new MutationObserver(onHeadMutation); headObserver.observe(document.head, { childList: true }); }
    if (!rootObserver) { rootObserver = new MutationObserver(onRootMutation); rootObserver.observe(root(), { attributes: true, attributeFilter: ['data-fld-mode', 'class'] }); }
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
    if (S.mode === 'auto') return `${MODE_ICON.auto} Auto → ${eff === 'dark' ? 'Sombre (votre thème)' : 'Clair'}${S.autoSource === 'schedule' ? ' (horaire)' : ' (système)'}`;
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
    return `<div id="fld_settings" class="fld-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>Force Light Dark</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div id="fld_status" class="fld-status"></div>
      <label for="fld_mode">Mode</label>
      <select id="fld_mode" class="text_pole">${opt('off', '○ Désactivé (aucun changement)')}${opt('light', '☀️ Forcer Clair')}${opt('dark', '🌙 Sombre (= votre thème, inchangé)')}${opt('auto', '🌗 Auto (suit le système)')}</select>
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
      <label class="checkbox_label" for="fld_meta"><input type="checkbox" id="fld_meta"><span>theme-color / barre d'état (Clair : blanc ; Sombre : fond réel de votre thème)</span></label>
      <label class="checkbox_label" for="fld_toast"><input type="checkbox" id="fld_toast"><span>Notification au changement rapide</span></label>
      <small class="opacity50">Les bulles de chat (et le texte des messages) ne sont jamais modifiées : elles gardent les couleurs de votre thème / de vos autres extensions.</small>
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
      <div class="fld-colors">${colorRows('light')}</div>
      <div id="fld_reset_light" class="menu_button">Couleurs Clair par défaut</div>
      <small class="opacity50">🌙 Mode sombre : c'est <b>votre thème tel quel</b> (l'extension n'applique ni couleur, ni fond, ni variable). Il n'y a donc aucune couleur sombre à régler.</small>
      <hr>
      <div id="fld_reset" class="menu_button">Tout réinitialiser</div>
      <small class="opacity50">Pour votre CSS : <code>html[data-fld-mode="light"]</code>, <code>html.fld-dark</code>… Les messages du chat ne sont jamais touchés. Ces attributs ne changent aucun style.</small>
    </div>
  </div>
</div>`;
}

function refreshUi() {
    if (!$id('fld_settings')) return;
    const set = (id, v) => { const e = $id(id); if (e && e.value !== String(v)) e.value = v; };
    const chk = (id, v) => { const e = $id(id); if (e) e.checked = !!v; };
    set('fld_mode', S.mode); set('fld_intensity', S.intensity); set('fld_autosrc', S.autoSource);
    set('fld_lightfrom', S.lightFrom); set('fld_darkfrom', S.darkFrom);
    chk('fld_hidebg', S.hideBg); chk('fld_transition', S.transition); chk('fld_meta', S.themeColorMeta);
    chk('fld_toast', S.toast); chk('fld_wand', S.wandEntry); chk('fld_fabshow', S.fabShow);
    set('fld_fabx', S.fabX); set('fld_faby', S.fabY); set('fld_fabsize', S.fabSize);
    $id('fld_autobox').style.display = S.mode === 'auto' ? '' : 'none';
    $id('fld_schedbox').style.display = S.autoSource === 'schedule' ? '' : 'none';
    $id('fld_fabbox').style.display = S.fabShow ? '' : 'none';
    for (const k of COLOR_KEYS) { const e = $id(`fld_c_light_${k}`); if (e && e.value !== S.colors.light[k]) e.value = S.colors.light[k]; }
    const eff = effectiveMode();
    let st = `Mode actif : <b>${describe()}</b>`;
    if (!eff) st += '<br><span class="opacity50">Aucun changement n\'est appliqué au thème.</span>';
    else if (eff === 'dark') st += '<br><span class="opacity50">Sombre = votre thème, tel quel : l\'extension ne modifie rien.</span>';
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
    on('fld_lightfrom', 'change', upd(() => { S.lightFrom = $id('fld_lightfrom').value || DEFAULTS.lightFrom; Object.assign(S, sanitize(S)); }, true));
    on('fld_darkfrom', 'change', upd(() => { S.darkFrom = $id('fld_darkfrom').value || DEFAULTS.darkFrom; Object.assign(S, sanitize(S)); }, true));
    on('fld_hidebg', 'change', upd(() => { S.hideBg = $id('fld_hidebg').checked; }));
    on('fld_transition', 'change', upd(() => { S.transition = $id('fld_transition').checked; }));
    on('fld_meta', 'change', upd(() => { S.themeColorMeta = $id('fld_meta').checked; }));
    on('fld_toast', 'change', upd(() => { S.toast = $id('fld_toast').checked; }));
    on('fld_wand', 'change', upd(() => { S.wandEntry = $id('fld_wand').checked; }));
    on('fld_fabshow', 'change', upd(() => { S.fabShow = $id('fld_fabshow').checked; }));
    for (const [id, key] of [['fld_fabx', 'fabX'], ['fld_faby', 'fabY'], ['fld_fabsize', 'fabSize']]) {
        on(id, 'input', upd(() => { S[key] = Number($id(id).value); Object.assign(S, sanitize(S)); }));
    }
    document.querySelectorAll('#fld_settings input[type="color"]').forEach((e) => {
        e.addEventListener('input', () => { S.colors.light[e.dataset.key] = e.value.toLowerCase(); save(); apply(); });
    });
    on('fld_reset_light', 'click', () => { S.colors.light = { ...DEFAULT_COLORS.light }; save(); apply(); });
    on('fld_reset', 'click', () => {
        if (!confirm('Réinitialiser tous les réglages de Force Light Dark ?')) return;
        const fresh = sanitize({});
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
        loadSettings(true); // extension_settings est maintenant chargé (vérité) ; migre les anciens réglages
        apply();
        const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (host) {
            host.insertAdjacentHTML('beforeend', panelHtml());
            bindUi();
            refreshUi();
        }
        waitFor(() => (S.wandEntry ? placeWandEntry() === true : true));
        try {
            eventSource.on(event_types.SETTINGS_UPDATED, () => { loadSettings(true); apply(); });
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
