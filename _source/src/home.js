/* Pronohub — accueil, matchs à venir, installation de l'app */
"use strict";

/* ---------- Matchs à venir (bandeau) ---------- */
const STRIP_LEAGUES = ["bel.1", "uefa.champions", "fra.1", "eng.1", "esp.1", "nba"];
const Strip = { lg: Store.get("stripLeague") || "bel.1", data: {}, loading: {}, err: {} };

async function loadStrip(lg, force = false) {
  if (Strip.loading[lg]) return;
  if (force) { delete Sports.cache["fx:" + lg + ":21"]; Store.del("fx." + lg); }
  Strip.loading[lg] = true; Strip.err[lg] = false;
  try { Strip.data[lg] = (await Sports.fixtures(lg, 21)).slice(0, 16); }
  catch (e) { Strip.err[lg] = true; }
  Strip.loading[lg] = false;
  queueRender();
}

function teamLogo(url, name) {
  return url ? `<img src="${esc(url)}" alt="" loading="lazy" width="28" height="28" onerror="this.style.visibility='hidden'">`
    : `<span class="crest" aria-hidden="true">${esc(name.charAt(0))}</span>`;
}

function matchStrip(cc) {
  const lg = Strip.lg;
  if (!Strip.data[lg] && !Strip.loading[lg] && !Strip.err[lg]) setTimeout(() => loadStrip(lg), 0);
  const list = Strip.data[lg];
  const existing = new Map();
  if (cc) for (const [id, b] of Object.entries(cc.bets)) if (b.src && b.status === "open") existing.set(b.src.event, id);
  const chips = STRIP_LEAGUES.map(id => {
    const L = LEAGUE[id];
    return `<button class="chip ${id === lg ? "on" : ""}" data-a="stripLeague" data-v="${id}" aria-pressed="${id === lg}">${CAT[L.cat].e} ${esc(L.name)}</button>`;
  }).join("");
  let body;
  if (!list && !Strip.err[lg]) body = `<div class="mrow">${[0, 1, 2].map(() => `<div class="mcard ghost" aria-hidden="true"></div>`).join("")}</div>`;
  else if (Strip.err[lg]) body = `<p class="strip-note">Le calendrier ne répond pas pour l'instant. <button class="link" data-a="stripRetry">Réessayer</button></p>`;
  else if (!list.length) body = `<p class="strip-note">Pas de match dans les trois prochaines semaines pour cette compétition.</p>`;
  else body = `<div class="mrow">${list.map(e => {
    const bet = existing.get(e.id);
    return `<article class="mcard">
      <span class="m-when">${fmtDate(e.date)}</span>
      <span class="m-team">${teamLogo(e.homeLogo, e.home)}<b>${esc(e.home)}</b></span>
      <span class="m-team">${teamLogo(e.awayLogo, e.away)}<b>${esc(e.away)}</b></span>
      ${bet ? `<button class="btn small" data-a="openBet" data-id="${esc(bet)}">Voir le pari</button>`
        : `<button class="btn small primary" data-a="matchBet" data-lg="${lg}" data-id="${esc(e.id)}">Parier</button>`}
    </article>`;
  }).join("")}</div>`;
  return `<div class="strip">
    <div class="chips strip-chips" role="group" aria-label="Compétitions">${chips}</div>
    ${body}
    <p class="source">Calendrier : ESPN (source publique non officielle).</p>
  </div>`;
}

/* Crée (ou retrouve) le pari d'un match importé dans un cercle */
async function createMatchBet(cc, lgId, e, withBonus = true) {
  const L = LEAGUE[lgId];
  const id = "m_" + L.id.replace(/\./g, "") + "_" + e.id;
  if (cc.bets[id]) return id;
  if (e.date <= Date.now() + 60000) { toast("Ce match a déjà commencé", "bad"); return null; }
  const bet = {
    kind: "match", cat: L.cat, title: e.home + " – " + e.away, desc: "", home: e.home, away: e.away, homeLogo: e.homeLogo || "", awayLogo: e.awayLogo || "",
    options: [{ id: "h", label: e.home }].concat(L.draw ? [{ id: "d", label: "Match nul" }] : [], [{ id: "a", label: e.away }]),
    closesAt: e.date, createdBy: myId(cc), createdAt: now(), season: cc.circle.season, status: "open", seed: cc.circle.seed,
    bonus: withBonus ? cc.circle.bonus : 0, src: { league: L.id, event: e.id },
  };
  return (await DB.put("bets", id, bet)) ? id : null;
}

/* Pari sur un match choisi depuis l'accueil : on ouvre le cercle, puis on crée le pari dès qu'il est prêt */
function processPendingMatch() {
  const pm = S.pendingMatch, cc = DB.cur();
  if (!pm || !cc || cc.status !== "ok" || !cc.circle || cc.code !== pm.code) return;
  S.pendingMatch = null;
  createMatchBet(cc, pm.lg, pm.e).then(id => { if (id) { toast("Pari créé, à toi de miser !", "good"); go("bet", { betId: id }); } });
}

function startMatchBet(code, lg, e) {
  S.pendingMatch = { code, lg, e };
  if (S.code === code && DB.cur() && DB.cur().status === "ok") { S.modal = null; processPendingMatch(); return; }
  openCircle(code);
}

function pickCircleModal() {
  const m = S.modal, e = m.e;
  return `<h2>Dans quel cercle ?</h2>
    <p class="muted">${esc(e.home)} – ${esc(e.away)}, ${fmtDate(e.date)}</p>
    <div class="circle-list compact">${MyCircles.list().map(c => `
      <button class="circle-card" data-a="pickCircle" data-code="${esc(c.code)}">
        <span class="cc-emoji" aria-hidden="true">${esc(c.emoji || "🎯")}</span>
        <span class="cc-body"><b>${esc(c.name)}</b><small>${c.local ? "Sur cet appareil" : "Code " + esc(c.code)}</small></span>
      </button>`).join("")}</div>
    <div class="row end"><button class="btn ghost" data-a="close">Annuler</button></div>`;
}

/* Résumé de chaque cercle, gardé sur l'appareil pour enrichir l'accueil */
function updateSnap(cc, a) {
  const me = myId(cc), s = a.standings.find(x => x.uid === me);
  if (!s) return;
  const bets = Object.values(a.bets);
  const snap = {
    bal: s.bal, rank: s.rank, n: a.standings.length,
    open: bets.filter(x => x.state === "open").length,
    todo: bets.filter(x => (x.state === "closed" || x.state === "contested") && canManage(cc, x.b, me)).length,
    faces: a.standings.slice(0, 5).map(x => ({ uid: x.uid, name: x.name, avatar: x.avatar || "" })),
  };
  const meta = MyCircles.list().find(c => c.code === cc.code);
  if (meta && JSON.stringify(meta.snap) !== JSON.stringify(snap)) MyCircles.update(cc.code, { snap });
}

/* ---------- Accueil ---------- */
function homeView() {
  const p = Profile.get();
  if (!p.name) return welcomeView();
  const list = MyCircles.list();
  const snaps = list.map(c => c.snap).filter(Boolean);
  const open = snaps.reduce((t, s) => t + s.open, 0);
  const todo = snaps.reduce((t, s) => t + s.todo, 0);
  let headline;
  if (!list.length) headline = "Crée ton premier cercle";
  else if (todo) headline = todo > 1 ? `${todo} résultats à saisir` : "Un résultat à saisir";
  else if (open) headline = open > 1 ? `${open} paris en cours` : "Un pari en cours";
  else headline = "Lance le prochain pari";

  const card = c => {
    const s = c.snap;
    const tags = [];
    if (s) {
      tags.push(`<span class="tag">${s.rank === 1 ? "En tête" : `Rang ${s.rank} / ${s.n}`}</span>`);
      if (s.open) tags.push(`<span class="tag">${s.open} ${pl(s.open, "pari ouvert", "paris ouverts")}</span>`);
      if (s.todo) tags.push(`<span class="tag warn">${s.todo} à régler</span>`);
    } else tags.push(`<span class="tag">${c.local ? "Sur cet appareil" : "Code " + esc(c.code)}</span>`);
    return `<button class="circle-card rich" data-a="openCircle" data-code="${esc(c.code)}">
      <span class="cc-emoji" aria-hidden="true">${esc(c.emoji || "🎯")}</span>
      <span class="cc-body"><b>${esc(c.name)}</b>
        ${s && s.faces ? `<span class="faces" aria-hidden="true">${s.faces.map(f => avatar(f, "sm")).join("")}</span>` : ""}
        <span class="tags">${tags.join("")}</span></span>
      ${s ? `<span class="cc-bal">${ICON.coin}<b>${nf(s.bal)}</b></span>` : `<span class="cc-go" aria-hidden="true">${ICON.chev}</span>`}
    </button>`;
  };

  return `<section class="page home">
    <header class="home-top">
      <span class="home-brand"><span class="logo-mark small" aria-hidden="true">${TICKET_SVG}</span>Pronohub</span>
      <span class="row">
        ${FB.ok ? `<button class="icon-btn" data-a="account" aria-label="Compte">${ICON.user}</button>` : ""}
        <button class="icon-btn" data-a="settings" aria-label="Réglages">${ICON.gear}</button>
      </span>
    </header>
    <div class="hello">
      <div class="hello-av">${avatar({ uid: p.id, name: p.name, avatar: p.avatar }, "xl")}</div>
      <div>
        <p class="kicker">Salut ${esc(p.name)}</p>
        <h1 class="display">${headline}</h1>
      </div>
    </div>
    ${installCard()}
    ${pushHomeCard()}
    ${soloHomeCard()}
    <div class="home-grid">
      <div class="home-main">
        <div class="sec-head"><h2>Mes cercles</h2>${list.length ? `<button class="btn small ghost" data-a="newCircle">${ICON.plus} Créer</button>` : ""}</div>
        ${list.length ? `<div class="circle-list">${list.map(card).join("")}</div>` : `<ol class="how">
          <li><b>Crée ton cercle</b><span>Les collègues, la famille, les potes du foot.</span></li>
          <li><b>Invite tes amis</b><span>Un code ou un lien suffit, ils rejoignent en un clic.</span></li>
          <li><b>Pariez des jetons</b><span>Matchs, élections, questions du bureau. Le meilleur finit en tête.</span></li>
        </ol>`}
        <div class="home-actions">
          ${list.length ? "" : `<button class="btn primary big" data-a="newCircle">${ICON.plus} Créer un cercle</button>`}
          <button class="btn big" data-a="joinCircle" ${FB.ok ? "" : "disabled"}>Rejoindre avec un code</button>
        </div>
        ${FB.ok ? "" : `<p class="note">Les cercles en ligne ne sont pas encore activés sur cette installation : crée un cercle « sur cet appareil » et passez-vous le téléphone.</p>`}
      </div>
      <div class="home-side">
        <div class="sec-head"><h2>Matchs à venir</h2></div>
        ${matchStrip(null)}
      </div>
    </div>
  </section>`;
}

/* ---------- Installation sur l'écran d'accueil ---------- */
const Install = {
  prompt: null,
  standalone() {
    try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; }
  },
  platform() {
    const ua = navigator.userAgent || "";
    if (/FBAN|FBAV|Instagram|WhatsApp|Messenger|Snapchat|Line\//i.test(ua)) return "inapp";
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios";
    if (/Android/.test(ua)) return /SamsungBrowser/.test(ua) ? "samsung" : /Firefox/.test(ua) ? "android-firefox" : "android";
    return "desktop";
  },
  hidden() { const t = Store.get("installHide"); return t && Date.now() - t < 14 * 86400000; },
};
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); Install.prompt = e; queueRender(); });
window.addEventListener("appinstalled", () => { Install.prompt = null; toast("Pronohub est installée", "good"); queueRender(); });

function installCard() {
  if (Install.standalone() || Install.hidden()) return "";
  const desk = Install.platform() === "desktop";
  return `<div class="install">
    <span class="install-icon" aria-hidden="true">${TICKET_SVG}</span>
    <span class="grow"><b>${desk ? "Installe Pronohub sur ton ordinateur" : "Installe Pronohub sur ton téléphone"}</b>
      <small>Une icône sur l'écran d'accueil, en plein écran, sans passer par le navigateur.</small></span>
    <span class="install-acts">
      <button class="btn primary small" data-a="install">Installer</button>
      <button class="icon-btn tiny" data-a="installHide" aria-label="Masquer pendant deux semaines">${ICON.x}</button>
    </span>
  </div>`;
}

const SHARE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
const DOTS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;

function installModal() {
  const pf = S.modal.pf || Install.platform();
  const k = i => `<span class="kbd">${i}</span>`;
  const steps = {
    ios: [
      `Dans Safari, touche le bouton Partager ${k(SHARE_ICON)}. Sur un iPhone récent, il se trouve dans le menu ${k("•••")} en bas à droite.`,
      `Fais défiler et choisis « Sur l'écran d'accueil ».`,
      `Touche « Ajouter » : Pronohub apparaît avec les autres apps.`,
    ],
    "ios-other": [
      `Touche le bouton Partager ${k(SHARE_ICON)} à côté de la barre d'adresse.`,
      `Choisis « Sur l'écran d'accueil ». Si l'option manque, ouvre la page dans Safari.`,
      `Touche « Ajouter ».`,
    ],
    android: [
      `Dans Chrome, ouvre le menu ${k(DOTS_ICON)} en haut à droite.`,
      `Choisis « Installer l'application » ou « Ajouter à l'écran d'accueil ».`,
      `Confirme avec « Installer », puis attends quelques secondes que l'icône apparaisse.`,
      `Si tu vois une croix ✕ en haut à gauche au lieu de la barre d'adresse, la page a été ouverte par une autre app : touche ${k(DOTS_ICON)} puis « Ouvrir dans Chrome » avant d'installer.`,
      `Si Chrome dit que l'appli est déjà installée, ouvre-la depuis l'icône Pronohub de ton écran d'accueil ou de la liste des applis.`,
    ],
    samsung: [
      `Ouvre le menu ${k("☰")} en bas à droite.`,
      `Choisis « Ajouter la page à », puis « Écran d'accueil ».`,
      `Confirme avec « Ajouter ».`,
    ],
    "android-firefox": [
      `Ouvre le menu ${k(DOTS_ICON)}.`,
      `Choisis « Installer ».`,
      `Confirme avec « Ajouter ».`,
    ],
    inapp: [
      `Tu es dans le navigateur d'une autre app (WhatsApp, Messenger…). Il ne permet pas d'installer Pronohub.`,
      `Ouvre son menu ${k("•••")} ou ${k(DOTS_ICON)} et choisis « Ouvrir dans le navigateur » (Safari ou Chrome).`,
      `Une fois dans le navigateur, reviens sur cette fenêtre avec le bouton « Installer ».`,
    ],
    desktop: [
      `Dans Chrome ou Edge, clique l'icône d'installation à droite de la barre d'adresse.`,
      `Ou ouvre le menu ${k(DOTS_ICON)} et choisis « Installer Pronohub » (dans « Caster, enregistrer et partager » sur Chrome).`,
      `Sur Mac avec Safari : menu Fichier, puis « Ajouter au Dock ».`,
    ],
  };
  const tabs = [["ios", "iPhone"], ["android", "Android"], ["desktop", "Ordinateur"]];
  const tabOn = t => pf === t || (t === "ios" && pf === "ios-other") || (t === "android" && (pf === "samsung" || pf === "android-firefox"));
  return `<h2>Installer Pronohub</h2>
    <div class="segs" role="group" aria-label="Appareil">${tabs.map(([v, l]) => `<button class="seg ${tabOn(v) ? "on" : ""}" data-a="installPf" data-v="${v}" aria-pressed="${tabOn(v)}">${l}</button>`).join("")}</div>
    <ol class="steps">${steps[pf].map(s => `<li>${typo(s)}</li>`).join("")}</ol>
    ${pf === "inapp" ? `<button class="btn wide" data-a="copy" data-text="${esc(location.href)}">Copier le lien de la page</button>` : ""}
    <p class="hint">Les mises à jour arrivent toutes seules : l'app se met à jour à la prochaine ouverture.</p>
    <div class="row end"><button class="btn primary" data-a="close">Compris</button></div>`;
}

async function doInstall() {
  if (Install.prompt) {
    const p = Install.prompt;
    Install.prompt = null;
    try { await p.prompt(); const r = await p.userChoice; if (r && r.outcome === "dismissed") toast("Installation annulée"); } catch (e) { S.modal = { k: "install" }; render(); }
    return;
  }
  S.modal = { k: "install" };
  render();
}

function homeAct(a, d) {
  switch (a) {
    case "stripLeague": Strip.lg = d.v; Store.set("stripLeague", d.v); return true;
    case "stripRetry": loadStrip(Strip.lg, true); return true;
    case "matchBet": {
      const e = (Strip.data[d.lg] || []).find(x => x.id === d.id);
      if (!e) return true;
      const cc = DB.cur();
      if (S.view !== "home" && S.code && cc && cc.status === "ok") { startMatchBet(S.code, d.lg, e); return true; }
      const list = MyCircles.list();
      if (!list.length) { S.pendingMatch = { lg: d.lg, e }; S.modal = { k: "newCircle" }; toast("Crée d'abord un cercle pour parier sur ce match"); return true; }
      if (list.length === 1) { startMatchBet(list[0].code, d.lg, e); return true; }
      S.modal = { k: "pickCircle", lg: d.lg, e };
      return true;
    }
    case "pickCircle": { const m = S.modal; startMatchBet(d.code, m.lg, m.e); return true; }
    case "install": doInstall(); return "keep";
    case "installPf": S.modal.pf = d.v; return true;
    case "installHide": Store.set("installHide", Date.now()); toast("Tu retrouveras l'installation dans les Réglages"); return true;
  }
  return false;
}
