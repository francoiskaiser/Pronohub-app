/* Faux Firebase « compat » pour les tests : authentification et Firestore en mémoire,
   partagés entre les onglets d'un même contexte de navigateur via localStorage. */
(function () {
  const KEY = "__mockdb", UKEY = "__mockusers";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const users = () => JSON.parse(localStorage.getItem(UKEY) || "{}");
  const saveUsers = u => localStorage.setItem(UKEY, JSON.stringify(u));
  const DEL = { __del: 1 };
  const rnd = () => Math.random().toString(36).slice(2, 12);
  const err = (code) => { const e = new Error(code); e.code = code; return e; };

  /* ---------- Firestore ---------- */
  const listeners = [];
  function notify() { setTimeout(() => listeners.slice().forEach(l => l.run()), 0); }
  window.addEventListener("storage", e => { if (e.key === KEY) notify(); });

  function docsOf(coll, q) {
    const d = load(), out = [];
    for (const [p, v] of Object.entries(d)) {
      if (!p.startsWith(coll + "/")) continue;
      const id = p.slice(coll.length + 1);
      if (id.includes("/")) continue;
      if (q.where.every(([f, , val]) => v[f] === val)) out.push({ id, data: v });
    }
    if (q.order) out.sort((a, b) => ((a.data[q.order[0]] > b.data[q.order[0]]) ? 1 : -1) * (q.order[1] === "desc" ? -1 : 1));
    return q.lim ? out.slice(0, q.lim) : out;
  }
  const snapDoc = (id, data) => ({ id, exists: data !== undefined, data: () => data && JSON.parse(JSON.stringify(data)) });

  function querySnap(list, prev) {
    const changes = [], now = new Map();
    for (const x of list) {
      const j = JSON.stringify(x.data);
      now.set(x.id, j);
      if (!prev.has(x.id)) changes.push({ type: "added", doc: snapDoc(x.id, x.data) });
      else if (prev.get(x.id) !== j) changes.push({ type: "modified", doc: snapDoc(x.id, x.data) });
    }
    for (const [id] of prev) if (!now.has(id)) changes.push({ type: "removed", doc: snapDoc(id, undefined) });
    const docs = list.map(x => snapDoc(x.id, x.data));
    return { snap: { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f), docChanges: () => changes }, now, changed: changes.length > 0 };
  }

  class Query {
    constructor(path, q) { this.path = path; this.q = q || { where: [], order: null, lim: 0 }; }
    where(f, op, v) { return new Query(this.path, Object.assign({}, this.q, { where: this.q.where.concat([[f, op, v]]) })); }
    orderBy(f, dir = "asc") { return new Query(this.path, Object.assign({}, this.q, { order: [f, dir] })); }
    limit(n) { return new Query(this.path, Object.assign({}, this.q, { lim: n })); }
    async get() { return querySnap(docsOf(this.path, this.q), new Map()).snap; }
    onSnapshot(cb) {
      let prev = new Map(), first = true;
      const l = { run: () => { const r = querySnap(docsOf(this.path, this.q), prev); prev = r.now; if (r.changed || first) { first = false; cb(r.snap); } } };
      listeners.push(l); setTimeout(l.run, 0);
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    }
  }
  class Coll extends Query {
    doc(id) { return new Doc(this.path + "/" + (id || rnd())); }
    async add(data) { const d = this.doc(); await d.set(data); return d; }
  }
  class Doc {
    constructor(path) { this.path = path; this.id = path.split("/").pop(); }
    collection(n) { return new Coll(this.path + "/" + n); }
    async get() {
      // Comme les vraies règles : seuls les membres d'un cercle lisent ses fiches membres
      const mm = this.path.match(/^circles\/([^/]+)\/members\/[^/]+$/);
      if (mm && !load()[`circles/${mm[1]}/members/${auth.currentUser && auth.currentUser.uid}`]) throw err("permission-denied");
      return snapDoc(this.id, load()[this.path]);
    }
    async set(data, opt) {
      if (window.__mockOffline) throw err("unavailable");
      const d = load();
      const base = opt && opt.merge ? Object.assign({}, d[this.path] || {}) : {};
      for (const [k, v] of Object.entries(data)) { if (v && v.__del) delete base[k]; else base[k] = v; }
      d[this.path] = JSON.parse(JSON.stringify(base));
      save(d); notify();
    }
    async update(data) { if (!load()[this.path]) throw err("not-found"); return this.set(data, { merge: true }); }
    async delete() { const d = load(); delete d[this.path]; save(d); notify(); }
    onSnapshot(cb) {
      let prev = null, first = true;
      const l = { run: () => { const v = load()[this.path]; const j = JSON.stringify(v); if (j !== prev || first) { first = false; prev = j; cb(snapDoc(this.id, v)); } } };
      listeners.push(l); setTimeout(l.run, 0);
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    }
  }
  const db = { collection: p => new Coll(p) };

  /* ---------- Authentification ---------- */
  const authCbs = [];
  let current = null;
  function mkUser(rec) {
    return {
      uid: rec.uid, isAnonymous: !rec.email, email: rec.email || null,
      providerData: rec.email ? [{ providerId: rec.provider || "password" }] : [],
      async linkWithPopup() {
        const email = window.__mockGoogleEmail || "google-user@example.test";
        const us = users();
        if (us[email]) { const e = err("auth/credential-already-in-use"); e.credential = { email, provider: "google.com" }; throw e; }
        us[email] = { uid: this.uid, pass: null, provider: "google.com" }; saveUsers(us);
        Object.assign(this, { isAnonymous: false, email, providerData: [{ providerId: "google.com" }] });
        return { user: this };
      },
      async linkWithCredential(c) {
        const us = users();
        if (us[c.email]) throw err("auth/email-already-in-use");
        if ((c.pass || "").length < 6) throw err("auth/weak-password");
        us[c.email] = { uid: this.uid, pass: c.pass, provider: "password" }; saveUsers(us);
        Object.assign(this, { isAnonymous: false, email: c.email, providerData: [{ providerId: "password" }] });
        return { user: this };
      },
      async reload() { },
      async delete() { const us = users(); for (const [k, v] of Object.entries(us)) if (v.uid === this.uid) delete us[k]; saveUsers(us); setUser(null); },
    };
  }
  function setUser(u) {
    current = u;
    try { if (u) sessionStorage.setItem("__mockauth", JSON.stringify({ uid: u.uid, email: u.email, provider: u.providerData[0] && u.providerData[0].providerId })); else sessionStorage.removeItem("__mockauth"); } catch (e) { }
    auth.currentUser = u;
    setTimeout(() => authCbs.forEach(cb => cb(u)), 0);
  }
  const auth = {
    currentUser: null,
    onAuthStateChanged(cb) {
      authCbs.push(cb);
      const s = sessionStorage.getItem("__mockauth");
      if (s && !current) { const r = JSON.parse(s); current = mkUser(r); auth.currentUser = current; }
      setTimeout(() => cb(current), 10);
    },
    async signInAnonymously() { const u = mkUser({ uid: "anon_" + rnd() }); setUser(u); return { user: u }; },
    async signInWithEmailAndPassword(email, pass) {
      const r = users()[email];
      if (!r) throw err("auth/user-not-found");
      if (r.pass !== pass) throw err("auth/wrong-password");
      const u = mkUser({ uid: r.uid, email, provider: "password" }); setUser(u); return { user: u };
    },
    async signInWithCredential(c) {
      const r = users()[c.email];
      const u = mkUser({ uid: r.uid, email: c.email, provider: c.provider }); setUser(u); return { user: u };
    },
    async signOut() { setUser(null); },
  };

  window.firebase = {
    initializeApp() { return {}; },
    auth: Object.assign(() => auth, {
      GoogleAuthProvider: function () { },
      EmailAuthProvider: { credential: (email, pass) => ({ email, pass, provider: "password" }) },
    }),
    firestore: Object.assign(() => db, { FieldValue: { delete: () => DEL, serverTimestamp: () => Date.now() } }),
  };
})();
