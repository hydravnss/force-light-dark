// v1.1.0 — les bulles ne sont JAMAIS touchées. Compare Désactivé / Clair / Sombre / Auto, sur 3 scénarios :
//  A) thème « iMessage Dark » simulé + bubble-colors (installé, actif, couleurs personnalisées dégradé)
//  B) thème simulé seul (bubble-colors bloqué au chargement)
//  C) ST par défaut, sans thème simulé (bubble-colors bloqué)
import fs from 'node:fs';
import { launch, inject, snap, wait, loadChat, bubbleProbe, chatDeepProbe, diffProbe, diffDeep } from './lib.mjs';
const SH = '/workspace/st-test-shots/';
const R = []; const ok = (n, c, d = '') => { R.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, c ? '' : d); };
const isLight = (rgb) => { const m = rgb.match(/[\d.]+/g).map(Number); return (0.299*m[0]+0.587*m[1]+0.114*m[2]) > 200; };
const isDark = (rgb) => { const m = rgb.match(/[\d.]+/g).map(Number); return (0.299*m[0]+0.587*m[1]+0.114*m[2]) < 60; };

async function scenario(tag, { theme, blockBubbleColors }) {
  console.log(`\n=== Scénario ${tag} (thème simulé: ${theme}, bubble-colors: ${!blockBubbleColors}) ===`);
  const { b, page, errs } = await launch({ scheme: 'dark', blockBubbleColors });
  await page.goto('http://localhost:8000/'); await wait(page, 6000);
  await page.evaluate(() => { ForceLightDark.setMode('off'); });
  await loadChat(page);
  if (theme) await inject(page);
  await wait(page, 600);
  const bcStyle = await page.evaluate(() => !!document.getElementById('bubble-colors-style'));
  ok(`${tag}: bubble-colors ${blockBubbleColors ? 'absent' : 'actif (#bubble-colors-style présent)'}`, bcStyle === !blockBubbleColors, String(bcStyle));

  const offRoot = await page.evaluate(() => Object.fromEntries(['UserMesBlurTintColor','BotMesBlurTintColor','ChatTintColor'].map(k => [k, getComputedStyle(document.documentElement).getPropertyValue('--SmartTheme'+k).trim()])));
  const off = { probe: await bubbleProbe(page), deep: await chatDeepProbe(page), snap: await snap(page) };
  ok(`${tag}: Désactivé = aucun <style fld>, pas de data-fld-mode`, off.snap.mode === null && !(await page.$('#fld-style')));
  ok(`${tag}: messages présents (2 bot + 1 user)`, off.snap.nBot >= 2 && off.snap.nUser >= 1 && off.deep.n > 20, `${off.snap.nBot}/${off.snap.nUser}/${off.deep.n}`);
  const dumpOff = off.probe['bot .mes_text'];
  console.log('  Désactivé: bot .mes_text', dumpOff.backgroundColor.slice(0,40), dumpOff.color, '| user', off.probe['user .mes_text'].backgroundColor.slice(0,40), off.probe['user .mes_text'].color, '| em', off.probe['bot em'].color);
  await page.screenshot({ path: `${SH}fld2-${tag}-0-desactive.png` });

  const states = {};
  for (const [name, setup] of [
    ['clair', () => ForceLightDark.setMode('light')], ['sombre', () => ForceLightDark.setMode('dark')],
  ]) {
    await page.evaluate(setup); await wait(page, 700);
    const cur = { probe: await bubbleProbe(page), deep: await chatDeepProbe(page), snap: await snap(page) };
    states[name] = cur;
    ok(`${tag}/${name}: mode appliqué (data-fld-mode=${name === 'clair' ? 'light' : 'dark'})`, cur.snap.mode === (name === 'clair' ? 'light' : 'dark') && !!(await page.$('#fld-style')));
    const dp = diffProbe(off.probe, cur.probe);
    ok(`${tag}/${name}: .mes_text (bot+user), .mes, .mes_block, em, i, q, strong, a, p, nom + variables --SmartTheme* : IDENTIQUES à Désactivé (${Object.keys(off.probe).length} sondes × ${18} props)`, dp.length === 0, dp.slice(0, 8).join(' | '));
    const dd = diffDeep(off.deep, cur.deep);
    ok(`${tag}/${name}: TOUTES les propriétés calculées de TOUS les éléments dans #chat .mes (${cur.deep.n} éléments) identiques`, dd.length === 0, dd.slice(0, 8).join(' | '));
    // le reste bascule
    const s = cur.snap;
    if (name === 'clair') {
      ok(`${tag}/clair: body, #chat, top-bar, #form_sheld, #send_textarea clairs, texte du champ sombre`, [s.bodyBg, s.chatBg, s.topBg, s.formBg, s.taBg].every(isLight) && isDark(s.taFg), JSON.stringify([s.bodyBg, s.chatBg, s.topBg, s.formBg, s.taBg, s.taFg]));
      ok(`${tag}/clair: color-scheme light, theme-color #ffffff`, s.scheme === 'light' && s.meta === '#ffffff', `${s.scheme} ${s.meta}`);
    } else {
      ok(`${tag}/sombre: body #000, top-bar, form, champ sombres`, s.bodyBg === 'rgb(0, 0, 0)' && [s.topBg, s.formBg, s.taBg].every(isDark), JSON.stringify([s.bodyBg, s.topBg, s.formBg, s.taBg]));
      ok(`${tag}/sombre: color-scheme dark, theme-color #000000`, s.scheme === 'dark' && s.meta === '#000000', `${s.scheme} ${s.meta}`);
    }
    ok(`${tag}/${name}: #form_sheld position fixed et mêmes coordonnées qu'en Désactivé`, s.formPos === 'fixed' && JSON.stringify(s.formRect) === JSON.stringify(off.snap.formRect), JSON.stringify([off.snap.formRect, s.formRect]));
    await page.screenshot({ path: `${SH}fld2-${tag}-${name === 'clair' ? 1 : 2}-${name}.png` });
  }
  // la variable --SmartTheme* hors #chat change bien, dans #chat jamais
  await page.evaluate(() => ForceLightDark.setMode('light')); await wait(page, 400);
  const vars = await page.evaluate(() => {
    const g = (el, k) => getComputedStyle(el).getPropertyValue(k).trim();
    return { root: g(document.documentElement, '--SmartThemeBodyColor'), chat: g(document.querySelector('#chat .mes .mes_text'), '--SmartThemeBodyColor'),
      top: g(document.getElementById('top-bar'), '--SmartThemeBodyColor'), form: g(document.getElementById('form_sheld'), '--SmartThemeBodyColor'),
      rootUser: getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeUserMesBlurTintColor').trim(), rootBot: getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBotMesBlurTintColor').trim(),
      rootChatTint: getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeChatTintColor').trim() };
  });
  console.log('  vars (Clair):', JSON.stringify(vars), '| Désactivé root:', JSON.stringify(off.probe['vars@bot .mes_text']['--SmartThemeBodyColor']));
  ok(`${tag}: --SmartThemeBodyColor non modifiée sur :root ni dans #chat, mais forcée dans #top-bar / #form_sheld`, vars.root === vars.chat && vars.chat === off.probe['vars@bot .mes_text']['--SmartThemeBodyColor'] && vars.top === 'rgb(0, 0, 0)'.replace('rgb(0, 0, 0)', '#000000') && vars.form === '#000000', JSON.stringify(vars));
  ok(`${tag}: User/Bot MesBlurTint + ChatTint jamais écrites (:root identique à Désactivé)`, vars.rootUser === offRoot.UserMesBlurTintColor && vars.rootBot === offRoot.BotMesBlurTintColor && vars.rootChatTint === offRoot.ChatTintColor, JSON.stringify(vars));
  // CSS généré : aucune règle bulle
  const css = await page.evaluate(() => document.getElementById('fld-style').textContent);
  const bad = css.split('\n').filter(l => /(\.mes_text|\.mes_block|\.mes\b|is_user)/.test(l) && !/name_text|ch_name|mes_timer/.test(l));
  ok(`${tag}: le CSS généré ne contient aucun sélecteur de bulle (.mes_text / .mes_block / .mes / is_user)`, bad.length === 0 && !/UserMesBlurTint|BotMesBlurTint|ChatTintColor/.test(css), bad.slice(0, 3).join(' | '));
  // Auto
  await page.evaluate(() => ForceLightDark.setMode('auto'));
  for (const sch of ['light', 'dark', 'light']) {
    await page.emulateMedia({ colorScheme: sch }); await wait(page, 600);
    const cur = { probe: await bubbleProbe(page), snap: await snap(page) };
    ok(`${tag}/auto(${sch}): suit le système, bulles identiques à Désactivé`, cur.snap.mode === sch && diffProbe(off.probe, cur.probe).length === 0 && (sch === 'light' ? isLight(cur.snap.bodyBg) : isDark(cur.snap.bodyBg)), diffProbe(off.probe, cur.probe).slice(0, 4).join(' | ') + ' ' + cur.snap.mode);
  }
  // Doux (soft)
  await page.evaluate(() => { const S = SillyTavern.getContext().extensionSettings['force-light-dark']; S.intensity = 'soft'; S.mode = 'light'; ForceLightDark.reapply(); }); await wait(page, 500);
  { const cur = { probe: await bubbleProbe(page), deep: await chatDeepProbe(page) };
    ok(`${tag}/doux+clair: bulles identiques (sondes + exhaustif)`, diffProbe(off.probe, cur.probe).length === 0 && diffDeep(off.deep, cur.deep).length === 0); }
  await page.evaluate(() => { const S = SillyTavern.getContext().extensionSettings['force-light-dark']; S.intensity = 'total'; ForceLightDark.reapply(); });
  // Retour Désactivé : retour exact
  await page.evaluate(() => ForceLightDark.setMode('off')); await wait(page, 500);
  { const cur = { probe: await bubbleProbe(page), snap: await snap(page) };
    ok(`${tag}/retour Désactivé: tout restauré (probe + body + theme-color)`, diffProbe(off.probe, cur.probe).length === 0 && cur.snap.bodyBg === off.snap.bodyBg && cur.snap.meta === off.snap.meta && cur.snap.mode === null); }
  // Messages ajoutés APRÈS l'activation + message en édition
  await page.evaluate(() => ForceLightDark.setMode('dark')); await wait(page, 400);
  await page.evaluate(() => { const x = SillyTavern.getContext(); const m = { name: x.name2, is_user: false, is_system: false, send_date: Date.now(), mes: 'Nouveau *message* "cité" **gras**' }; x.chat.push(m); x.addOneMessage(m); }); await wait(page, 500);
  { const cur = await bubbleProbe(page); ok(`${tag}/message ajouté en Sombre: sondes identiques à Désactivé`, diffProbe(off.probe, cur).length === 0, diffProbe(off.probe, cur).slice(0, 4).join(' | ')); }
  const e = errs.filter(x => !/interactive-widget/.test(x));
  ok(`${tag}: aucune erreur console`, e.length === 0, JSON.stringify(e));
  await b.close();
}
await scenario('A', { theme: true, blockBubbleColors: false });
await scenario('B', { theme: true, blockBubbleColors: true });
await scenario('C', { theme: false, blockBubbleColors: true });
console.log('\n' + R.filter(x => !x).length + ' échec(s) /', R.length);
fs.writeFileSync('/tmp/fld2-bubbles-results.json', JSON.stringify(R));
process.exit(R.some(x => !x) ? 1 : 0);
