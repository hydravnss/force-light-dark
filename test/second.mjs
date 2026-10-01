import { launch, inject, snap, wait, loadChat } from './lib.mjs';
const SH = '/workspace/st-test-shots/';
const R = []; const ok = (n, c, d='') => { R.push(c); console.log(c ? 'PASS' : 'FAIL', n, d); };
const { b, ctx, page, errs } = await launch({ scheme: 'dark' });
await page.addInitScript(() => { // horloge simulée pilotable pour l'horaire
  const RD = Date; let off = 0;
  window.__setHour = (h, m=0) => { const d = new RD(); d.setHours(h, m, 0, 0); off = d.getTime() - RD.now(); };
  window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } };
});
await page.goto('http://localhost:8000/'); await wait(page, 6000);
console.log('ald actif ?', await page.evaluate(() => ({ style: !!document.getElementById('ald_style'), attr: document.documentElement.dataset.aldMode })));
await loadChat(page); await inject(page); await wait(page, 500);
// l'utilisateur ajoute son bloc CSS html[data-ald-mode="light"] ...
await page.evaluate(() => { const s = document.createElement('style'); s.id = 'user-ald-css'; s.textContent = 'html[data-ald-mode="light"] #chat:not(#z1):not(#z2) .mes .mes_text { background:#ffd1dc !important; }'; document.head.appendChild(s); });
await page.evaluate(() => ForceLightDark.setMode('off')); await wait(page, 800);
let s = await snap(page);
console.log('autolightdark seul (système sombre):', s.ald, s.botBg);
await page.emulateMedia({ colorScheme: 'light' }); await wait(page, 600);
s = await snap(page); console.log('autolightdark seul (système clair):', s.ald, s.botBg);
// FLD Sombre force par-dessus ald (qui est en light)
await page.evaluate(() => ForceLightDark.setMode('dark')); await wait(page, 800);
s = await snap(page);
ok('ald=light (système clair) mais FLD Forcer Sombre gagne', s.mode === 'dark' && s.ald === 'dark' && s.botBg === 'rgb(38, 38, 40)' && s.bodyBg === 'rgb(0, 0, 0)', JSON.stringify({m:s.mode,a:s.ald,b:s.botBg,bg:s.bodyBg}));
await page.emulateMedia({ colorScheme: 'dark' }); await wait(page, 400); await page.emulateMedia({ colorScheme: 'light' }); await wait(page, 800);
s = await snap(page); ok('ald re-déclenché ne reprend pas la main', s.mode === 'dark' && s.ald === 'dark' && s.botBg === 'rgb(38, 38, 40)', JSON.stringify({m:s.mode,a:s.ald,b:s.botBg}));
await page.evaluate(() => ForceLightDark.setMode('light')); await wait(page, 600);
s = await snap(page); ok('FLD Clair avec le bloc CSS html[data-ald-mode="light"] de l\'utilisateur: data-ald-mode aligné sur light', s.ald === 'light' && s.mode === 'light', `${s.ald} ${s.botBg}`);
await page.screenshot({ path: SH + 'fld-10-avec-autolightdark.png' });
await page.evaluate(() => ForceLightDark.setMode('off')); await wait(page, 800);
s = await snap(page); ok('Désactivé: autolightdark reprend (système clair => ald=light)', s.mode === null && s.ald === 'light', `${s.mode} ${s.ald} ${s.botBg}`);

// Horaire
await page.evaluate(() => { ForceLightDark.setMode('auto'); });
await page.click('#extensionsMenuButton').catch(()=>{}); await page.keyboard.press('Escape');
await page.click('#extensions-settings-button .drawer-toggle'); await wait(page, 700);
await page.evaluate(() => { document.querySelector('#fld_settings .inline-drawer-toggle').click(); });
await wait(page, 400);
await page.selectOption('#fld_autosrc', 'schedule'); await wait(page, 300);
await page.evaluate(() => { const l = document.getElementById('fld_lightfrom'); l.value = '07:00'; l.dispatchEvent(new Event('change')); const d = document.getElementById('fld_darkfrom'); d.value = '20:00'; d.dispatchEvent(new Event('change')); });
await page.evaluate(() => __setHour(12)); await page.evaluate(() => ForceLightDark.reapply()); await wait(page, 300);
s = await snap(page); ok('Horaire 12:00 (07-20) => clair, malgré système clair', s.mode === 'light', s.mode);
await page.evaluate(() => __setHour(22)); await page.evaluate(() => ForceLightDark.reapply()); await wait(page, 300);
s = await snap(page); ok('Horaire 22:00 => sombre, malgré système clair', s.mode === 'dark', s.mode);
await page.evaluate(() => __setHour(3)); await page.evaluate(() => ForceLightDark.reapply()); await wait(page, 300);
s = await snap(page); ok('Horaire 03:00 => sombre', s.mode === 'dark', s.mode);
await page.evaluate(() => __setHour(7, 1)); await wait(page, 21000);
s = await snap(page); ok('Horaire: le minuteur bascule seul à 07:01 => clair', s.mode === 'light', s.mode);

// Transition
await page.evaluate(() => { const e = document.getElementById('fld_transition'); e.checked = true; e.dispatchEvent(new Event('change')); });
await page.evaluate(() => { ForceLightDark.setMode('dark'); });
await wait(page, 100);
const fade = await page.evaluate(() => document.documentElement.classList.contains('fld-fade'));
await wait(page, 900);
const fade2 = await page.evaluate(() => document.documentElement.classList.contains('fld-fade'));
ok('Transition: classe fld-fade posée pendant le changement puis retirée (pas de coût permanent)', fade && !fade2, `${fade} ${fade2}`);

// Capture du panneau complet (clair), défilement vers l'aperçu
await page.evaluate(() => ForceLightDark.setMode('light')); await wait(page, 500);
await page.evaluate(() => { document.querySelector('#fld_prev_light').scrollIntoView({ block: 'center' }); }); await wait(page, 400);
await page.screenshot({ path: SH + 'fld-11-panneau-apercu-clair.png' });
await page.evaluate(() => ForceLightDark.setMode('dark')); await wait(page, 500);
await page.evaluate(() => { document.querySelector('#fld_prev_dark').scrollIntoView({ block: 'center' }); }); await wait(page, 400);
await page.screenshot({ path: SH + 'fld-12-panneau-apercu-sombre.png' });
await page.evaluate(() => { document.querySelector('#fld_autosrc').scrollIntoView({ block: 'center' }); }); await wait(page, 300);
await page.evaluate(() => ForceLightDark.setMode('light')); await wait(page, 400);
await page.screenshot({ path: SH + 'fld-13-panneau-options-clair.png' });

// Reset total
page.once('dialog', d => d.accept());
await page.evaluate(() => document.getElementById('fld_reset').click()); await wait(page, 600);
s = await snap(page); ok('Tout réinitialiser => Désactivé', s.mode === null, s.mode);

// Popup + menu baguette en clair
await page.evaluate(() => ForceLightDark.setMode('light')); await wait(page, 300);
await page.evaluate(() => document.querySelector('#extensions-settings-button .drawer-toggle').click()); await wait(page, 600);
await page.click('#extensionsMenuButton'); await wait(page, 500);
await page.screenshot({ path: SH + 'fld-14-menu-baguette-clair.png' });
const menuBg = await page.evaluate(() => getComputedStyle(document.getElementById('extensionsMenu')).backgroundColor);
ok('Menu baguette clair', /^rgb\((2[3-5]\d)/.test(menuBg), menuBg);
await page.keyboard.press('Escape');
const e = errs.filter(x => !/interactive-widget/.test(x));
ok('Aucune erreur console', e.length === 0, JSON.stringify(e));
console.log(R.filter(x => !x).length + ' échec(s) /', R.length);
await b.close();
