/* Pronohub — import des matchs et résultats depuis une source gratuite (API publique d'ESPN, non officielle).
   Si la source ne répond pas, le créateur du pari peut toujours saisir le résultat à la main. */
"use strict";

const Sports = {
  base: "https://site.api.espn.com/apis/site/v2/sports/",
  cache: {},
  tried: {},

  ymd(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  },

  async get(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  },

  parse(ev) {
    const c = (ev.competitions || [])[0] || {};
    const cs = c.competitors || [];
    const home = cs.find(x => x.homeAway === "home") || cs[0] || {};
    const away = cs.find(x => x.homeAway === "away") || cs[1] || {};
    const st = (ev.status || c.status || {}).type || {};
    const team = x => (x.team && (x.team.shortDisplayName || x.team.displayName)) || "?";
    return {
      id: String(ev.id),
      date: Date.parse(ev.date),
      home: team(home), away: team(away),
      homeLogo: (home.team && home.team.logo) || "",
      awayLogo: (away.team && away.team.logo) || "",
      state: st.state || "pre",
      completed: !!st.completed,
      statusName: st.name || "",
      sh: home.score != null ? parseInt(home.score, 10) : null,
      sa: away.score != null ? parseInt(away.score, 10) : null,
    };
  },

  ym(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0");
  },

  /* Tous les matchs d'un mois (ESPN n'accepte plus les plages de dates, seulement un jour ou un mois) */
  async month(L, ym, fresh = false) {
    const key = "m:" + L.id + ":" + ym;
    const c = this.cache[key];
    if (!fresh && c && Date.now() - c.t < 10 * 60000) return c.list;
    const j = await this.get(`${this.base}${L.sport}/${L.id}/scoreboard?dates=${ym}&limit=500`);
    const list = (j.events || []).map(e => this.parse(e));
    this.cache[key] = { t: Date.now(), list };
    return list;
  },

  /* Matchs à venir d'une compétition (les `days` prochains jours) */
  async fixtures(leagueId, days = 14) {
    const L = LEAGUE[leagueId];
    const T = Date.now(), end = T + days * 86400000;
    const key = "fx:" + leagueId + ":" + days;
    const c = this.cache[key];
    if (c && T - c.t < 10 * 60000) return c.list;
    // Petit cache local d'une heure : l'accueil s'affiche tout de suite, même hors ligne
    const stored = Store.get("fx." + leagueId);
    if (!c && stored && T - stored.t < 3600000 && stored.days >= days) {
      const list = stored.list.filter(e => e.date > T && e.date < end);
      this.cache[key] = { t: stored.t, list };
      return list;
    }
    const months = [...new Set([this.ym(T), this.ym(end)])];
    const all = (await Promise.all(months.map(m => this.month(L, m)))).flat();
    const seen = new Set();
    const list = all.filter(e => e.state === "pre" && e.date > T && e.date < end && !seen.has(e.id) && seen.add(e.id))
      .sort((a, b) => a.date - b.date);
    this.cache[key] = { t: T, list };
    Store.set("fx." + leagueId, { t: T, days, list: list.map(e => ({ id: e.id, date: e.date, home: e.home, away: e.away, homeLogo: e.homeLogo, awayLogo: e.awayLogo, state: e.state })) });
    return list;
  },

  /* Résultat d'un match importé : {done, void, h, a} */
  async result(src, kickoff) {
    const L = LEAGUE[src.league];
    if (!L) return null;
    const months = [...new Set([this.ym(kickoff - 86400000), this.ym(kickoff + 86400000)])];
    const all = (await Promise.all(months.map(m => this.month(L, m, true)))).flat();
    const m = all.find(e => e.id === String(src.event));
    if (!m) return null;
    if (/POSTPONED|CANCELED|CANCELLED|ABANDONED|SUSPENDED/.test(m.statusName)) return { done: true, void: true };
    if (m.completed && m.sh != null && m.sa != null) return { done: true, h: m.sh, a: m.sa };
    return { done: false };
  },

  /* Règlement automatique des paris importés dont le match est terminé */
  async autoSettle() {
    const cc = DB.cur();
    if (!cc || cc.status !== "ok" || !cc.circle) return;
    const T = Date.now();
    for (const [id, b] of Object.entries(cc.bets)) {
      if (!b.src || b.status !== "open" || (b.season || 1) !== cc.circle.season) continue;
      if (T < b.closesAt + 100 * 60000) continue;
      if (this.tried[id] && T - this.tried[id] < 10 * 60000) continue;
      this.tried[id] = T;
      try {
        const r = await this.result(b.src, b.closesAt);
        if (!r || !r.done || DB.code !== cc.code) continue;
        if (r.void) {
          await DB.put("bets", id, { status: "void", settledBy: "auto", settledAt: Date.now() }, true);
          continue;
        }
        const res = matchResult(b, r.h, r.a);
        if (!res) await DB.put("bets", id, { status: "void", score: { h: r.h, a: r.a }, settledBy: "auto", settledAt: Date.now() }, true);
        else await DB.put("bets", id, { status: "settled", result: res, score: { h: r.h, a: r.a }, settledBy: "auto", settledAt: Date.now() }, true);
      } catch (e) { /* source indisponible : on réessaiera plus tard */ }
    }
  },
};
