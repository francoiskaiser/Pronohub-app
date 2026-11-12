/* Test du relais de notifications : faux Google (jetons, Firestore, FCM) en mémoire. */
import worker from "../worker/pronohub-notify.js";
import { generateKeyPairSync, createSign } from "node:crypto";

const PID = "demo-proj";
let fails = 0;
const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fails++; };

// Clé « Google » qui signe les jetons d'identité, et clé du compte de service
const idKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const saKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...idKey.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const SA = { project_id: PID, client_email: "sa@demo.iam", private_key: saKey.privateKey.export({ type: "pkcs8", format: "pem" }) };
const b64u = b => Buffer.from(b).toString("base64url");
function idToken(uid, opts = {}) {
  const t = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" })), p = b64u(JSON.stringify({ aud: opts.aud || PID, iss: `https://securetoken.google.com/${PID}`, sub: uid, iat: t - 10, exp: t + 3600 }));
  const s = createSign("RSA-SHA256").update(h + "." + p).sign(idKey.privateKey);
  return h + "." + p + "." + b64u(s);
}

// Faux Firestore : chemin -> { fields JS, updateTime }
const db = {};
let clock = 1;
const put = (p, data) => { db[p] = { data: JSON.parse(JSON.stringify(data)), updateTime: "t" + (clock++) }; };
const enc = v => typeof v === "string" ? { stringValue: v } : typeof v === "number" ? { integerValue: String(v) } : typeof v === "boolean" ? { booleanValue: v }
  : v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const ROOT = `projects/${PID}/databases/(default)/documents`;
const docJson = p => ({ name: `${ROOT}/${p}`, fields: enc(db[p].data).mapValue.fields, updateTime: db[p].updateTime });
const sent = [];
let saTokenOk = false;

globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url), method = opt.method || "GET";
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" } });
  if (u.hostname === "www.googleapis.com") return J({ keys: [jwk] });
  if (u.hostname === "oauth2.googleapis.com") {
    const a = new URLSearchParams(opt.body).get("assertion");
    const [h, p, s] = a.split(".");
    const { createVerify } = await import("node:crypto");
    saTokenOk = createVerify("RSA-SHA256").update(h + "." + p).verify(saKey.publicKey, Buffer.from(s, "base64url"));
    return saTokenOk ? J({ access_token: "AT", expires_in: 3600 }) : J({ error: "bad" }, 400);
  }
  if ((opt.headers || {}).Authorization !== "Bearer AT") return J({ error: "unauth" }, 401);
  if (u.hostname === "fcm.googleapis.com") {
    const m = JSON.parse(opt.body).message;
    if (m.token === "dead") return J({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, 404);
    sent.push(m); return J({ name: "x" });
  }
  // Firestore
  const path = decodeURIComponent(u.pathname).replace(`/v1/${ROOT}`, "").replace(/^\//, "");
  if (path.endsWith(":batchGet")) {
    const b = JSON.parse(opt.body);
    return J(b.documents.map(n => { const p = n.slice(ROOT.length + 1); return db[p] ? { found: docJson(p) } : { missing: n }; }));
  }
  if (path.endsWith(":runQuery")) {
    const parent = path.replace(":runQuery", ""), q = JSON.parse(opt.body).structuredQuery;
    const coll = q.from[0].collectionId, f = q.where.fieldFilter;
    const out = Object.keys(db).filter(p => p.startsWith(parent + "/" + coll + "/") && p.split("/").length === parent.split("/").length + 2 && db[p].data[f.field.fieldPath] === f.value.stringValue).map(p => ({ document: docJson(p) }));
    return J(out.length ? out : [{ readTime: "x" }]);
  }
  if (method === "GET") {
    if (db[path]) return J(docJson(path));
    const depth = path.split("/").length;
    if (depth % 2 === 1) return J({ documents: Object.keys(db).filter(p => p.startsWith(path + "/") && p.split("/").length === depth + 1).map(docJson) });
    return J({ error: "nf" }, 404);
  }
  if (method === "PATCH") {
    const pre = u.searchParams.get("currentDocument.updateTime");
    if (pre && (!db[path] || db[path].updateTime !== pre)) return J({ error: "FAILED_PRECONDITION" }, 400);
    const mask = u.searchParams.getAll("updateMask.fieldPaths");
    const fields = JSON.parse(opt.body).fields || {};
    for (const m of mask) {
      const ks = m.split("."); let o = db[path].data;
      for (const k of ks.slice(0, -1)) o = o[k] = o[k] || {};
      let v = fields; for (const k of ks) v = v && (v.mapValue ? v.mapValue.fields : v)[k];
      if (v === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = v.integerValue ? Number(v.integerValue) : v.stringValue;
    }
    db[path].updateTime = "t" + (clock++);
    return J(docJson(path));
  }
  return J({ error: "?" }, 400);
};

const env = { FIREBASE_SA: JSON.stringify(SA) };
const ORIGIN = "https://francoiskaiser.github.io";
const call = (uid, body, origin = ORIGIN) => worker.fetch(new Request("https://w.example/", {
  method: "POST", headers: { Origin: origin, Authorization: "Bearer " + (typeof uid === "string" && uid.includes(".") ? uid : idToken(uid)), "Content-Type": "application/json" }, body: JSON.stringify(body),
}), env).then(async r => ({ status: r.status, j: await r.json(), cors: r.headers.get("Access-Control-Allow-Origin") }));

// Données : cercle ABC-234, Ana (créatrice), Ben (FR, 2 appareils dont un mort), Cleo (EN, a coupé les résultats), Dan (sans notif)
const T = Date.now();
put("circles/ABC-234", { name: "Les potes", emoji: "⚽", owner: "ana", season: 1 });
for (const [id, name] of [["ana", "Ana"], ["ben", "Ben"], ["cleo", "Cleo"], ["dan", "Dan"]]) put(`circles/ABC-234/members/${id}`, { uid: id, name });
put("users/ben", { name: "Ben", push: { tokens: { ta: { t: "ben-phone", lang: "fr" }, tb: { t: "dead", lang: "fr" } } } });
put("users/cleo", { push: { tokens: { tc: { t: "cleo-phone", lang: "en" } }, off: { settle: true } } });
put("users/dan", { name: "Dan" });
put("circles/ABC-234/bets/b1", { kind: "yesno", title: "Il pleut demain ?", createdBy: "ana", createdAt: T - 1000, status: "open", options: [{ id: "y", label: "Oui" }, { id: "n", label: "Non" }] });
put("circles/ABC-234/bets/old", { kind: "yesno", title: "Vieux", createdBy: "ana", createdAt: T - 3600000, status: "open", options: [] });

let r = await call("ana", { type: "bet", code: "ABC-234", bets: ["b1"] });
ok(r.status === 200 && r.j.sent === 2, `nouveau pari : envoyé à Ben et Cleo (${JSON.stringify(r.j)})`);
ok(saTokenOk, "jeton du compte de service signé correctement");
ok(sent.some(m => m.token === "ben-phone" && m.data.body === "Ana a lancé un pari : Il pleut demain ?" && m.data.title === "⚽ Les potes"), "texte français pour Ben");
ok(sent.some(m => m.token === "cleo-phone" && m.data.body === "Ana added a bet: Il pleut demain ?"), "texte anglais pour Cleo");
ok(!sent.some(m => m.token === "dead"), "aucun envoi réussi vers l'appareil mort");
ok(!db["users/ben"].data.push.tokens.tb, "appareil mort retiré du profil de Ben");
ok(sent.every(m => m.data.code === "ABC-234" && m.data.bet === "b1"), "lien vers le pari dans la notif");
ok(!!db["circles/ABC-234/bets/b1"].data.pushed.bet, "pari marqué « envoyé »");

sent.length = 0;
r = await call("ana", { type: "bet", code: "ABC-234", bets: ["b1"] });
ok(r.j.sent === 0 && !sent.length, "deuxième appel : rien n'est renvoyé");
r = await call("ben", { type: "bet", code: "ABC-234", bets: ["old"] });
ok(r.j.sent === 0, "pari d'un autre : refusé");
r = await call("ana", { type: "bet", code: "ABC-234", bets: ["old"] });
ok(r.j.sent === 0, "pari trop ancien : ignoré");
r = await call("zoe", { type: "bet", code: "ABC-234", bets: ["b1"] });
ok(r.status === 403, "non-membre : refusé");
r = await call("ana", { type: "bet", code: "ABC-234", bets: ["b1"] }, "https://evil.example");
ok(r.status === 403, "autre site : refusé");
r = await call(idToken("ana", { aud: "other" }), { type: "bet", code: "ABC-234", bets: ["b1"] });
ok(r.status === 401, "jeton d'un autre projet : refusé");
r = await call(idToken("ana").slice(0, -4) + "AAAA", { type: "bet", code: "ABC-234", bets: ["b1"] });
ok(r.status === 401, "jeton falsifié : refusé");
r = await call("ana", { type: "hack", code: "ABC-234", bets: ["b1"] });
ok(r.status === 400, "type inconnu : refusé");

// Plusieurs paris d'un coup (import de matchs) = une seule notif
for (const i of [1, 2, 3, 4]) put(`circles/ABC-234/bets/m${i}`, { kind: "match", home: "Équipe " + i, away: "Rival", title: "x", createdBy: "ana", createdAt: T, status: "open", options: [] });
sent.length = 0;
r = await call("ana", { type: "bet", code: "ABC-234", bets: ["m1", "m2", "m3", "m4"] });
const benMsg = sent.find(m => m.token === "ben-phone");
ok(sent.length === 2 && benMsg && /a lancé 4 paris/.test(benMsg.data.body) && benMsg.data.bet === "", `import : une notif groupée (${benMsg && benMsg.data.body})`);

// Résultat : seuls les parieurs, sauf qui a réglé, et sauf Cleo qui a coupé les résultats
Object.assign(db["circles/ABC-234/bets/b1"].data, { status: "settled", result: "y", settledBy: "ana", settledAt: Date.now() });
put("circles/ABC-234/wagers/b1_ben", { bet: "b1", uid: "ben", opt: "y", amt: 10 });
put("circles/ABC-234/wagers/b1_cleo", { bet: "b1", uid: "cleo", opt: "n", amt: 10 });
put("circles/ABC-234/wagers/b1_ana", { bet: "b1", uid: "ana", opt: "y", amt: 10 });
put("circles/ABC-234/wagers/m1_dan", { bet: "m1", uid: "dan", opt: "h", amt: 10 });
sent.length = 0;
r = await call("ana", { type: "settle", code: "ABC-234", bets: ["b1"] });
ok(r.j.sent === 1 && sent[0].token === "ben-phone" && sent[0].data.body === "Résultat de « Il pleut demain ? » : Oui. Va voir si tu as gagné !", `résultat : seul Ben est prévenu (${sent.map(m => m.data.body)})`);
r = await call("ben", { type: "settle", code: "ABC-234", bets: ["b1"] });
ok(r.j.sent === 0, "résultat déjà annoncé : pas de doublon");
r = await call("ben", { type: "settle", code: "ABC-234", bets: ["m2"] });
ok(r.j.sent === 0, "résultat d'un pari encore ouvert : ignoré");

// Préférences : cercle en sourdine
db["users/ben"].data.push.mute = { "ABC-234": true };
put("circles/ABC-234/bets/b9", { kind: "yesno", title: "Encore ?", createdBy: "ana", createdAt: Date.now(), status: "open", options: [] });
sent.length = 0;
r = await call("ana", { type: "bet", code: "ABC-234", bets: ["b9"] });
ok(!sent.some(m => m.token === "ben-phone") && sent.some(m => m.token === "cleo-phone"), "cercle en sourdine chez Ben : pas de notif pour lui");

// Cercle supprimé
db["circles/ABC-234"].data.deleted = true;
r = await call("ana", { type: "bet", code: "ABC-234", bets: ["b9"] });
ok(r.status === 404, "cercle supprimé : refusé");

r = await worker.fetch(new Request("https://w.example/", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env);
ok(r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === ORIGIN, "pré-vérification CORS");

console.log(fails ? `ÉCHECS: ${fails}` : "ERREURS: aucune");
process.exit(fails ? 1 : 0);
