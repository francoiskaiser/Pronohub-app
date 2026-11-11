/* Pronohub — couche de données : un même cache pour les cercles locaux et en ligne */
"use strict";

const COLLS = ["members", "bets", "wagers", "ledger", "flags", "comments", "reacts"];

function blankCircle(code, local) {
  const cc = { code, local, status: "loading", err: "", circle: null, seasons: {}, seasonsLoaded: false };
  for (const c of COLLS) cc[c] = {};
  return cc;
}

const DB = {
  c: {},          // cache par code
  code: null,     // cercle ouvert
  unsub: [],
  _season: null,

  cur() { return this.code ? this.c[this.code] : null; },

  /* ---------- Ouverture ---------- */
  open(code) {
    if (this.code === code && this.cur() && this.cur().status === "ok") return;
    this.close();
    this.code = code;
    const meta = MyCircles.list().find(c => c.code === code);
    if (meta && meta.local) return this.openLocal(code);
    return this.openOnline(code);
  },

  gone(cc) {
    cc.status = "gone";
    MyCircles.remove(cc.code);
    Account.syncCircles();
    if (this.code === cc.code) { this.unsub.forEach(u => { try { u(); } catch (e) { } }); this.unsub = []; }
    liveRender();
  },

  close() {
    this.unsub.forEach(u => { try { u(); } catch (e) { } });
    this.unsub = [];
    this.code = null;
  },

  openLocal(code) {
    const cc = blankCircle(code, true);
    const d = Store.get("local." + code);
    if (!d) { cc.status = "missing"; this.c[code] = cc; return; }
    Object.assign(cc, d, { status: "ok" });
    for (const c of COLLS) cc[c] = cc[c] || {};
    cc.seasons = cc.seasons || {};
    cc.seasonsLoaded = true;
    this.c[code] = cc;
  },

  saveLocal(cc) {
    const d = { circle: cc.circle, seasons: cc.seasons };
    for (const c of COLLS) d[c] = cc[c];
    Store.saveSoon("local." + cc.code, d);
  },

  async openOnline(code) {
    const cc = blankCircle(code, false);
    this.c[code] = cc;
    if (!FB.ok) { cc.status = "nofb"; return; }
    if (!FB.uid) { cc.status = FB.ready ? "auth" : "loading"; return; }
    try {
      const snap = await FB.circle(code).get();
      if (this.code !== code) return;
      if (!snap.exists) { cc.status = "missing"; liveRender(); return; }
      if (snap.data().deleted) { this.gone(cc); return; }
      cc.circle = snap.data();
      // Un non-membre n'a pas le droit de lire la fiche : un refus veut dire « pas membre »
      let isMem = false;
      try { isMem = (await FB.sub(code, "members").doc(FB.uid).get()).exists; }
      catch (e) { if (!/permission/.test(e.code || "")) throw e; }
      if (this.code !== code) return;
      if (!isMem) { cc.status = "notmember"; liveRender(); return; }
    } catch (e) {
      cc.status = /permission/.test(e.code || "") ? "denied" : "offline";
      cc.err = fbErr(e);
      liveRender();
      return;
    }
    cc.status = "ok";
    this.listen(cc);
    liveRender();
  },

  listen(cc) {
    const code = cc.code;
    const onErr = e => {
      cc.status = /permission/.test(e.code || "") ? "denied" : "offline";
      cc.err = fbErr(e);
      liveRender();
    };
    const apply = (coll) => snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type === "removed") delete cc[coll][ch.doc.id];
        else cc[coll][ch.doc.id] = ch.doc.data();
      });
      queueRender();
    };
    this.unsub.push(FB.circle(code).onSnapshot(s => {
      if (!s.exists) { cc.status = "missing"; liveRender(); return; }
      if (s.data().deleted) { this.gone(cc); return; }
      cc.circle = s.data();
      MyCircles.update(code, { name: cc.circle.name, emoji: cc.circle.emoji });
      if (cc._season !== cc.circle.season) { cc._season = cc.circle.season; this.listenSeason(cc); }
      queueRender();
    }, onErr));
    this.unsub.push(FB.sub(code, "members").onSnapshot(s => {
      apply("members")(s);
      if (FB.uid && !cc.members[FB.uid] && cc.status === "ok") { cc.status = "notmember"; liveRender(); }
    }, onErr));
    for (const coll of ["flags", "reacts"]) this.unsub.push(FB.sub(code, coll).onSnapshot(apply(coll), onErr));
    this.unsub.push(FB.sub(code, "comments").orderBy("at", "desc").limit(200).onSnapshot(apply("comments"), onErr));
  },

  _seasonUnsub: [],
  listenSeason(cc) {
    this._seasonUnsub.forEach(u => u());
    this._seasonUnsub = [];
    for (const coll of ["bets", "wagers", "ledger"]) {
      cc[coll] = {};
      const u = FB.sub(cc.code, coll).where("season", "==", cc.circle.season).onSnapshot(snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type === "removed") delete cc[coll][ch.doc.id];
          else cc[coll][ch.doc.id] = ch.doc.data();
        });
        queueRender();
      }, e => { cc.err = fbErr(e); cc.status = "denied"; liveRender(); });
      this._seasonUnsub.push(u);
      this.unsub.push(u);
    }
  },

  async loadSeasons(cc = this.cur()) {
    if (!cc || cc.local || cc.seasonsLoaded) return;
    try {
      const s = await FB.sub(cc.code, "seasons").get();
      s.forEach(d => { cc.seasons[d.id] = d.data(); });
      cc.seasonsLoaded = true;
      liveRender();
    } catch (e) { cc.seasonsLoaded = true; }
  },

  /* ---------- Écritures ---------- */
  async put(coll, id, data, merge = false) {
    const cc = this.cur();
    if (!cc) return false;
    if (cc.local) {
      cc[coll] = cc[coll] || {};
      cc[coll][id] = merge ? Object.assign({}, cc[coll][id], data) : data;
      this.saveLocal(cc);
      queueRender();
      return true;
    }
    try { await FB.sub(cc.code, coll).doc(id).set(data, { merge }); return true; }
    catch (e) { toast(fbErr(e), "bad"); return false; }
  },

  async del(coll, id) {
    const cc = this.cur();
    if (!cc) return false;
    if (cc.local) { delete cc[coll][id]; this.saveLocal(cc); queueRender(); return true; }
    try { await FB.sub(cc.code, coll).doc(id).delete(); return true; }
    catch (e) { toast(fbErr(e), "bad"); return false; }
  },

  async setCircle(patch) {
    const cc = this.cur();
    if (!cc) return false;
    if (cc.local) {
      Object.assign(cc.circle, patch);
      this.saveLocal(cc);
      MyCircles.update(cc.code, { name: cc.circle.name, emoji: cc.circle.emoji });
      queueRender();
      return true;
    }
    try { await FB.circle(cc.code).set(patch, { merge: true }); return true; }
    catch (e) { toast(fbErr(e), "bad"); return false; }
  },

  async putSeason(n, data) {
    const cc = this.cur();
    cc.seasons[n] = data;
    if (cc.local) { this.saveLocal(cc); return true; }
    try { await FB.sub(cc.code, "seasons").doc(String(n)).set(data); return true; }
    catch (e) { toast(fbErr(e), "bad"); return false; }
  },

  /* ---------- Création et adhésion ---------- */
  async createLocal(name, emoji, settings) {
    const code = "LOC-" + rid(4).toUpperCase();
    const p = Profile.get();
    const circle = Object.assign({ name, emoji, owner: p.id, createdAt: now(), season: 1 }, CIRCLE_DEFAULTS, settings);
    const d = { circle, seasons: {} };
    for (const c of COLLS) d[c] = {};
    d.members[p.id] = { uid: p.id, name: p.name || "Moi", avatar: p.avatar || "", joinedAt: now() };
    Store.set("local." + code, d);
    MyCircles.add({ code, name, emoji, local: true });
    return code;
  },

  async createOnline(name, emoji, settings) {
    const p = Profile.get();
    let code;
    for (let i = 0; i < 6; i++) {
      code = newCode();
      const s = await FB.circle(code).get();
      if (!s.exists) break;
    }
    const circle = Object.assign({ name, emoji, owner: FB.uid, createdAt: now(), season: 1 }, CIRCLE_DEFAULTS, settings);
    await FB.circle(code).set(circle);
    await FB.sub(code, "members").doc(FB.uid).set({ uid: FB.uid, name: p.name || "Moi", avatar: p.avatar || "", joinedAt: now() });
    await FB.sub(code, "private").doc("owner").set({ key: rid(10).toUpperCase() });
    MyCircles.add({ code, name, emoji, local: false });
    Account.syncCircles();
    return code;
  },

  async join(code) {
    const p = Profile.get();
    const s = await FB.circle(code).get();
    if (!s.exists || s.data().deleted) throw { code: "not-found" };
    const c = s.data();
    const ref = FB.sub(code, "members").doc(FB.uid);
    let exists = false;
    try { exists = (await ref.get()).exists; }
    catch (e) { if (!/permission/.test(e.code || "")) throw e; }
    if (!exists) await ref.set({ uid: FB.uid, name: p.name || "Joueur", avatar: p.avatar || "", joinedAt: now() });
    MyCircles.add({ code, name: c.name, emoji: c.emoji, local: false });
    Account.syncCircles();
    return c;
  },
};

/* Rendu groupé : plusieurs instantanés Firestore = un seul rendu */
let _rq = false;
function queueRender() {
  if (_rq) return;
  _rq = true;
  requestAnimationFrame(() => { _rq = false; liveRender(); });
}
