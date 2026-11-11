/* Pronohub — mode solo : Parcours (roguelite sur des matchs passés) et Défi du jour (vrais matchs à venir) */
"use strict";

const SOLO_START = 100;
const OBJ = [130, 180, 250, 340, 460, 620, 830, 1100];
const BOSS_AT = [3, 7];
const LEVELS = [0, 80, 200, 380, 620, 920, 1300, 1750, 2300, 3000];
const TITLES = ["Novice", "Habitué", "Pronostiqueur", "Connaisseur", "Fin limier", "Analyste", "Stratège", "Expert", "Maître du prono", "Légende"];
const LEAGUE_UNLOCK = { 1: ["bel.1", "eng.1"], 2: ["fra.1"], 3: ["esp.1"], 4: ["ita.1"], 5: ["ger.1"], 6: ["nba"] };
const AVATAR_UNLOCK = { 3: "🧠", 5: "💎", 7: "🦅", 9: "👑", 10: "🏆" };
const PRICE = { 1: 4, 2: 6, 3: 8 };
const RARITY = { 1: "Commun", 2: "Rare", 3: "Légendaire" };

const ATOUTS = [
  { id: "feu", e: "🔥", name: "En feu", desc: "+10 % de gain par ticket gagné d'affilée. La série repart à zéro à la première défaite.", r: 1, lvl: 1 },
  { id: "filet", e: "🪂", name: "Filet de sécurité", desc: "Ton premier ticket perdu de chaque étape est remboursé à moitié.", r: 1, lvl: 1 },
  { id: "nul", e: "🤝", name: "Nul assumé", desc: "Les cotes des matchs nuls sont multipliées par 1,5.", r: 1, lvl: 1 },
  { id: "domicile", e: "🏟️", name: "Douzième homme", desc: "Les victoires à domicile rapportent 20 % de plus.", r: 1, lvl: 1 },
  { id: "favori", e: "🛡️", name: "Valeur sûre", desc: "Les cotes inférieures à 1,70 gagnent 0,25.", r: 1, lvl: 1 },
  { id: "prime", e: "🏅", name: "Prime d'étape", desc: "+2 fiches à chaque étape réussie.", r: 1, lvl: 1 },
  { id: "outsider", e: "🎯", name: "Chasseur d'outsiders", desc: "Un ticket gagnant qui contient une cote de 3 ou plus rapporte 50 % de plus.", r: 2, lvl: 2 },
  { id: "accu", e: "🧱", name: "Accumulateur", desc: "La cote des combinés de 3 matchs ou plus est multipliée par 1,3.", r: 2, lvl: 2 },
  { id: "tirelire", e: "🐷", name: "Tirelire", desc: "En fin d'étape, +10 % sur les jetons que tu n'as pas misés (50 au maximum).", r: 1, lvl: 3 },
  { id: "collection", e: "🗂️", name: "Collectionneur", desc: "+1 fiche supplémentaire par ticket gagné.", r: 1, lvl: 3 },
  { id: "assurance", e: "☂️", name: "Assurance combiné", desc: "Un combiné qui rate un seul match est remboursé.", r: 2, lvl: 4 },
  { id: "remontada", e: "✈️", name: "Remontada", desc: "Les victoires à l'extérieur rapportent 30 % de plus.", r: 2, lvl: 4 },
  { id: "ticket", e: "🎫", name: "Ticket bonus", desc: "Un quatrième ticket à chaque étape.", r: 2, lvl: 5 },
  { id: "relance", e: "♻️", name: "Seconde chance", desc: "Si tu rates un objectif, tu continues quand même. L'atout disparaît ensuite.", r: 3, lvl: 6 },
  { id: "double", e: "💥", name: "Coup double", desc: "Le plus gros gain de chaque étape est doublé.", r: 3, lvl: 7 },
];
const ATOUT = Object.fromEntries(ATOUTS.map(a => [a.id, a]));

const BOSSES = [
  { id: "simple", e: "🚫", name: "Pas de combiné", desc: "Chaque ticket ne contient qu'un seul match." },
  { id: "outsider", e: "🐺", name: "Outsiders seulement", desc: "Chaque pronostic doit avoir une cote d'au moins 2,20." },
  { id: "one", e: "☝️", name: "Un seul ticket", desc: "Tu n'as droit qu'à un ticket pour cette étape." },
  { id: "allin", e: "🎲", name: "Tout ou rien", desc: "Chaque ticket doit miser au moins la moitié de tes jetons." },
];
const BOSS = Object.fromEntries(BOSSES.map(b => [b.id, b]));

const SOLO_TROPHIES = [
  { id: "run1", e: "🎒", name: "Premier Parcours", desc: "Terminer un Parcours" },
  { id: "half", e: "⛰️", name: "Mi-parcours", desc: "Réussir 4 étapes dans un même Parcours" },
  { id: "perfect", e: "🏆", name: "Parcours parfait", desc: "Réussir les 8 étapes" },
  { id: "poker", e: "🚀", name: "Coup de génie", desc: "Gagner un ticket à une cote de 5 ou plus" },
  { id: "combo4", e: "🧩", name: "Combiné royal", desc: "Gagner un combiné de 4 matchs" },
  { id: "streak5", e: "⚡", name: "Intouchable", desc: "Gagner 5 tickets d'affilée" },
  { id: "rich", e: "💰", name: "Pactole", desc: "Atteindre 2 000 jetons dans un Parcours" },
  { id: "full", e: "🗃️", name: "Collection complète", desc: "Détenir 4 atouts en même temps" },
  { id: "daily1", e: "📅", name: "Premier défi", desc: "Terminer un Défi du jour" },
  { id: "daily7", e: "🗓️", name: "Fidèle", desc: "Terminer 7 Défis du jour" },
  { id: "days7", e: "🌟", name: "Une semaine de feu", desc: "Jouer 7 jours d'affilée" },
];

/* ---------- Progression et sauvegarde ---------- */
const Solo = {
  st: null,
  s() { if (!this.st) this.load(); return this.st; },
  load() {
    const d = Store.get("solo", {}) || {};
    this.st = Object.assign({ rep: 0, runs: 0, best: 0, wins: 0, trophies: {}, streak: { last: "", n: 0 }, dailyCount: 0, run: null, daily: {} }, d);
    if (this.st.run) this.st.run.loading = false;
  },
  save() { Store.saveSoon("solo", this.st); this.syncSoon(); },
  level(rep = this.s().rep) { let l = 1; LEVELS.forEach((v, i) => { if (rep >= v) l = i + 1; }); return l; },
  title(l = this.level()) { return TITLES[l - 1]; },
  leagues(l = this.level()) { const out = []; for (let i = 1; i <= l; i++) out.push(...(LEAGUE_UNLOCK[i] || [])); return out; },
  pool(l = this.level()) { return ATOUTS.filter(a => a.lvl <= l); },
  avatars(l = this.level()) { return Object.entries(AVATAR_UNLOCK).filter(([k]) => +k <= l).map(([, v]) => v); },
  today(t = Date.now()) {
    const d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },
  streakOn() { const s = this.s().streak; return s.n > 1 && s.last >= this.today(Date.now() - 86400000) ? s.n : 0; },
  played() {
    const st = this.s(), t = this.today();
    if (st.streak.last === t) return;
    const y = this.today(Date.now() - 86400000);
    st.streak = { last: t, n: st.streak.last === y ? st.streak.n + 1 : 1 };
    if (st.streak.n >= 7) this.award("days7");
  },
  award(id) {
    const st = this.s();
    if (st.trophies[id]) return;
    st.trophies[id] = now();
    const t = SOLO_TROPHIES.find(x => x.id === id);
    if (t) setTimeout(() => toast(`Trophée débloqué : ${t.name}`, "good"), 600);
  },
  addRep(n) { const before = this.level(); this.s().rep += n; return { before, after: this.level() }; },
  unlocksAt(l) {
    const out = [];
    (LEAGUE_UNLOCK[l] || []).forEach(id => out.push(`${CAT[LEAGUE[id].cat].e} ${LEAGUE[id].name}`));
    ATOUTS.filter(a => a.lvl === l).forEach(a => out.push(`${a.e} ${a.name}`));
    if (AVATAR_UNLOCK[l]) out.push(`${AVATAR_UNLOCK[l]} Nouvel avatar`);
    out.push(`🏷️ ${TITLES[l - 1]}`);
    return out;
  },

  /* Ce que voient les amis dans les cercles */
  summary() {
    const st = this.s(), d = st.daily[this.today()];
    const played = d && d.tickets.length;
    return { day: played ? d.day : "", bank: played ? d.bank : 0, done: played ? !!d.done : false, n: played ? d.tickets.length : 0, level: this.level(), best: st.best, rep: st.rep };
  },
  syncSoon: debounce(function () { Solo.sync(); }, 1500),
  async sync() {
    if (!FB.ok || !FB.uid) return;
    const st = this.s();
    const meta = { rep: st.rep, runs: st.runs, best: st.best, wins: st.wins, trophies: st.trophies, dailyCount: st.dailyCount, streak: st.streak };
    const mj = JSON.stringify(meta);
    if (mj !== this._meta) { this._meta = mj; try { await FB.userDoc().set({ solo: meta }, { merge: true }); } catch (e) { this._meta = ""; } }
    const sum = this.summary(), sj = JSON.stringify(sum);
    if (sj === this._sum) return;
    this._sum = sj;
    for (const c of MyCircles.list().filter(c => !c.local)) {
      try { await FB.sub(c.code, "members").doc(FB.uid).set({ solo: sum }, { merge: true }); } catch (e) { }
    }
  },
  mergeRemote(r) {
    if (!r) return;
    const st = this.s();
    if ((r.rep || 0) > st.rep) Object.assign(st, { rep: r.rep, runs: r.runs || 0, best: r.best || 0, wins: r.wins || 0, dailyCount: r.dailyCount || 0 });
    st.trophies = Object.assign({}, r.trophies || {}, st.trophies);
    if (r.streak && r.streak.last > st.streak.last) st.streak = r.streak;
    this._meta = "";
    this.save();
  },
};

function allAvatars() { return AVATARS.concat(Solo.avatars()); }

/* ---------- Cotes, tickets ---------- */
function effOdd(base, o, atouts = []) {
  let x = base;
  const has = id => atouts.includes(id);
  if (o === "d" && has("nul")) x *= 1.5;
  if (o === "h" && has("domicile")) x *= 1.2;
  if (o === "a" && has("remontada")) x *= 1.3;
  if (base < 1.7 && has("favori")) x += 0.25;
  return Math.round(x * 100) / 100;
}
function ticketOdd(sel, ctx) {
  let x = 1;
  for (const s of sel) { const g = ctx.gmap[s.g]; x *= ctx.eff(g.odds[s.o], s.o); }
  if (ctx.accu && sel.length >= 3) x *= 1.3;
  return Math.round(x * 100) / 100;
}
function selLabel(g, o) { return o === "h" ? g.h : o === "a" ? g.a : `Nul ${g.h}–${g.a}`; }

function runCtx(run) {
  const has = id => run.atouts.includes(id);
  const staked = run.tickets.reduce((s, t) => s + t.stake, 0);
  return {
    kind: "run", games: run.data.games, gmap: Object.fromEntries(run.data.games.map(g => [g.id, g])), tickets: run.tickets,
    max: run.boss === "one" ? 1 : has("ticket") ? 4 : 3, available: run.bank - staked,
    eff: (b, o) => effOdd(b, o, run.atouts), accu: has("accu"),
    minStake: run.boss === "allin" ? Math.ceil(run.startBank / 2) : 1, simple: run.boss === "simple", minOdd: run.boss === "outsider" ? 2.2 : 0,
    locked: () => false,
  };
}
function dailyCtx(d) {
  const staked = d.tickets.reduce((s, t) => s + t.stake, 0);
  return {
    kind: "daily", games: d.games, gmap: Object.fromEntries(d.games.map(g => [g.id, g])), tickets: d.tickets, max: 3,
    available: SOLO_START - staked, eff: b => b, accu: false, minStake: 1, simple: false, minOdd: 0,
    locked: g => g.t <= Date.now() + 60000,
  };
}
function curCtx() {
  const st = Solo.s();
  if (S.soloView === "run" && st.run && st.run.phase === "bet" && st.run.data) return runCtx(st.run);
  if (S.soloView === "daily" && Daily.cur()) return dailyCtx(Daily.cur());
  return null;
}

/* ---------- Parcours ---------- */
function bossFor(run, idx) { return BOSS_AT.includes(idx) ? BOSSES[Math.floor(rng(run.seed * 7 + idx)() * BOSSES.length)].id : null; }

async function stageGen(run, idx, retry = 0) {
  const r = rng(run.seed + idx * 977 + retry * 31);
  const lgs = Solo.leagues();
  return Odds.retroStage(lgs[Math.floor(r() * lgs.length)], r);
}

function newRun() {
  const st = Solo.s();
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const r = rng(seed);
  st.run = {
    seed, stage: 0, bank: SOLO_START, startBank: SOLO_START, fiches: 0, atouts: [], streak: 0, phase: "draft", tickets: [],
    offer: shuffle(Solo.pool().filter(a => a.r === 1), r).slice(0, 3).map(a => a.id), rerolls: 0,
    stats: { won: 0, bestOdd: 0, maxBank: SOLO_START, cleared: 0 }, startedAt: now(),
  };
  Solo.save();
  stageGen(st.run, 0).then(data => { if (st.run && st.run.stage === 0 && !st.run.data) { st.run.next = { idx: 0, data }; Solo.save(); } }).catch(() => { });
}

async function loadStage() {
  const run = Solo.s().run;
  if (!run || run.loading) return;
  run.phase = "loading"; run.loadErr = false;
  if (run.next && run.next.idx === run.stage) {
    run.data = run.next.data; run.next = null;
  } else {
    run.loading = true; render();
    try { run.data = await stageGen(run, run.stage, run.retry || 0); }
    catch (e) { run.loadErr = true; run.retry = (run.retry || 0) + 1; run.loading = false; render(); return; }
    run.loading = false;
  }
  run.boss = bossFor(run, run.stage);
  run.tickets = []; run.startBank = run.bank; run.phase = "bet"; run.last = null;
  S.draft = null;
  Solo.save();
  render();
  window.scrollTo(0, 0);
}

async function prepareNext() {
  const run = Solo.s().run;
  const idx = run.stage + 1;
  if (idx >= OBJ.length || (run.next && run.next.idx === idx) || run.preparing) return;
  run.preparing = true;
  try { run.next = { idx, data: await stageGen(run, idx) }; Solo.save(); } catch (e) { }
  run.preparing = false;
}

function playStage() {
  const run = Solo.s().run, has = id => run.atouts.includes(id);
  const gmap = Object.fromEntries(run.data.games.map(g => [g.id, g]));
  const staked = run.tickets.reduce((s, t) => s + t.stake, 0);
  let streak = run.streak, filetUsed = false, won = 0;
  const res = run.tickets.map(t => {
    const wrong = t.sel.filter(s => gameResult(gmap[s.g]) !== s.o).length;
    let pay = 0, note = "";
    if (!wrong) {
      let gain = t.stake * t.odd - t.stake, mult = 1;
      if (has("outsider") && t.sel.some(s => s.base >= 3)) { mult *= 1.5; note = "outsider"; }
      if (has("feu") && streak) mult *= 1 + 0.1 * streak;
      gain = Math.floor(gain * mult);
      pay = t.stake + gain; streak++; won++;
      run.stats.bestOdd = Math.max(run.stats.bestOdd, t.odd);
      if (t.odd >= 5) Solo.award("poker");
      if (t.sel.length >= 4) Solo.award("combo4");
    } else {
      streak = 0;
      if (has("assurance") && t.sel.length >= 2 && wrong === 1) { pay = t.stake; note = "assurance"; }
      else if (has("filet") && !filetUsed) { pay = Math.floor(t.stake / 2); filetUsed = true; note = "filet"; }
    }
    return { pay, won: !wrong, note };
  });
  if (has("double")) {
    let bi = -1, bg = 0;
    res.forEach((r, i) => { const g = r.pay - run.tickets[i].stake; if (r.won && g > bg) { bg = g; bi = i; } });
    if (bi >= 0) { res[bi].pay += bg; res[bi].note = "double"; }
  }
  const before = run.bank;
  const tirelire = has("tirelire") ? Math.min(50, Math.floor((before - staked) * 0.1)) : 0;
  run.bank = before - staked + res.reduce((s, r) => s + r.pay, 0) + tirelire;
  run.streak = streak;
  run.stats.won += won;
  run.stats.maxBank = Math.max(run.stats.maxBank, run.bank);
  if (streak >= 5) Solo.award("streak5");
  if (run.bank >= 2000) Solo.award("rich");
  const obj = OBJ[run.stage];
  let cleared = run.bank >= obj, second = false;
  if (!cleared && has("relance") && run.bank > 0) { cleared = true; second = true; run.atouts = run.atouts.filter(a => a !== "relance"); }
  const fiches = [];
  if (cleared) {
    fiches.push(["Étape réussie", 3]);
    if (run.boss) fiches.push(["Étape boss", 3]);
    if (won) fiches.push([`${won} ${pl(won, "ticket gagné", "tickets gagnés")}`, won * (has("collection") ? 2 : 1)]);
    const surplus = Math.min(3, Math.floor((run.bank / obj - 1) / 0.25));
    if (surplus > 0) fiches.push(["Objectif dépassé", surplus]);
    if (has("prime")) fiches.push(["Prime d'étape", 2]);
    run.fiches += fiches.reduce((s, f) => s + f[1], 0);
    run.stats.cleared++;
    if (run.stats.cleared >= 4) Solo.award("half");
  }
  run.last = { before, after: run.bank, obj, res, tirelire, cleared, second, fiches };
  run.phase = "reveal";
  Solo.played();
  Solo.save();
  S.soloAnim = true;
  setTimeout(() => { S.soloAnim = false; }, 4000);
}

function shopOffer(run) {
  const r = rng(run.seed + run.stage * 131 + run.rerolls * 17);
  const pool = Solo.pool().filter(a => !run.atouts.includes(a.id));
  const bag = [];
  for (const a of pool) for (let k = 0; k < 4 - a.r; k++) bag.push(a.id);
  const out = [];
  for (const id of shuffle(bag, r)) { if (!out.includes(id)) out.push(id); if (out.length === 3) break; }
  return out;
}

function endRun(won) {
  const st = Solo.s(), run = st.run;
  const gain = run.stats.cleared * 15 + (won ? 60 : 0) + run.stats.won * 2 + (run.stats.bestOdd >= 5 ? 10 : 0);
  const lv = Solo.addRep(gain);
  st.runs++;
  st.best = Math.max(st.best, run.stats.cleared);
  if (won) st.wins++;
  Solo.award("run1");
  if (won) Solo.award("perfect");
  const unlocks = [];
  for (let l = lv.before + 1; l <= lv.after; l++) unlocks.push(...Solo.unlocksAt(l));
  run.phase = "end";
  run.result = { won, gain, before: lv.before, after: lv.after, unlocks };
  run.next = null;
  Solo.save();
}

/* ---------- Défi du jour ---------- */
const Daily = {
  busy: false, err: false, board: null, boardAt: 0, refAt: 0,
  cur() { return Solo.s().daily[Solo.today()]; },
  async prepare() {
    const st = Solo.s(), day = Solo.today();
    if (st.daily[day] || this.busy) return;
    this.busy = true; this.err = false; queueRender();
    try {
      const games = await Odds.daily(day, startOfDay(Date.now()));
      st.daily[day] = { day, games, tickets: [], bank: SOLO_START, done: false };
      const old = Solo.today(Date.now() - 7 * 86400000);
      for (const k of Object.keys(st.daily)) if (k < old) delete st.daily[k];
      Solo.save();
    } catch (e) { this.err = true; }
    this.busy = false;
    queueRender();
  },
  async refresh(force) {
    const d = this.cur();
    if (!d || d.done) return;
    if (!force && Date.now() - this.refAt < 60000) return;
    this.refAt = Date.now();
    const T = Date.now();
    const need = d.games.filter(g => !g.c && !g.v && g.t < T - 100 * 60000);
    for (const k of [...new Set(need.map(g => g.lg + "|" + Sports.ym(g.t)))]) {
      const [lg, ym] = k.split("|");
      try {
        const list = await Odds.month(lg, ym, 5 * 60000);
        for (const g of need) {
          const m = list.find(x => x.i === g.id);
          if (!m) continue;
          if (m.v) g.v = 1;
          else if (m.c) { g.x = m.x; g.y = m.y; g.c = 1; }
        }
      } catch (e) { }
    }
    this.settle();
    queueRender();
  },
  settle() {
    const d = this.cur();
    if (!d) return;
    const gmap = Object.fromEntries(d.games.map(g => [g.id, g]));
    let changed = false;
    for (const t of d.tickets) {
      if (t.res) continue;
      const rs = t.sel.map(s => gameResult(gmap[s.g]));
      if (rs.some(x => x === null)) continue;
      let odd = 1, wrong = 0;
      t.sel.forEach((s, i) => { if (rs[i] === "void") return; if (rs[i] === s.o) odd *= s.odd; else wrong++; });
      t.res = wrong ? "lost" : "won";
      t.pay = wrong ? 0 : Math.floor(t.stake * odd);
      changed = true;
      if (!wrong) { Solo.addRep(5); if (odd >= 5) Solo.award("poker"); }
    }
    const staked = d.tickets.reduce((s, t) => s + t.stake, 0);
    d.bank = SOLO_START - staked + d.tickets.reduce((s, t) => s + (t.pay || 0), 0);
    const T = Date.now();
    const canStill = d.tickets.length < 3 && SOLO_START - staked > 0 && d.games.some(g => g.t > T + 60000);
    if (!d.done && d.tickets.length && d.tickets.every(t => t.res) && !canStill) {
      d.done = true; changed = true;
      const st = Solo.s();
      st.dailyCount++;
      Solo.addRep(10);
      Solo.award("daily1");
      if (st.dailyCount >= 7) Solo.award("daily7");
    }
    if (changed) Solo.save();
  },
  pending(d) { return d.tickets.filter(t => !t.res).reduce((s, t) => s + t.stake, 0); },
  async loadBoard() {
    if (!FB.ok || !FB.uid || Date.now() - this.boardAt < 60000) return;
    this.boardAt = Date.now();
    const seen = {}, day = Solo.today();
    for (const c of MyCircles.list().filter(c => !c.local)) {
      try {
        const snap = await FB.sub(c.code, "members").get();
        snap.forEach(doc => { const m = doc.data(); if (m.solo && m.solo.day === day) seen[doc.id] = Object.assign({ uid: doc.id, name: m.name, avatar: m.avatar }, m.solo); });
      } catch (e) { }
    }
    this.board = Object.values(seen).sort((a, b) => b.bank - a.bank);
    queueRender();
  },
};

/* ---------- Composants ---------- */
function formLabel(f) {
  const n = { W: 0, D: 0, L: 0 };
  for (const c of f) n[c]++;
  return `Forme : ${n.W} ${pl(n.W, "victoire", "victoires")}, ${n.D} ${pl(n.D, "match nul", "matchs nuls")}, ${n.L} ${pl(n.L, "défaite", "défaites")}`;
}
function formDots(f) {
  if (!f) return "";
  return `<span class="form" role="img" aria-label="${esc(formLabel(f))}">${[...f].map(c => `<i class="f${c}"></i>`).join("")}</span>`;
}

function gameCard(g, o) {
  const L = LEAGUE[g.lg];
  const res = gameResult(g);
  const keys = L.draw ? ["h", "d", "a"] : ["h", "a"];
  const lab = { h: "1", d: "N", a: "2" };
  const locked = o.locked && o.locked(g);
  let right = "";
  if ((o.show || locked) && g.c && g.x != null) right = `<b class="g-score" style="--i:${o.i || 0}">${g.x}–${g.y}</b>`;
  else if (g.v) right = `<span class="tag">Annulé</span>`;
  else if (locked) right = `<span class="tag">Commencé</span>`;
  return `<article class="gcard ${locked ? "locked" : ""} ${o.picked ? "has-pick" : ""}">
    <div class="g-top"><span>${o.league ? `${CAT[L.cat].e} ${esc(L.name)}, ` : ""}${fmtDate(g.t)}</span>${right}</div>
    <div class="g-team">${teamLogo(Odds.logo(g.hl), g.h)}<b>${esc(g.h)}</b>${formDots(g.fh)}</div>
    <div class="g-team">${teamLogo(Odds.logo(g.al), g.a)}<b>${esc(g.a)}</b>${formDots(g.fa)}</div>
    <div class="g-odds n${keys.length}">${keys.map(k => {
      const cls = [o.picked === k ? "on" : "", o.placed && o.placed.has(k) ? "placed" : "", (o.show || locked) && res === k ? "win" : "", o.show && res && res !== k && o.placed && o.placed.has(k) ? "miss" : ""].join(" ");
      const odd = o.eff ? o.eff(g.odds[k], k) : g.odds[k];
      const boosted = odd !== g.odds[k];
      return `<button class="odd ${cls}" data-a="pick" data-g="${esc(g.id)}" data-o="${k}" ${o.show || locked ? "disabled" : ""} aria-pressed="${o.picked === k}"><span>${lab[k]}</span><b class="${boosted ? "boost" : ""}">${oddsFmt(odd)}</b></button>`;
    }).join("")}</div>
  </article>`;
}

function gameList(ctx, extra = {}) {
  const draft = S.draft && S.draft.kind === ctx.kind ? S.draft : null;
  return `<div class="glist">${ctx.games.map((g, i) => {
    const placed = new Set(ctx.tickets.flatMap(t => t.sel.filter(s => s.g === g.id).map(s => s.o)));
    const p = draft && draft.sel.find(s => s.g === g.id);
    return gameCard(g, Object.assign({ picked: p ? p.o : null, placed, eff: ctx.eff, locked: ctx.locked, i }, extra));
  }).join("")}</div>`;
}

function slipView(ctx) {
  const d = S.draft;
  if (!d || d.kind !== ctx.kind || !d.sel.length) return "";
  const odd = ticketOdd(d.sel, ctx), avail = Math.max(0, ctx.available);
  const stake = Math.max(Math.min(ctx.minStake, avail), Math.min(avail, d.stake != null ? d.stake : Math.max(1, Math.round(avail / 4))));
  return `<form class="slip" data-f="ticket">
    <div class="slip-sel">${d.sel.map(s => {
      const g = ctx.gmap[s.g];
      return `<span class="sel">${esc(selLabel(g, s.o))} <b>${oddsFmt(ctx.eff(g.odds[s.o], s.o))}</b><button type="button" class="x" data-a="unpick" data-g="${esc(s.g)}" aria-label="Retirer ce pronostic">${ICON.x}</button></span>`;
    }).join("")}</div>
    <div class="slip-row">
      <span class="slip-odd"><small>${d.sel.length > 1 ? `Combiné de ${d.sel.length}` : "Simple"}${ctx.accu && d.sel.length >= 3 ? ", accumulateur" : ""}</small><b>${oddsFmt(odd)}</b></span>
      <label class="slip-stake"><small>Mise</small><input name="slipStake" type="number" inputmode="numeric" min="${ctx.minStake}" max="${avail}" value="${stake}" data-odd="${odd}"></label>
    </div>
    <div class="chips">${[0.1, 0.25, 0.5].map(f => `<button type="button" class="chip" data-a="slipFrac" data-v="${f}">${Math.round(f * 100)} %</button>`).join("")}<button type="button" class="chip hot" data-a="slipFrac" data-v="1">Tout (${nf(avail)})</button></div>
    <button class="btn primary wide big" ${avail < 1 ? "disabled" : ""}>Placer le ticket, gain <span id="slipGain">${nf(Math.floor(stake * odd))}</span></button>
  </form>`;
}

function updateSlip() {
  const inp = $('form[data-f="ticket"] input[name="slipStake"]'), out = $("#slipGain");
  if (!inp || !out) return;
  const v = Math.max(0, parseInt(inp.value, 10) || 0);
  if (S.draft) S.draft.stake = v;
  out.textContent = nf(Math.floor(v * parseFloat(inp.dataset.odd)));
}

function ticketsList(ctx, opts = {}) {
  if (!ctx.tickets.length) return "";
  return `<div class="tlist">${ctx.tickets.map((t, i) => {
    const r = opts.res && opts.res[i];
    const pay = r ? r.pay : t.res ? t.pay : null;
    let stamp = "";
    if (r || t.res) {
      const g = pay - t.stake;
      const won = r ? r.won : t.res === "won";
      stamp = won ? `<span class="stamp win">+${nf(g)}</span>` : pay > 0 ? `<span class="stamp void">${nf(pay)} rendus</span>` : `<span class="stamp lose">Perdu</span>`;
    }
    const note = r && r.note ? { outsider: "🎯 Chasseur d'outsiders", assurance: "☂️ Assurance combiné", filet: "🪂 Filet de sécurité", double: "💥 Coup double" }[r.note] : "";
    return `<article class="tk ${r || t.res ? (pay > t.stake ? "won" : "lost") : ""}">
      <div class="tk-head"><b>${t.sel.length > 1 ? `Combiné de ${t.sel.length}` : "Simple"}, cote ${oddsFmt(t.odd)}</b>${stamp}</div>
      <ul>${t.sel.map(s => { const g = ctx.gmap[s.g], res = gameResult(g); return `<li class="${res && res !== "void" ? (res === s.o ? "ok" : "ko") : ""}"><span>${esc(selLabel(g, s.o))}</span><small>${esc(g.h)} – ${esc(g.a)}</small></li>`; }).join("")}</ul>
      <div class="tk-foot"><span>Mise ${nf(t.stake)}</span><span>${pay != null ? `Retour ${nf(pay)}` : `Gain possible ${nf(Math.floor(t.stake * t.odd))}`}</span>${opts.canDel && opts.canDel(t) ? `<button class="btn tiny ghost" data-a="delTicket" data-i="${i}">Retirer</button>` : ""}</div>
      ${note ? `<p class="tk-note">${note}</p>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function atoutCard(id, act = "") {
  const a = ATOUT[id];
  return `<div class="acard r${a.r}"><span class="a-emo" aria-hidden="true">${a.e}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${act}</div>`;
}

/* ---------- Vues ---------- */
function soloView() {
  const v = S.soloView || "hub";
  if (v === "run") return runView();
  if (v === "daily") return dailyView();
  return soloHub();
}

function levelCard() {
  const st = Solo.s(), l = Solo.level(), cur = LEVELS[l - 1], nx = LEVELS[l];
  const pct = nx ? Math.round(100 * (st.rep - cur) / (nx - cur)) : 100;
  const p = Profile.get(), streak = Solo.streakOn();
  return `<div class="lvl-card">
    ${avatar({ uid: p.id, name: p.name, avatar: p.avatar }, "lg")}
    <div class="grow"><b>${esc(Solo.title())}</b><span>Niveau ${l}, ${nf(st.rep)}${nx ? ` sur ${nf(nx)}` : ""} de réputation</span>
      <i class="bar" aria-hidden="true"><i style="width:${pct}%"></i></i></div>
    ${streak ? `<span class="flame" aria-label="${streak} jours d'affilée">🔥 ${streak}</span>` : ""}
  </div>`;
}

function soloHub() {
  const st = Solo.s(), run = st.run, d = Daily.cur(), l = Solo.level();
  const active = run && run.phase !== "end";
  const dStatus = !d || !d.tickets.length ? "À jouer aujourd'hui" : d.done ? `Terminé avec ${nf(d.bank)} jetons` : `En cours, ${nf(d.bank)} jetons pour l'instant`;
  const next = l < LEVELS.length ? Solo.unlocksAt(l + 1) : [];
  return `<section class="page narrow solo-hub">
    <div class="pagehead"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button><h1>Solo</h1></div>
    ${levelCard()}
    <div class="mode-card">
      <div class="mode-top"><span class="mode-emo" aria-hidden="true">🧗</span><div><h2>Parcours</h2>
        <p>8 étapes sur de vrais matchs passés, au résultat caché. Atteins l'objectif de chaque étape, collectionne des atouts et va le plus loin possible.</p></div></div>
      ${active ? `<p class="run-mini">Étape ${run.stage + 1} sur 8, ${nf(run.bank)} jetons, ${run.atouts.length} ${pl(run.atouts.length, "atout", "atouts")}</p>
        <button class="btn primary big wide" data-a="soloRun">Reprendre le Parcours</button>`
      : `<button class="btn primary big wide" data-a="soloNewRun">Nouveau Parcours</button>`}
      <p class="mode-foot">Record : ${st.best ? `${st.best} ${pl(st.best, "étape réussie", "étapes réussies")}` : "aucun pour l'instant"}. ${st.runs} ${pl(st.runs, "Parcours joué", "Parcours joués")}, ${st.wins} ${pl(st.wins, "réussi", "réussis")}.</p>
    </div>
    <div class="mode-card daily">
      <div class="mode-top"><span class="mode-emo" aria-hidden="true">📅</span><div><h2>Défi du jour</h2>
        <p>Les mêmes vrais matchs pour tous tes amis, 100 jetons et 3 tickets. Les résultats tombent au fil des matchs.</p></div></div>
      <p class="run-mini">${dStatus}</p>
      <button class="btn big wide" data-a="soloDaily">${d && d.tickets.length ? "Voir mon défi" : "Jouer le défi"}</button>
    </div>
    <h3>Trophées <small>${Object.keys(st.trophies).length}/${SOLO_TROPHIES.length}</small></h3>
    <div class="badges">${SOLO_TROPHIES.map(t => `<div class="badge ${st.trophies[t.id] ? "got" : ""}"><span class="b-emo" aria-hidden="true">${t.e}</span><b>${t.name}</b><small>${t.desc}</small></div>`).join("")}</div>
    ${next.length ? `<h3>Au niveau ${l + 1}</h3><ul class="unlocks">${next.map(u => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
    <h3>Compétitions débloquées</h3>
    <p class="muted">${Solo.leagues().map(id => `${CAT[LEAGUE[id].cat].e} ${esc(LEAGUE[id].name)}`).join(", ")}</p>
    <p class="source">Matchs et scores : ESPN (source publique non officielle). Les cotes du mode solo sont calculées par Pronohub d'après la forme des équipes.</p>
  </section>`;
}

function runHead(run, bank = run.bank, shop = false) {
  const obj = OBJ[shop ? run.stage + 1 : run.stage];
  return `<div class="run-head">
    <div class="row between"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button>
      <b class="run-title">${shop ? `Avant l'étape ${run.stage + 2}` : `Étape ${run.stage + 1} sur 8`}</b>
      <button class="btn tiny ghost" data-a="abandonRun">Abandonner</button></div>
    <div class="track" aria-hidden="true">${OBJ.map((o, i) => `<i class="${i < run.stage ? "done" : i === run.stage ? "cur" : ""} ${BOSS_AT.includes(i) ? "boss" : ""}"></i>`).join("")}</div>
    <div class="run-stats">
      <span><small>Jetons</small><b>${ICON.coin}${nf(bank)}</b></span>
      <span><small>Objectif</small><b>${nf(obj)}</b></span>
      <span><small>Fiches</small><b>💠 ${run.fiches}</b></span>
    </div>
    <div class="goal" aria-hidden="true"><i style="width:${Math.min(100, Math.round(100 * bank / obj))}%"></i></div>
    ${run.atouts.length ? `<div class="atout-row">${run.atouts.map(id => `<details class="achip"><summary>${ATOUT[id].e} ${esc(ATOUT[id].name)}</summary><p>${esc(ATOUT[id].desc)}</p></details>`).join("")}</div>` : ""}
  </div>`;
}

function stageLabel(data) {
  const L = LEAGUE[data.lg];
  const when = new Date(data.games[0].t).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  return `${CAT[L.cat].e} ${esc(L.name)}, saison ${data.season}-${data.season + 1}, ${when}`;
}

function runView() {
  const run = Solo.s().run;
  if (!run) { S.soloView = "hub"; return soloHub(); }
  if (run.phase === "draft") {
    return `<section class="page narrow solo-run">
      <div class="pagehead"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button><h1>Nouveau Parcours</h1></div>
      <p class="lead-s">Choisis ton atout de départ. Il change les règles en ta faveur pour tout le Parcours.</p>
      <div class="shop-grid">${run.offer.map(id => atoutCard(id, `<button class="btn primary small" data-a="draftPick" data-id="${id}">Choisir</button>`)).join("")}</div>
      <p class="hint">Tu démarres avec ${SOLO_START} jetons. Chaque étape a un objectif de jetons à atteindre ; les étapes 4 et 8 imposent une règle spéciale.</p>
    </section>`;
  }
  if (run.phase === "loading") {
    if (!run.loading && !run.loadErr) setTimeout(loadStage, 0);
    return `<section class="page narrow solo-run">${runHead(run)}
      <div class="state-box center">${run.loadErr
        ? `<h2>Impossible de charger l'étape</h2><p class="muted">La source des matchs ne répond pas. Vérifie ta connexion.</p><button class="btn primary" data-a="retryStage">Réessayer</button>`
        : `<div class="spinner" aria-hidden="true"></div><p>Préparation de l'étape : on remonte le temps…</p>`}</div></section>`;
  }
  if (run.phase === "end") return endView(run);
  if (run.phase === "shop") return shopView(run);
  if (run.phase === "reveal") return revealView(run);

  const ctx = runCtx(run);
  const boss = run.boss ? BOSS[run.boss] : null;
  const left = ctx.max - run.tickets.length;
  return `<section class="page narrow solo-run">
    ${runHead(run)}
    ${boss ? `<div class="boss-banner"><span aria-hidden="true">${boss.e}</span><div><b>Étape boss : ${esc(boss.name)}</b><small>${esc(boss.desc)}</small></div></div>` : ""}
    <p class="stage-label">${stageLabel(run.data)}</p>
    ${gameList(ctx)}
    <div class="sec-head"><h2>Tes tickets <small>${run.tickets.length}/${ctx.max}</small></h2></div>
    ${run.tickets.length ? ticketsList(ctx, { canDel: () => true }) : `<p class="muted">Touche une cote pour composer un ticket : un match pour un pari simple, jusqu'à 4 pour un combiné.</p>`}
    <div class="play-box">
      <p>Jetons non misés : <b>${nf(ctx.available)}</b>. Il t'en faut <b>${nf(OBJ[run.stage])}</b> à la fin de l'étape.</p>
      <button class="btn primary big wide" data-a="playStage">Jouer l'étape${left > 0 && run.tickets.length ? ` (${left} ${pl(left, "ticket restant", "tickets restants")})` : ""}</button>
    </div>
    ${S.draft && S.draft.kind === "run" && S.draft.sel.length ? `<div class="slip-space"></div>` : ""}
  </section>${slipView(ctx)}`;
}

function revealView(run) {
  const L = run.last;
  const ctx = { kind: "run", games: run.data.games, gmap: Object.fromEntries(run.data.games.map(g => [g.id, g])), tickets: run.tickets, eff: (b, o) => effOdd(b, o, run.atouts) };
  const last = run.stage === OBJ.length - 1;
  return `<section class="page narrow solo-run ${S.soloAnim ? "anim" : ""}">
    ${runHead(run, L.after)}
    <div class="verdict ${L.cleared ? "ok" : "ko"}">
      <b>${L.second ? "Seconde chance !" : L.cleared ? (last ? "Parcours réussi !" : "Étape réussie") : "Objectif manqué"}</b>
      <span>${nf(L.before)} → ${nf(L.after)} jetons, objectif ${nf(L.obj)}${L.tirelire ? `, dont ${nf(L.tirelire)} de la tirelire` : ""}</span>
    </div>
    <p class="stage-label">${stageLabel(run.data)}</p>
    ${gameList(ctx, { show: true })}
    ${run.tickets.length ? `<div class="sec-head"><h2>Tes tickets</h2></div>${ticketsList(ctx, { res: L.res })}` : ""}
    ${L.fiches.length ? `<div class="panel"><h3>Fiches gagnées</h3><ul class="fiches">${L.fiches.map(([l, n]) => `<li><span>${esc(l)}</span><b>+${n} 💠</b></li>`).join("")}</ul></div>` : ""}
    <button class="btn primary big wide" data-a="${L.cleared && !last ? "toShop" : "toEnd"}">${L.cleared && !last ? "Aller à la boutique" : "Voir le bilan"}</button>
  </section>`;
}

function shopView(run) {
  const nextIdx = run.stage + 1;
  const boss = bossFor(run, nextIdx);
  const reroll = 2 + run.rerolls;
  return `<section class="page narrow solo-run">
    ${runHead(run, run.bank, true)}
    <div class="sec-head"><h2>Boutique</h2><span class="fiche-count">💠 ${run.fiches} ${pl(run.fiches, "fiche", "fiches")}</span></div>
    ${run.offer.length ? `<div class="shop-grid">${run.offer.map(id => {
      const a = ATOUT[id], price = PRICE[a.r];
      return atoutCard(id, `<span class="rarity">${RARITY[a.r]}</span><button class="btn small ${run.fiches >= price ? "primary" : ""}" data-a="shopBuy" data-id="${id}" ${run.fiches < price ? "disabled" : ""}>Acheter, ${price} 💠</button>`);
    }).join("")}</div>` : `<p class="muted">Tu as acheté toute l'offre.</p>`}
    <button class="btn small ghost" data-a="shopReroll" ${run.fiches < reroll ? "disabled" : ""}>Nouvelle offre, ${reroll} 💠</button>
    <h3>Tes atouts <small>${run.atouts.length}/4</small></h3>
    ${run.atouts.length ? `<div class="shop-grid owned">${run.atouts.map(id => atoutCard(id, `<button class="btn tiny ghost" data-a="shopSell" data-id="${id}">Revendre, +${Math.floor(PRICE[ATOUT[id].r] / 2)} 💠</button>`)).join("")}</div>` : `<p class="muted">Aucun atout pour l'instant.</p>`}
    <div class="play-box">
      <p>Prochaine étape : objectif <b>${nf(OBJ[nextIdx])}</b> jetons${boss ? `, étape boss « ${esc(BOSS[boss].name)} » : ${esc(BOSS[boss].desc)}` : "."}</p>
      <button class="btn primary big wide" data-a="nextStage">Lancer l'étape ${nextIdx + 1}</button>
    </div>
  </section>`;
}

function endView(run) {
  const R = run.result, s = run.stats, l = Solo.level(), cur = LEVELS[l - 1], nx = LEVELS[l];
  const pct = nx ? Math.round(100 * (Solo.s().rep - cur) / (nx - cur)) : 100;
  return `<section class="page narrow solo-run end">
    <div class="end-hero"><span class="end-emo" aria-hidden="true">${R.won ? "🏆" : s.cleared >= 4 ? "⛰️" : "🧗"}</span>
      <h1 class="display small">${R.won ? "Parcours réussi !" : "Fin du Parcours"}</h1>
      <p>${s.cleared} ${pl(s.cleared, "étape réussie", "étapes réussies")} sur 8.${Solo.s().best === s.cleared && s.cleared ? " Nouveau record !" : ""}</p></div>
    <div class="stats">
      <div class="stat"><b>${s.cleared}</b><span>étapes</span></div>
      <div class="stat"><b>${s.won}</b><span>tickets gagnés</span></div>
      <div class="stat"><b>${s.bestOdd ? oddsFmt(s.bestOdd) : "—"}</b><span>plus belle cote</span></div>
      <div class="stat"><b>${nf(s.maxBank)}</b><span>jetons au plus haut</span></div>
    </div>
    <div class="panel rep-panel">
      <p><b>+${nf(R.gain)}</b> de réputation</p>
      <p class="muted">${esc(Solo.title())}, niveau ${l}</p>
      <i class="bar" aria-hidden="true"><i style="width:${pct}%"></i></i>
      ${R.after > R.before ? `<h3>Niveau ${R.after} atteint !</h3><ul class="unlocks">${R.unlocks.map(u => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="row wrap center"><button class="btn primary big" data-a="soloNewRun">Nouveau Parcours</button><button class="btn big" data-a="soloHub">Retour</button></div>
  </section>`;
}

function dailyView() {
  const d = Daily.cur();
  const head = `<div class="pagehead"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button><h1>Défi du jour</h1></div>`;
  if (!d) {
    if (!Daily.busy && !Daily.err) setTimeout(() => Daily.prepare(), 0);
    return `<section class="page narrow">${head}<div class="state-box center">${Daily.err
      ? `<h2>Défi indisponible</h2><p class="muted">La source des matchs ne répond pas. Vérifie ta connexion.</p><button class="btn primary" data-a="dailyRetry">Réessayer</button>`
      : `<div class="spinner" aria-hidden="true"></div><p>On prépare les matchs du jour…</p>`}</div></section>`;
  }
  if (Date.now() - Daily.refAt > 60000) setTimeout(() => Daily.refresh(), 0);
  if (FB.ok && Date.now() - Daily.boardAt > 60000) setTimeout(() => Daily.loadBoard(), 0);
  const day = new Date(startOfDay(Date.now())).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
  if (!d.games.length) return `<section class="page narrow">${head}<div class="empty"><p class="empty-big">Pas de match aujourd'hui.</p><p>Aucune compétition suivie ne joue dans les 48 heures. Reviens demain !</p></div></section>`;
  const ctx = dailyCtx(d);
  const pend = Daily.pending(d);
  const me = Profile.get();
  const board = Daily.board;
  return `<section class="page narrow solo-daily">
    ${head}
    <p class="lead-s">${day.charAt(0).toUpperCase() + day.slice(1)}. 100 jetons, 3 tickets au maximum, les mêmes matchs pour tout le monde. Tu peux parier jusqu'au coup d'envoi.</p>
    <div class="daily-score">
      <span><small>${d.done ? "Score final" : "Score provisoire"}</small><b>${ICON.coin}${nf(d.bank)}</b></span>
      ${pend ? `<span><small>En jeu</small><b>${nf(pend)}</b></span>` : ""}
      <span><small>Tickets</small><b>${d.tickets.length}/3</b></span>
    </div>
    ${gameList(ctx, { league: true })}
    ${d.tickets.length ? `<div class="sec-head"><h2>Tes tickets</h2></div>${ticketsList(ctx, { canDel: t => !t.res && t.sel.every(s => !ctx.locked(ctx.gmap[s.g])) })}` : `<p class="muted">Touche une cote pour composer un ticket.</p>`}
    <div class="sec-head"><h2>Tes amis aujourd'hui</h2></div>
    ${!FB.ok ? `<p class="muted">Le classement entre amis demande les cercles en ligne.</p>`
      : !board ? `<p class="muted">Chargement…</p>`
      : !board.length ? `<p class="muted">Personne de tes cercles n'a encore joué aujourd'hui. Lance-toi, puis invite-les à faire mieux.</p>`
      : `<ol class="ranking">${board.map((m, i) => `<li class="${m.uid === FB.uid ? "me" : ""}"><button tabindex="-1"><span class="rk">${i + 1}</span>${avatar(m)}<span class="grow"><b>${esc(m.name)}</b><small>${m.done ? "Terminé" : "En cours"}, ${m.n} ${pl(m.n, "ticket", "tickets")}</small></span><span class="bal">${nf(m.bank)}</span></button></li>`).join("")}</ol>`}
    ${S.draft && S.draft.kind === "daily" && S.draft.sel.length ? `<div class="slip-space"></div>` : ""}
  </section>${slipView(ctx)}`;
}

/* Carte « Mode solo » de l'accueil */
function soloHomeCard() {
  const st = Solo.s(), run = st.run, d = Daily.cur();
  const active = run && run.phase !== "end";
  const streak = Solo.streakOn();
  return `<div class="solo-card">
    <button class="solo-head" data-a="soloHub"><span><small>Mode solo</small><b>${esc(Solo.title())}, niveau ${Solo.level()}</b></span>${streak ? `<span class="flame">🔥 ${streak}</span>` : ""}${ICON.chev}</button>
    <div class="solo-acts">
      <button class="solo-btn" data-a="soloRun"><span class="sb-e" aria-hidden="true">🧗</span><span><b>${active ? `Parcours, étape ${run.stage + 1}` : "Parcours"}</b><small>${active ? `${nf(run.bank)} jetons, objectif ${nf(OBJ[run.stage])}` : "8 étapes sur des matchs passés"}</small></span></button>
      <button class="solo-btn" data-a="soloDaily"><span class="sb-e" aria-hidden="true">📅</span><span><b>Défi du jour</b><small>${!d || !d.tickets.length ? "À jouer" : d.done ? `Terminé, ${nf(d.bank)} jetons` : `En cours, ${nf(d.bank)} jetons`}</small></span></button>
    </div>
  </div>`;
}

/* Défi du jour dans l'onglet Classement d'un cercle */
function circleDailyPanel(cc) {
  if (cc.local) return "";
  const day = Solo.today();
  const list = visibleMembers(cc).filter(m => m.solo && m.solo.day === day).sort((a, b) => (b.solo.bank || 0) - (a.solo.bank || 0));
  const mine = list.some(m => m.uid === myId(cc));
  return `<div class="sec-head"><h2>Défi du jour</h2><button class="btn small ${mine ? "ghost" : "primary"}" data-a="soloDaily">${mine ? "Mon défi" : "Jouer"}</button></div>
    ${list.length ? `<ol class="mini-rank daily-rank">${list.map((m, i) => `<li class="${m.uid === myId(cc) ? "me" : ""}"><span class="rk">${i + 1}</span>${avatar(m, "sm")}<span class="grow">${esc(m.name)}${m.solo.done ? "" : ` <small class="tag">en cours</small>`}</span><b>${nf(m.solo.bank)}</b></li>`).join("")}</ol>`
      : `<p class="muted">Personne n'a encore joué le défi aujourd'hui.</p>`}`;
}

/* ---------- Actions ---------- */
function soloAct(a, d) {
  const st = Solo.s(), run = st.run;
  switch (a) {
    case "soloHub": go("solo", { soloView: "hub" }); return "keep";
    case "soloNewRun": newRun(); S.draft = null; go("solo", { soloView: "run" }); return "keep";
    case "soloRun":
      if (!run || run.phase === "end") newRun();
      go("solo", { soloView: "run" }); return "keep";
    case "soloDaily": go("solo", { soloView: "daily" }); return "keep";
    case "dailyRetry": Daily.err = false; Daily.prepare(); return true;
    case "retryStage": run.loadErr = false; loadStage(); return true;
    case "draftPick": run.atouts = [d.id]; loadStage(); return true;
    case "abandonRun":
      ask("Abandonner ce Parcours ? Tu gardes la réputation des étapes déjà réussies.", "Abandonner", true).then(ok => {
        if (!ok) return;
        if (run.stage === 0 && !run.stats.cleared && run.phase !== "reveal") { st.run = null; Solo.save(); S.soloView = "hub"; }
        else endRun(false);
        render();
      });
      return true;
    case "pick": {
      const ctx = curCtx();
      if (!ctx) return true;
      const g = ctx.gmap[d.g];
      if (!g || ctx.locked(g)) return true;
      if (ctx.tickets.length >= ctx.max) { toast("Tu as déjà placé tous tes tickets"); return true; }
      if (ctx.minOdd && g.odds[d.o] < ctx.minOdd) { toast("Étape boss : cote minimum de 2,20"); return true; }
      if (!S.draft || S.draft.kind !== ctx.kind) S.draft = { kind: ctx.kind, sel: [], stake: null };
      const sel = S.draft.sel, i = sel.findIndex(s => s.g === d.g);
      if (i >= 0 && sel[i].o === d.o) sel.splice(i, 1);
      else if (i >= 0) sel[i].o = d.o;
      else {
        if (ctx.simple) sel.length = 0;
        if (sel.length >= 4) { toast("4 matchs au maximum par ticket"); return true; }
        sel.push({ g: d.g, o: d.o });
      }
      return true;
    }
    case "unpick": if (S.draft) S.draft.sel = S.draft.sel.filter(s => s.g !== d.g); return true;
    case "slipFrac": {
      const ctx = curCtx(), inp = $('form[data-f="ticket"] input[name="slipStake"]');
      if (!ctx || !inp) return "keep";
      inp.value = Math.max(ctx.minStake, Math.min(ctx.available, Math.round(ctx.available * parseFloat(d.v))));
      updateSlip();
      return "keep";
    }
    case "delTicket": {
      const ctx = curCtx();
      if (!ctx) return true;
      ctx.tickets.splice(+d.i, 1);
      Solo.save();
      return true;
    }
    case "playStage": {
      const go2 = () => { playStage(); window.scrollTo(0, 0); render(); };
      if (!run.tickets.length) ask("Jouer l'étape sans aucun ticket ? Tes jetons ne bougeront pas.", "Jouer quand même").then(ok => ok && go2());
      else if (S.draft && S.draft.sel.length) ask("Ton ticket en cours n'est pas placé. Jouer l'étape quand même ?", "Jouer l'étape").then(ok => { if (ok) { S.draft = null; go2(); } });
      else go2();
      return "keep";
    }
    case "toShop":
      run.phase = "shop"; run.rerolls = 0; run.offer = shopOffer(run); Solo.save();
      prepareNext();
      window.scrollTo(0, 0);
      return true;
    case "toEnd": endRun(run.last && run.last.cleared); window.scrollTo(0, 0); return true;
    case "shopBuy": {
      const at = ATOUT[d.id], price = PRICE[at.r];
      if (run.atouts.length >= 4) { toast("4 atouts au maximum : revends-en un d'abord", "bad"); return true; }
      if (run.fiches < price) return true;
      run.fiches -= price; run.atouts.push(d.id); run.offer = run.offer.filter(x => x !== d.id);
      if (run.atouts.length >= 4) Solo.award("full");
      toast(`${at.e} ${at.name} rejoint ton jeu`, "good");
      Solo.save();
      return true;
    }
    case "shopSell": run.fiches += Math.floor(PRICE[ATOUT[d.id].r] / 2); run.atouts = run.atouts.filter(x => x !== d.id); Solo.save(); return true;
    case "shopReroll": {
      const cost = 2 + run.rerolls;
      if (run.fiches < cost) return true;
      run.fiches -= cost; run.rerolls++; run.offer = shopOffer(run); Solo.save();
      return true;
    }
    case "nextStage": run.stage++; run.phase = "loading"; S.draft = null; loadStage(); return true;
  }
  return false;
}

function soloSubmit(f, fd) {
  if (f.dataset.f !== "ticket") return false;
  const ctx = curCtx();
  if (!ctx || !S.draft || !S.draft.sel.length) return true;
  const stake = parseInt(fd.get("slipStake"), 10);
  if (!(stake >= 1)) { toast("Mise d'au moins 1 jeton", "bad"); return true; }
  if (stake < ctx.minStake) { toast(`Étape boss : mise d'au moins ${nf(ctx.minStake)} jetons`, "bad"); return true; }
  if (stake > ctx.available) { toast(`Tu n'as que ${nf(ctx.available)} jetons`, "bad"); return true; }
  if (S.draft.sel.some(s => ctx.locked(ctx.gmap[s.g]))) { toast("Un des matchs a déjà commencé", "bad"); return true; }
  const sel = S.draft.sel.map(s => { const g = ctx.gmap[s.g]; return { g: s.g, o: s.o, base: g.odds[s.o], odd: ctx.eff(g.odds[s.o], s.o) }; });
  ctx.tickets.push({ sel, stake, odd: ticketOdd(S.draft.sel, ctx), at: now() });
  S.draft = null;
  if (ctx.kind === "daily") { Solo.played(); Daily.settle(); }
  Solo.save();
  toast("Ticket placé", "good");
  return true;
}
