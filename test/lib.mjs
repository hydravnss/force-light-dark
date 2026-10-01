import { webkit, devices } from 'playwright';
export const USER_CSS = `
/* approximation de « iMessage Dark » */
html, body { background:#000 !important; }
body, #sheld, #chat, #bg1, #bg_custom { background:#000 !important; background-image:none !important; }
#top-bar, #top-settings-holder { background:#000 !important; }
.drawer-content, .popup, .options-content, .list-group { background:#1c1c1e !important; color:#f2f2f7 !important; }
html body #chat:not(#z1):not(#z2) .mes, #chat .mes .mes_block { background:transparent !important; border:0 !important; box-shadow:none !important; }
html body #chat:not(#z1):not(#z2) .mes .mes_text { display:inline-block; border-radius:18px !important; padding:8px 14px !important; color:#f2f2f7 !important; background:#262628 !important; }
html body #chat:not(#z1):not(#z2) .mes[is_user="true"] .mes_text { background:#0a84ff !important; color:#fff !important; }
html body #chat:not(#z1):not(#z2) .mes .mes_text em, #chat .mes .mes_text i { color:#919191 !important; }
#form_sheld { position:fixed !important; bottom:0 !important; left:0; right:0; background:#000 !important; }
#send_form { background:#000 !important; border:0 !important; }
html body #send_textarea:not(#z1) { background:#1c1c1e !important; color:#fff !important; border-radius:18px !important; }
#tjxv3p { transform: translateY(-12px); }
html, body { height:100dvh !important; }
`;
export async function launch({ scheme='dark', init } = {}) {
  const b = await webkit.launch();
  const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], colorScheme: scheme });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 300)); if (/Force Light Dark/.test(m.text()) && m.type()==='warning') errs.push('WARN '+m.text().slice(0,300)); });
  if (init) await page.addInitScript(init);
  return { b, ctx, page, errs };
}
export const inject = (page) => page.evaluate((css) => {
  const s = document.createElement('style'); s.id = 'user-theme-sim'; s.textContent = css; document.head.appendChild(s);
}, USER_CSS);
export const snap = (page) => page.evaluate(() => {
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const bot = document.querySelector('#chat .mes[is_user="false"] .mes_text');
  const usr = document.querySelector('#chat .mes[is_user="true"] .mes_text');
  const em = document.querySelector('#chat .mes[is_user="false"] .mes_text em');
  const f = document.getElementById('form_sheld').getBoundingClientRect();
  const m = document.querySelector('meta[name="theme-color"]');
  const head = document.head;
  return {
    mode: document.documentElement.getAttribute('data-fld-mode'), ald: document.documentElement.getAttribute('data-ald-mode'),
    cls: document.documentElement.className,
    bodyBg: cs(document.body, 'backgroundColor'), scheme: cs(document.documentElement, 'colorScheme'),
    botBg: cs(bot, 'backgroundColor'), botFg: cs(bot, 'color'), userBg: cs(usr, 'backgroundColor'), userFg: cs(usr, 'color'),
    emFg: cs(em, 'color'), taBg: cs(document.getElementById('send_textarea'), 'backgroundColor'), taFg: cs(document.getElementById('send_textarea'), 'color'),
    formBg: cs(document.getElementById('form_sheld'), 'backgroundColor'), topBg: cs(document.getElementById('top-bar'), 'backgroundColor'),
    formPos: cs(document.getElementById('form_sheld'), 'position'), formRect: [Math.round(f.left), Math.round(f.top), Math.round(f.width), Math.round(f.height), Math.round(f.bottom)],
    meta: m && m.content, lastHead: head.lastElementChild && (head.lastElementChild.id || head.lastElementChild.tagName),
    nBot: document.querySelectorAll('#chat .mes[is_user="false"]').length, nUser: document.querySelectorAll('#chat .mes[is_user="true"]').length,
  };
});
export const wait = (page, ms) => page.waitForTimeout(ms);
export async function loadChat(page) {
  await page.evaluate(async () => {
    const c = SillyTavern.getContext();
    await c.selectCharacterById(1);
    await new Promise(r => setTimeout(r, 2000));
    const x = SillyTavern.getContext();
    x.chat.length = 0; document.querySelector('#chat').innerHTML = '';
    const add = (m) => { x.chat.push(m); x.addOneMessage(m); };
    add({ name: x.name2, is_user: false, is_system: false, send_date: Date.now(), mes: 'Salut ! *sourit doucement* "Comment ça va ?" Un [lien](https://example.com) et du **gras**.' });
    add({ name: 'Moi', is_user: true, is_system: false, send_date: Date.now(), mes: 'Très bien, merci ! *je souris*' });
    add({ name: x.name2, is_user: false, is_system: false, send_date: Date.now(), mes: '*Elle hoche la tête.* Parfait, on continue alors.' });
  });
  await page.waitForTimeout(600);
}
