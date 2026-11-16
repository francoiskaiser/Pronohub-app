/* Test du relais de notifications : faux Google (jetons, Firestore, FCM) en mémoire. */
import worker from "../worker/pronohub-notify.js";
import { generateKeyPairSync, createSign, createVerify } from "node:crypto";

const PID = "demo-proj";
let fails = 0;
const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fails++; };

const idKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const saKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...idKey.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const SA = { project_id: PID, client_email: "sa@demo.iam", private_key: saKey.privateKey.export({ type: "pkcs8", format: "pem" }) };
const b64u = b => Buffer.from(b).toString("base64url");
function idToken(uid, opts = {}) {
  const t = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" })), p = b64u(JSON.stringify({ aud: opts.aud || PID, iss: `https://securetoken.google.com/${PID}`, sub: uid, iat: t - 10, exp: t + 3600 }));
  return h + "." + p + "." + b64u(createSign("RSA-SHA256").update(h + "." + p).sign(idKey.privateKey));
}

/* ---- Faux Firestore ---- */
const db = {};
let clock = 1, calls = 0;
const put = (p, data) => { db[p] = { data: JSON.parse(JSON.stringify(data)), updateTime: "t" + (clock++) }; };
const enc = v => typeof v === "string" ? { stringValue: v } : typeof v === "number" ? { integerValue: String(v) } : typeof v === "boolean" ? { booleanValue: v }
  : v === null || v === undefined ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = v => "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "booleanValue" in v ? v.booleanValue : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
const ROOT = `projects/${PID}/databases/(default)/documents`;
const docJson = p => ({ name: `${ROOT}/${p}`, fields: enc(db[p].data).mapValue.fields, updateTime: db[p].updateTime });
const depth = p => p.split("/").length;
function applyMask(path, fields, mask) {
  for (const m of mask) {
    const ks = m.split("."); let o = db[path].data;
    for (const k of ks.slice(0, -1)) o = o[k] = o[k] || {};
    let v = { mapValue: { fields } };
    for (const k of ks) v = v && v.mapValue && v.mapValue.fields[k];
    if (v === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = dec(v);
  }
  db[path].updateTime = "t" + (clock++);
}
const sent = [];
const send = tok => sent.filter(m => m.token === tok);

globalThis.fetch = async (url, opt = {}) => {
  calls++;
  const u = new URL(url), method = opt.method || "GET";
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" } });
  if (u.hostname === "www.googleapis.com") return J({ keys: [jwk] });
  if (u.hostname === "oauth2.googleapis.com") {
    const [h, p, s] = new URLSearchParams(opt.body).get("assertion").split(".");
    return createVerify("RSA-SHA256").update(h + "." + p).verify(saKey.publicKey, Buffer.from(s, "base64url")) ? J({ access_token: "AT", expires_in: 3600 }) : J({}, 400);
  }
  if ((opt.headers || {}).Authorization !== "Bearer AT") return J({ error: "unauth" }, 401);
  if (u.hostname === "fcm.googleapis.com") {
    const m = JSON.parse(opt.body).message;
    if (m.token === "dead") return J({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, 404);
    sent.push(m); return J({ name: "x" });
  }
  const path = decodeURIComponent(u.pathname).replace(`/v1/${ROOT}`, "").replace(/^\//, "");
  if (path.endsWith(":batchGet")) {
    return J(JSON.parse(opt.body).documents.map(n => { const p = n.slice(ROOT.length + 1); return db[p] ? { found: docJson(p) } : { missing: n }; }));
  }
  if (path.endsWith(":batchWrite")) {
    const status = JSON.parse(opt.body).writes.map(w => {
      if (w.delete) { delete db[w.delete.slice(ROOT.length + 1)]; return {}; }
      const p = w.update.name.slice(ROOT.length + 1), pre = w.currentDocument || {};
      if (!db[p] || (pre.updateTime && db[p].updateTime !== pre.updateTime)) return { code: 9 };
      applyMask(p, w.update.fields, w.updateMask.fieldPaths); return {};
    });
    return J({ writeResults: status.map(() => ({})), status });
  }
  if (path.endsWith(":runQuery")) {
    const parent = path.replace(":runQuery", ""), q = JSON.parse(opt.body).structuredQuery;
    const coll = q.from[0].collectionId;
    const filters = q.where.fieldFilter ? [q.where.fieldFilter] : q.where.compositeFilter.filters.map(f => f.fieldFilter);
    const pre = (parent ? parent + "/" : "") + coll + "/";
    let out = Object.keys(db).filter(p => p.startsWith(pre) && depth(p) === depth(pre) && filters.every(f => {
      const v = db[p].data[f.field.fieldPath], x = dec(f.value);
      return f.op === "EQUAL" ? v === x : f.op === "GREATER_THAN_OR_EQUAL" ? v >= x : f.op === "LESS_THAN_OR_EQUAL" ? v <= x : false;
    }));
    if (q.orderBy) out.sort((a, b) => db[a].data[q.orderBy[0].field.fieldPath] - db[b].data[q.orderBy[0].field.fieldPath]);
    out = out.slice(0, q.limit || 1e9).map(p => ({ document: docJson(p) }));
    return J(out.length ? out : [{ readTime: "x" }]);
  }
  if (method === "GET") {
    if (db[path]) return J(docJson(path));
    if (depth(path) % 2 === 1) return J({ documents: Object.keys(db).filter(p => p.startsWith(path + "/") && depth(p) === depth(path) + 1).map(docJson) });
    return J({ error: "nf" }, 404);
  }
  if (method === "PATCH") {
    if (!db[path]) return J({}, 404);
    applyMask(path, JSON.parse(opt.body).fields || {}, u.searchParams.getAll("updateMask.fieldPaths"));
    return J(docJson(path));
  }
  return J({ error: "?" }, 400);
};

const env = { FIREBASE_SA: JSON.stringify(SA) };
const ORIGIN = "https://francoiskaiser.github.io";
const call = (uid, body, origin = ORIGIN) => worker.fetch(new Request("https://w.example/", {
  method: "POST", headers: { Origin: origin, Authorization: "Bearer " + (uid.includes(".") ? uid : idToken(uid)), "Content-Type": "application/json" }, body: JSON.stringify(body),
}), env).then(async r => ({ status: r.status, j: await r.json() }));
const cron = async () => { let p; await worker.scheduled({}, env, { waitUntil: x => { p = x; } }); await p; };
const reset = () => { sent.length = 0; calls = 0; };

/* ---- Données ---- */
const T = Date.now();
const C = "ABC-234";
put(`circles/${C}`, { name: "Les potes", emoji: "⚽", owner: "ana", season: 1 });
for (const [id, name] of [["ana", "Ana"], ["ben", "Ben"], ["cleo", "Cleo"], ["dan", "Dan"]]) put(`circles/${C}/members/${id}`, { uid: id, name, joinedAt: T - DAYS(2) });
function DAYS(n) { return n * 86400000; }
put("users/ana", { push: { tokens: { tz: { t: "ana-phone", lang: "fr" } } } });
put("users/ben", { push: { tokens: { ta: { t: "ben-phone", lang: "fr" }, tb: { t: "dead", lang: "fr" } } } });
put("users/cleo", { push: { tokens: { tc: { t: "cleo-phone", lang: "en" } }, off: { settle: true } } });
put("users/dan", { name: "Dan" });
put(`circles/${C}/bets/b1`, { kind: "yesno", title: "Il pleut demain ?", createdBy: "ana", createdAt: T - 1000, status: "open", closesAt: T + DAYS(1), options: [{ id: "y", label: "Oui" }, { id: "n", label: "Non" }] });
put(`circles/${C}/bets/old`, { kind: "yesno", title: "Vieux", createdBy: "ana", createdAt: T - 3600000, status: "open", options: [] });

/* ---- Nouveau pari ---- */
let r = await call("ana", { type: "bet", code: C, bets: ["b1"] });
ok(r.status === 200 && r.j.sent === 2, `nouveau pari : Ben et Cleo prévenus (${JSON.stringify(r.j)})`);
ok(send("ben-phone")[0].data.body === "Ana a lancé un pari : Il pleut demain ?" && send("ben-phone")[0].data.title === "⚽ Les potes", "texte français");
ok(send("cleo-phone")[0].data.body === "Ana added a bet: Il pleut demain ?", "texte anglais");
ok(!db["users/ben"].data.push.tokens.tb, "appareil mort retiré");
ok(send("ben-phone")[0].data.code === C && send("ben-phone")[0].data.bet === "b1", "lien vers le pari");
reset();
r = await call("ana", { type: "bet", code: C, bets: ["b1"] });
ok(r.j.sent === 0 && !sent.length, "pas de doublon");
r = await call("ben", { type: "bet", code: C, bets: ["old"] });
ok(r.j.sent === 0, "pari d'un autre : ignoré");
r = await call("ana", { type: "bet", code: C, bets: ["old"] });
ok(r.j.sent === 0, "pari trop ancien : ignoré");
r = await call("zoe", { type: "bet", code: C, bets: ["b1"] });
ok(r.status === 403, "non-membre : refusé");
r = await call("ana", { type: "bet", code: C, bets: ["b1"] }, "https://evil.example");
ok(r.status === 403, "autre site : refusé");
r = await call(idToken("ana", { aud: "other" }), { type: "bet", code: C, bets: ["b1"] });
ok(r.status === 401, "jeton d'un autre projet : refusé");
r = await call(idToken("ana").slice(0, -4) + "AAAA", { type: "bet", code: C, bets: ["b1"] });
ok(r.status === 401, "jeton falsifié : refusé");
r = await call("ana", { type: "hack", code: C, bets: ["b1"] });
ok(r.status === 400, "type inconnu : refusé");

// Import groupé : 12 paris = une notif par personne, et peu d'appels sortants
for (let i = 1; i <= 12; i++) put(`circles/${C}/bets/m${i}`, { kind: "match", home: "Équipe " + i, away: "Rival", title: "x", createdBy: "ana", createdAt: T, status: "open", closesAt: T + DAYS(2), src: { lg: "bel.1" }, options: [] });
reset();
r = await call("ana", { type: "bet", code: C, bets: Array.from({ length: 12 }, (_, i) => "m" + (i + 1)) });
ok(send("ben-phone").length === 1 && /a lancé 12 paris/.test(send("ben-phone")[0].data.body), `import : une notif groupée (${send("ben-phone")[0] && send("ben-phone")[0].data.body})`);
ok(calls <= 10, `import : ${calls} appels sortants seulement`);

/* ---- Résultat ---- */
Object.assign(db[`circles/${C}/bets/b1`].data, { status: "settled", result: "y", settledBy: "ana", settledAt: Date.now() });
put(`circles/${C}/wagers/b1_ben`, { bet: "b1", uid: "ben", opt: "y", amt: 10 });
put(`circles/${C}/wagers/b1_cleo`, { bet: "b1", uid: "cleo", opt: "n", amt: 10 });
put(`circles/${C}/wagers/b1_ana`, { bet: "b1", uid: "ana", opt: "y", amt: 10 });
reset();
r = await call("ana", { type: "settle", code: C, bets: ["b1"] });
ok(r.j.sent === 1 && sent[0].token === "ben-phone" && sent[0].data.body === "Résultat de « Il pleut demain ? » : Oui. Va voir si tu as gagné !", `résultat : seul Ben (Cleo a coupé les résultats)`);
r = await call("ben", { type: "settle", code: C, bets: ["b1"] });
ok(r.j.sent === 0, "résultat : pas de doublon");

/* ---- Contestation ---- */
put(`circles/${C}/flags/b1_cleo`, { bet: "b1", uid: "cleo", result: "y" });
reset();
r = await call("cleo", { type: "contest", code: C, bets: ["b1"] });
ok(send("ana-phone").length === 1 && send("ben-phone").length === 1 && !send("cleo-phone").length, "contestation : créatrice et parieurs prévenus, pas Cleo");
ok(send("ana-phone")[0].data.body === "Cleo conteste le résultat de « Il pleut demain ? ». Donne ton avis dans l'app.", "texte de contestation");
reset();
r = await call("ben", { type: "contest", code: C, bets: ["b1"] });
ok(!sent.length, "contestation sans signalement réel : ignorée");

/* ---- Nouveau membre ---- */
put(`circles/${C}/members/eve`, { uid: "eve", name: "Eve", joinedAt: Date.now() });
reset();
r = await call("eve", { type: "member", code: C });
ok(send("ana-phone").length === 1 && send("ana-phone")[0].data.body === "Eve a rejoint le cercle.", "nouveau membre : la créatrice est prévenue");
r = await call("eve", { type: "member", code: C });
ok(r.j.sent === 0, "nouveau membre : une seule fois");
reset();
r = await call("ben", { type: "member", code: C });
ok(!sent.length, "ancien membre : rien");

/* ---- Invitation dans un cercle ---- */
put("users/zoe", { push: { tokens: { tz: { t: "zoe-phone", lang: "fr" } }, mute: { [C]: true } } });
put(`users/zoe/inbox/${C}_ana`, { type: "circle", code: C, from: "ana", name: "Les potes", at: Date.now() });
reset();
r = await call("ana", { type: "invite", code: C, to: ["zoe", "dan"] });
ok(send("zoe-phone").length === 1 && send("zoe-phone")[0].data.body === "Ana t'invite dans le cercle ⚽ Les potes." && send("zoe-phone")[0].data.open === "join", "invitation reçue (lien pour rejoindre)");
reset();
r = await call("ben", { type: "invite", code: C, to: ["zoe"] });
ok(!sent.length, "invitation inexistante : rien");

/* ---- Duels (face-à-face) ---- */
const D = "DUO-777";
put(`circles/${D}`, { name: "Ana vs Ben", emoji: "🤝", owner: "ana", guest: "ben", duo: true, season: 1 });
put(`circles/${D}/members/ana`, { uid: "ana", name: "Ana" });
put(`circles/${D}/bets/d1`, { kind: "duel", title: "Je cours 10 km en moins de 50 min", createdBy: "ana", createdAt: Date.now(), status: "open", closesAt: Date.now() + 40 * 60000, duel: { to: "ben", stake: 100 }, options: [{ id: "y", label: "Ana a raison" }, { id: "n", label: "Ben a raison" }] });
put(`deadlines/${D}_d1`, { code: D, bet: "d1", closesAt: Date.now() + 40 * 60000, createdBy: "ana" });
reset();
r = await call("ana", { type: "bet", code: D, bets: ["d1"] });
ok(send("ben-phone").length === 1 && send("ben-phone")[0].data.body === "Ana te défie : Je cours 10 km en moins de 50 min (100 jetons chacun). Tu relèves ?" && send("ben-phone")[0].data.title === "🤝 Ana vs Ben", "défi : Ben prévenu, même avant d'être membre du duel");
put(`circles/${D}/members/ben`, { uid: "ben", name: "Ben" });
put(`circles/${D}/wagers/d1_ben`, { bet: "d1", uid: "ben", opt: "n", amt: 100 });
reset();
r = await call("ben", { type: "accept", code: D, bets: ["d1"] });
ok(send("ana-phone").length === 1 && /Ben relève ton défi/.test(send("ana-phone")[0].data.body), "défi relevé : Ana prévenue");
reset();
r = await call("ana", { type: "accept", code: D, bets: ["d1"] });
ok(!sent.length, "faux « défi relevé » : ignoré");

/* ---- Amis ---- */
put("friends/ana_zoe", { users: ["ana", "zoe"], names: { ana: "Ana", zoe: "Zoé" }, status: "pending", from: "ana" });
reset();
r = await call("ana", { type: "friend", to: "zoe" });
ok(send("zoe-phone").length === 1 && send("zoe-phone")[0].data.body === "Ana veut t'ajouter en ami." && send("zoe-phone")[0].data.open === "friends", "demande d'ami reçue (même cercle en sourdine)");
r = await call("zoe", { type: "friend", to: "ana" });
ok(r.j.sent === 0, "demande : seul l'auteur peut l'annoncer");
db["friends/ana_zoe"].data.status = "ok";
reset();
r = await call("zoe", { type: "friend", to: "ana" });
ok(send("ana-phone").length === 1 && /Zoé est maintenant ton ami/.test(send("ana-phone")[0].data.body), "demande acceptée : Ana prévenue");
reset();
r = await call("ben", { type: "friend", to: "zoe" });
ok(!sent.length, "pas d'amitié : rien");

/* ---- Rappels planifiés ---- */
// Pari qui ferme dans 40 min : Ben a misé, Cleo et Dan non (Dan sans appareil) ; défi d1 déjà relevé
put(`circles/${C}/bets/s1`, { kind: "yesno", title: "Il neige ?", createdBy: "ana", createdAt: T, status: "open", closesAt: Date.now() + 40 * 60000, options: [] });
put(`circles/${C}/bets/s2`, { kind: "yesno", title: "Il gèle ?", createdBy: "ana", createdAt: T, status: "open", closesAt: Date.now() + 50 * 60000, options: [] });
put(`circles/${C}/wagers/s1_ben`, { bet: "s1", uid: "ben", opt: "y", amt: 5 });
put(`deadlines/${C}_s1`, { code: C, bet: "s1", closesAt: Date.now() + 40 * 60000, createdBy: "ana" });
put(`deadlines/${C}_s2`, { code: C, bet: "s2", closesAt: Date.now() + 50 * 60000, createdBy: "ana" });
// Pari manuel fini depuis 2 jours sans résultat, et un pari déjà réglé
put(`circles/${C}/bets/late`, { kind: "multi", title: "Employé du mois", createdBy: "ben", createdAt: T - DAYS(5), status: "open", closesAt: Date.now() - DAYS(2), options: [] });
put(`deadlines/${C}_late`, { code: C, bet: "late", closesAt: Date.now() - DAYS(2), createdBy: "ben" });
put(`deadlines/${C}_b1`, { code: C, bet: "b1", closesAt: Date.now() - DAYS(3), createdBy: "ana" });
db["users/ben"].data.push.tokens.ta.lang = "fr";
reset();
await cron();
const cleo = send("cleo-phone"), ben = send("ben-phone");
ok(cleo.length === 1 && /2 bets close within the hour/.test(cleo[0].data.body), `rappel groupé pour Cleo (${cleo.map(m => m.data.body)})`);
ok(ben.some(m => /« Il gèle \? » ferme dans \d+ min/.test(m.data.body)) && !ben.some(m => /Il neige/.test(m.data.body)), "Ben : rappel seulement pour le pari où il n'a pas misé");
ok(ben.some(m => m.data.body === "« Employé du mois » est terminé : saisis le résultat pour verser les gains."), "pari à régler : son créateur est prévenu");
ok(send("ana-phone").length === 1 && /2 paris ferment dans l'heure/.test(send("ana-phone")[0].data.body) && !send("ana-phone").some(m => /défi/.test(m.data.body)), "Ana : rappel pour ses paris sans mise, rien pour le défi déjà relevé");
ok(!db[`deadlines/${C}_late`] && !db[`deadlines/${C}_b1`], "échéances passées nettoyées");
ok(db[`deadlines/${C}_s1`].data.reminded > 0, "rappel noté");
ok(calls < 46, `rappels : ${calls} appels sortants`);
reset();
await cron();
ok(!sent.length, "deuxième passage : pas de doublon");

/* ---- Cercle supprimé, CORS ---- */
db[`circles/${C}`].data.deleted = true;
r = await call("ana", { type: "bet", code: C, bets: ["b1"] });
ok(r.status === 404, "cercle supprimé : refusé");
const o = await worker.fetch(new Request("https://w.example/", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env);
ok(o.status === 204 && o.headers.get("Access-Control-Allow-Origin") === ORIGIN, "pré-vérification CORS");

console.log(fails ? `ÉCHECS: ${fails}` : "ERREURS: aucune");
process.exit(fails ? 1 : 0);
