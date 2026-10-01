import fs from 'node:fs';
import { launch, inject, snap, wait, loadChat } from './lib.mjs';
const SH = '/workspace/st-test-shots/';
const results = []; const ok = (n, c, d='') => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n, d); };
const isLight = (rgb) => { const m = rgb.match(/[\d.]+/g).map(Number); return (0.299*m[0]+0.587*m[1]+0.114*m[2]) > 200; };
const isDark = (rgb) => { const m = rgb.match(/[\d.]+/g).map(Number); return (0.299*m[0]+0.587*m[1]+0.114*m[2]) < 60; };
const settingsMode = (page) => page.evaluate(() => SillyTavern.getContext().extensionSettings['force-light-dark']?.mode);

// Contexte persistant: on repart de zéro (réglages ST effacés pour l'extension)
const { b, ctx, page, errs } = await launch({ scheme: 'dark' });
await page.addInitScript(() => { window.__fld = []; new MutationObserver(() => {}).observe(document, { childList: true }); });
await page.goto('http://localhost:8000/'); await wait(page, 6000);
// reset état
await page.evaluate(() => { ForceLightDark.setMode('off'); localStorage.removeItem('fld_cache_v1'); });
await wait(page, 2500);
await page.reload(); await wait(page, 6000);
await loadChat(page);
await inject(page);              // CSS « iMessage Dark » injecté APRÈS l'extension
await wait(page, 400);

let s = await snap(page);
ok('défaut = Désactivé (pas de data-fld-mode, pas de <style fld>)', s.mode === null && !(await page.$('#fld-style')), JSON.stringify({mode:s.mode}));
ok('thème simulé sombre en dur (bulle bot #262628, user #0a84ff, fond noir)', s.botBg === 'rgb(38, 38, 40)' && s.userBg === 'rgb(10, 132, 255)' && isDark(s.bodyBg), JSON.stringify(s));
await page.screenshot({ path: SH + 'fld-00-desactive.png' });
const base = s.formRect; const origMeta = s.meta;

// --- Forcer Clair
await page.evaluate(() => ForceLightDark.setMode('light')); await wait(page, 500);
s = await snap(page);
ok('Clair: data-fld-mode=light + classes', s.mode === 'light' && /fld-active/.test(s.cls) && /fld-light/.test(s.cls), s.cls);
ok('Clair: body clair', isLight(s.bodyBg), s.bodyBg);
ok('Clair: bulle bot #e9e9eb, texte noir', s.botBg === 'rgb(233, 233, 235)' && s.botFg === 'rgb(0, 0, 0)', `${s.botBg} ${s.botFg}`);
ok('Clair: bulle user #0a84ff texte blanc', s.userBg === 'rgb(10, 132, 255)' && s.userFg === 'rgb(255, 255, 255)', `${s.userBg} ${s.userFg}`);
ok('Clair: em pas #919191 (gris clair) -> #6e6e73', s.emFg === 'rgb(110, 110, 115)', s.emFg);
ok('Clair: input clair + texte sombre', isLight(s.taBg) && isDark(s.taFg), `${s.taBg} ${s.taFg}`);
ok('Clair: #form_sheld et top-bar clairs', isLight(s.formBg) && isLight(s.topBg), `${s.formBg} ${s.topBg}`);
ok('Clair: color-scheme light', s.scheme === 'light', s.scheme);
ok('Clair: theme-color #ffffff', s.meta === '#ffffff', s.meta);
await page.evaluate(() => { const x = document.createElement('style'); x.id = 'late-style'; x.textContent = '/* ajouté après */'; document.head.appendChild(x); }); await wait(page, 700);
const last2 = await page.evaluate(() => document.head.lastElementChild.id);
ok('<style fld-style> se remet dernier dans head après ajout d\'un style tardif (ou combat avec un autre extension: spécificité gagne)', last2 === 'fld-style' || (await snap(page)).botBg === 'rgb(233, 233, 235)', last2);
ok('Clair: un style tardif ne casse pas le forçage', (await snap(page)).botBg === 'rgb(233, 233, 235)');
ok('Clair: barre fixe inchangée (position fixed, mêmes coordonnées)', s.formPos === 'fixed' && JSON.stringify(s.formRect) === JSON.stringify(base), JSON.stringify([base, s.formRect]));
await page.screenshot({ path: SH + 'fld-01-clair.png' });

// --- Forcer Sombre
await page.evaluate(() => ForceLightDark.setMode('dark')); await wait(page, 500);
s = await snap(page);
ok('Sombre: body noir OLED #000', s.bodyBg === 'rgb(0, 0, 0)', s.bodyBg);
ok('Sombre: bulles bot #262628 / user #0a84ff, em #919191', s.botBg === 'rgb(38, 38, 40)' && s.userBg === 'rgb(10, 132, 255)' && s.emFg === 'rgb(145, 145, 145)', `${s.botBg} ${s.userBg} ${s.emFg}`);
ok('Sombre: theme-color #000000, color-scheme dark', s.meta === '#000000' && s.scheme === 'dark', `${s.meta} ${s.scheme}`);
ok('Sombre: barre fixe inchangée', JSON.stringify(s.formRect) === JSON.stringify(base));
await page.screenshot({ path: SH + 'fld-02-sombre.png' });

// --- Auto suit prefers-color-scheme
await page.evaluate(() => ForceLightDark.setMode('auto'));
await page.emulateMedia({ colorScheme: 'light' }); await wait(page, 500);
s = await snap(page);
ok('Auto + système clair -> light', s.mode === 'light' && isLight(s.bodyBg) && s.botBg === 'rgb(233, 233, 235)', `${s.mode} ${s.bodyBg}`);
await page.screenshot({ path: SH + 'fld-03-auto-clair.png' });
await page.emulateMedia({ colorScheme: 'dark' }); await wait(page, 500);
s = await snap(page);
ok('Auto + système sombre -> dark (live, sans reload)', s.mode === 'dark' && s.bodyBg === 'rgb(0, 0, 0)', `${s.mode} ${s.bodyBg}`);
await page.emulateMedia({ colorScheme: 'light' }); await wait(page, 400);
s = await snap(page); ok('Auto rebascule en clair', s.mode === 'light');

// --- Désactivé
await page.evaluate(() => ForceLightDark.setMode('off')); await wait(page, 400);
s = await snap(page);
ok('Désactivé: plus de data-fld-mode, thème d\'origine restauré', s.mode === null && s.botBg === 'rgb(38, 38, 40)' && isDark(s.bodyBg) && !(await page.$('#fld-style')), JSON.stringify({m:s.mode,b:s.botBg}));
ok('Désactivé: theme-color d\'origine restauré', s.meta === origMeta, `${origMeta} -> ${s.meta}`);

// --- Bouton du menu baguette (cycle) : off -> light -> dark -> auto -> off
await page.click('#extensionsMenuButton'); await wait(page, 400);
await page.screenshot({ path: SH + 'fld-04-menu-baguette.png' });
const seq = [];
for (let i = 0; i < 4; i++) {
  if (!(await page.isVisible('#fld_wand_button'))) { await page.click('#extensionsMenuButton'); await wait(page, 300); }
  await page.click('#fld_wand_button'); await wait(page, 350);
  seq.push(await settingsMode(page));
}
ok('Entrée baguette: cycle light > dark > auto > off', JSON.stringify(seq) === JSON.stringify(['light', 'dark', 'auto', 'off']), JSON.stringify(seq));
await page.keyboard.press('Escape');

// --- Bouton flottant
await page.evaluate(() => { const S = SillyTavern.getContext().extensionSettings['force-light-dark']; S.fabShow = true; S.fabX = 100; S.fabY = 40; ForceLightDark.reapply(); });
// le panneau n'est pas ouvert : on passe par l'UI pour rafraîchir
await page.evaluate(() => { document.getElementById('fld_fabshow').dispatchEvent(new Event('change')); });
await wait(page, 300);
ok('Bouton flottant affiché', await page.isVisible('#fld_fab'));
const fabBox = await page.evaluate(() => { const r = document.getElementById('fld_fab').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; });
console.log('fab', fabBox);
ok('Bouton flottant à droite (x ≈ largeur - taille)', fabBox[0] + fabBox[2] >= 385, JSON.stringify(fabBox));
const before = await settingsMode(page);
await page.click('#fld_fab'); await wait(page, 300);
const after = await settingsMode(page);
ok('Bouton flottant fait avancer le mode', before === 'off' && after === 'light', `${before} -> ${after}`);
await page.screenshot({ path: SH + 'fld-05-bouton-flottant.png' });
await page.click('#fld_fab'); await wait(page, 300); // dark

// --- Panneau
await page.click('#top-settings-holder #extensions-settings-button .drawer-toggle, #extensions-settings-button .drawer-toggle'); await wait(page, 800);
await page.evaluate(() => { const d = document.querySelector('#fld_settings .inline-drawer-toggle'); d.scrollIntoView(); d.click(); });
await wait(page, 700);
await page.screenshot({ path: SH + 'fld-06-panneau-sombre.png' });
await page.evaluate(() => ForceLightDark.setMode('light')); await wait(page, 500);
await page.screenshot({ path: SH + 'fld-07-panneau-clair.png' });
s = await page.evaluate(() => { const dc = document.querySelector('#rm_extensions_block') || document.querySelector('.drawer-content.openDrawer'); const st = getComputedStyle(document.querySelector('.drawer-content.openDrawer')); return { dcBg: st.backgroundColor, dcColor: st.color, lbl: getComputedStyle(document.querySelector('#fld_settings label')).color, selBg: getComputedStyle(document.getElementById('fld_mode')).backgroundColor }; });
ok('Panneau clair: tiroir ouvert clair, texte sombre, select clair', isLight(s.dcBg) && isDark(s.dcColor) && isLight(s.selBg), JSON.stringify(s));
// couleur personnalisée
await page.evaluate(() => { const e = document.getElementById('fld_c_light_bot'); e.value = '#ffe0b2'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(page, 300);
s = await snap(page);
ok('Couleur perso (bulle reçue clair #ffe0b2) appliquée', s.botBg === 'rgb(255, 224, 178)', s.botBg);
// intensité douce
await page.evaluate(() => { const e = document.getElementById('fld_intensity'); e.value = 'soft'; e.dispatchEvent(new Event('change')); }); await wait(page, 400);
s = await snap(page);
ok('Intensité Douce: le CSS dur du thème reprend (bulle bot reste #262628)', s.botBg === 'rgb(38, 38, 40)' && s.mode === 'light', `${s.botBg} ${s.mode}`);
await page.screenshot({ path: SH + 'fld-08-intensite-douce.png' });
await page.evaluate(() => { const e = document.getElementById('fld_intensity'); e.value = 'total'; e.dispatchEvent(new Event('change')); }); await wait(page, 300);
// reset couleurs
await page.evaluate(() => document.getElementById('fld_reset_light').click()); await wait(page, 300);
s = await snap(page); ok('Reset couleurs Clair', s.botBg === 'rgb(233, 233, 235)', s.botBg);
// persistance : mode light, sauvegarde
await page.evaluate(() => { ForceLightDark.setMode('light'); }); await wait(page, 1800);

// --- persistance après rechargement + flash
await page.close();
const page2 = await ctx.newPage();
const e2 = []; page2.on('pageerror', e => e2.push(e.message)); page2.on('console', m => { if (m.type()==='error') e2.push(m.text()); });
await page2.addInitScript(() => {
  window.__tl = { attrAt: null, preloaderGoneAt: null, bodyAt: null, fcp: null, firstBg: null };
  const iv = setInterval(() => {
    const t = Math.round(performance.now()), d = document.documentElement;
    if (document.body && window.__tl.bodyAt === null) window.__tl.bodyAt = t;
    if (window.__tl.attrAt === null && d.getAttribute('data-fld-mode')) { window.__tl.attrAt = t; window.__tl.preloaderThere = !!document.getElementById('preloader'); }
    const pre = document.getElementById('preloader');
    if (window.__tl.attrAt !== null && (!pre || getComputedStyle(pre).display === 'none') && window.__tl.preloaderGoneAt === null) { window.__tl.preloaderGoneAt = t; clearInterval(iv); }
  }, 5);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__tl.fcp = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true });
});
await page2.goto('http://localhost:8000/', { waitUntil: 'load' });
await wait(page2, 4000);
const paint = await page2.evaluate(() => window.__tl);
console.log('timeline', JSON.stringify(paint));
ok('Pas de flash du chat: data-fld-mode posé AVANT que le préchargeur ST disparaisse (le chat n\'est jamais visible dans l\'ancien thème)', paint.attrAt !== null && paint.preloaderThere === true && paint.attrAt <= paint.preloaderGoneAt, JSON.stringify(paint));
await wait(page2, 6000);
const persisted = await page2.evaluate(() => ({ st: SillyTavern.getContext().extensionSettings['force-light-dark']?.mode, attr: document.documentElement.getAttribute('data-fld-mode'), ls: JSON.parse(localStorage.getItem('fld_cache_v1')).mode, panel: document.getElementById('fld_mode').value }));
ok('Réglages persistés après rechargement (extension_settings + cache + panneau)', persisted.st === 'light' && persisted.attr === 'light' && persisted.ls === 'light' && persisted.panel === 'light', JSON.stringify(persisted));
await page2.screenshot({ path: SH + 'fld-09-apres-reload-clair.png' });

// Persistance côté SERVEUR : vérifier que settings.json contient bien le mode (sans cache localStorage)
await page2.evaluate(() => localStorage.removeItem('fld_cache_v1'));
await wait(page2, 1200);
const ctx2 = await (await import('playwright')).webkit.launch();
const c3 = await ctx2.newContext({ ...(await import('playwright')).devices['iPhone 14 Pro'] });
const page3 = await c3.newPage(); page3.on('pageerror', e => e2.push(e.message));
await page3.goto('http://localhost:8000/'); await wait(page3, 6000);
const fromServer = await page3.evaluate(() => ({ attr: document.documentElement.getAttribute('data-fld-mode'), st: SillyTavern.getContext().extensionSettings['force-light-dark']?.mode }));
ok('Persistance serveur (nouveau navigateur sans localStorage)', fromServer.st === 'light' && fromServer.attr === 'light', JSON.stringify(fromServer));
await ctx2.close();

// theme-color revient + console
const errsAll = [...errs, ...e2].filter(x => !/interactive-widget/.test(x));
ok('Aucune erreur console / pageerror', errsAll.length === 0, JSON.stringify(errsAll));
console.log('\n' + results.filter(r => !r[1]).length + ' échec(s) /', results.length);
fs.writeFileSync('/workspace/pw/fld/results.json', JSON.stringify(results));
await b.close();
