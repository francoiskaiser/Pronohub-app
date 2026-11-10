/* Pronohub — fil d'activité, commentaires, réactions */
"use strict";

function reactionsBar(cc, betId) {
  const me = myId(cc);
  const counts = {};
  let mine = null;
  for (const r of Object.values(cc.reacts)) {
    if (r.bet !== betId) continue;
    counts[r.e] = (counts[r.e] || 0) + 1;
    if (r.uid === me) mine = r.e;
  }
  return `<div class="reacts" role="group" aria-label="Réactions">${REACTIONS.map(e => `<button class="react ${mine === e ? "on" : ""}" data-a="react" data-bet="${esc(betId)}" data-e="${e}" aria-pressed="${mine === e}">${e}${counts[e] ? `<small>${counts[e]}</small>` : ""}</button>`).join("")}</div>`;
}

function commentsBlock(cc, betId) {
  const list = Object.entries(cc.comments).filter(([, c]) => c.bet === betId).sort((a, b) => a[1].at - b[1].at);
  return `<div class="comments">
    <h3>Commentaires${list.length ? ` <small>${list.length}</small>` : ""}</h3>
    ${list.length ? `<ul class="clist">${list.map(([id, c]) => commentItem(cc, id, c)).join("")}</ul>` : `<p class="muted">Personne n'a encore chambré. Lance-toi.</p>`}
    ${composer(betId)}
  </div>`;
}

function commentItem(cc, id, c) {
  const m = memberOf(cc, c.uid), me = myId(cc);
  return `<li class="cmt">${avatar(m, "sm")}<div class="bubble"><span class="who">${esc(m.name)} <time>${rel(c.at)}</time></span><p>${esc(c.text)}</p></div>
    ${c.uid === me || isOwner(cc) ? `<button class="icon-btn tiny" data-a="delComment" data-id="${esc(id)}" aria-label="Supprimer le commentaire">${ICON.x}</button>` : ""}</li>`;
}

function composer(betId) {
  return `<form data-f="comment" data-bet="${esc(betId || "")}" class="composer">
    <input name="text" maxlength="280" autocomplete="off" placeholder="${betId ? "Ton pronostic, ta vanne…" : "Écris au cercle…"}" aria-label="Message" required>
    <button class="btn primary icon" aria-label="Envoyer">${ICON.send}</button>
  </form>`;
}

/* Événements du fil, du plus récent au plus ancien */
function feedEvents(cc, a, limit = 80) {
  const ev = [];
  const name = uid => esc(memberOf(cc, uid).name);
  const betLink = (id, b) => `<button class="link" data-a="openBet" data-id="${esc(id)}">${esc(b.kind === "match" && b.home ? b.home + " – " + b.away : b.title)}</button>`;
  for (const [id, c] of Object.entries(cc.comments)) {
    const b = c.bet && cc.bets[c.bet];
    ev.push({ at: c.at, uid: c.uid, kind: "comment", id, html: `<b>${name(c.uid)}</b>${b ? ` sur ${betLink(c.bet, b)}` : ""}`, text: c.text, bet: c.bet });
  }
  for (const [id, info] of Object.entries(a.bets)) {
    const b = info.b;
    if (b.kind === "duel") ev.push({ at: b.createdAt, uid: b.createdBy, kind: "bet", bet: id, html: `<b>${name(b.createdBy)}</b> défie <b>${name(b.duel.to)}</b> : ${betLink(id, b)}, ${nf(b.duel.stake)} jetons` });
    else ev.push({ at: b.createdAt, uid: b.createdBy, kind: "bet", bet: id, html: `<b>${name(b.createdBy)}</b> a lancé un pari : ${betLink(id, b)}` });
    if (info.state === "settled" || info.state === "contested") {
      const winners = info.ws.filter(w => info.payouts[w.id] > w.amt).sort((x, y) => (info.payouts[y.id] - y.amt) - (info.payouts[x.id] - x.amt));
      const wtxt = winners.length ? winners.slice(0, 4).map(w => `${name(w.u)} <span class="pos">+${nf(info.payouts[w.id] - w.amt)}</span>`).join(", ") + (winners.length > 4 ? "…" : "") : "personne n'a vu juste";
      ev.push({ at: b.settledAt || b.closesAt, kind: "result", bet: id, html: `Résultat de ${betLink(id, b)} : <b>${esc(optLabel(b, b.result))}</b>${b.score ? ` (${b.score.h}–${b.score.a})` : ""}. ${wtxt}.` });
    } else if (info.state === "void" && b.settledAt) {
      ev.push({ at: b.settledAt, kind: "void", bet: id, html: `${betLink(id, b)} est annulé, mises remboursées.` });
    }
    for (const w of info.ws) {
      ev.push({ at: w.at, uid: w.u, kind: "wager", bet: id, html: `<b>${name(w.u)}</b> a misé ${nf(w.amt)} sur ${betLink(id, b)}` });
    }
  }
  for (const l of Object.values(cc.ledger)) {
    if (l.type === "rescue") ev.push({ at: l.at, uid: l.uid, kind: "rescue", html: `<b>${name(l.uid)}</b> s'est fait renflouer par la banque 💸` });
  }
  for (const m of visibleMembers(cc)) ev.push({ at: m.joinedAt || 0, uid: m.uid, kind: "join", html: `<b>${esc(m.name)}</b> a rejoint le cercle` });
  for (const s of Object.values(cc.seasons || {})) {
    const ch = s.standings && s.standings[0];
    ev.push({ at: s.endedAt, kind: "season", html: `Fin de la saison ${s.n}${ch ? ` : <b>${esc(ch.name)}</b> est sacré champion avec ${nf(ch.bal)} jetons 🏆` : ""}` });
  }
  return ev.filter(e => e.at).sort((x, y) => y.at - x.at).slice(0, limit);
}

const FEED_ICON = { comment: "💬", bet: "🎟️", result: "🏁", void: "↩️", wager: "🪙", rescue: "💸", join: "👋", season: "🏆" };

function feedItem(cc, e) {
  const who = e.uid ? memberOf(cc, e.uid) : null;
  return `<li class="ev ev-${e.kind}">
    <span class="ev-ico">${who && e.kind === "comment" ? avatar(who, "sm") : `<span class="ev-emo" aria-hidden="true">${FEED_ICON[e.kind]}</span>`}</span>
    <div class="ev-body"><p>${e.html}</p>${e.text ? `<p class="ev-text">${esc(e.text)}</p>` : ""}<time>${rel(e.at)}</time></div>
  </li>`;
}

function feedTab(cc, a) {
  const ev = feedEvents(cc, a);
  return `<section class="page narrow">
    <h2 class="section-title">Le fil du cercle</h2>
    ${composer(null)}
    ${ev.length ? `<ul class="feed">${ev.map(e => feedItem(cc, e)).join("")}</ul>` : `<div class="empty"><p class="empty-big">C'est calme ici.</p><p>Les paris, résultats et vannes du cercle apparaîtront dans ce fil.</p></div>`}
  </section>`;
}

function feedAct(a, d) {
  const cc = DB.cur();
  switch (a) {
    case "react": {
      const me = myId(cc), id = `${d.bet}_${me}`;
      const cur = cc.reacts[id];
      if (cur && cur.e === d.e) DB.del("reacts", id);
      else DB.put("reacts", id, { bet: d.bet, uid: me, e: d.e, at: now() });
      return "keep";
    }
    case "delComment": DB.del("comments", d.id); return true;
  }
  return false;
}

function feedSubmit(f, fd) {
  if (f.dataset.f !== "comment") return false;
  const text = String(fd.get("text") || "").trim().slice(0, 280);
  if (!text) return true;
  const cc = DB.cur();
  DB.put("comments", rid(14), { uid: myId(cc), text, bet: f.dataset.bet || null, at: now(), season: cc.circle.season });
  f.reset();
  return "keep";
}
