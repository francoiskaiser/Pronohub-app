/* Pronohub — cotes du mode solo.
   En solo il n'y a pas de pari mutuel : l'app calcule ses propres cotes avec un classement Elo,
   construit à partir des matchs joués avant la date du pari (jamais avec le résultat à deviner). */
"use strict";

/* Générateur pseudo-aléatoire reproductible (mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/";

/* Résultat d'un match : h, d, a, "void" (annulé) ou null (pas encore joué) */
function gameResult(g) {
  if (!g) return null;
  if (g.v) return "void";
  if (!g.c || g.x == null) return null;
  return g.x > g.y ? "h" : g.x < g.y ? "a" : "d";
}

const Odds = {
  mem: {},
  SEASONS: [2022, 2023, 2024, 2025],
  DAILY: ["bel.1", "eng.1", "fra.1", "esp.1", "ita.1", "ger.1", "uefa.champions", "uefa.europa", "ned.1"],

  curYm() { return Sports.ym(Date.now()); },
  addMonths(ym, n) {
    let y = +ym.slice(0, 4), m = +ym.slice(4) - 1 + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + String(m + 1).padStart(2, "0");
  },
  logo(p) { return p ? (p.startsWith("http") ? p : LOGO_BASE + p) : ""; },

  compact(e) {
    return {
      i: e.id, t: e.date, h: e.home, a: e.away,
      hl: (e.homeLogo || "").replace(LOGO_BASE, ""), al: (e.awayLogo || "").replace(LOGO_BASE, ""),
      x: e.sh, y: e.sa, c: e.completed ? 1 : 0,
      v: /POSTPONED|CANCEL|ABANDON|SUSPEND/.test(e.statusName) ? 1 : 0,
    };
  },

  /* Tous les matchs d'un mois, en version compacte. Les mois passés sont gardés sur l'appareil. */
  async month(lgId, ym, maxAge = 30 * 60000) {
    const key = lgId + ":" + ym, T = Date.now();
    const m = this.mem[key];
    if (m && (m.final || T - m.t < maxAge)) return m.list;
    const sk = Store.ns + "mo." + key;
    let st = null;
    try { st = JSON.parse(localStorage.getItem(sk)); } catch (e) { }
    if (st && (st.final || T - st.t < maxAge)) { this.mem[key] = st; return st.list; }
    const L = LEAGUE[lgId];
    const j = await Sports.get(`${Sports.base}${L.sport}/${L.id}/scoreboard?dates=${ym}&limit=500`);
    const seen = new Set();
    const list = (j.events || []).map(e => this.compact(Sports.parse(e))).filter(x => !seen.has(x.i) && seen.add(x.i));
    const rec = { t: T, final: ym < this.curYm(), list };
    this.mem[key] = rec;
    this.save(sk, rec);
    return list;
  },

  save(k, v) {
    const s = JSON.stringify(v);
    try { localStorage.setItem(k, s); }
    catch (e) {
      // Stockage plein : on vide le cache des matchs et on réessaie une fois
      try {
        for (const key of Object.keys(localStorage)) if (key.startsWith(Store.ns + "mo.")) localStorage.removeItem(key);
        localStorage.setItem(k, s);
      } catch (e2) { }
    }
  },

  /* Classement Elo et forme des équipes, d'après les matchs terminés avant `before` */
  ratings(list, before, sport) {
    const soccer = sport === "soccer";
    const K = soccer ? 24 : 14, H = soccer ? 55 : 60;
    const R = {}, form = {};
    const done = list.filter(m => m.c && !m.v && m.x != null && m.t < before).sort((a, b) => a.t - b.t);
    for (const m of done) {
      const rh = R[m.h] ?? 1500, ra = R[m.a] ?? 1500;
      const E = 1 / (1 + Math.pow(10, (ra - (rh + H)) / 400));
      const S = m.x > m.y ? 1 : m.x < m.y ? 0 : 0.5;
      const gd = Math.abs(m.x - m.y);
      const mult = soccer ? (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8) : Math.min(2, 0.6 + Math.log(gd + 1) / 3);
      const d = K * mult * (S - E);
      R[m.h] = rh + d;
      R[m.a] = ra - d;
      (form[m.h] = form[m.h] || []).push(S === 1 ? "W" : S === 0 ? "L" : "D");
      (form[m.a] = form[m.a] || []).push(S === 0 ? "W" : S === 1 ? "L" : "D");
    }
    return { R, form, H };
  },

  /* Cotes 1N2 avec une marge de 7 %, comme un bookmaker raisonnable */
  price(rt, h, a, draw) {
    const rh = rt.R[h] ?? 1500, ra = rt.R[a] ?? 1500;
    const E = 1 / (1 + Math.pow(10, (ra - (rh + rt.H)) / 400));
    let p;
    if (draw) {
      const pd = Math.max(0.14, Math.min(0.29, 0.29 - Math.abs(rh + rt.H - ra) / 1600));
      p = { h: E - pd / 2, d: pd, a: 1 - E - pd / 2 };
    } else p = { h: E, a: 1 - E };
    for (const k in p) p[k] = Math.max(0.05, p[k]);
    const s = Object.values(p).reduce((x, y) => x + y, 0);
    const o = {};
    for (const k in p) o[k] = Math.max(1.05, Math.round(100 / ((p[k] / s) * 1.07)) / 100);
    return o;
  },

  game(m, lgId, rt) {
    return {
      id: m.i, lg: lgId, t: m.t, h: m.h, a: m.a, hl: m.hl, al: m.al,
      odds: this.price(rt, m.h, m.a, LEAGUE[lgId].draw),
      fh: (rt.form[m.h] || []).slice(-5).join(""), fa: (rt.form[m.a] || []).slice(-5).join(""),
      x: m.x, y: m.y, c: m.c, v: m.v,
    };
  },

  /* Une étape de Parcours : 5 matchs d'une même « journée » d'une saison passée */
  async retroStage(lgId, r) {
    const L = LEAGUE[lgId], soccer = L.sport === "soccer";
    for (let attempt = 0; attempt < 5; attempt++) {
      const y = this.SEASONS[Math.floor(r() * this.SEASONS.length)];
      const first = soccer ? y + "08" : y + "10";
      const valid = soccer
        ? [y + "10", y + "11", y + "12", (y + 1) + "01", (y + 1) + "02", (y + 1) + "03", (y + 1) + "04"]
        : [y + "12", (y + 1) + "01", (y + 1) + "02", (y + 1) + "03"];
      const ym = valid[Math.floor(r() * valid.length)];
      if (ym >= this.curYm()) continue;
      const months = [];
      for (let k = 3; k >= 0; k--) { const mm = this.addMonths(ym, -k); if (mm >= first) months.push(mm); }
      const lists = await Promise.all(months.map(mm => this.month(lgId, mm)));
      const all = lists.flat();
      const cur = lists[lists.length - 1].filter(m => m.c && !m.v && m.x != null);
      if (cur.length < 6) continue;
      const days = shuffle([...new Set(cur.map(m => startOfDay(m.t)))], r);
      for (const d of days) {
        const win = cur.filter(m => m.t >= d && m.t < d + 3 * 86400000);
        if (win.length < 4) continue;
        const rt = this.ratings(all, d, L.sport);
        const pick = shuffle(win, r).slice(0, 5).sort((a, b) => a.t - b.t);
        return { lg: lgId, season: y, games: pick.map(m => this.game(m, lgId, rt)) };
      }
    }
    throw new Error("no-stage");
  },

  /* Le Défi du jour : jusqu'à 6 vrais matchs des 48 prochaines heures, les mêmes pour tous */
  async daily(day, dayStartTs) {
    const r = rng(hashStr("daily" + day));
    const end = dayStartTs + 48 * 3600000;
    const months = [...new Set([Sports.ym(dayStartTs), Sports.ym(end)])];
    const pool = [], seen = new Set();
    const collect = async lg => {
      let lists;
      try { lists = await Promise.all(months.map(m => this.month(lg, m, 10 * 60000))); } catch (e) { return; }
      for (const m of lists.flat()) if (m.t >= dayStartTs && m.t < end && !m.v && !seen.has(m.i)) { seen.add(m.i); pool.push({ m, lg }); }
    };
    for (const lg of shuffle(this.DAILY, r)) { await collect(lg); if (pool.length >= 10) break; }
    if (pool.length < 4) await collect("nba");
    if (!pool.length) return [];
    const sel = shuffle(pool, r).slice(0, 6).sort((a, b) => a.m.t - b.m.t);
    const rts = {};
    const base = Sports.ym(dayStartTs);
    for (const { lg } of sel) {
      if (rts[lg]) continue;
      const ms = [this.addMonths(base, -2), this.addMonths(base, -1), base];
      const lists = await Promise.all(ms.map(mm => this.month(lg, mm).catch(() => [])));
      rts[lg] = this.ratings(lists.flat(), dayStartTs, LEAGUE[lg].sport);
    }
    return sel.map(({ m, lg }) => Object.assign(this.game(m, lg, rts[lg]), { x: null, y: null, c: 0, v: 0 }));
  },
};
