/* Pronohub — relais de notifications (Cloudflare Worker, offre gratuite).

   L'app appelle ce relais juste après avoir publié un pari ou enregistré un résultat.
   Le relais vérifie qui appelle (jeton Firebase), relit le pari dans Firestore, puis envoie
   une notification aux autres membres du cercle via Firebase Cloud Messaging (FCM).
   Chaque événement n'est envoyé qu'une fois : le pari garde la trace « pushed ».

   Configuration (Cloudflare > Workers > ce worker > Settings > Variables and Secrets) :
   - FIREBASE_SA : le contenu complet du fichier JSON du compte de service Firebase (type « Secret »)
   - ALLOWED_ORIGINS (facultatif) : origines autorisées, séparées par des virgules
*/

const DEFAULT_ORIGINS = "https://francoiskaiser.github.io";
const MAX_AGE = { bet: 20 * 60000, settle: 60 * 60000 };

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
    if (req.method === "GET") return reply(200, { ok: true, service: "pronohub-notify" });
    if (req.method !== "POST") return reply(405, { error: "method" });
    if (!origins.includes(origin)) return reply(403, { error: "origin" });

    let sa;
    try { sa = JSON.parse(env.FIREBASE_SA); } catch (e) { return reply(500, { error: "config" }); }
    try {
      const uid = await verifyIdToken((req.headers.get("Authorization") || "").replace(/^Bearer /, ""), sa.project_id);
      const body = await req.json();
      const res = await handle(sa, uid, body);
      return reply(200, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.log("erreur", e && e.stack || e);
      return reply(status, { error: e.message || "error" });
    }
  },
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------------- Événements ---------------- */

async function handle(sa, uid, body) {
  const type = body && body.type;
  const code = String(body && body.code || "");
  const ids = Array.isArray(body && body.bets) ? body.bets.map(String).slice(0, 20) : [];
  if (!["bet", "settle"].includes(type) || !/^[A-Z0-9-]{3,12}$/.test(code) || !ids.length || ids.some(id => !/^[A-Za-z0-9_.-]{1,64}$/.test(id))) throw new HttpError(400, "bad-request");

  const fs = new Firestore(sa);
  const circle = await fs.get(`circles/${code}`);
  if (!circle || circle.data.deleted) throw new HttpError(404, "circle");
  const meMember = await fs.get(`circles/${code}/members/${uid}`);
  if (!meMember) throw new HttpError(403, "not-member");

  // Paris concernés : on ne garde que ceux qui correspondent vraiment à l'événement annoncé
  const now = Date.now(), bets = [];
  for (const id of ids) {
    const doc = await fs.get(`circles/${code}/bets/${id}`);
    if (!doc) continue;
    const b = doc.data;
    if ((b.pushed || {})[type]) continue;
    if (type === "bet" && (b.createdBy !== uid || !(now - (b.createdAt || 0) < MAX_AGE.bet))) continue;
    if (type === "settle" && (!["settled", "void"].includes(b.status) || !(now - (b.settledAt || 0) < MAX_AGE.settle))) continue;
    // Marque « envoyé » avant d'envoyer : en cas d'appels simultanés, un seul passe
    if (!(await fs.markPushed(doc, type, now))) continue;
    bets.push({ id, b });
  }
  if (!bets.length) return { ok: true, sent: 0 };

  const members = await fs.list(`circles/${code}/members`);
  const names = {};
  for (const m of members) names[m.id] = m.data.name || "";
  const actor = names[uid] || "";

  // Destinataires : tous les autres membres pour un nouveau pari, les parieurs pour un résultat
  const messages = new Map(); // uid -> liste de paris
  if (type === "bet") {
    for (const m of members) if (m.id !== uid) messages.set(m.id, bets);
  } else {
    for (const x of bets) {
      const wagers = await fs.query(`circles/${code}`, "wagers", "bet", x.id);
      for (const w of wagers) {
        const u = w.data.uid;
        if (!u || u === uid) continue;
        if (!messages.has(u)) messages.set(u, []);
        messages.get(u).push(x);
      }
    }
  }
  if (!messages.size) return { ok: true, sent: 0 };

  const users = await fs.batchGet([...messages.keys()].map(u => `users/${u}`), ["push"]);
  let sent = 0;
  for (const [u, list] of messages) {
    const push = users[`users/${u}`] && users[`users/${u}`].push;
    if (!push || !push.tokens) continue;
    if ((push.off || {})[type]) continue;
    if ((push.mute || {})[code]) continue;
    for (const [key, tk] of Object.entries(push.tokens)) {
      if (!tk || !tk.t) continue;
      const msg = compose(type, list, circle.data, code, actor, tk.lang === "en" ? "en" : "fr");
      const r = await sendFcm(sa, tk.t, msg);
      if (r === "gone") await fs.deleteField(`users/${u}`, `push.tokens.${key}`);
      else if (r === "ok") sent++;
    }
  }
  return { ok: true, sent };
}

function betTitle(b) { return b.kind === "match" && b.home ? `${b.home} – ${b.away}` : (b.title || ""); }
function optLabel(b, id, lang) {
  const o = (b.options || []).find(x => x.id === id);
  if (!o) return "";
  if (lang === "en" && o.label === "Oui") return "Yes";
  if (lang === "en" && o.label === "Non") return "No";
  if (lang === "en" && o.label === "Match nul") return "Draw";
  return o.label;
}

function compose(type, list, circle, code, actor, lang) {
  const en = lang === "en";
  const cname = `${circle.emoji || "🎯"} ${circle.name || code}`;
  const who = actor || (en ? "Someone" : "Quelqu'un");
  let title, body, bet = list.length === 1 ? list[0].id : "";
  if (type === "bet") {
    if (list.length === 1) {
      const b = list[0].b;
      title = cname;
      body = b.kind === "duel"
        ? (en ? `${who} started a duel: ${betTitle(b)}` : `${who} lance un duel : ${betTitle(b)}`)
        : (en ? `${who} added a bet: ${betTitle(b)}` : `${who} a lancé un pari : ${betTitle(b)}`);
    } else {
      title = cname;
      const some = list.slice(0, 3).map(x => betTitle(x.b)).join(", ");
      body = en ? `${who} added ${list.length} bets: ${some}${list.length > 3 ? "…" : ""}` : `${who} a lancé ${list.length} paris : ${some}${list.length > 3 ? "…" : ""}`;
    }
  } else {
    title = cname;
    if (list.length === 1) {
      const b = list[0].b;
      body = b.status === "void"
        ? (en ? `“${betTitle(b)}” was cancelled, stakes refunded.` : `« ${betTitle(b)} » est annulé, mises remboursées.`)
        : (en ? `Result of “${betTitle(b)}”: ${optLabel(b, b.result, lang)}${b.score ? ` (${b.score.h}–${b.score.a})` : ""}. See if you won!` : `Résultat de « ${betTitle(b)} » : ${optLabel(b, b.result, lang)}${b.score ? ` (${b.score.h}–${b.score.a})` : ""}. Va voir si tu as gagné !`);
    } else {
      const voids = list.filter(x => x.b.status === "void").length;
      body = voids === list.length
        ? (en ? `${list.length} of your bets were cancelled, stakes refunded.` : `${list.length} de tes paris sont annulés, mises remboursées.`)
        : (en ? `${list.length} of your bets have a result. See if you won!` : `${list.length} de tes paris ont un résultat. Va voir si tu as gagné !`);
    }
  }
  return {
    title: clip(title, 80), body: clip(body, 240), code, bet, lang,
    tag: `${code}-${type}-${bet || list.length}`,
  };
}
function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

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
async function accessToken(sa) {
  if (access.token && Date.now() < access.exp) return access.token;
  const t = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: t, exp: t + 3600,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
  };
  const unsigned = b64urlFromText(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64urlFromText(JSON.stringify(claims));
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + unsigned + "." + b64urlFromBytes(sig),
  });
  if (!r.ok) throw new Error("token " + r.status + " " + await r.text());
  const j = await r.json();
  access = { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return access.token;
}

/* ---------------- Envoi FCM ---------------- */

async function sendFcm(sa, token, m) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: "Bearer " + await accessToken(sa), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        data: { title: m.title, body: m.body, code: m.code, bet: m.bet, tag: m.tag, lang: m.lang },
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

/* ---------------- Firestore (API REST, droits administrateur) ---------------- */

class Firestore {
  constructor(sa) {
    this.sa = sa;
    this.root = `projects/${sa.project_id}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }
  async call(url, opt = {}) {
    const r = await fetch(url, { ...opt, headers: { Authorization: "Bearer " + await accessToken(this.sa), "Content-Type": "application/json" } });
    return r;
  }
  async get(path) {
    const r = await this.call(`${this.base}/${path}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("get " + path + " " + r.status);
    const d = await r.json();
    return { id: path.split("/").pop(), path, data: decodeFields(d.fields), updateTime: d.updateTime };
  }
  async list(path) {
    const out = [];
    let page = "";
    do {
      const r = await this.call(`${this.base}/${path}?pageSize=300${page ? "&pageToken=" + encodeURIComponent(page) : ""}`);
      if (!r.ok) throw new Error("list " + path + " " + r.status);
      const j = await r.json();
      for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), data: decodeFields(d.fields) });
      page = j.nextPageToken || "";
    } while (page && out.length < 2000);
    return out;
  }
  async query(parent, coll, field, value) {
    const r = await this.call(`${this.base}/${parent}:runQuery`, {
      method: "POST",
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } }, limit: 500 } }),
    });
    if (!r.ok) throw new Error("query " + r.status);
    const j = await r.json();
    return j.filter(x => x.document).map(x => ({ id: x.document.name.split("/").pop(), data: decodeFields(x.document.fields) }));
  }
  async batchGet(paths, fields) {
    const out = {};
    for (let i = 0; i < paths.length; i += 100) {
      const r = await this.call(`${this.base}:batchGet`, {
        method: "POST",
        body: JSON.stringify({ documents: paths.slice(i, i + 100).map(p => `${this.root}/${p}`), mask: { fieldPaths: fields } }),
      });
      if (!r.ok) throw new Error("batchGet " + r.status);
      for (const x of await r.json()) if (x.found) out[x.found.name.slice(this.root.length + 1)] = decodeFields(x.found.fields);
    }
    return out;
  }
  /* Écrit pushed.<type> seulement si le pari n'a pas changé depuis la lecture */
  async markPushed(doc, type, at) {
    const r = await this.call(`${this.base}/${doc.path}?updateMask.fieldPaths=pushed.${type}&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { pushed: { mapValue: { fields: { [type]: { integerValue: String(at) } } } } } }),
    });
    if (r.ok) return true;
    if (r.status === 400 || r.status === 409 || r.status === 412) return false;
    throw new Error("mark " + r.status);
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
