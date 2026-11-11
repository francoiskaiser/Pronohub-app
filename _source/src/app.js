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

const TICKET_SVG = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
  <path d="M10 14h44a4 4 0 0 1 4 4v8a6 6 0 0 0 0 12v8a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-8a6 6 0 0 0 0-12v-8a4 4 0 0 1 4-4z" fill="var(--brand)"/>
  <path d="M42 18v28" stroke="var(--paper)" stroke-width="2.5" stroke-dasharray="3 3"/>
  <circle cx="24" cy="32" r="9" fill="var(--gold)"/><circle cx="24" cy="32" r="5.5" fill="none" stroke="var(--gold-ink)" stroke-width="2"/>
</svg>`;

/* ---------- Navigation ---------- */
function go(view, params = {}) {
  Object.assign(S, params, { view, modal: null });
  try { history.pushState({ view, ...params }, ""); } catch (e) { }
  render();
  window.scrollTo(0, 0);
}
function goBack() {
  if (history.state && history.state.view) history.back();
  else { S.view = S.code ? "circle" : "home"; render(); }
}
window.addEventListener("popstate", e => {
  const st = e.state || {};
  S.modal = null;
  if (st.view) Object.assign(S, st);
  else S.view = S.code ? "circle" : "home";
  render();
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
      ${cc.local ? "" : `<button class="btn small ghost wide" data-a="invite">${ICON.users} Inviter des amis</button>`}
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
      S.tab = d.v;
      if (S.view !== "circle") { go("circle"); return "keep"; }
      window.scrollTo(0, 0);
      return true;
    case "tourNext": S.modal.step = (S.modal.step || 0) + 1; return true;
  }
  return circlesAct(a, d) || homeAct(a, d) || soloAct(a, d) || betsAct(a, d) || feedAct(a, d) || profileAct(a, d) || accountAct(a, d) || settingsAct(a, d);
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
  const r = circlesSubmit(f, fd) || soloSubmit(f, fd) || betsSubmit(f, fd) || feedSubmit(f, fd) || profileSubmit(f, fd) || accountSubmit(f, fd) || (f.dataset.f === "feedback" && (sendFeedback(fd), true));
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
function boot() {
  Solo.load();
  applyTheme();
  FB.onAuth(() => Account.onAuth());
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
  const last = Store.get("last");
  if (!S.code && last && MyCircles.has(last)) { S.code = last; S.view = "circle"; }
  if (S.code) DB.open(S.code);
  if (S.pendingJoin && FB.ready && FB.ok && Profile.get().name) { S.modal = { k: "join", code: S.pendingJoin }; S.pendingJoin = null; }
  if (!Store.get("tourDone") && Profile.get().name) { S.modal = S.modal || { k: "tour", step: 0 }; Store.set("tourDone", 1); }
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
