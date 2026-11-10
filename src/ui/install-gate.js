// Phone browsers do not play: on a phone the game runs only as the installed app (home screen), where it is full
// screen, keeps its saves and works offline. Opened in Safari/Chrome on a phone, this page explains how to install
// it, in the game's own look. Desktop browsers play as before. ?debug or ?play skip the page (tests, quick checks).
import { HAT } from './intro.js';
import { isStandalone, isIOS } from './pwa.js';

const TXT = {
  it: {
    sub: 'Una storia di pesca, senza fretta',
    why: 'Sul telefono Lenza Lenta si gioca come app: a tutto schermo, anche offline, e i salvataggi restano nell\'app.',
    ios: 'Su iPhone', android: 'Su Android',
    ios1: 'Apri questa pagina in <b>Safari</b>.',
    ios2: 'Tocca <b>Condividi</b> <span class="ig-ic">⬆︎</span> in basso.',
    ios3: 'Scegli <b>«Aggiungi alla schermata Home»</b>, poi <b>Aggiungi</b>.',
    ios4: 'Apri Lenza Lenta dall\'icona sulla schermata Home.',
    and1: 'Apri questa pagina in <b>Chrome</b>.',
    and2: 'Tocca il menu <b>⋮</b> in alto a destra.',
    and3: 'Scegli <b>«Installa app»</b> (o «Aggiungi a schermata Home»).',
    and4: 'Apri Lenza Lenta dall\'icona tra le app.',
    install: 'Installa adesso',
    pc: 'Dal computer si può giocare anche nel browser.',
  },
  en: {
    sub: 'A fishing story, in no hurry',
    why: 'On a phone Lenza Lenta plays as an app: full screen, offline too, and your saves stay in the app.',
    ios: 'On iPhone', android: 'On Android',
    ios1: 'Open this page in <b>Safari</b>.',
    ios2: 'Tap <b>Share</b> <span class="ig-ic">⬆︎</span> at the bottom.',
    ios3: 'Choose <b>“Add to Home Screen”</b>, then <b>Add</b>.',
    ios4: 'Open Lenza Lenta from its home screen icon.',
    and1: 'Open this page in <b>Chrome</b>.',
    and2: 'Tap the <b>⋮</b> menu at the top right.',
    and3: 'Choose <b>“Install app”</b> (or “Add to Home screen”).',
    and4: 'Open Lenza Lenta from its app icon.',
    install: 'Install now',
    pc: 'On a computer you can also play in the browser.',
  },
};

const isPhone = () => isIOS() || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent || '');

export function shouldGate() {
  if (/[?&](debug|play)\b/.test(location.search)) return false;
  return isPhone() && !isStandalone();
}

export function showInstallPage() {
  const lang = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';
  const T = TXT[lang];
  const ios = isIOS(), android = /Android/i.test(navigator.userAgent || '');
  document.getElementById('boot')?.remove();
  const css = document.createElement('style');
  css.textContent = `
    .ig { position: fixed; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; font-family: var(--font); color: var(--ink);
      background: radial-gradient(120% 90% at 50% 30%, #d6f4f6 0%, #a9e4f2 50%, #6cc9d8 100%);
      padding: calc(env(safe-area-inset-top) + 28px) 16px calc(env(safe-area-inset-bottom) + 28px); box-sizing: border-box; }
    .ig-in { max-width: 460px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .ig .logo-text { font-size: clamp(40px, 13vw, 72px); max-width: none; }
    .ig .logo-hat { width: min(200px, 50vw); }
    .ig-sub { font-size: 16px; padding: 6px 16px 7px; }
    .ig-why { text-align: center; font-weight: 800; font-size: 16px; line-height: 1.35; color: #1d4f6a; margin: 4px 6px 0; }
    .ig-card { width: 100%; box-sizing: border-box; padding: 16px 18px 18px; border-radius: 22px; }
    .ig-card h2 { margin: 0 0 10px; font-size: 19px; font-weight: 900; display: flex; align-items: center; gap: 8px; }
    .ig-card ol { margin: 0; padding: 0; list-style: none; counter-reset: s; display: flex; flex-direction: column; gap: 10px; }
    .ig-card li { counter-increment: s; position: relative; padding-left: 38px; font-size: 15.5px; line-height: 1.35; min-height: 28px; }
    .ig-card li::before { content: counter(s); position: absolute; left: 0; top: -1px; width: 27px; height: 27px; border-radius: 50%;
      background: var(--sea); color: #fff; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 0 var(--sea-d); }
    .ig-card.dim { opacity: .72; }
    .ig-ic { display: inline-block; font-weight: 900; color: var(--sea-d); }
    .ig-pc { font-size: 13.5px; font-weight: 700; color: #1d4f6a; opacity: .8; text-align: center; }
    .ig-go { width: 100%; }
    .ig-go[hidden] { display: none !important; }`;
  document.head.append(css);
  const steps = (k) => `<ol>${[1, 2, 3, 4].map(i => `<li>${T[k + i]}</li>`).join('')}</ol>`;
  const iosCard = `<section class="ig-card paper stitched${android ? ' dim' : ''}"><h2>🍎 ${T.ios}</h2>${steps('ios')}</section>`;
  const andCard = `<section class="ig-card paper stitched${ios ? ' dim' : ''}"><h2>🤖 ${T.android}</h2>${steps('and')}</section>`;
  const page = document.createElement('div');
  page.className = 'ig';
  page.innerHTML = `<div class="ig-in">
    <div class="logo">${HAT}<h1 class="logo-text"><span class="l1">Lenza</span><span class="l2">Lenta</span></h1></div>
    <div class="ig-sub plank">${T.sub}</div>
    <p class="ig-why">${T.why}</p>
    <button class="btn gold big ig-go" type="button" hidden>${T.install}</button>
    ${android ? andCard + iosCard : iosCard + andCard}
    <p class="ig-pc">${T.pc}</p></div>`;
  document.body.append(page);
  // Android Chrome: a real install button when the browser offers it (needs the service worker)
  const go = page.querySelector('.ig-go');
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; go.hidden = !android; });
  go.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch { /* closed */ } deferred = null; go.hidden = true; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // once installed and opened from the icon the page is not shown any more (standalone)
}
