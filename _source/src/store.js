/* Pronohub — stockage local (localStorage) */
"use strict";

const Store = {
  ns: (window.__PH_NS || "ph") + ".",
  get(k, def = null) {
    try {
      const v = localStorage.getItem(this.ns + k);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(k, v) {
    try { localStorage.setItem(this.ns + k, JSON.stringify(v)); return true; }
    catch (e) { toast("Stockage plein ou indisponible", "bad"); return false; }
  },
  del(k) { try { localStorage.removeItem(this.ns + k); } catch (e) { } },
  keys() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(this.ns)) out.push(k.slice(this.ns.length)); } } catch (e) { }
    return out;
  },
  _pending: {},
  _timer: null,
  saveSoon(k, v) {
    this._pending[k] = v;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  },
  flush() {
    for (const [k, v] of Object.entries(this._pending)) this.set(k, v);
    this._pending = {};
  },
};
window.addEventListener("pagehide", () => Store.flush());

/* Profil de l'utilisateur sur cet appareil */
const Profile = {
  get() {
    let p = Store.get("profile");
    if (!p) { p = { id: "me_" + rid(8), name: "", avatar: "" }; Store.set("profile", p); }
    return p;
  },
  set(patch) {
    const p = Object.assign(this.get(), patch);
    Store.set("profile", p);
    return p;
  },
};

/* Liste des cercles de l'utilisateur : [{code, name, emoji, local}] */
const MyCircles = {
  list() { return Store.get("circles", []); },
  save(l) { Store.set("circles", l); },
  add(c) {
    const l = this.list().filter(x => x.code !== c.code);
    l.unshift({ code: c.code, name: c.name, emoji: c.emoji || "🎯", local: !!c.local });
    this.save(l);
  },
  update(code, patch) {
    const l = this.list();
    const x = l.find(c => c.code === code);
    if (x) { Object.assign(x, patch); this.save(l); }
  },
  remove(code) { this.save(this.list().filter(c => c.code !== code)); },
  has(code) { return this.list().some(c => c.code === code); },
};
