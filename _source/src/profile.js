/* Pronohub — classement, profil, statistiques, badges */
"use strict";

function rankTab(cc, a) {
  const st = a.standings;
  const me = myId(cc);
  const pod = st.slice(0, 3);
  const order = [1, 0, 2].filter(i => pod[i]);
  const seasons = Object.values(cc.seasons || {}).sort((x, y) => y.n - x.n);
  if (!cc.local && !cc.seasonsLoaded) DB.loadSeasons(cc);
  return `<section class="page narrow">
    <div class="row between"><h2 class="section-title">Saison ${a.season}</h2>${isOwner(cc) ? `<button class="btn small ghost" data-a="circleInfo">Règles et saison</button>` : ""}</div>
    ${pod.length ? `<div class="podium">${order.map(i => {
      const s = pod[i];
      return `<button class="pod p${i + 1}" data-a="player" data-uid="${esc(s.uid)}">
        ${avatar(s, i === 0 ? "xl" : "lg")}<b>${esc(s.name)}</b><span class="pod-bal">${nf(s.bal)}</span>
        <span class="pod-step"><span>${s.rank}</span></span></button>`;
    }).join("")}</div>` : ""}
    <ol class="ranking">${st.map(s => `<li class="${s.uid === me ? "me" : ""}"><button data-a="player" data-uid="${esc(s.uid)}">
      <span class="rk">${s.rank}</span>${avatar(s)}<span class="grow"><b>${esc(s.name)}</b><small>${s.wins} ${pl(s.wins, "victoire", "victoires")} pour ${s.wins + s.losses} ${pl(s.wins + s.losses, "pari", "paris")}${s.locked ? `, ${nf(s.locked)} en jeu` : ""}</small></span>
      <span class="bal">${nf(s.bal)}</span></button></li>`).join("")}</ol>
    <p class="hint">Le classement se fait au solde de jetons. Les mises en cours sont déduites jusqu'au résultat.</p>
    ${circleDailyPanel(cc)}
    ${seasons.length ? `<h3>Palmarès</h3><ul class="honours">${seasons.map(s => `<li><span class="h-season">Saison ${s.n}</span>${(s.standings || []).slice(0, 3).map((x, i) => `<span class="h-place">${["🥇", "🥈", "🥉"][i]} ${esc(x.name)} <small>${nf(x.bal)}</small></span>`).join("")}</li>`).join("")}</ul>` : ""}
  </section>`;
}

function playerCard(cc, a, uid, self) {
  const m = memberOf(cc, uid);
  const s = a.standings.find(x => x.uid === uid) || Object.assign({}, m, a.players[uid] || {});
  const p = a.players[uid] || { bets: 0, wins: 0 };
  const badges = badgesOf(cc, a, uid);
  const trophies = trophiesOf(cc, a, uid);
  const rate = p.bets ? Math.round(100 * p.wins / p.bets) : 0;
  const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const hist = (p.history || []).slice().reverse().slice(0, 15);
  return `<div class="profile-head">
      ${avatar(m, "xl")}
      <div class="grow"><h1 class="display small">${esc(m.name)}</h1>
        <p class="muted">${s.rank ? `Rang ${s.rank} / ${a.standings.length}` : ""}</p>
        ${m.solo && m.solo.level ? `<p class="solo-line">${esc(TITLES[m.solo.level - 1] || "")}, niveau ${m.solo.level} en solo${m.solo.best ? `, record ${m.solo.best} ${pl(m.solo.best, "étape", "étapes")}` : ""}</p>` : ""}</div>
      ${self ? `<button class="btn small ghost" data-a="editProfile">Modifier</button>` : ""}
    </div>
    <div class="balance-card"><span>Solde</span><b>${nf(s.bal || 0)}</b><small>${p.locked ? `dont ${nf(p.locked)} en jeu` : "jetons"}</small></div>
    <div class="stats">
      ${stat(p.bets, "paris réglés")}
      ${stat(rate + " %", "de réussite")}
      ${stat(nf(p.best || 0), "plus gros gain")}
      ${stat(p.maxStreak || 0, "meilleure série")}
      ${stat(p.bestOdds ? oddsFmt(p.bestOdds) : "—", "plus belle cote")}
      ${stat(p.rescues || 0, pl(p.rescues || 0, "faillite", "faillites"))}
    </div>
    ${trophies.length ? `<h3>Trophées</h3><div class="trophies">${trophies.map(t => `<span class="trophy">${["🥇", "🥈", "🥉"][t.place - 1]} Saison ${t.season}</span>`).join("")}</div>` : ""}
    <h3>Badges <small>${badges.length}/${BADGES.length}</small></h3>
    <div class="badges">${BADGES.map(bd => {
      const got = badges.includes(bd.id);
      return `<div class="badge ${got ? "got" : ""}"><span class="b-emo" aria-hidden="true">${bd.e}</span><b>${bd.name}</b><small>${bd.desc}</small></div>`;
    }).join("")}</div>
    ${hist.length ? `<h3>Derniers résultats</h3><ul class="history">${hist.map(h => {
      const info = a.bets[h.bet];
      if (!info) return "";
      const b = info.b;
      return `<li><button class="link" data-a="openBet" data-id="${esc(h.bet)}">${esc(b.kind === "match" && b.home ? b.home + " – " + b.away : b.title)}</button><span class="${h.gain > 0 ? "pos" : h.gain < 0 ? "neg" : ""}">${h.gain > 0 ? "+" : ""}${nf(h.gain)}</span></li>`;
    }).join("")}</ul>` : ""}`;
}

function meTab(cc, a) {
  const me = myId(cc);
  return `<section class="page narrow">
    ${bonusCard(cc, a)}
    ${playerCard(cc, a, me, !cc.local || me === Profile.get().id)}
    <div class="row wrap me-actions">
      <button class="btn" data-a="invite" ${cc.local ? "hidden" : ""}>Inviter des amis</button>
      <button class="btn ghost" data-a="soloHub">Mode solo</button>
      <button class="btn ghost" data-a="circleInfo">Le cercle</button>
      <button class="btn ghost" data-a="settings">Réglages</button>
    </div>
  </section>`;
}

function playerView(cc, a) {
  return `<section class="page narrow">
    <div class="pagehead"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button></div>
    ${playerCard(cc, a, S.playerId, S.playerId === myId(cc) && (!cc.local || S.playerId === Profile.get().id))}
  </section>`;
}

function editProfileModal() {
  const p = Profile.get();
  const sel = p.avatar || AVATARS[0];
  return `<h2>Mon profil</h2>
    <form data-f="editProfile" class="stack">
      <label class="fld"><span>Pseudo</span><input name="name" maxlength="24" required value="${esc(p.name)}"></label>
      <fieldset class="fld"><legend>Avatar</legend>
        <div class="emoji-grid">${allAvatars().map(e => `<label class="emo ${e === sel ? "on" : ""}"><input type="radio" name="avatar" value="${e}" ${e === sel ? "checked" : ""}><span>${e}</span></label>`).join("")}</div>
      </fieldset>
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary">Enregistrer</button></div>
    </form>`;
}

function profileAct(a, d) {
  switch (a) {
    case "player": go("player", { playerId: d.uid }); return true;
    case "editProfile": S.modal = { k: "editProfile" }; return true;
  }
  return false;
}

function profileSubmit(f, fd) {
  if (f.dataset.f !== "editProfile") return false;
  const name = String(fd.get("name") || "").trim().slice(0, 24);
  if (!name) return true;
  const p = Profile.set({ name, avatar: fd.get("avatar") || "" });
  // Cercles locaux : mettre à jour ma fiche
  for (const c of MyCircles.list().filter(c => c.local)) {
    const d = Store.get("local." + c.code);
    if (d && d.members[p.id]) { Object.assign(d.members[p.id], { name: p.name, avatar: p.avatar }); Store.set("local." + c.code, d); }
  }
  const cc = DB.cur();
  if (cc && cc.local && cc.members[p.id]) Object.assign(cc.members[p.id], { name: p.name, avatar: p.avatar });
  Account.pushProfile();
  S.modal = null;
  toast("Profil mis à jour", "good");
  render();
  return true;
}
