/* Pronohub — relais de notifications (Cloudflare Worker, offre gratuite).

   L'app appelle ce relais juste après un événement (nouveau pari, résultat, défi relevé,
   contestation, nouveau membre, invitation, demande d'ami). Le relais vérifie qui appelle
   (jeton Firebase), relit les données dans Firestore pour confirmer l'événement, puis prévient
   les bonnes personnes via Firebase Cloud Messaging (FCM). Chaque événement n'est envoyé
   qu'une fois : le document concerné garde la trace « pushed ».

   Toutes les 15 minutes (déclencheur Cron), il envoie aussi les rappels :
   - « ce pari ferme bientôt et tu n'as pas misé » ;
   - « ce pari est terminé depuis un jour : saisis le résultat » (pour son créateur).

   Configuration (Cloudflare > Workers > ce worker > Paramètres) :
   - Variables et secrets : FIREBASE_SA = le contenu complet du fichier JSON du compte de service (type « Secret »)
   - Déclencheurs : un Cron toutes les 15 minutes (voir NOTIFICATIONS.md pour l'expression)
   - ALLOWED_ORIGINS (facultatif) : origines autorisées, séparées par des virgules
*/

const DEFAULT_ORIGINS = "https://francoiskaiser.github.io";
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const FRESH = { bet: 20 * MIN, settle: HOUR, member: 30 * MIN, invite: 30 * MIN };
const REMIND_BEFORE = HOUR;      // rappel dans l'heure qui précède la fermeture
const TOSETTLE_AFTER = DAY;      // rappel au créateur un jour après la fermeture
// Interrupteur de préférence (Réglages de l'app) pour chaque type de notification
const PREF = { bet: "bet", settle: "settle", duel: "social", accept: "social", invite: "social", friend: "social", contest: "contest", member: "member", remind: "remind", tosettle: "tosettle" };

export default {
  async fetch(req, env) {
    const origins = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(s => s.trim());
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET") return reply(200, { ok: true, service: "pronohub-notify", v: 2 });
    if (req.method !== "POST") return reply(405, { error: "method" });
    if (!origins.includes(origin)) return reply(403, { error: "origin" });

    let sa;
    try { sa = JSON.parse(env.FIREBASE_SA); } catch (e) { return reply(500, { error: "config" }); }
    try {
      const uid = await verifyIdToken((req.headers.get("Authorization") || "").replace(/^Bearer /, ""), sa.project_id);
      const body = await req.json();
      const res = await handle(new Ctx(sa), uid, body || {});
      return reply(200, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.log("erreur", e && e.stack || e);
      return reply(status, { error: e.message || "error" });
    }
  },

  async scheduled(event, env, ctx) {
    let sa;
    try { sa = JSON.parse(env.FIREBASE_SA); } catch (e) { console.log("FIREBASE_SA invalide"); return; }
    ctx.waitUntil(cron(new Ctx(sa)).then(r => console.log("rappels", JSON.stringify(r)), e => console.log("erreur rappels", e && e.stack || e)));
  },
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* L'offre gratuite de Cloudflare limite à 50 appels sortants par exécution : on compte. */
class Ctx {
  constructor(sa, max = 46) { this.sa = sa; this.n = 0; this.max = max; this.fs = new Firestore(this); }
  left() { return this.max - this.n; }
  async fetch(url, opt) {
    if (this.n >= this.max) throw new HttpError(503, "budget");
    this.n++;
    return fetch(url, opt);
  }
}

const reCode = /^[A-Z0-9-]{3,12}$/, reId = /^[A-Za-z0-9_.-]{1,64}$/;
const pairOf = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;

/* ---------------- Événements envoyés par l'app ---------------- */

async function handle(cx, uid, body) {
  const type = body.type;
  const fs = cx.fs, now = Date.now();
  if (type === "friend") return friendEvent(cx, uid, String(body.to || ""));
  if (!["bet", "settle", "accept", "contest", "member", "invite"].includes(type)) throw new HttpError(400, "bad-request");
  const code = String(body.code || "");
  if (!reCode.test(code)) throw new HttpError(400, "bad-request");
  const ids = Array.isArray(body.bets) ? body.bets.map(String).slice(0, 20) : [];
  if (ids.some(id => !reId.test(id))) throw new HttpError(400, "bad-request");
  if (["bet", "settle", "accept", "contest"].includes(type) && !ids.length) throw new HttpError(400, "bad-request");

  const got = await fs.batchGet([`circles/${code}`, `circles/${code}/members/${uid}`]);
  const circle = got[`circles/${code}`];
  if (!circle || circle.data.deleted) throw new HttpError(404, "circle");
  const meMember = got[`circles/${code}/members/${uid}`];
  if (!meMember) throw new HttpError(403, "not-member");
  const C = circle.data;

  if (type === "member") {
    if (C.duo || !C.owner || C.owner === uid) return { ok: true, sent: 0 };
    const m = meMember;
    if ((m.data.pushed || {}).member || !(now - (m.data.joinedAt || 0) < FRESH.member)) return { ok: true, sent: 0 };
    if (!(await fs.markPushed(m, "member", now))) return { ok: true, sent: 0 };
    const who = m.data.name || "";
    return deliver(cx, [{ uid: C.owner, pref: "member", code, compose: L => ({ title: circleTitle(C, code), body: L.en ? `${who || "Someone"} joined the circle.` : `${who || "Quelqu'un"} a rejoint le cercle.`, code, open: "circle" }) }]);
  }

  if (type === "invite") {
    const to = (Array.isArray(body.to) ? body.to : []).map(String).filter(x => reId.test(x) && x !== uid).slice(0, 20);
    if (!to.length) return { ok: true, sent: 0 };
    const docs = await fs.batchGet(to.map(t => `users/${t}/inbox/${code}_${uid}`));
    const fresh = Object.values(docs).filter(d => d.data.from === uid && d.data.code === code && !(d.data.pushed || {}).invite && now - (d.data.at || 0) < FRESH.invite);
    const claimed = await fs.claim(fresh, "invite", now);
    const who = meMember.data.name || "";
    return deliver(cx, claimed.map(d => ({
      uid: d.path.split("/")[1], pref: "invite", code,
      compose: L => ({ title: "Pronohub", body: L.en ? `${who || "A friend"} invites you to join ${circleTitle(C, code)}.` : `${who || "Un ami"} t'invite dans le cercle ${circleTitle(C, code)}.`, code, open: "join" }),
    })), { noMute: true });
  }

  // Événements liés à des paris : relire les paris et ne garder que les vrais événements
  const extra = {};
  if (type === "accept" || type === "contest") {
    const paths = ids.map(id => type === "accept" ? `circles/${code}/wagers/${id}_${uid}` : `circles/${code}/flags/${id}_${uid}`);
    Object.assign(extra, await fs.batchGet(paths));
  }
  const betDocs = await fs.batchGet(ids.map(id => `circles/${code}/bets/${id}`));
  const ok = d => {
    const b = d.data, id = d.id;
    if ((b.pushed || {})[type]) return false;
    if (type === "bet") return b.createdBy === uid && b.status === "open" && now - (b.createdAt || 0) < FRESH.bet;
    if (type === "settle") return ["settled", "void"].includes(b.status) && now - (b.settledAt || 0) < FRESH.settle;
    if (type === "accept") { const w = extra[`circles/${code}/wagers/${id}_${uid}`]; return b.kind === "duel" && b.status === "open" && b.createdBy !== uid && w && w.data.opt === "n"; }
    if (type === "contest") { const f = extra[`circles/${code}/flags/${id}_${uid}`]; return b.status === "settled" && f && f.data.result === b.result; }
    return false;
  };
  const bets = await fs.claim(Object.values(betDocs).filter(ok), type, now);
  if (!bets.length) return { ok: true, sent: 0 };

  const names = {};
  const members = await fs.list(`circles/${code}/members`);
  for (const m of members) names[m.id] = m.data.name || "";
  const who = names[uid] || "";
  const ctitle = circleTitle(C, code);
  const out = []; // { uid, pref, code, compose }
  const add = (u, pref, compose) => { if (u && u !== uid) out.push({ uid: u, pref, code, compose }); };
  const foeOf = b => b.duel && b.duel.to ? b.duel.to : (C.guest || (members.find(m => m.id !== b.createdBy) || {}).id || "");

  if (type === "bet") {
    const duels = bets.filter(x => x.data.kind === "duel"), plain = bets.filter(x => x.data.kind !== "duel");
    for (const x of duels) {
      const b = x.data;
      add(foeOf(b), "duel", L => ({ title: ctitle, body: L.en ? `${who || "Someone"} challenges you: ${b.title} (${b.duel.stake} tokens each). Accept?` : `${who || "Quelqu'un"} te défie : ${b.title} (${b.duel.stake} jetons chacun). Tu relèves ?`, code, bet: x.id }));
    }
    if (plain.length && !C.duo) for (const m of members) add(m.id, "bet", L => ({ title: ctitle, body: newBetsText(plain.map(x => x.data), who, L), code, bet: plain.length === 1 ? plain[0].id : "" }));
  } else if (type === "settle") {
    const per = new Map();
    for (const x of bets) {
      const ws = await fs.query(`circles/${code}`, "wagers", "bet", x.id);
      for (const w of ws) { const u = w.data.uid; if (!u || u === uid) continue; if (!per.has(u)) per.set(u, []); per.get(u).push(x); }
    }
    for (const [u, list] of per) add(u, "settle", L => ({ title: ctitle, body: resultsText(list.map(x => x.data), L), code, bet: list.length === 1 ? list[0].id : "" }));
  } else if (type === "accept") {
    for (const x of bets) add(x.data.createdBy, "accept", L => ({ title: ctitle, body: L.en ? `${who || "Your opponent"} accepted your challenge: ${x.data.title}. May the best one win!` : `${who || "Ton adversaire"} relève ton défi : ${x.data.title}. Que le meilleur gagne !`, code, bet: x.id }));
  } else if (type === "contest") {
    for (const x of bets) {
      const b = x.data, to = new Set([b.createdBy]);
      if (b.settledBy && b.settledBy !== "auto") to.add(b.settledBy);
      for (const w of await fs.query(`circles/${code}`, "wagers", "bet", x.id)) to.add(w.data.uid);
      for (const u of to) add(u, "contest", L => ({ title: ctitle, body: L.en ? `${who || "Someone"} disputes the result of “${betTitle(b)}”. Have your say in the app.` : `${who || "Quelqu'un"} conteste le résultat de « ${betTitle(b)} ». Donne ton avis dans l'app.`, code, bet: x.id }));
    }
  }
  return deliver(cx, out);
}

async function friendEvent(cx, uid, to) {
  if (!reId.test(to) || to === uid) throw new HttpError(400, "bad-request");
  const fs = cx.fs, now = Date.now();
  const f = await fs.get(`friends/${pairOf(uid, to)}`);
  if (!f || !(f.data.users || []).includes(uid) || !(f.data.users || []).includes(to)) return { ok: true, sent: 0 };
  const names = f.data.names || {}, who = names[uid] || "";
  if (f.data.status === "pending" && f.data.from === uid) {
    if (!(await fs.markPushed(f, "req", now))) return { ok: true, sent: 0 };
    return deliver(cx, [{ uid: to, pref: "friend", compose: L => ({ title: "Pronohub", body: L.en ? `${who || "Someone"} wants to add you as a friend.` : `${who || "Quelqu'un"} veut t'ajouter en ami.`, open: "friends" }) }], { noMute: true });
  }
  if (f.data.status === "ok") {
    if (!(await fs.markPushed(f, "ok", now))) return { ok: true, sent: 0 };
    return deliver(cx, [{ uid: to, pref: "friend", compose: L => ({ title: "Pronohub", body: L.en ? `${who || "Your friend"} is now your friend on Pronohub. Challenge them to a duel!` : `${who || "Ton ami"} est maintenant ton ami sur Pronohub. Lance-lui un défi !`, open: "friends" }) }], { noMute: true });
  }
  return { ok: true, sent: 0 };
}

/* ---------------- Rappels planifiés ---------------- */

async function cron(cx) {
  const fs = cx.fs, now = Date.now();
  const res = { reminded: 0, tosettle: 0, cleaned: 0, sent: 0 };
  // 1. Paris terminés depuis un jour : rappel au créateur, puis on oublie l'échéance
  const old = await fs.range("deadlines", "closesAt", 0, now - TOSETTLE_AFTER, 12);
  // 2. Paris qui ferment dans l'heure
  const soon = (await fs.range("deadlines", "closesAt", now + 5 * MIN, now + REMIND_BEFORE, 15)).filter(d => !d.data.reminded);
  const all = old.concat(soon).filter(d => reCode.test(d.data.code || "") && reId.test(d.data.bet || ""));
  if (!all.length) return res;
  const bets = await fs.batchGet(all.map(d => `circles/${d.data.code}/bets/${d.data.bet}`));
  const betOf = d => bets[`circles/${d.data.code}/bets/${d.data.bet}`];
  const writes = [], out = [];

  for (const d of old) {
    const x = betOf(d);
    writes.push({ delete: d.path });
    res.cleaned++;
    if (!x || x.data.status !== "open" || x.data.src || !x.data.createdBy) continue;
    const b = x.data, code = d.data.code;
    res.tosettle++;
    out.push({ uid: b.createdBy, pref: "tosettle", code, compose: L => ({ title: "Pronohub", body: L.en ? `“${betTitle(b)}” is over: enter the result so winnings are paid out.` : `« ${betTitle(b)} » est terminé : saisis le résultat pour verser les gains.`, code, bet: d.data.bet }) });
  }

  const circles = {}, members = {};
  const circleDocs = await fs.batchGet([...new Set(soon.map(d => `circles/${d.data.code}`))]);
  const per = new Map(); // "uid|code" -> [{ id, b }]
  for (const d of soon) {
    if (cx.left() < 8) break;
    const x = betOf(d), code = d.data.code, C = (circleDocs[`circles/${code}`] || {}).data;
    if (!x || !C || C.deleted || x.data.status !== "open" || !(x.data.closesAt > now)) { writes.push({ delete: d.path }); res.cleaned++; continue; }
    writes.push({ update: d.path, field: "reminded", value: now });
    circles[code] = C;
    if (!members[code]) members[code] = await fs.list(`circles/${code}/members`);
    const staked = new Set((await fs.query(`circles/${code}`, "wagers", "bet", d.data.bet)).map(w => w.data.uid));
    const b = x.data;
    const targets = b.kind === "duel" ? [b.duel && b.duel.to || C.guest || (members[code].find(m => m.id !== b.createdBy) || {}).id] : members[code].map(m => m.id);
    for (const u of targets) {
      if (!u || staked.has(u) || (b.kind === "duel" && u === b.createdBy)) continue;
      const k = u + "|" + code;
      if (!per.has(k)) per.set(k, []);
      per.get(k).push({ id: d.data.bet, b });
    }
    res.reminded++;
  }
  for (const [k, list] of per) {
    const [u, code] = k.split("|"), C = circles[code];
    out.push({ uid: u, pref: "remind", code, compose: L => ({ title: circleTitle(C, code), body: remindText(list, L, now), code, bet: list.length === 1 ? list[0].id : "" }) });
  }
  if (writes.length) await fs.batchWrite(writes);
  const r = await deliver(cx, out);
  res.sent = r.sent;
  return res;
}

/* ---------------- Envoi ---------------- */

/* list : [{ uid, pref, code?, compose(L) }] — un message par appareil, selon ses préférences */
async function deliver(cx, list, opt = {}) {
  if (!list.length) return { ok: true, sent: 0 };
  const fs = cx.fs;
  const users = await fs.batchGet([...new Set(list.map(x => `users/${x.uid}`))], ["push"]);
  let sent = 0;
  for (const x of list) {
    const u = users[`users/${x.uid}`];
    const push = u && u.data.push;
    if (!push || !push.tokens) continue;
    if ((push.off || {})[PREF[x.pref] || x.pref]) continue;
    if (!opt.noMute && x.code && (push.mute || {})[x.code]) continue;
    for (const [key, tk] of Object.entries(push.tokens)) {
      if (!tk || !tk.t) continue;
      if (cx.left() < 1) return { ok: true, sent, partial: true };
      const L = { en: tk.lang === "en", lang: tk.lang === "en" ? "en" : "fr" };
      const m = x.compose(L);
      const r = await sendFcm(cx, tk.t, Object.assign({ lang: L.lang, tag: `${x.pref}-${m.code || ""}-${m.bet || ""}` }, m));
      if (r === "gone" && cx.left() > 0) await fs.deleteField(`users/${x.uid}`, `push.tokens.${key}`);
      else if (r === "ok") sent++;
    }
  }
  return { ok: true, sent };
}

function circleTitle(C, code) { return C && C.duo ? `🤝 ${C.name || "Duel"}` : `${(C && C.emoji) || "🎯"} ${(C && C.name) || code}`; }
function betTitle(b) { return b.kind === "match" && b.home ? `${b.home} – ${b.away}` : (b.title || ""); }
function optLabel(b, id, L) {
  const o = (b.options || []).find(x => x.id === id);
  if (!o) return "";
  if (L.en) {
    if (o.label === "Oui") return "Yes";
    if (o.label === "Non") return "No";
    if (o.label === "Match nul") return "Draw";
    if (/ a raison$/.test(o.label)) return o.label.replace(/ a raison$/, " was right");
  }
  return o.label;
}
function more(list, n) { return list.length > n ? "…" : ""; }

function newBetsText(list, who, L) {
  const w = who || (L.en ? "Someone" : "Quelqu'un");
  if (list.length === 1) return L.en ? `${w} added a bet: ${betTitle(list[0])}` : `${w} a lancé un pari : ${betTitle(list[0])}`;
  const some = list.slice(0, 3).map(betTitle).join(", ") + more(list, 3);
  return L.en ? `${w} added ${list.length} bets: ${some}` : `${w} a lancé ${list.length} paris : ${some}`;
}
function resultsText(list, L) {
  if (list.length === 1) {
    const b = list[0];
    if (b.status === "void") return L.en ? `“${betTitle(b)}” was cancelled, stakes refunded.` : `« ${betTitle(b)} » est annulé, mises remboursées.`;
    const sc = b.score ? ` (${b.score.h}–${b.score.a})` : "";
    return L.en ? `Result of “${betTitle(b)}”: ${optLabel(b, b.result, L)}${sc}. See if you won!` : `Résultat de « ${betTitle(b)} » : ${optLabel(b, b.result, L)}${sc}. Va voir si tu as gagné !`;
  }
  const voids = list.filter(b => b.status === "void").length;
  if (voids === list.length) return L.en ? `${list.length} of your bets were cancelled, stakes refunded.` : `${list.length} de tes paris sont annulés, mises remboursées.`;
  return L.en ? `${list.length} of your bets have a result. See if you won!` : `${list.length} de tes paris ont un résultat. Va voir si tu as gagné !`;
}
function remindText(list, L, now) {
  if (list.length === 1) {
    const { b } = list[0];
    const mins = Math.max(5, Math.round((b.closesAt - now) / MIN / 5) * 5);
    if (b.kind === "duel") return L.en ? `⏰ Reply to the challenge “${b.title}” within ${mins} min or it is cancelled.` : `⏰ Réponds au défi « ${b.title} » dans les ${mins} min, sinon il est annulé.`;
    return L.en ? `⏰ “${betTitle(b)}” closes in ${mins} min and you haven't bet yet.` : `⏰ « ${betTitle(b)} » ferme dans ${mins} min et tu n'as pas encore misé.`;
  }
  const some = list.slice(0, 3).map(x => betTitle(x.b)).join(", ") + more(list, 3);
  return L.en ? `⏰ ${list.length} bets close within the hour and you haven't bet: ${some}` : `⏰ ${list.length} paris ferment dans l'heure et tu n'as pas misé : ${some}`;
}

/* ---------------- Vérification de l'appelant (jeton d'identité Firebase) ---------------- */

let jwks = { keys: null, exp: 0 };
async function googleKeys() {
  if (jwks.keys && Date.now() < jwks.exp) return jwks.keys;
  const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!r.ok) throw new HttpError(503, "keys");
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get("Cache-Control") || "");
  jwks = { keys: j.keys, exp: Date.now() + (m ? +m[1] * 1000 : 3600000) };
  return jwks.keys;
}

async function verifyIdToken(token, projectId) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new HttpError(401, "auth");
  let head, claims;
  try { head = JSON.parse(b64urlText(parts[0])); claims = JSON.parse(b64urlText(parts[1])); } catch (e) { throw new HttpError(401, "auth"); }
  if (head.alg !== "RS256") throw new HttpError(401, "auth");
  const jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk) throw new HttpError(401, "auth");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  const t = Math.floor(Date.now() / 1000);
  if (!ok || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`
    || !(claims.exp > t) || !(claims.iat <= t + 300) || !claims.sub) throw new HttpError(401, "auth");
  return claims.sub;
}

/* ---------------- Accès Google (compte de service) ---------------- */

let access = { token: "", exp: 0 };
async function accessToken(cx) {
  if (access.token && Date.now() < access.exp) return access.token;
  const sa = cx.sa, t = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: t, exp: t + 3600,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
  };
  const unsigned = b64urlFromText(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64urlFromText(JSON.stringify(claims));
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await cx.fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + unsigned + "." + b64urlFromBytes(sig),
  });
  if (!r.ok) throw new Error("token " + r.status + " " + await r.text());
  const j = await r.json();
  access = { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return access.token;
}

/* ---------------- Envoi FCM ---------------- */

async function sendFcm(cx, token, m) {
  const r = await cx.fetch(`https://fcm.googleapis.com/v1/projects/${cx.sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: "Bearer " + await accessToken(cx), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        data: { title: clip(m.title, 80), body: clip(m.body, 240), code: m.code || "", bet: m.bet || "", open: m.open || "", tag: m.tag || "", lang: m.lang },
        webpush: { headers: { Urgency: "high", TTL: "86400" } },
        android: { priority: "high" },
      },
    }),
  });
  if (r.ok) return "ok";
  const txt = await r.text();
  if (r.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(txt)) return "gone";
  console.log("fcm", r.status, txt.slice(0, 300));
  return "err";
}
function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

/* ---------------- Firestore (API REST, droits administrateur) ---------------- */

class Firestore {
  constructor(cx) {
    this.cx = cx;
    this.root = `projects/${cx.sa.project_id}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }
  async call(url, opt = {}) {
    return this.cx.fetch(url, { ...opt, headers: { Authorization: "Bearer " + await accessToken(this.cx), "Content-Type": "application/json" } });
  }
  doc(d) { const path = d.name.slice(this.root.length + 1); return { id: path.split("/").pop(), path, data: decodeFields(d.fields), updateTime: d.updateTime }; }
  async get(path) {
    const r = await this.call(`${this.base}/${path}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("get " + path + " " + r.status);
    return this.doc(await r.json());
  }
  async list(path) {
    const out = [];
    let page = "";
    do {
      const r = await this.call(`${this.base}/${path}?pageSize=300${page ? "&pageToken=" + encodeURIComponent(page) : ""}`);
      if (!r.ok) throw new Error("list " + path + " " + r.status);
      const j = await r.json();
      for (const d of j.documents || []) out.push(this.doc(d));
      page = j.nextPageToken || "";
    } while (page && out.length < 1000);
    return out;
  }
  async runQuery(parent, structuredQuery) {
    const r = await this.call(`${this.base}${parent ? "/" + parent : ""}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery }) });
    if (!r.ok) throw new Error("query " + r.status + " " + (await r.text()).slice(0, 200));
    return (await r.json()).filter(x => x.document).map(x => this.doc(x.document));
  }
  query(parent, coll, field, value) {
    return this.runQuery(parent, { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } }, limit: 500 });
  }
  range(coll, field, lo, hi, limit) {
    const f = (op, v) => ({ fieldFilter: { field: { fieldPath: field }, op, value: { integerValue: String(Math.round(v)) } } });
    return this.runQuery("", {
      from: [{ collectionId: coll }],
      where: { compositeFilter: { op: "AND", filters: [f("GREATER_THAN_OR_EQUAL", lo), f("LESS_THAN_OR_EQUAL", hi)] } },
      orderBy: [{ field: { fieldPath: field }, direction: "ASCENDING" }], limit,
    });
  }
  /* Plusieurs documents en un appel : { chemin: doc } pour ceux qui existent */
  async batchGet(paths, fields) {
    const out = {};
    paths = [...new Set(paths)];
    for (let i = 0; i < paths.length; i += 100) {
      const body = { documents: paths.slice(i, i + 100).map(p => `${this.root}/${p}`) };
      if (fields) body.mask = { fieldPaths: fields };
      const r = await this.call(`${this.base}:batchGet`, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error("batchGet " + r.status);
      for (const x of await r.json()) if (x.found) { const d = this.doc(x.found); out[d.path] = d; }
    }
    return out;
  }
  /* Écrit pushed.<type> sur chaque document resté inchangé depuis sa lecture ; renvoie ceux qui ont réussi.
     En cas d'appels simultanés, un seul relais « gagne » chaque événement. */
  async claim(docs, type, at) {
    if (!docs.length) return [];
    const r = await this.call(`${this.base}:batchWrite`, {
      method: "POST",
      body: JSON.stringify({ writes: docs.map(d => ({
        update: { name: `${this.root}/${d.path}`, fields: { pushed: { mapValue: { fields: { [type]: { integerValue: String(at) } } } } } },
        updateMask: { fieldPaths: [`pushed.${type}`] },
        currentDocument: { updateTime: d.updateTime },
      })) }),
    });
    if (!r.ok) throw new Error("claim " + r.status);
    const st = (await r.json()).status || [];
    return docs.filter((d, i) => !st[i] || !st[i].code);
  }
  async markPushed(doc, type, at) { return (await this.claim([doc], type, at)).length === 1; }
  /* writes : [{ delete: chemin } | { update: chemin, field, value }] */
  async batchWrite(writes) {
    for (let i = 0; i < writes.length; i += 100) {
      await this.call(`${this.base}:batchWrite`, {
        method: "POST",
        body: JSON.stringify({ writes: writes.slice(i, i + 100).map(w => w.delete ? { delete: `${this.root}/${w.delete}` } : {
          update: { name: `${this.root}/${w.update}`, fields: { [w.field]: { integerValue: String(w.value) } } },
          updateMask: { fieldPaths: [w.field] }, currentDocument: { exists: true },
        }) }),
      });
    }
  }
  async deleteField(path, field) {
    await this.call(`${this.base}/${path}?updateMask.fieldPaths=${field}&currentDocument.exists=true`, { method: "PATCH", body: JSON.stringify({ fields: {} }) });
  }
}

function decodeFields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = decodeValue(v); return o; }
function decodeValue(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}

/* ---------------- Base64 URL ---------------- */

function b64urlBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlText(s) { return new TextDecoder().decode(b64urlBytes(s)); }
function b64urlFromBytes(u8) { let s = ""; for (const c of u8) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlFromText(t) { return b64urlFromBytes(new TextEncoder().encode(t)); }
function pemBytes(pem) {
  const b = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out.buffer;
}
