/* Pronohub — état, rendu, navigation, actions */
"use strict";

const S = {
  view: "home",     // home | circle | bet | player | settings
  tab: "bets",      // bets | rank | feed | me
  code: null,       // cercle ouvert
  betId: null,
  playerId: null,
  modal: null,
  filter: "open",
  actor: null,      // joueur actif dans un cercle « sur cet appareil »
  pendingJoin: null,
};
let _renderTick = 0;

const svg = (p, extra = "") => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
const ICON = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  chev: svg('<path d="M9 18l6-6-6-6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  ticket: svg('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  send: svg('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'),
  coin: `<span class="coin" aria-hidden="true"></span>`,
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
};

// Logo de l'app : le ticket anthracite sur fond orange (dessin d'origine : tools/logo.svg)
const TICKET_SVG = `<svg viewBox="0 0 1024 1024" width="64" height="64" aria-hidden="true" focusable="false">
  <defs><linearGradient id="lg-bg" x1="512" y1="1140" x2="512" y2="725" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7a491d"/><stop offset="1" stop-color="#f49239"/></linearGradient></defs>
  <rect width="1024" height="1024" rx="224" fill="url(#lg-bg)"/>
  <path fill="#2d2d2d" d="M983.85,561.87l-13.55-63.11c-57.18,12.28-113.49-24.12-125.77-81.31-12.28-57.18,24.12-113.49,81.31-125.77l-13.55-63.11c-5.26-24.51-29.39-40.11-53.9-34.85L107.01,355.07c-24.51,5.26-40.11,29.39-34.85,53.9l13.55,63.11c57.18-12.28,113.49,24.12,125.77,81.31,12.28,57.18-24.12,113.49-81.31,125.77l13.55,63.11c5.26,24.51,29.39,40.11,53.9,34.85l751.38-161.33c24.51-5.26,40.11-29.39,34.85-53.9ZM530.98,403.62c20.02-4.41,39.83,8.22,44.28,28.23,4.43,19.9-8.27,39.81-28.29,44.32-19.76,4.45-39.7-8.31-44.26-28.33-4.53-19.87,8.22-39.8,28.27-44.22ZM435.96,376.92c26.61-5.76,53.21,11.21,59.03,37.66,5.89,26.76-11.11,53.44-37.85,59.44-26.61,5.97-53.71-11.57-59.33-38.39-5.58-26.6,11.55-52.96,38.15-58.71ZM360.88,440.76c20.04-4.11,39.72,8.7,43.81,28.53,4.15,20.13-8.71,40.05-28.49,44.16-20.13,4.18-39.95-8.65-44.14-28.56-4.25-20.23,8.66-40,28.82-44.13ZM380.07,637.62c-4.73.96-9.55,2.29-14.3,2.16-11.95-.32-20.79-8.23-23.45-20.2-3.14-14.1-6.19-28.22-9.25-42.34-5.13-23.69,8-44.82,31.54-50.58,6.94-1.7,13.95-3.07,21.28-4.67-.14,2.32-.49,4.26-.33,6.16.42,5.28.59,10.64,1.68,15.79,5.03,23.89,10.3,47.73,15.57,71.57,1.18,5.34,2.73,10.59,4.22,16.27-8.75,1.91-17.82,3.98-26.94,5.84ZM543.38,602c-18.57,4.07-37.14,8.11-55.71,12.17-18.48,4.03-36.96,8.07-55.44,12.1-6.71,1.46-10.27-.83-11.74-7.53-5.79-26.49-11.62-52.97-17.33-79.47-4.28-19.88,4.73-38.31,22.95-46.99,2.74-1.31,5.74-2.22,8.72-2.88,16.27-3.64,32.56-7.25,48.88-10.69,19.57-4.12,37.96,4.95,46.49,22.92,1.42,2.99,2.39,6.27,3.11,9.52,5.86,26.47,11.61,52.97,17.39,79.46,1.38,6.34-.97,10.01-7.32,11.4ZM619.76,576.5c-2.9,5.14-6.82,9.55-12.46,10.98-13.06,3.31-26.31,5.89-38.85,8.63-1.61-8.1-3.15-16.4-4.92-24.64-4.35-20.22-8.82-40.41-13.2-60.62-1.62-7.5-3.78-14.79-7.81-21.4-.23-.37-.29-.84-.54-1.62,11.79-1.85,22.97-6.77,35.03-5.09,16.29,2.27,27.62,11.19,33.81,26.5.17.41.49.76.74,1.14,3.78,17.3,7.55,34.61,11.33,51.91-.14,4.94-.62,9.77-3.13,14.23ZM668.15,271.63l28.26-6.07,9.53,44.37-28.26,6.07-9.53-44.37ZM684.62,348.34l28.26-6.07,9.53,44.37-28.26,6.07-9.53-44.37ZM701.09,425.05l28.26-6.07,9.53,44.37-28.26,6.07-9.53-44.37ZM717.56,501.76l28.26-6.07,9.53,44.37-28.26,6.07-9.53-44.37ZM743.56,622.85l-9.53-44.37,28.26-6.07,9.53,44.37-28.26,6.07Z"/>
</svg>`;

/* ---------- Navigation ---------- */
/* Chaque écran est une entrée de l'historique du navigateur : le bouton retour du téléphone
   ramène à l'écran précédent, ferme une fenêtre ouverte, et ne quitte l'app que depuis l'accueil. */
const Hist = { modal: false, ignore: 0 };
function navState(view, params = {}) {
  return Object.assign({ view, code: S.code, tab: S.tab, betId: S.betId, playerId: S.playerId, soloView: S.soloView }, params, { view });
}
function navPush(st) {
  try {
    if (Hist.modal) { history.replaceState(st, ""); Hist.modal = false; }
    else history.pushState(st, "");
  } catch (e) { }
}
function go(view, params = {}) {
  Object.assign(S, params, { view, modal: null });
  navPush(navState(view, params));
  render();
  window.scrollTo(0, 0);
}
function goBack() {
  if (history.state && history.state.view && history.length > 1) history.back();
  else { S.view = S.code ? "circle" : "home"; render(); }
}
function restoreNav(st) {
  S.modal = null;
  const view = st.view || "home";
  if (view !== "home" && view !== "solo" && view !== "settings" && st.code && st.code !== S.code) {
    S.code = st.code; S.actor = null; Store.set("last", st.code); DB.open(st.code);
  }
  Object.assign(S, { view, tab: st.tab || "bets", betId: st.betId ?? S.betId, playerId: st.playerId ?? S.playerId, soloView: st.soloView || S.soloView });
  if (view === "home") Store.del("last");
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", e => {
  if (Hist.ignore) { Hist.ignore--; return; }
  // Retour avec une fenêtre ouverte : on ferme seulement la fenêtre
  if (Hist.modal) {
    Hist.modal = false;
    if (S.modal && S.modal.k === "ask") askDone(false);
    S.modal = null;
    render();
    return;
  }
  restoreNav(e.state || {});
});

/* ---------- Rendu ---------- */
function topBar(cc, a) {
  const me = myId(cc), p = a.players[me];
  const c = cc.circle;
  const tabs = [["bets", "Paris", ICON.ticket], ["rank", "Classement", ICON.trophy], ["feed", "Fil", ICON.chat], ["me", "Moi", ICON.user]];
  return `<header class="top">
    <button class="circle-btn" data-a="switcher" aria-label="Changer de cercle">
      <span class="cb-emo" aria-hidden="true">${esc(c.emoji || "🎯")}</span><span class="cb-name">${esc(c.name)}</span>${ICON.down}
    </button>
    <nav class="top-tabs" aria-label="Sections">${tabs.map(([k, l, i]) => `<button class="${S.view === "circle" && S.tab === k ? "on" : ""}" data-a="tab" data-v="${k}">${i}<span>${l}</span></button>`).join("")}</nav>
    <div class="top-right">
      ${cc.local ? `<button class="actor-chip" data-a="actor" aria-label="Changer de joueur">${avatar(memberOf(cc, me), "sm")}<span>${esc(memberOf(cc, me).name)}</span></button>` : ""}
      <button class="coin-chip" data-a="tab" data-v="me" aria-label="Mon solde">${ICON.coin}<b>${nf(p ? p.bal : 0)}</b></button>
      <button class="icon-btn" data-a="settings" aria-label="Réglages">${ICON.gear}</button>
    </div>
  </header>`;
}

function tabBar() {
  const tabs = [["bets", "Paris", ICON.ticket], ["rank", "Classement", ICON.trophy], ["feed", "Fil", ICON.chat], ["me", "Moi", ICON.user]];
  return `<nav class="tabbar" aria-label="Sections">${tabs.map(([k, l, i]) => `<button class="${S.view === "circle" && S.tab === k ? "on" : ""}" data-a="tab" data-v="${k}" ${S.view === "circle" && S.tab === k ? 'aria-current="page"' : ""}>${i}<span>${l}</span></button>`).join("")}</nav>`;
}

function asideCol(cc, a) {
  const me = myId(cc);
  const top = a.standings.slice(0, 6);
  const ev = feedEvents(cc, a, 8);
  return `<aside class="side">
    <div class="panel">
      <div class="row between"><h3>Classement</h3><button class="link" data-a="tab" data-v="rank">Tout voir</button></div>
      <ol class="mini-rank">${top.map(s => `<li class="${s.uid === me ? "me" : ""}"><span class="rk">${s.rank}</span>${avatar(s, "sm")}<span class="grow">${esc(s.name)}</span><b>${nf(s.bal)}</b></li>`).join("")}</ol>
      ${cc.local || cc.circle.duo ? "" : `<button class="btn small ghost wide" data-a="invite">${ICON.users} Inviter des amis</button>`}
    </div>
    <div class="panel">
      <div class="row between"><h3>Dernières nouvelles</h3><button class="link" data-a="tab" data-v="feed">Le fil</button></div>
      ${ev.length ? `<ul class="feed mini">${ev.map(e => feedItem(cc, e)).join("")}</ul>` : `<p class="muted">Rien pour l'instant.</p>`}
    </div>
  </aside>`;
}

function render() {
  _renderTick++;
  _pendingLive = false;
  const app = $("#app");
  let main = "", header = "", tabbar = "", aside = "", fab = "";
  let view = S.view;
  const cc = DB.cur();
  if (view === "settings") main = settingsView();
  else if (view === "solo") main = soloView();
  else if (!S.code || view === "home") { view = "home"; main = homeView(); }
  else if (!cc || cc.status !== "ok" || !cc.circle) { view = "state"; main = circleStateView(cc); }
  else {
    const a = analysis(cc);
    updateSnap(cc, a);
    Friends.fixDuo(cc);
    if (S.pendingMatch) setTimeout(processPendingMatch, 0);
    header = topBar(cc, a);
    tabbar = tabBar();
    aside = asideCol(cc, a);
    if (view === "bet") main = betView(cc, a);
    else if (view === "player") main = playerView(cc, a);
    else {
      view = "circle";
      main = S.tab === "rank" ? rankTab(cc, a) : S.tab === "feed" ? feedTab(cc, a) : S.tab === "me" ? meTab(cc, a) : betsTab(cc, a);
      if (S.tab === "bets") fab = `<button class="fab" data-a="newBet">${ICON.plus}<span>Nouveau pari</span></button>`;
    }
  }
  document.body.dataset.view = view;
  document.body.dataset.tab = S.tab;
  app.innerHTML = `${header}<div class="shell ${aside ? "has-side" : ""}"><main id="main">${main}</main>${aside}</div>${fab}${tabbar}`;
  renderModal();
}

let _lastModal = null;
function renderModal() {
  const ov = $("#overlay");
  const m = S.modal;
  // Une fenêtre ouverte ajoute une entrée d'historique, que l'on retire à sa fermeture
  try {
    if (m && !Hist.modal) { history.pushState(Object.assign({}, history.state, { modal: 1 }), ""); Hist.modal = true; }
    else if (!m && Hist.modal) { Hist.modal = false; Hist.ignore++; history.back(); }
  } catch (e) { }
  if (!m) { ov.hidden = true; ov.innerHTML = ""; _lastModal = null; document.body.classList.remove("modal-open"); return; }
  const cc = DB.cur();
  const a = cc && cc.status === "ok" ? analysis(cc) : null;
  let html = "";
  switch (m.k) {
    case "account": html = Account.modal(); break;
    case "newCircle": html = newCircleModal(); break;
    case "join": html = joinModal(); break;
    case "invite": html = S.code ? inviteModal() : ""; break;
    case "switcher": html = switcherModal(); break;
    case "circle": html = cc && cc.circle ? circleModal() : ""; break;
    case "recover": html = recoverModal(); break;
    case "actor": html = actorModal(); break;
    case "newBet": html = a ? newBetModal(cc) : ""; break;
    case "wager": html = a ? wagerModal(cc, a) : ""; break;
    case "settle": html = a ? settleModal(cc, a) : ""; break;
    case "editProfile": html = editProfileModal(); break;
    case "feedback": html = feedbackModal(); break;
    case "legal": html = legalModal(); break;
    case "tour": html = tourModal(); break;
    case "ask": html = askModal(); break;
    case "install": html = installModal(); break;
    case "pickCircle": html = pickCircleModal(); break;
    default: html = friendsModal(cc);
  }
  if (!html) { S.modal = null; return renderModal(); }
  ov.hidden = false;
  document.body.classList.add("modal-open");
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(m.k)}"><button class="sheet-x icon-btn" data-a="close" aria-label="Fermer">${ICON.x}</button>${html}</div>`;
  const key = m.k + (m.kind || "") + (m.mode || "") + (m.step || "");
  if (key !== _lastModal) {
    _lastModal = key;
    const f = ov.querySelector("input:not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea");
    if (f && matchMedia("(pointer: fine)").matches) f.focus();
    else ov.querySelector(".sheet").focus({ preventScroll: true });
  }
}

/* Rendu « en direct » (données qui arrivent) sans casser une saisie en cours */
let _pendingLive = false;
function liveRender() {
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== "radio" && el.type !== "checkbox" && el.type !== "file") { _pendingLive = true; return; }
  render();
}
document.addEventListener("focusout", () => setTimeout(() => { if (_pendingLive) liveRender(); }, 50));

/* ---------- Confirmation (remplace confirm() du navigateur) ---------- */
function ask(msg, ok = "Confirmer", danger = false) {
  return new Promise(res => {
    S.modal = { k: "ask", msg, ok, danger, res, prev: S.modal && S.modal.k !== "ask" ? S.modal : null };
    render();
  });
}
function askModal() {
  const m = S.modal;
  return `<div class="ask"><p class="ask-msg">${esc(m.msg)}</p>
    <div class="row end"><button class="btn ghost" data-a="askNo">Annuler</button><button class="btn ${m.danger ? "danger" : "primary"}" data-a="askYes">${esc(m.ok)}</button></div></div>`;
}
function askDone(v) {
  const m = S.modal;
  S.modal = m.prev;
  m.res(v);
}

/* ---------- Présentation ---------- */
const TOUR = [
  { e: "🪙", t: "Des jetons, pas d'argent", d: "Chaque membre reçoit des jetons au début de la saison, plus un petit bonus chaque jour. Ils n'ont aucune valeur : seule la gloire compte." },
  { e: "📈", t: "Les cotes bougent toutes seules", d: "Toutes les mises vont dans une cagnotte que se partagent les gagnants. Moins il y a de monde sur ton choix, plus il rapporte." },
  { e: "🎟️", t: "Parie sur tout", d: "Importe les matchs de foot ou de NBA, crée une question pour le bureau, une élection, ou défie un ami en duel." },
  { e: "🧑‍⚖️", t: "Un résultat juste", d: "Le créateur du pari saisit le résultat, ou il arrive tout seul pour les matchs importés. Si la majorité des parieurs le conteste, les gains sont gelés." },
];
function tourModal() {
  const i = S.modal.step || 0, s = TOUR[i];
  return `<div class="tour">
    <div class="tour-emo" aria-hidden="true">${s.e}</div>
    <h2>${s.t}</h2><p>${s.d}</p>
    <div class="dots" aria-hidden="true">${TOUR.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div>
    <div class="row between">
      <button class="btn ghost" data-a="close">Passer</button>
      ${i < TOUR.length - 1 ? `<button class="btn primary" data-a="tourNext">Suivant</button>` : `<button class="btn primary" data-a="close">Compris</button>`}
    </div></div>`;
}

/* ---------- Actions ---------- */
function act(a, d) {
  switch (a) {
    case "close": if (S.modal && S.modal.k === "ask") { askDone(false); return true; } S.modal = null; return true;
    case "askYes": askDone(true); return true;
    case "askNo": askDone(false); return true;
    case "back": goBack(); return "keep";
    case "reload": location.reload(); return "keep";
    case "tab":
      if (S.view !== "circle") { S.tab = d.v; go("circle"); return "keep"; }
      if (S.tab !== d.v) {
        const hs = history.state || {};
        S.tab = d.v;
        // Un seul niveau d'onglet dans l'historique : retour depuis Classement, Fil ou Moi revient aux Paris
        if (hs.view === "circle" && hs.tab && hs.tab !== "bets") history.replaceState(navState("circle"), "");
        else navPush(navState("circle"));
      }
      window.scrollTo(0, 0);
      return true;
    case "tourNext": S.modal.step = (S.modal.step || 0) + 1; return true;
  }
  return circlesAct(a, d) || homeAct(a, d) || soloAct(a, d) || betsAct(a, d) || feedAct(a, d) || profileAct(a, d) || accountAct(a, d) || settingsAct(a, d) || pushAct(a, d) || friendsAct(a, d);
}

document.addEventListener("click", e => {
  const ov = $("#overlay");
  if (e.target === ov) { if (S.modal && S.modal.k === "ask") askDone(false); else S.modal = null; render(); return; }
  const el = e.target.closest("[data-a]");
  if (!el || el.disabled) return;
  if (el.tagName === "A") e.preventDefault();
  const r = act(el.dataset.a, Object.assign({}, el.dataset));
  if (r === true) render();
});

document.addEventListener("submit", e => {
  const f = e.target.closest("form[data-f]");
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const r = circlesSubmit(f, fd) || soloSubmit(f, fd) || betsSubmit(f, fd) || feedSubmit(f, fd) || profileSubmit(f, fd) || accountSubmit(f, fd) || friendsSubmit(f, fd) || (f.dataset.f === "feedback" && (sendFeedback(fd), true));
  if (r === true) render();
});

document.addEventListener("input", e => {
  const t = e.target;
  if (t.name === "amt" && t.closest('form[data-f="wager"]')) updatePotential();
  if (t.name === "slipStake") updateSlip();
  if (t.classList.contains("code-input")) {
    const v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    t.value = v.length > 3 ? v.slice(0, 3) + "-" + v.slice(3) : v;
  }
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.f === "league") { loadFixtures(t.value); return; }
  if (t.dataset.f === "import" && t.files && t.files[0]) { importData(t.files[0]); t.value = ""; return; }
  if (t.type === "checkbox" && t.name === "fx" && S.modal) S.modal.sel = $$('input[name="fx"]:checked').map(x => x.value);
  if (t.type === "radio") {
    const grp = t.closest(".emoji-grid, .choice-list, .segs");
    if (grp) $$("label", grp).forEach(l => l.classList.toggle("on", !!l.querySelector("input:checked")));
    if (t.name === "where" && S.modal) S.modal.where = t.value;
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && S.modal) { if (S.modal.k === "ask") askDone(false); else S.modal = null; render(); }
});

/* ---------- Démarrage ---------- */
/* Liens en attente (invitation d'ami ou défi) : traités une fois connecté et le pseudo choisi */
function processPending() {
  if (S.pendingAmi && FB.ok && FB.uid && Profile.get().name && !S.modal) {
    const k = S.pendingAmi; S.pendingAmi = null;
    Friends.openLink(k);
  }
}

function boot() {
  Solo.load();
  applyTheme();
  FB.onAuth(() => Account.onAuth());
  FB.onAuth(() => { Push.onAuth(); });
  FB.onAuth(() => { Friends.listen(); processPending(); });
  FB.onAuth(() => {
    const cc = DB.cur();
    if (S.code && (!cc || !cc.local) && (!cc || cc.status !== "ok")) { const c = S.code; DB.close(); DB.open(c); }
    if (S.pendingJoin && Profile.get().name) { S.modal = { k: "join", code: S.pendingJoin }; S.pendingJoin = null; }
  });
  FB.init();

  const q = new URLSearchParams(location.search);
  const join = normCode(q.get("join"));
  if (join) {
    history.replaceState(null, "", location.pathname);
    if (MyCircles.has(join)) { S.code = join; S.view = "circle"; }
    else S.pendingJoin = join;
  }
  // Lancement depuis l'app Android du Play Store : ?store=android (adresse de départ de l'emballage)
  if (q.get("store") === "android" || /^android-app:/.test(document.referrer || "")) Store.set("native", "android");
  // Liens des pages publiques : ?compte=1 ouvre le compte (suppression), ?retour=1 le formulaire de contact
  if (q.get("compte")) S.modal = { k: "account" };
  else if (q.get("retour")) S.modal = { k: "feedback" };
  if (q.get("store") || q.get("compte") || q.get("retour")) history.replaceState(null, "", location.pathname);
  // Lien d'ami ou de défi : ?ami=CLÉ ; notification « amis » : ?amis=1
  const ami = q.get("ami");
  if (ami && /^[A-Za-z0-9]{6,20}$/.test(ami)) { history.replaceState(null, "", location.pathname); S.pendingAmi = ami; }
  if (q.get("amis")) { history.replaceState(null, "", location.pathname); S.view = "home"; S.code = null; Store.del("last"); }
  // Ouverture depuis une notification : ?c=CODE&b=PARI
  const nc = normCode(q.get("c")), nb = q.get("b");
  if (nc) {
    history.replaceState(null, "", location.pathname);
    if (MyCircles.has(nc)) { S.code = nc; S.view = nb ? "bet" : "circle"; S.betId = nb || null; S.tab = "bets"; Store.set("last", nc); }
  }
  const last = Store.get("last");
  if (!S.code && !q.get("amis") && last && MyCircles.has(last)) { S.code = last; S.view = "circle"; }
  if (S.code) { DB.open(S.code); Seen.mark(S.code); }
  if (S.pendingJoin && FB.ready && FB.ok && Profile.get().name) { S.modal = { k: "join", code: S.pendingJoin }; S.pendingJoin = null; }
  if (!Store.get("tourDone") && Profile.get().name) { S.modal = S.modal || { k: "tour", step: 0 }; Store.set("tourDone", 1); }
  // L'accueil sert de première page : le retour depuis un cercle y ramène avant de quitter l'app
  try {
    history.replaceState({ view: "home" }, "");
    if (S.code) history.pushState(navState("circle", { tab: "bets", view: "circle" }), "");
    if (S.code && S.view === "bet") history.pushState(navState("bet"), "");
  } catch (e) { }
  render();
  $("#splash") && $("#splash").remove();

  setInterval(() => { if (!S.modal) liveRender(); }, 30000);
  setInterval(() => Sports.autoSettle(), 60000);
  setInterval(() => { if (S.view === "solo" && S.soloView === "daily") Daily.refresh(); }, 120000);
  setTimeout(() => Sports.autoSettle(), 4000);

  // Service worker et mises à jour
  if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE }).catch(() => { });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (had) $("#update").hidden = false;
      had = true;
    });
  }
}
