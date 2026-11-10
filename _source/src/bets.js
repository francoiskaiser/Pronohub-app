/* Pronohub — paris : liste, détail, création, mises, résultats, contestations, duels */
"use strict";

const STATE_LABEL = { open: "Ouvert", closed: "En attente du résultat", settled: "Terminé", void: "Annulé", contested: "Contesté" };

function canManage(cc, b, uid = myId(cc)) { return b.createdBy === uid || isOwner(cc, uid); }
function myWager(info, uid) { return info.ws.find(w => w.u === uid); }

/* ---------- Bandeau bonus du jour / renflouement ---------- */
function bonusCard(cc, a) {
  const me = myId(cc), p = a.players[me];
  if (!p) return "";
  const day = dayNum();
  const c = cc.circle;
  const out = [];
  if (c.daily > 0 && !cc.ledger[`${me}_daily_${day}`]) {
    out.push(`<div class="gift"><span class="gift-coin" aria-hidden="true">🪙</span><span class="grow"><b>Bonus du jour</b><small>+${nf(c.daily)} jetons t'attendent</small></span><button class="btn primary small" data-a="claimDaily">Récupérer</button></div>`);
  }
  if (c.rescue > 0 && p.bal < 10 && !cc.ledger[`${me}_rescue_${day}`]) {
    out.push(`<div class="gift broke"><span class="gift-coin" aria-hidden="true">💸</span><span class="grow"><b>À sec ?</b><small>La banque te renfloue de ${nf(c.rescue)} jetons. Ça comptera comme une faillite…</small></span><button class="btn small" data-a="claimRescue">Me renflouer</button></div>`);
  }
  return out.join("");
}

/* ---------- Ticket (carte de pari) ---------- */
function ticket(cc, a, info) {
  const b = info.b, me = myId(cc), mine = myWager(info, me);
  const cat = CAT[b.cat] || CAT.autre;
  const L = b.src && LEAGUE[b.src.league];
  let time;
  if (info.state === "open") time = `<span class="t-time live">${ICON.clock}${countdown(b.closesAt)}</span>`;
  else time = `<span class="t-time">${STATE_LABEL[info.state]}</span>`;
  const maxShare = Math.max(1, ...b.options.map(o => info.byOpt[o.id] || 0));
  const optsArr = b.options.map(o => {
    const win = info.state === "settled" && b.result === o.id;
    const hide = info.state === "open" && b.kind !== "duel";
    return `<div class="t-opt ${mine && mine.opt === o.id ? "mine" : ""} ${win ? "win" : ""}">
      <span class="t-lbl">${esc(o.label)}</span>
      <span class="t-odd">${info.odds[o.id] ? oddsFmt(info.odds[o.id]) : "—"}</span>
      <i class="t-bar" style="--w:${hide ? 0 : Math.round(100 * (info.byOpt[o.id] || 0) / maxShare)}%"></i>
    </div>`;
  });
  const opts = optsArr.length <= 4 ? optsArr.join("") : optsArr.slice(0, 3).join("") + `<div class="t-more">+ ${optsArr.length - 3} ${pl(optsArr.length - 3, "autre choix", "autres choix")}</div>`;
  let stamp = "";
  if (mine && info.state === "settled") {
    const g = info.payouts[mine.id] - mine.amt;
    stamp = g > 0 ? `<span class="stamp win">Gagné +${nf(g)}</span>` : g === 0 ? `<span class="stamp void">Remboursé</span>` : `<span class="stamp lose">Perdu</span>`;
  } else if (info.state === "void") stamp = `<span class="stamp void">Annulé</span>`;
  else if (info.state === "contested") stamp = `<span class="stamp lose">Contesté</span>`;
  const title = b.kind === "match" && b.home ? matchTitle(b) : esc(b.title);
  const duelLine = b.kind === "duel" && b.duel ? `<p class="t-sub">${esc(memberOf(cc, b.createdBy).name)} contre ${esc(memberOf(cc, b.duel.to).name)}, ${nf(b.duel.stake)} jetons chacun</p>` : "";
  return `<article class="ticket st-${info.state} ${mine ? "has-mine" : ""}">
    <div class="t-top"><span class="t-cat">${cat.e} ${L ? esc(L.name) : esc(cat.label)}</span>${time}</div>
    <h3 class="t-title">${title}</h3>
    ${duelLine}
    <div class="t-opts n${Math.min(b.options.length, 4)}">${opts}</div>
    <div class="t-foot">
      <span>${ICON.coin}${nf(info.pool)}</span>
      <span>${info.participants.size} ${pl(info.participants.size, "parieur", "parieurs")}</span>
      ${mine ? `<span class="t-mine">Ta mise : ${nf(mine.amt)}</span>` : info.state === "open" ? `<span class="t-cta">Parier</span>` : ""}
    </div>
    ${stamp}
    <button class="t-link" data-a="openBet" data-id="${esc(info.id)}" aria-label="Voir le pari : ${esc(b.kind === "match" && b.home ? b.home + " – " + b.away : b.title)}"></button>
  </article>`;
}

function matchTitle(b) {
  const logo = (u, n) => u ? `<img src="${esc(u)}" alt="" loading="lazy" width="22" height="22" onerror="this.remove()">` : `<span class="crest" aria-hidden="true">${esc(n.charAt(0))}</span>`;
  return `<span class="match"><span class="team">${logo(b.homeLogo, b.home)}${esc(b.home)}</span><span class="vs">${b.score ? `${b.score.h}–${b.score.a}` : "–"}</span><span class="team away">${esc(b.away)}${logo(b.awayLogo, b.away)}</span></span>`;
}

/* ---------- Onglet Paris ---------- */
function betsTab(cc, a) {
  const all = Object.values(a.bets);
  const groups = {
    open: all.filter(x => x.state === "open").sort((x, y) => x.b.closesAt - y.b.closesAt),
    todo: all.filter(x => x.state === "closed" || x.state === "contested").sort((x, y) => x.b.closesAt - y.b.closesAt),
    done: all.filter(x => x.state === "settled" || x.state === "void").sort((x, y) => (y.b.settledAt || 0) - (x.b.settledAt || 0)),
  };
  const f = S.filter in groups ? S.filter : "open";
  const list = groups[f];
  const seg = (k, l) => `<button class="seg ${f === k ? "on" : ""}" data-a="filter" data-v="${k}" aria-pressed="${f === k}">${l}<span class="count">${groups[k].length}</span></button>`;
  const empty = {
    open: `<div class="empty"><p class="empty-big">Aucun pari en cours.</p><p>Lance le premier : un match, une élection ou une question qui fera débat à la pause café.</p><button class="btn primary" data-a="newBet">${ICON.plus} Créer un pari</button></div>`,
    todo: `<div class="empty"><p class="empty-big">Rien à régler.</p><p>Les paris clôturés attendant un résultat apparaîtront ici.</p></div>`,
    done: `<div class="empty"><p class="empty-big">Pas encore de résultat.</p><p>Les paris terminés et tes gains s'afficheront ici.</p></div>`,
  }[f];
  return `<section class="page">
    ${bonusCard(cc, a)}
    <div class="segs tabs-filter" role="group" aria-label="Filtrer les paris">${seg("open", "En cours")}${seg("todo", "À régler")}${seg("done", "Terminés")}</div>
    <div class="tickets">${list.length ? list.map(x => ticket(cc, a, x)).join("") : empty}</div>
  </section>`;
}

/* ---------- Détail d'un pari ---------- */
function betView(cc, a) {
  const info = a.bets[S.betId];
  if (!info) return `<section class="page"><div class="pagehead"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button><h1>Pari introuvable</h1></div><p class="muted">Il a peut-être été supprimé, ou il appartient à une saison terminée.</p></section>`;
  const b = info.b, me = myId(cc), mine = myWager(info, me);
  const cat = CAT[b.cat] || CAT.autre;
  const L = b.src && LEAGUE[b.src.league];
  const open = info.state === "open";
  const manage = canManage(cc, b, me);
  const reveal = !open || b.kind === "duel";
  const isDuelTarget = b.kind === "duel" && b.duel && b.duel.to === me;

  const opts = b.options.map(o => {
    const share = info.pool ? (info.byOpt[o.id] || 0) / info.pool : 0;
    const n = info.ws.filter(w => w.opt === o.id).length;
    const win = (info.state === "settled" || info.state === "contested") && b.result === o.id;
    const can = open && b.kind !== "duel" && (!mine || mine.opt === o.id);
    const tag = can ? "button" : "div";
    return `<${tag} class="opt ${mine && mine.opt === o.id ? "mine" : ""} ${win ? "win" : ""} ${can ? "can" : ""}" ${can ? `data-a="wager" data-opt="${esc(o.id)}"` : ""}>
      <span class="opt-main"><b>${esc(o.label)}</b>${reveal ? `<small>${nf(info.byOpt[o.id] || 0)} jetons, ${n} ${pl(n, "parieur", "parieurs")}</small>` : ""}</span>
      <span class="opt-odd">${info.odds[o.id] ? oddsFmt(info.odds[o.id]) : "—"}</span>
      ${reveal ? `<i class="opt-bar" style="--w:${Math.round(share * 100)}%"></i>` : ""}
      ${win ? `<span class="opt-check" aria-label="Résultat">${ICON.check}</span>` : ""}
    </${tag}>`;
  }).join("");

  let banner = "";
  if (info.state === "settled") {
    banner = `<div class="banner good"><b>Résultat : ${esc(optLabel(b, b.result))}${b.score ? ` (${b.score.h}–${b.score.a})` : ""}</b><small>${b.settledBy === "auto" ? "Réglé automatiquement" : "Réglé par " + esc(memberOf(cc, b.settledBy).name)}, ${rel(b.settledAt)}</small></div>`;
  } else if (info.state === "contested") {
    banner = `<div class="banner bad"><b>Résultat contesté</b><small>La majorité des parieurs conteste « ${esc(optLabel(b, b.result))} ». Les gains sont gelés jusqu'à correction.</small></div>`;
  } else if (info.state === "void") {
    banner = `<div class="banner"><b>Pari annulé</b><small>Toutes les mises ont été remboursées.</small></div>`;
  } else if (info.state === "closed") {
    banner = b.src
      ? `<div class="banner"><b>Mises clôturées</b><small>Le résultat arrivera automatiquement après le match.</small></div>`
      : `<div class="banner"><b>Mises clôturées</b><small>${manage ? "À toi de saisir le résultat." : "En attente du résultat de " + esc(memberOf(cc, b.createdBy).name) + "."}</small></div>`;
  }

  // Ma position
  let minePanel = "";
  if (mine) {
    const pay = info.payouts[mine.id];
    const gain = pay != null ? pay - mine.amt : null;
    minePanel = `<div class="panel mine-panel">
      <div class="row between"><span>Ta mise</span><b>${nf(mine.amt)} sur ${esc(optLabel(b, mine.opt))}</b></div>
      ${mine.score ? `<div class="row between"><span>Ton score</span><b>${mine.score.h}–${mine.score.a}</b></div>` : ""}
      ${gain != null ? `<div class="row between"><span>Résultat</span><b class="${gain > 0 ? "pos" : gain < 0 ? "neg" : ""}">${gain > 0 ? "+" : ""}${nf(gain)}</b></div>`
        : `<div class="row between"><span>Gain si ça passe (estimé)</span><b class="pos">${nf(potential(info, mine.opt, 0, mine))}</b></div>`}
      ${open && b.kind !== "duel" ? `<button class="btn small" data-a="wager" data-opt="${esc(mine.opt)}">Ajouter des jetons</button>` : ""}
    </div>`;
  }

  // Duel : accepter ou refuser
  let duelPanel = "";
  if (b.kind === "duel" && open && b.duel) {
    if (isDuelTarget && !mine) duelPanel = `<div class="panel duel">
      <p><b>${esc(memberOf(cc, b.createdBy).name)}</b> te défie : ${nf(b.duel.stake)} jetons chacun, le gagnant rafle ${nf(b.duel.stake * 2)}.</p>
      <div class="row wrap"><button class="btn primary" data-a="duelAccept">Relever le défi</button><button class="btn ghost" data-a="duelDecline">Refuser</button></div></div>`;
    else if (b.createdBy === me && info.ws.length < 2) duelPanel = `<div class="panel duel"><p>En attente de la réponse de <b>${esc(memberOf(cc, b.duel.to).name)}</b>. Sans réponse avant la clôture, le duel est annulé.</p></div>`;
  }

  // Parieurs
  const byU = info.ws.slice().sort((x, y) => y.amt - x.amt);
  const people = byU.length ? `<h3>Parieurs</h3><ul class="bettors">${byU.map(w => {
    const m = memberOf(cc, w.u);
    const pay = info.payouts[w.id];
    const g = pay != null ? pay - w.amt : null;
    return `<li>${avatar(m)}<span class="grow">${esc(m.name)}${reveal ? `<small>${esc(optLabel(b, w.opt))}${w.score && !open ? ", " + w.score.h + "–" + w.score.a : ""}</small>` : `<small>a misé</small>`}</span>
      <span class="amt">${nf(w.amt)}${g != null && g !== 0 ? `<small class="${g > 0 ? "pos" : "neg"}">${g > 0 ? "+" : ""}${nf(g)}</small>` : ""}</span></li>`;
  }).join("")}</ul>${open && b.kind !== "duel" ? `<p class="hint">Les choix de chacun seront révélés à la clôture.</p>` : ""}` : "";

  // Actions de gestion
  const acts = [];
  if (b.src && (info.state === "closed" || info.state === "open") && Date.now() > b.closesAt) acts.push(`<button class="btn" data-a="checkResult">Vérifier le résultat</button>`);
  if (manage && (info.state === "closed" || info.state === "contested" || (open && !b.src && b.kind !== "duel"))) acts.push(`<button class="btn primary" data-a="settle">${info.state === "contested" ? "Corriger le résultat" : "Saisir le résultat"}</button>`);
  if (manage && b.kind === "duel" && (info.state === "closed" || (open && info.ws.length === 2))) acts.push(`<button class="btn primary" data-a="settle">Désigner le gagnant</button>`);
  if (manage && info.state === "settled") acts.push(`<button class="btn ghost" data-a="settle">Corriger le résultat</button>`);
  if (manage && open) acts.push(`<button class="btn ghost" data-a="closeNow">Clôturer les mises</button>`);
  if (manage && info.state !== "void" && info.state !== "settled") acts.push(`<button class="btn ghost danger" data-a="voidBet">Annuler le pari</button>`);
  if (manage && !info.ws.some(w => w.u !== me)) acts.push(`<button class="btn ghost danger" data-a="deleteBet">Supprimer</button>`);

  // Contestation
  let contest = "";
  if ((info.state === "settled" || info.state === "contested") && mine && b.settledBy !== me && a.U(b.settledBy) !== me) {
    const flagged = !!cc.flags[`${info.id}_${me}`] && cc.flags[`${info.id}_${me}`].result === b.result;
    contest = `<div class="contest"><span>${flagged ? "Tu contestes ce résultat." : "Le résultat te semble faux ?"} <small>${info.contest}/${info.contestNeed} ${pl(info.contestNeed, "voix nécessaire", "voix nécessaires")}</small></span>
      <button class="btn small ${flagged ? "" : "ghost"}" data-a="${flagged ? "unflag" : "flag"}">${flagged ? "Retirer ma contestation" : "Contester"}</button></div>`;
  }

  return `<section class="page bet-page">
    <div class="pagehead"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button>
      <span class="t-cat">${cat.e} ${L ? esc(L.name) : esc(cat.label)}</span></div>
    <div class="bet-hero">
      <h1 class="bet-title">${b.kind === "match" && b.home ? matchTitle(b) : esc(b.title)}</h1>
      ${b.desc ? `<p class="bet-desc">${esc(b.desc)}</p>` : ""}
      <p class="bet-meta">${open ? `Clôture ${fmtDate(b.closesAt)}, ${rel(b.closesAt)}` : `Clôturé le ${fmtDate(b.closesAt)}`}</p>
      <p class="bet-meta">Proposé par ${esc(memberOf(cc, b.createdBy).name)}${b.src ? ", résultat automatique" : ""}${b.bonus ? `, bonus score exact +${nf(b.bonus)}` : ""}</p>
    </div>
    ${banner}
    ${duelPanel}
    <div class="opts">${opts}</div>
    <p class="pool-line">${ICON.coin} <span><b>${nf(info.pool)}</b> jetons dans la cagnotte${info.seed ? `, + ${nf(info.seed * b.options.length)} de la banque` : ""}</span></p>
    ${minePanel}
    ${contest}
    ${acts.length ? `<div class="row wrap acts">${acts.join("")}</div>` : ""}
    ${reactionsBar(cc, info.id)}
    ${people}
    ${commentsBlock(cc, info.id)}
    ${b.src ? `<p class="source">Matchs et scores : ESPN (source publique non officielle).</p>` : ""}
  </section>`;
}

/* ---------- Mise ---------- */
function wagerModal(cc, a) {
  const info = a.bets[S.modal.bet];
  if (!info) return "";
  const b = info.b, me = myId(cc), mine = myWager(info, me);
  const opt = S.modal.opt;
  const bal = a.players[me] ? a.players[me].bal : 0;
  const amt = S.modal.amt != null ? S.modal.amt : Math.min(100, Math.max(0, bal));
  const chips = [10, 50, 100, 250, 500].filter(v => v < bal);
  const scoreOk = b.kind === "match" && b.bonus > 0;
  return `<h2>${mine ? "Ajouter des jetons" : "Ta mise"}</h2>
    <p class="wager-on">Sur <b>${esc(optLabel(b, opt))}</b>, cote actuelle ${info.odds[opt] ? oddsFmt(info.odds[opt]) : "—"}</p>
    <form data-f="wager" class="stack">
      <div class="amount">
        <button type="button" class="icon-btn" data-a="amt" data-d="-10" aria-label="Moins 10">−</button>
        <input name="amt" type="number" inputmode="numeric" min="1" max="${bal}" step="1" value="${amt}" aria-label="Montant en jetons" required>
        <button type="button" class="icon-btn" data-a="amt" data-d="10" aria-label="Plus 10">+</button>
      </div>
      <div class="chips">${chips.map(v => `<button type="button" class="chip" data-a="amtSet" data-v="${v}">${v}</button>`).join("")}<button type="button" class="chip hot" data-a="amtSet" data-v="${bal}">Tapis (${nf(bal)})</button></div>
      <p class="potential">Gain estimé si ça passe : <b id="potential">${nf(potential(info, opt, amt, mine))}</b> <small>La cote finale dépend des mises de tous jusqu'à la clôture.</small></p>
      ${scoreOk && !mine ? `<fieldset class="fld score-fld"><legend>Score exact (facultatif, +${nf(b.bonus)} si trouvé)</legend>
        <div class="score"><span>${esc(b.home)}</span><input name="sh" type="number" inputmode="numeric" min="0" max="30" aria-label="Buts ${esc(b.home)}"><span class="dash">–</span><input name="sa" type="number" inputmode="numeric" min="0" max="30" aria-label="Buts ${esc(b.away)}"><span>${esc(b.away)}</span></div>
      </fieldset>` : ""}
      <p class="muted small">Ton solde : ${nf(bal)} jetons</p>
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary big" ${bal < 1 ? "disabled" : ""}>Miser</button></div>
    </form>`;
}

/* ---------- Résultat ---------- */
function settleModal(cc, a) {
  const info = a.bets[S.modal.bet];
  const b = info.b;
  if (b.kind === "match") {
    return `<h2>Score final</h2>
      <form data-f="settle" class="stack">
        <div class="score big"><span>${esc(b.home)}</span><input name="sh" type="number" inputmode="numeric" min="0" max="99" required aria-label="Score ${esc(b.home)}" value="${b.score ? b.score.h : ""}"><span class="dash">–</span><input name="sa" type="number" inputmode="numeric" min="0" max="99" required aria-label="Score ${esc(b.away)}" value="${b.score ? b.score.a : ""}"><span>${esc(b.away)}</span></div>
        ${b.options.some(o => o.id === "d") ? "" : `<p class="hint">Pas de match nul possible : en cas d'égalité, le pari sera annulé et remboursé.</p>`}
        <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary">Valider le résultat</button></div>
      </form>`;
  }
  return `<h2>${b.kind === "duel" ? "Qui a gagné ?" : "Quel est le résultat ?"}</h2>
    <form data-f="settle" class="stack">
      <div class="choice-list">${b.options.map(o => `<label class="choice"><input type="radio" name="res" value="${esc(o.id)}" required ${b.result === o.id ? "checked" : ""}><span><b>${esc(o.label)}</b></span></label>`).join("")}</div>
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary">Valider le résultat</button></div>
    </form>`;
}

/* ---------- Création ---------- */
function newBetModal(cc) {
  const m = S.modal;
  if (!m.kind) {
    return `<h2>Nouveau pari</h2>
      <button class="kind-card feature" data-a="betKind" data-kind="import">
        <span class="k-emo" aria-hidden="true">📡</span><span><b>Importer des matchs</b><small>Football, NBA, NHL, NFL : calendrier et résultats automatiques</small></span></button>
      <div class="kind-grid">${KINDS.map(k => `<button class="kind-card" data-a="betKind" data-kind="${k.id}"><span class="k-emo" aria-hidden="true">${k.e}</span><span><b>${k.label}</b><small>${esc(k.hint)}</small></span></button>`).join("")}</div>
      <div class="row end"><button class="btn ghost" data-a="close">Annuler</button></div>`;
  }
  if (m.kind === "import") return importModal(cc);
  const d = m.draft;
  const kind = KINDS.find(k => k.id === m.kind);
  const others = visibleMembers(cc).filter(x => x.uid !== myId(cc));
  const catSel = `<label class="fld"><span>Catégorie</span><select name="cat">${CATS.map(c => `<option value="${c.id}" ${d.cat === c.id ? "selected" : ""}>${c.e} ${c.label}</option>`).join("")}</select></label>`;
  const close = `<label class="fld"><span>${m.kind === "duel" ? "Réponse attendue avant le" : "Fin des mises"}</span><input type="datetime-local" name="closesAt" required value="${esc(d.closesAt)}"></label>`;
  let body = "";
  if (m.kind === "match") {
    body = `<div class="grid2">
        <label class="fld"><span>Équipe à domicile</span><input name="home" maxlength="40" required value="${esc(d.home || "")}" placeholder="Ex. Standard"></label>
        <label class="fld"><span>Équipe à l'extérieur</span><input name="away" maxlength="40" required value="${esc(d.away || "")}" placeholder="Ex. Anderlecht"></label>
      </div>
      <label class="check"><input type="checkbox" name="draw" ${d.draw !== false ? "checked" : ""}><span>Match nul possible</span></label>
      <label class="check"><input type="checkbox" name="bonus" ${d.bonus !== false ? "checked" : ""}><span>Bonus score exact (+${nf(cc.circle.bonus)})</span></label>
      ${catSel}${close}`;
  } else if (m.kind === "duel") {
    body = others.length ? `<label class="fld"><span>Adversaire</span><select name="to" required>${others.map(x => `<option value="${esc(x.uid)}" ${d.to === x.uid ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
      <label class="fld"><span>Je parie que…</span><input name="title" maxlength="120" required value="${esc(d.title || "")}" placeholder="Ex. le Standard gagne le derby"></label>
      <label class="fld"><span>Mise de chacun</span><input name="stake" type="number" inputmode="numeric" min="1" required value="${esc(d.stake || 100)}"></label>
      ${catSel}${close}` : `<p class="muted">Il faut au moins un autre membre dans le cercle pour lancer un duel.</p>`;
  } else {
    body = `<label class="fld"><span>${m.kind === "vote" ? "Élection" : "Question"}</span><input name="title" maxlength="120" required value="${esc(d.title || "")}" placeholder="${m.kind === "vote" ? "Ex. Qui sera bourgmestre d'Ouffet ?" : m.kind === "yesno" ? "Ex. Julie va-t-elle oublier son badge lundi ?" : "Ex. Qui sera l'employé du mois ?"}"></label>
      <label class="fld"><span>Précisions (facultatif)</span><textarea name="desc" rows="2" maxlength="300" placeholder="Règles, source du résultat…">${esc(d.desc || "")}</textarea></label>
      ${m.kind === "yesno" ? "" : `<fieldset class="fld"><legend>${m.kind === "vote" ? "Candidats ou partis" : "Choix possibles"}</legend>
        <div class="opt-inputs">${d.opts.map((o, i) => `<div class="row"><input name="opt${i}" maxlength="50" value="${esc(o)}" placeholder="Choix ${i + 1}" aria-label="Choix ${i + 1}" ${i < 2 ? "required" : ""}>${d.opts.length > 2 ? `<button type="button" class="icon-btn" data-a="optDel" data-i="${i}" aria-label="Retirer ce choix">${ICON.x}</button>` : ""}</div>`).join("")}</div>
        ${d.opts.length < 12 ? `<button type="button" class="btn small ghost" data-a="optAdd">${ICON.plus} Ajouter un choix</button>` : ""}
      </fieldset>`}
      ${catSel}${close}`;
  }
  return `<h2>${kind.e} ${kind.label}</h2>
    <form data-f="newBet" class="stack">${body}
      <div class="row between"><button type="button" class="btn ghost" data-a="betKind" data-kind="">Retour</button>${m.kind === "duel" && !others.length ? "" : `<button class="btn primary">${m.kind === "duel" ? "Lancer le défi" : "Publier le pari"}</button>`}</div>
    </form>`;
}

function importModal(cc) {
  const m = S.modal;
  const lg = m.league || LEAGUES[0].id;
  let list;
  if (m.loading) list = `<p class="muted center">Chargement du calendrier…</p>`;
  else if (m.err) list = `<div class="banner bad"><b>Calendrier indisponible</b><small>${esc(m.err)} Tu peux créer le match à la main avec « Match ».</small></div>`;
  else if (!m.fx) list = "";
  else if (!m.fx.length) list = `<p class="muted center">Aucun match dans les 14 prochains jours pour cette compétition.</p>`;
  else {
    const existing = new Set(Object.values(cc.bets).filter(b => b.src).map(b => b.src.event));
    let lastDay = "";
    list = `<div class="fixtures">${m.fx.map(e => {
      const day = fmtDate(e.date, false);
      const head = day !== lastDay ? `<p class="fx-day">${day}</p>` : "";
      lastDay = day;
      const dup = existing.has(e.id);
      return `${head}<label class="fx ${dup ? "dup" : ""}"><input type="checkbox" name="fx" value="${esc(e.id)}" ${dup ? "disabled" : ""} ${(m.sel || []).includes(e.id) ? "checked" : ""}>
        <span class="fx-time">${fmtTime(e.date)}</span><span class="fx-teams">${esc(e.home)}<small>${esc(e.away)}</small></span>${dup ? `<small class="tag">déjà proposé</small>` : ""}</label>`;
    }).join("")}</div>`;
  }
  return `<h2>Importer des matchs</h2>
    <label class="fld"><span>Compétition</span><select data-f="league">${LEAGUES.map(l => `<option value="${l.id}" ${l.id === lg ? "selected" : ""}>${CAT[l.cat].e} ${esc(l.name)} (${esc(l.country)})</option>`).join("")}</select></label>
    <form data-f="import" class="stack">
      ${list}
      ${m.fx && m.fx.length ? `<label class="check"><input type="checkbox" name="bonus" checked><span>Bonus score exact (+${nf(cc.circle.bonus)})</span></label>` : ""}
      <p class="source">Calendrier et scores : ESPN (source publique non officielle). Les mises se ferment au coup d'envoi.</p>
      <div class="row between"><button type="button" class="btn ghost" data-a="betKind" data-kind="">Retour</button>${m.fx && m.fx.length ? `<button class="btn primary">Créer les paris</button>` : ""}</div>
    </form>`;
}

async function loadFixtures(lg) {
  S.modal.league = lg; S.modal.loading = true; S.modal.err = ""; S.modal.fx = null; render();
  try { const fx = await Sports.fixtures(lg); if (S.modal && S.modal.league === lg) { S.modal.fx = fx; } }
  catch (e) { if (S.modal) S.modal.err = "La source de résultats ne répond pas."; }
  if (S.modal) { S.modal.loading = false; render(); }
}

function defaultClose() {
  const d = new Date(Date.now() + 86400000);
  d.setHours(20, 0, 0, 0);
  return toLocalInput(d.getTime());
}

/* Relit les champs du formulaire de création pour ne rien perdre lors d'un nouveau rendu */
function syncDraft() {
  const f = $('form[data-f="newBet"]');
  if (!f || !S.modal || !S.modal.draft) return;
  const fd = new FormData(f), d = S.modal.draft;
  for (const k of ["title", "desc", "cat", "closesAt", "home", "away", "to", "stake"]) if (fd.has(k)) d[k] = fd.get(k);
  if (f.querySelector('[name="draw"]')) d.draw = fd.has("draw");
  if (f.querySelector('[name="bonus"]')) d.bonus = fd.has("bonus");
  d.opts = d.opts.map((o, i) => fd.has("opt" + i) ? fd.get("opt" + i) : o);
}

/* ---------- Actions ---------- */
async function claim(type) {
  const cc = DB.cur(), me = myId(cc), day = dayNum();
  const amt = type === "daily" ? cc.circle.daily : cc.circle.rescue;
  const ok = await DB.put("ledger", `${me}_${type}_${day}`, { uid: me, type, amt, day, season: cc.circle.season, at: now() });
  if (ok) toast(type === "daily" ? `+${nf(amt)} jetons, à toi de jouer !` : `La banque te prête ${nf(amt)} jetons. Fais-en bon usage…`, "good");
}

async function setResult(cc, b, id, patch) {
  const ok = await DB.put("bets", id, Object.assign({ settledBy: myId(cc), settledAt: now() }, patch), true);
  if (ok) { S.modal = null; toast(patch.status === "void" ? "Pari annulé : tout le monde est remboursé" : "Résultat enregistré", "good"); render(); }
}

function betsAct(a, d) {
  const cc = DB.cur();
  const an = cc && cc.status === "ok" ? analysis(cc) : null;
  const info = an && S.betId ? an.bets[S.betId] : null;
  switch (a) {
    case "filter": S.filter = d.v; return true;
    case "openBet": go("bet", { betId: d.id }); return true;
    case "claimDaily": claim("daily"); return true;
    case "claimRescue": claim("rescue"); return true;
    case "newBet": S.modal = { k: "newBet" }; return true;
    case "betKind": {
      syncDraft();
      if (!d.kind) { S.modal = { k: "newBet" }; return true; }
      const draft = { closesAt: defaultClose(), cat: d.kind === "vote" ? "vote" : d.kind === "match" ? "foot" : d.kind === "duel" ? "potes" : "potes", opts: ["", ""] };
      if (d.kind === "vote") draft.opts = ["", "", ""];
      S.modal = { k: "newBet", kind: d.kind, draft };
      if (d.kind === "import") loadFixtures(S.lastLeague || LEAGUES[0].id);
      return true;
    }
    case "optAdd": syncDraft(); S.modal.draft.opts.push(""); return true;
    case "optDel": syncDraft(); S.modal.draft.opts.splice(+d.i, 1); return true;
    case "wager": {
      if (!info) return true;
      S.modal = { k: "wager", bet: S.betId, opt: d.opt };
      return true;
    }
    case "amt": case "amtSet": {
      const inp = $('form[data-f="wager"] input[name="amt"]');
      if (!inp) return true;
      const v = a === "amt" ? (parseInt(inp.value, 10) || 0) + parseInt(d.d, 10) : parseInt(d.v, 10);
      inp.value = Math.max(1, Math.min(+inp.max || v, v));
      updatePotential();
      return "keep";
    }
    case "duelAccept": {
      const me = myId(cc), b = info.b;
      const bal = an.players[me] ? an.players[me].bal : 0;
      if (bal < b.duel.stake) { toast("Pas assez de jetons pour relever ce défi", "bad"); return true; }
      DB.put("wagers", `${info.id}_${me}`, { bet: info.id, uid: me, opt: "n", amt: b.duel.stake, season: b.season, at: now() })
        .then(ok => ok && toast("Défi relevé. Que le meilleur gagne !", "good"));
      return true;
    }
    case "duelDecline":
      ask("Refuser ce défi ?", "Refuser").then(ok => ok && DB.put("bets", info.id, { status: "void", settledBy: myId(cc), settledAt: now() }, true).then(ok => ok && toast("Défi refusé")));
      return true;
    case "settle": S.modal = { k: "settle", bet: S.betId }; return true;
    case "closeNow":
      ask("Fermer les mises maintenant ?", "Clôturer les mises").then(ok => ok && DB.put("bets", info.id, { closesAt: now() }, true).then(ok => ok && toast("Mises clôturées")));
      return true;
    case "voidBet":
      ask("Annuler ce pari ? Toutes les mises seront remboursées.", "Annuler le pari", true).then(ok => ok && setResult(cc, info.b, info.id, { status: "void" }));
      return true;
    case "deleteBet":
      ask("Supprimer ce pari ?", "Supprimer", true).then(async ok => {
        if (!ok) return;
        {
          for (const w of info.ws) await DB.del("wagers", w.id);
          if (await DB.del("bets", info.id)) { toast("Pari supprimé"); goBack(); }
        }
      });
      return true;
    case "checkResult":
      delete Sports.tried[info.id];
      toast("Vérification auprès de la source…");
      Sports.autoSettle().then(() => { const b = DB.cur().bets[info.id]; if (b && b.status === "open") toast("Pas encore de résultat final"); });
      return true;
    case "flag": DB.put("flags", `${info.id}_${myId(cc)}`, { bet: info.id, uid: myId(cc), result: info.b.result, at: now() }).then(ok => ok && toast("Contestation enregistrée")); return true;
    case "unflag": DB.del("flags", `${info.id}_${myId(cc)}`); return true;
  }
  return false;
}

function updatePotential() {
  const cc = DB.cur(), an = analysis(cc);
  const inp = $('form[data-f="wager"] input[name="amt"]'), out = $("#potential");
  if (!inp || !out || !S.modal) return;
  const info = an.bets[S.modal.bet];
  const amt = Math.max(0, parseInt(inp.value, 10) || 0);
  S.modal.amt = amt;
  out.textContent = nf(potential(info, S.modal.opt, amt, myWager(info, myId(cc))));
}

function betsSubmit(f, fd) {
  const k = f.dataset.f;
  const cc = DB.cur();
  if (k === "wager") {
    const an = analysis(cc), info = an.bets[S.modal.bet], me = myId(cc);
    const amt = parseInt(fd.get("amt"), 10);
    const bal = an.players[me] ? an.players[me].bal : 0;
    if (info.state !== "open") { toast("Les mises sont fermées", "bad"); S.modal = null; render(); return true; }
    if (!(amt >= 1)) { toast("Mise d'au moins 1 jeton", "bad"); return true; }
    if (amt > bal) { toast(`Tu n'as que ${nf(bal)} jetons`, "bad"); return true; }
    const mine = myWager(info, me);
    const data = { bet: info.id, uid: me, opt: S.modal.opt, amt: (mine ? mine.amt : 0) + amt, season: info.b.season, at: mine ? mine.at : now() };
    if (mine && mine.score) data.score = mine.score;
    const sh = fd.get("sh"), sa = fd.get("sa");
    if (sh !== null && sa !== null && sh !== "" && sa !== "") data.score = { h: Math.max(0, parseInt(sh, 10) || 0), a: Math.max(0, parseInt(sa, 10) || 0) };
    DB.put("wagers", `${info.id}_${me}`, data).then(ok => { if (ok) { S.modal = null; toast(`${nf(amt)} jetons misés sur ${optLabel(info.b, data.opt)}`, "good"); render(); } });
    return true;
  }
  if (k === "settle") {
    const an = analysis(cc), info = an.bets[S.modal.bet], b = info.b;
    if (b.kind === "match") {
      const h = parseInt(fd.get("sh"), 10), aa = parseInt(fd.get("sa"), 10);
      if (isNaN(h) || isNaN(aa)) return true;
      const res = matchResult(b, h, aa);
      setResult(cc, b, info.id, res ? { status: "settled", result: res, score: { h, a: aa }, closesAt: Math.min(b.closesAt, now()) } : { status: "void", score: { h, a: aa } });
    } else {
      const res = fd.get("res");
      if (!res) return true;
      setResult(cc, b, info.id, { status: "settled", result: res, closesAt: Math.min(b.closesAt, now()) });
    }
    return true;
  }
  if (k === "newBet") {
    syncDraft();
    const m = S.modal, d = m.draft, me = myId(cc);
    const closesAt = new Date(d.closesAt).getTime();
    if (!(closesAt > now() + 60000)) { toast("Choisis une fin des mises dans le futur", "bad"); return true; }
    const id = rid(14);
    const bet = { kind: m.kind, cat: d.cat || "autre", closesAt, createdBy: me, createdAt: now(), season: cc.circle.season, status: "open", seed: cc.circle.seed, bonus: 0, title: "", desc: "" };
    if (m.kind === "yesno") { bet.title = d.title.trim(); bet.desc = (d.desc || "").trim(); bet.options = [{ id: "y", label: "Oui" }, { id: "n", label: "Non" }]; }
    else if (m.kind === "multi" || m.kind === "vote") {
      const labels = [...new Set(d.opts.map(x => x.trim()).filter(Boolean))];
      if (labels.length < 2) { toast("Il faut au moins deux choix différents", "bad"); return true; }
      bet.title = d.title.trim(); bet.desc = (d.desc || "").trim();
      bet.options = labels.map((l, i) => ({ id: "o" + (i + 1), label: l }));
    } else if (m.kind === "match") {
      bet.home = d.home.trim(); bet.away = d.away.trim();
      bet.title = bet.home + " – " + bet.away;
      bet.options = [{ id: "h", label: bet.home }].concat(d.draw ? [{ id: "d", label: "Match nul" }] : [], [{ id: "a", label: bet.away }]);
      bet.bonus = d.bonus ? cc.circle.bonus : 0;
    } else if (m.kind === "duel") {
      const stake = parseInt(d.stake, 10);
      const an = analysis(cc), bal = an.players[me] ? an.players[me].bal : 0;
      if (!(stake >= 1)) { toast("Mise d'au moins 1 jeton", "bad"); return true; }
      if (stake > bal) { toast(`Tu n'as que ${nf(bal)} jetons`, "bad"); return true; }
      const foe = memberOf(cc, d.to);
      bet.title = d.title.trim();
      bet.seed = 0;
      bet.duel = { to: d.to, stake };
      bet.options = [{ id: "y", label: memberOf(cc, me).name + " a raison" }, { id: "n", label: foe.name + " a raison" }];
    }
    if (!bet.title) { toast("Donne un titre à ton pari", "bad"); return true; }
    DB.put("bets", id, bet).then(async ok => {
      if (!ok) return;
      if (m.kind === "duel") await DB.put("wagers", `${id}_${me}`, { bet: id, uid: me, opt: "y", amt: bet.duel.stake, season: bet.season, at: now() });
      S.modal = null;
      toast(m.kind === "duel" ? "Défi lancé !" : "Pari publié", "good");
      go("bet", { betId: id });
    });
    return true;
  }
  if (k === "import") {
    const ids = fd.getAll("fx");
    if (!ids.length) { toast("Coche au moins un match", "bad"); return true; }
    const L = LEAGUE[S.modal.league];
    const bonus = fd.has("bonus") ? cc.circle.bonus : 0;
    const me = myId(cc);
    (async () => {
      let n = 0;
      for (const fid of ids) {
        const e = S.modal.fx.find(x => x.id === fid);
        if (!e) continue;
        const bet = {
          kind: "match", cat: L.cat, title: e.home + " – " + e.away, desc: "", home: e.home, away: e.away, homeLogo: e.homeLogo, awayLogo: e.awayLogo,
          options: [{ id: "h", label: e.home }].concat(L.draw ? [{ id: "d", label: "Match nul" }] : [], [{ id: "a", label: e.away }]),
          closesAt: e.date, createdBy: me, createdAt: now(), season: cc.circle.season, status: "open", seed: cc.circle.seed, bonus,
          src: { league: L.id, event: e.id },
        };
        if (await DB.put("bets", "m_" + L.id.replace(/\./g, "") + "_" + e.id, bet)) n++;
      }
      S.lastLeague = L.id;
      S.modal = null; S.filter = "open";
      toast(`${n} ${pl(n, "match importé", "matchs importés")}`, "good");
      render();
    })();
    return true;
  }
  return false;
}
