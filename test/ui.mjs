// v1.1.0 — fonctionnel : modes, Auto en direct, horaire, bouton rapide, panneau (SANS UI de bulles), persistance,
// migration des anciens réglages (≤ 1.0.x), pas de flash, aucune erreur console.
import fs from 'node:fs';
import { launch, inject, snap, wait, loadChat, bubbleProbe, diffProbe } from './lib.mjs';
const SH = '/workspace/st-test-shots/';
const R = []; const ok = (n, c, d = '') => { R.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, c ? '' : d); };
const isLight = (rgb) => { const m = rgb.match(/[\d.]+/g).map(Number); return (0.299*m[0]+0.587*m[1]+0.114*m[2]) > 200; };
const isDark = (rgb) => { const m = rgb.match(/[\d.]+/g).map(Number); return (0.299*m[0]+0.587*m[1]+0.114*m[2]) < 60; };
const stSettings = (page) => page.evaluate(() => JSON.parse(JSON.stringify(SillyTavern.getContext().extensionSettings['force-light-dark'] || null)));

const { b, ctx, page, errs } = await launch({ scheme: 'dark' });
await page.addInitScript(() => { // horloge simulée pour l'horaire
  const RD = Date; let off = 0;
  window.__setHour = (h, m = 0) => { const d = new RD(); d.setHours(h, m, 0, 0); off = d.getTime() - RD.now(); };
  window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } };
});
const OLD = { mode: 'dark', intensity: 'total', autoSource: 'system', lightFrom: '08:00', darkFrom: '21:30', transition: true, hideBg: false, paint: 'mes_block', themeColorMeta: true, wandEntry: true, toast: false, fabShow: false, fabX: 70, fabY: 20, fabSize: 50,
  colors: { light: { bg: '#fafafa', bot: '#ffe0b2', user: '#ff2d55', text: '#111111', userText: '#eeeeee', em: '#555555' }, dark: { bg: '#050505', bot: '#123456', user: '#654321', text: '#e0e0e0', userText: '#fefefe', em: 'PAS-UNE-COULEUR' } } };
// MIGRATION : on écrit directement des réglages 1.0.x (avec bulles) dans settings.json AVANT de charger ST (cache localStorage vide)
const SETF = '/workspace/st-test/data/default-user/settings.json';
{ const j = JSON.parse(fs.readFileSync(SETF, 'utf8')); j.extension_settings['force-light-dark'] = OLD; fs.writeFileSync(SETF, JSON.stringify(j, null, 4)); }
const serverBefore = JSON.parse(fs.readFileSync(SETF, 'utf8')).extension_settings['force-light-dark'];
ok('migration: (préparation) settings.json contient les anciens réglages avec paint + colors.bot/user/userText', serverBefore.paint === 'mes_block' && serverBefore.colors.light.bot === '#ffe0b2' && serverBefore.colors.light.userText === '#eeeeee');
await page.goto('http://localhost:8000/'); await wait(page, 7000);
await wait(page, 3000);
const serverAfter = JSON.parse(fs.readFileSync(SETF, 'utf8')).extension_settings['force-light-dark'];

let cur = await stSettings(page);
ok('migration: clés de bulles supprimées (paint, bot, user, userText), schema=2', !('paint' in cur) && Object.values(cur.colors).every(c => !('bot' in c) && !('user' in c) && !('userText' in c)) && cur.schema === 2, JSON.stringify(cur));
ok('migration: réglages utiles conservés (mode, horaire, transition, hideBg, fab, bg/text/em valides)', cur.mode === 'dark' && cur.lightFrom === '08:00' && cur.darkFrom === '21:30' && cur.transition === true && cur.hideBg === false && cur.toast === false && cur.fabX === 70 && cur.fabSize === 50 && cur.colors.light.bg === '#fafafa' && cur.colors.light.text === '#111111' && cur.colors.light.em === '#555555' && cur.colors.dark.bg === '#050505' && cur.colors.dark.text === '#e0e0e0', JSON.stringify(cur));
ok('migration: valeur invalide (em="PAS-UNE-COULEUR") remplacée par la valeur par défaut', cur.colors.dark.em === '#919191', cur.colors.dark.em);
ok('migration: la version nettoyée est ENREGISTRÉE côté serveur (settings.json)', serverAfter && !('paint' in serverAfter) && serverAfter.schema === 2 && !('bot' in serverAfter.colors.light) && serverAfter.colors.light.bg === '#fafafa', JSON.stringify(serverAfter).slice(0, 300));
const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('fld_cache_v1')));
ok('migration: cache localStorage aussi nettoyé', !('paint' in ls) && !('bot' in ls.colors.light), JSON.stringify(ls).slice(0, 200));
// retour à un état propre
await page.evaluate(() => { ForceLightDark.setMode('off'); localStorage.removeItem('fld_cache_v1'); });
await wait(page, 2500); await page.reload(); await wait(page, 7000);
await page.evaluate(() => { const S = SillyTavern.getContext().extensionSettings['force-light-dark']; S.transition = false; S.hideBg = true; S.toast = true; S.fabShow = false; S.lightFrom = '07:00'; S.darkFrom = '20:00'; S.colors = { light: { bg: '#ffffff', text: '#000000', em: '#6e6e73' }, dark: { bg: '#000000', text: '#f2f2f7', em: '#919191' } }; });
await page.evaluate(() => ForceLightDark.reapply());
await loadChat(page); await inject(page); await wait(page, 500);

let s = await snap(page);
ok('défaut/Désactivé: pas de data-fld-mode, pas de <style fld>', s.mode === null && !(await page.$('#fld-style')));
const baseProbe = await bubbleProbe(page); const base = s.formRect; const origMeta = s.meta;
await page.screenshot({ path: SH + 'fld2-10-desactive-theme.png' });

// ---- Panneau : pas d'UI de bulles
await page.click('#extensions-settings-button .drawer-toggle'); await wait(page, 800);
await page.evaluate(() => { const d = document.querySelector('#fld_settings .inline-drawer-toggle'); d.scrollIntoView(); d.click(); }); await wait(page, 700);
const ui = await page.evaluate(() => {
  const root = document.getElementById('fld_settings');
  return { paint: !!document.getElementById('fld_paint'), prev: !!root.querySelector('.fld-prev, [id^="fld_prev"]'),
    colorIds: [...root.querySelectorAll('input[type="color"]')].map(e => e.id), txt: root.textContent,
    labels: [...root.querySelectorAll('label.fld-row span')].map(e => e.textContent) };
});
ok('panneau: plus de sélecteur « élément portant le fond des bulles » ni d\'aperçu de bulles', !ui.paint && !ui.prev && !/portant le fond|Bulle reçue|Bulle envoyée|bulles\s*\(/i.test(ui.txt.replace('Les bulles de chat (et le texte des messages) ne sont jamais modifiées', '')), JSON.stringify(ui).slice(0, 300));
ok('panneau: seulement 3 couleurs par mode (bg, text, em) — aucun sélecteur bot / user / userText', JSON.stringify(ui.colorIds) === JSON.stringify(['fld_c_light_bg', 'fld_c_light_text', 'fld_c_light_em', 'fld_c_dark_bg', 'fld_c_dark_text', 'fld_c_dark_em']), JSON.stringify(ui.colorIds));
ok('panneau: mention « bulles jamais modifiées »', /ne sont jamais modifiées/.test(ui.txt));
await page.screenshot({ path: SH + 'fld2-11-panneau-desactive.png' });

// ---- Modes via l'UI
await page.selectOption('#fld_mode', 'light'); await wait(page, 600);
s = await snap(page);
ok('Clair via le panneau: page/top/form/champ clairs, theme-color #ffffff, color-scheme light', [s.bodyBg, s.topBg, s.formBg, s.taBg].every(isLight) && s.meta === '#ffffff' && s.scheme === 'light', JSON.stringify(s));
ok('Clair: bulles identiques à Désactivé', diffProbe(baseProbe, await bubbleProbe(page)).length === 0);
ok('Clair: #form_sheld inchangé (fixed + mêmes coordonnées)', s.formPos === 'fixed' && JSON.stringify(s.formRect) === JSON.stringify(base), JSON.stringify([base, s.formRect]));
await page.evaluate(() => document.querySelector('#fld_settings #fld_mode').scrollIntoView({ block: 'start' })); await wait(page, 300);
const drawer = await page.evaluate(() => { const st = getComputedStyle(document.querySelector('.drawer-content.openDrawer')); return { bg: st.backgroundColor, fg: st.color, lbl: getComputedStyle(document.querySelector('#fld_settings label')).color, sel: getComputedStyle(document.getElementById('fld_mode')).backgroundColor }; });
ok('Clair: tiroir ouvert clair, texte sombre, select clair', isLight(drawer.bg) && isDark(drawer.fg) && isDark(drawer.lbl) && isLight(drawer.sel), JSON.stringify(drawer));
await page.screenshot({ path: SH + 'fld2-12-panneau-clair.png' });
// couleur perso du fond
await page.evaluate(() => { const e = document.getElementById('fld_c_light_bg'); e.value = '#fff0e0'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(page, 300);
s = await snap(page);
ok('couleur « Fond de page » Clair perso (#fff0e0) appliquée au body + theme-color', s.bodyBg === 'rgb(255, 240, 224)' && s.meta === '#fff0e0', `${s.bodyBg} ${s.meta}`);
ok('couleur perso: bulles toujours identiques', diffProbe(baseProbe, await bubbleProbe(page)).length === 0);
await page.evaluate(() => document.getElementById('fld_reset_light').click()); await wait(page, 300);
s = await snap(page); ok('reset couleurs Clair', s.bodyBg === 'rgb(255, 255, 255)', s.bodyBg);
await page.selectOption('#fld_mode', 'dark'); await wait(page, 600);
s = await snap(page);
ok('Sombre: noir, theme-color #000000, bulles identiques, barre fixe inchangée', s.bodyBg === 'rgb(0, 0, 0)' && s.meta === '#000000' && diffProbe(baseProbe, await bubbleProbe(page)).length === 0 && JSON.stringify(s.formRect) === JSON.stringify(base));
await page.screenshot({ path: SH + 'fld2-13-panneau-sombre.png' });
// intensité douce : le CSS dur du thème reprend pour le reste
await page.selectOption('#fld_intensity', 'soft'); await wait(page, 400);
await page.selectOption('#fld_mode', 'light'); await wait(page, 400);
s = await snap(page);
ok('Doux: variables seulement — le fond dur du thème (#000) reprend, mode=light', s.mode === 'light' && s.bodyBg === 'rgb(0, 0, 0)' && diffProbe(baseProbe, await bubbleProbe(page)).length === 0, `${s.mode} ${s.bodyBg}`);
await page.selectOption('#fld_intensity', 'total'); await wait(page, 300);
// popups : menu baguette
await page.evaluate(() => document.querySelector('#extensions-settings-button .drawer-toggle').click()); await wait(page, 600);
await page.click('#extensionsMenuButton'); await wait(page, 500);
const menuBg = await page.evaluate(() => getComputedStyle(document.getElementById('extensionsMenu')).backgroundColor);
ok('menu baguette (clair) clair', isLight(menuBg), menuBg);
await page.screenshot({ path: SH + 'fld2-14-menu-baguette-clair.png' });
await page.keyboard.press('Escape');

// ---- Auto : système en direct
await page.selectOption('#fld_mode', 'off').catch(() => {});
await page.evaluate(() => ForceLightDark.setMode('auto'));
for (const sch of ['light', 'dark', 'light']) { await page.emulateMedia({ colorScheme: sch }); await wait(page, 500); s = await snap(page); ok(`Auto + système ${sch} => ${sch} (en direct)`, s.mode === sch && (sch === 'light' ? isLight(s.bodyBg) : isDark(s.bodyBg)), `${s.mode} ${s.bodyBg}`); }
await page.screenshot({ path: SH + 'fld2-15-auto-clair.png' });

// ---- Horaire
await page.evaluate(() => { document.querySelector('#extensions-settings-button .drawer-toggle').click(); });
await wait(page, 500);
await page.selectOption('#fld_autosrc', 'schedule'); await wait(page, 300);
await page.evaluate(() => { const l = document.getElementById('fld_lightfrom'); l.value = '07:00'; l.dispatchEvent(new Event('change')); const d = document.getElementById('fld_darkfrom'); d.value = '20:00'; d.dispatchEvent(new Event('change')); });
for (const [h, exp] of [[12, 'light'], [22, 'dark'], [3, 'dark']]) { await page.evaluate((h) => { __setHour(h); ForceLightDark.reapply(); }, h); await wait(page, 300); s = await snap(page); ok(`Horaire ${h}:00 (07-20) => ${exp}`, s.mode === exp, s.mode); }
await page.evaluate(() => __setHour(7, 1)); await wait(page, 21000);
s = await snap(page); ok('Horaire: le minuteur bascule seul à 07:01 => clair', s.mode === 'light', s.mode);
await page.evaluate(() => { document.getElementById('fld_autosrc').value = 'system'; document.getElementById('fld_autosrc').dispatchEvent(new Event('change')); });

// ---- Transition
await page.evaluate(() => { const e = document.getElementById('fld_transition'); e.checked = true; e.dispatchEvent(new Event('change')); });
await page.evaluate(() => ForceLightDark.setMode('dark')); await wait(page, 100);
const fade = await page.evaluate(() => document.documentElement.classList.contains('fld-fade')); await wait(page, 900);
const fade2 = await page.evaluate(() => document.documentElement.classList.contains('fld-fade'));
ok('Transition: fld-fade posée pendant le changement puis retirée', fade && !fade2, `${fade} ${fade2}`);
ok('Transition: bulles identiques pendant/après', diffProbe(baseProbe, await bubbleProbe(page)).length === 0);
await page.evaluate(() => { const e = document.getElementById('fld_transition'); e.checked = false; e.dispatchEvent(new Event('change')); });

// ---- Désactivé + theme-color restauré
await page.evaluate(() => ForceLightDark.setMode('off')); await wait(page, 500);
s = await snap(page);
ok('Désactivé: attributs/style retirés, theme-color d\'origine, body d\'origine', s.mode === null && !(await page.$('#fld-style')) && s.meta === origMeta && isDark(s.bodyBg), `${s.meta} vs ${origMeta}`);

// ---- Menu baguette : cycle off -> light -> dark -> auto -> off
await page.evaluate(() => { const d = document.querySelector('.drawer-content.openDrawer'); if (d) d.closest('.drawer').querySelector('.drawer-toggle').click(); }); await wait(page, 600);
await page.click('#extensionsMenuButton'); await wait(page, 400);
const seq = [];
for (let i = 0; i < 4; i++) { if (!(await page.isVisible('#fld_wand_button'))) { await page.click('#extensionsMenuButton'); await wait(page, 300); } await page.click('#fld_wand_button'); await wait(page, 350); seq.push((await stSettings(page)).mode); }
ok('entrée baguette: cycle light > dark > auto > off', JSON.stringify(seq) === JSON.stringify(['light', 'dark', 'auto', 'off']), JSON.stringify(seq));
await page.keyboard.press('Escape');

// ---- Bouton flottant
await page.keyboard.press('Escape'); await wait(page, 300);
await page.evaluate(() => document.querySelector('#extensions-settings-button .drawer-toggle').click()); await wait(page, 700);
await page.evaluate(() => { const e = document.getElementById('fld_fabshow'); e.checked = true; e.dispatchEvent(new Event('change')); }); await wait(page, 300);
await page.evaluate(() => { const d = document.querySelector('.drawer-content.openDrawer'); if (d) d.closest('.drawer').querySelector('.drawer-toggle').click(); }); await wait(page, 600);
ok('bouton flottant affiché', await page.isVisible('#fld_fab'));
await page.click('#fld_fab'); await wait(page, 300);
ok('bouton flottant: off -> light', (await stSettings(page)).mode === 'light');
await page.screenshot({ path: SH + 'fld2-16-bouton-flottant-clair.png' });
await page.click('#fld_fab'); await wait(page, 300);
await page.evaluate(() => { const S = SillyTavern.getContext().extensionSettings['force-light-dark']; S.fabShow = false; ForceLightDark.setMode('light'); }); await wait(page, 1800);

// ---- Persistance + pas de flash
await page.close();
const page2 = await ctx.newPage();
const e2 = []; page2.on('pageerror', e => e2.push(e.message)); page2.on('console', m => { if (m.type() === 'error') e2.push(m.text()); });
await page2.addInitScript(() => {
  window.__tl = { attrAt: null, preloaderGoneAt: null };
  const iv = setInterval(() => {
    const t = Math.round(performance.now()), d = document.documentElement;
    if (window.__tl.attrAt === null && d.getAttribute('data-fld-mode')) { window.__tl.attrAt = t; window.__tl.preloaderThere = !!document.getElementById('preloader'); }
    const pre = document.getElementById('preloader');
    if (window.__tl.attrAt !== null && (!pre || getComputedStyle(pre).display === 'none') && window.__tl.preloaderGoneAt === null) { window.__tl.preloaderGoneAt = t; clearInterval(iv); }
  }, 5);
});
await page2.goto('http://localhost:8000/', { waitUntil: 'load' }); await wait(page2, 4000);
const tl = await page2.evaluate(() => window.__tl);
ok('pas de flash: data-fld-mode posé avant la disparition du préchargeur', tl.attrAt !== null && tl.preloaderThere === true && tl.attrAt <= tl.preloaderGoneAt, JSON.stringify(tl));
await wait(page2, 6000);
const persisted = await page2.evaluate(() => ({ st: SillyTavern.getContext().extensionSettings['force-light-dark']?.mode, attr: document.documentElement.getAttribute('data-fld-mode'), ls: JSON.parse(localStorage.getItem('fld_cache_v1')).mode, panel: document.getElementById('fld_mode').value }));
ok('persistance après rechargement (extension_settings + cache + panneau)', persisted.st === 'light' && persisted.attr === 'light' && persisted.ls === 'light' && persisted.panel === 'light', JSON.stringify(persisted));
await page2.evaluate(() => localStorage.removeItem('fld_cache_v1')); await wait(page2, 1200);
const c3 = await b.newContext({ viewport: { width: 393, height: 852 } }); const page3 = await c3.newPage(); page3.on('pageerror', e => e2.push(e.message));
await page3.goto('http://localhost:8000/'); await wait(page3, 6000);
const fromServer = await page3.evaluate(() => ({ attr: document.documentElement.getAttribute('data-fld-mode'), st: SillyTavern.getContext().extensionSettings['force-light-dark']?.mode }));
ok('persistance serveur (nouveau navigateur sans localStorage)', fromServer.st === 'light' && fromServer.attr === 'light', JSON.stringify(fromServer));
await c3.close();

const errsAll = [...errs, ...e2].filter(x => !/interactive-widget/.test(x));
ok('aucune erreur console / pageerror', errsAll.length === 0, JSON.stringify(errsAll));
console.log('\n' + R.filter(x => !x).length + ' échec(s) /', R.length);
await b.close();
process.exit(R.some(x => !x) ? 1 : 0);
