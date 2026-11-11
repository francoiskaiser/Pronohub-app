/* Pronohub — moteur : cotes en pari mutuel, soldes, classement, statistiques, badges.
   Tout est recalculé à partir des données brutes : personne n'écrit le solde d'un autre. */
"use strict";

/* Identifiant de l'utilisateur qui agit dans le cercle ouvert */
function myId(cc = DB.cur()) {
  if (!cc) return null;
  if (cc.local) return S.actor && cc.members[S.actor] ? S.actor : Profile.get().id;
  return FB.uid;
}

/* Fusion des identités (compte anonyme rattaché à un compte Google ou e-mail) */
function aliasMap(cc) {
  const m = {};
  for (const [uid, mem] of Object.entries(cc.members)) if (mem.alias) m[mem.alias] = uid;
  return m;
}

function memberOf(cc, uid) {
  return cc.members[uid] || { uid, name: "Ancien membre", avatar: "👻", gone: true };
}

/* Membres visibles (sans les identités anonymes fusionnées) */
function visibleMembers(cc) {
  const al = aliasMap(cc);
  return Object.entries(cc.members).filter(([uid]) => !al[uid]).map(([uid, m]) => Object.assign({ uid }, m));
}

function isOwner(cc, uid = myId(cc)) { return cc && cc.circle && cc.circle.owner === uid; }

function betSeed(b) { return b.kind === "duel" ? 0 : (b.seed ?? CIRCLE_DEFAULTS.seed); }

/* Analyse complète du cercle pour la saison en cours */
function compute(cc) {
  const season = cc.circle.season || 1;
  const al = aliasMap(cc);
  const U = uid => al[uid] || uid;
  const T = Date.now();

  const bets = {};
  const wagersByBet = {};
  for (const [id, w] of Object.entries(cc.wagers)) {
    if ((w.season || 1) !== season) continue;
    if (!cc.bets[w.bet]) continue;
    (wagersByBet[w.bet] = wagersByBet[w.bet] || []).push(Object.assign({ id }, w, { u: U(w.uid) }));
  }

  const flagsByBet = {};
  for (const f of Object.values(cc.flags)) (flagsByBet[f.bet] = flagsByBet[f.bet] || []).push(f);

  const players = {};
  // Bonus quotidien automatique et identique pour tous, depuis le début de la saison
  const days = cc.circle.daily > 0 ? Math.max(0, dayNum(T) - dayNum(cc.circle.seasonAt || cc.circle.createdAt || T)) : 0;
  const base = cc.circle.start + days * cc.circle.daily;
  const P = uid => players[uid] || (players[uid] = {
    uid, bal: base, locked: 0, staked: 0, won: 0, bets: 0, wins: 0, losses: 0,
    exact: 0, duelWins: 0, best: 0, bestOdds: 0, streak: 0, maxStreak: 0, lossStreak: 0, maxLoss: 0,
    created: 0, comments: 0, rescues: 0, biggest: 0, history: [],
  });
  for (const m of visibleMembers(cc)) P(m.uid);

  for (const l of Object.values(cc.ledger)) {
    if ((l.season || 1) !== season || l.type === "daily") continue;
    const p = P(U(l.uid));
    p.bal += l.amt;
    if (l.type === "rescue") p.rescues++;
  }
  for (const c of Object.values(cc.comments)) P(U(c.uid)).comments++;

  const settledOrder = [];

  for (const [id, b] of Object.entries(cc.bets)) {
    if ((b.season || 1) !== season) continue;
    if (cc.members[b.createdBy] || al[b.createdBy]) P(U(b.createdBy)).created++;
    const ws = wagersByBet[id] || [];
    const seed = betSeed(b);
    const byOpt = {};
    for (const o of b.options) byOpt[o.id] = 0;
    let pool = 0;
    for (const w of ws) { byOpt[w.opt] = (byOpt[w.opt] || 0) + w.amt; pool += w.amt; }
    const total = pool + seed * b.options.length;
    const odds = {};
    for (const o of b.options) {
      const d = byOpt[o.id] + seed;
      odds[o.id] = b.kind === "duel" ? 2 : d > 0 ? total / d : null;
    }
    const participants = new Set(ws.map(w => w.u));
    let state = b.status === "void" ? "void" : b.status === "settled" ? "settled" : (T >= b.closesAt ? "closed" : "open");
    let contest = 0, contestNeed = 0;
    if (state === "settled") {
      const elig = [...participants].filter(u => u !== U(b.settledBy));
      contestNeed = Math.floor(elig.length / 2) + 1;
      contest = (flagsByBet[id] || []).filter(f => f.result === b.result && elig.includes(U(f.uid))).length;
      if (elig.length && contest >= contestNeed) state = "contested";
    }
    if (b.kind === "duel" && state === "open" && ws.length < 2 && T >= b.closesAt) state = "void";

    const payouts = {};
    const info = { id, b, ws, pool, byOpt, odds, total, seed, state, payouts, participants, contest, contestNeed };
    bets[id] = info;

    if (state === "settled") {
      const winD = byOpt[b.result] + seed;
      const refund = winD === 0 || (b.kind === "duel" && ws.length < 2);
      for (const w of ws) {
        let pay = refund ? w.amt : (w.opt === b.result ? Math.floor(w.amt * total / winD) : 0);
        let bonus = 0;
        if (!refund && b.score && w.score && b.bonus && w.score.h === b.score.h && w.score.a === b.score.a) bonus = b.bonus;
        payouts[w.id] = pay + bonus;
        const p = P(w.u);
        p.bal += pay + bonus - w.amt;
        p.staked += w.amt;
        if (!refund) {
          p.bets++;
          if (bonus) p.exact++;
        }
      }
      if (!refund) settledOrder.push(info);
    } else if (state === "void") {
      for (const w of ws) payouts[w.id] = w.amt;
    } else {
      for (const w of ws) { const p = P(w.u); p.bal -= w.amt; p.locked += w.amt; p.staked += w.amt; }
    }
    for (const w of ws) { const p = P(w.u); if (w.amt > p.biggest) p.biggest = w.amt; }
  }

  // Séries et records, dans l'ordre chronologique des résultats
  settledOrder.sort((a, b) => (a.b.settledAt || 0) - (b.b.settledAt || 0));
  for (const info of settledOrder) {
    const seen = new Set();
    for (const w of info.ws) {
      if (seen.has(w.u)) continue;
      seen.add(w.u);
      const p = P(w.u);
      const gain = info.payouts[w.id] - w.amt;
      const won = w.opt === info.b.result;
      p.history.push({ bet: info.id, gain, won, at: info.b.settledAt });
      if (won) {
        p.wins++; p.won += info.payouts[w.id];
        p.streak++; p.maxStreak = Math.max(p.maxStreak, p.streak); p.lossStreak = 0;
        if (gain > p.best) p.best = gain;
        const o = info.odds[w.opt] || 0;
        if (o > p.bestOdds) p.bestOdds = o;
        if (info.b.kind === "duel") p.duelWins++;
      } else {
        p.losses++;
        p.lossStreak++; p.maxLoss = Math.max(p.maxLoss, p.lossStreak); p.streak = 0;
      }
    }
  }

  const standings = visibleMembers(cc).map(m => Object.assign({}, m, players[m.uid] || P(m.uid)))
    .sort((a, b) => b.bal - a.bal || a.name.localeCompare(b.name));
  standings.forEach((s, i) => { s.rank = i > 0 && s.bal === standings[i - 1].bal ? standings[i - 1].rank : i + 1; });

  return { bets, players, standings, season, U, daysBonus: days * cc.circle.daily };
}

/* Mémoïsation simple : un calcul par rendu */
let _cmp = null, _cmpKey = "";
function analysis(cc = DB.cur()) {
  if (!cc || !cc.circle) return null;
  const key = cc.code + ":" + _renderTick;
  if (_cmpKey !== key) { _cmp = compute(cc); _cmpKey = key; }
  return _cmp;
}

/* Gain potentiel si l'on ajoute `x` jetons sur l'option `opt` */
function potential(info, opt, x, mine) {
  const already = mine && mine.opt === opt ? mine.amt : 0;
  const total = info.total + x;
  const d = info.byOpt[opt] + info.seed + x;
  if (d <= 0) return 0;
  return Math.floor((already + x) * total / d);
}

/* Badges gagnés par un joueur */
function badgesOf(cc, a, uid) {
  const p = a.players[uid];
  if (!p) return [];
  const out = [];
  if (p.bets > 0 || p.locked > 0 || p.biggest > 0) out.push("first");
  if (p.created >= 5) out.push("creator");
  if (p.wins && p.bestOdds >= 3) out.push("nostra");
  if (p.maxStreak >= 3) out.push("streak");
  if (p.exact > 0) out.push("sniper");
  if (p.biggest >= 500) out.push("whale");
  if (p.duelWins > 0) out.push("duelist");
  if (p.comments >= 10) out.push("talk");
  if (p.rescues > 0) out.push("broke");
  if (p.maxLoss >= 5) out.push("unlucky");
  const champ = Object.values(cc.seasons || {}).some(s => s.standings && s.standings[0] && (s.standings[0].uid === uid || a.U(s.standings[0].uid) === uid));
  if (champ) out.push("champ");
  return out;
}

/* Trophées des saisons passées */
function trophiesOf(cc, a, uid) {
  const t = [];
  for (const s of Object.values(cc.seasons || {})) {
    (s.standings || []).slice(0, 3).forEach((x, i) => { if (x.uid === uid || a.U(x.uid) === uid) t.push({ season: s.n, place: i + 1 }); });
  }
  return t.sort((x, y) => x.season - y.season);
}

/* Libellé de l'option gagnante d'un pari */
function optLabel(b, id) { const o = b.options.find(o => o.id === id); return o ? o.label : "?"; }

/* Résultat d'un match à partir du score */
function matchResult(b, h, a) {
  if (h > a) return "h";
  if (h < a) return "a";
  return b.options.some(o => o.id === "d") ? "d" : null;
}
