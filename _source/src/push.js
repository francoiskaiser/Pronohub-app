/* Pronohub — notifications : nouveaux paris dans tes cercles, résultats de tes paris.
   L'appareil s'abonne via Firebase Cloud Messaging ; l'envoi passe par un petit relais
   (Cloudflare Worker, dossier worker/) que l'app prévient après chaque pari ou résultat. */
"use strict";

// Clé publique « Web Push » de Firebase et adresse du relais (ni l'une ni l'autre n'est secrète)
const PUSH_CFG = Object.assign({ vapidKey: "", worker: "" }, window.PRONOHUB_PUSH || {});
const FCM_SDK = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js";

const Push = {
  st: null,                 // { on, key, uid, asked } : état de cet appareil
  prefs: { off: {}, mute: {} },
  busy: false,
  _q: {}, _t: null,

  load() { this.st = Object.assign({ on: false, key: "", uid: "", asked: 0 }, Store.get("push") || {}); },
  save() { Store.set("push", this.st); },

  configured() { return !!(FB.ok && PUSH_CFG.vapidKey && PUSH_CFG.worker); },
  ios() { const ua = navigator.userAgent || ""; return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); },
  supported() { return "serviceWorker" in navigator && "Notification" in window && "PushManager" in window && !!(window.crypto && crypto.subtle); },
  /* hidden | ios-install | unsupported | denied | off | on */
  state() {
    if (!this.configured()) return "hidden";
    if (!this.supported()) return this.ios() && !Install.standalone() ? "ios-install" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    return this.st.on && Notification.permission === "granted" ? "on" : "off";
  },

  async messaging() {
    if (!firebase.messaging) await loadScript(FCM_SDK);
    return firebase.messaging();
  },
  async keyOf(token) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    return "t" + [...h.slice(0, 8)].map(x => x.toString(16).padStart(2, "0")).join("");
  },
  device() {
    const ua = navigator.userAgent || "";
    return /Android/.test(ua) ? "Android" : this.ios() ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Navigateur";
  },

  /* Abonnement de cet appareil */
  async enable() {
    if (this.busy) return;
    this.busy = true; liveRender();
    try {
      if (Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted") { toast(p === "denied" ? "Notifications refusées : tu peux les autoriser dans les réglages du navigateur" : "Notifications non activées"); return; }
      }
      await this.register(true);
      this.st.on = true; this.st.asked = now(); this.save();
      toast("Notifications activées", "good");
    } catch (e) {
      console.warn("push", e);
      toast("Impossible d'activer les notifications sur cet appareil", "bad");
    } finally { this.busy = false; liveRender(); }
  },

  async register(force) {
    const reg = await navigator.serviceWorker.ready;
    const token = await (await this.messaging()).getToken({ vapidKey: PUSH_CFG.vapidKey, serviceWorkerRegistration: reg });
    if (!token) throw new Error("no-token");
    const key = await this.keyOf(token);
    if (!force && key === this.st.key && this.st.uid === FB.uid) return;
    if (this.st.key && this.st.key !== key && this.st.uid === FB.uid) await this.dropKey(this.st.key);
    await FB.userDoc().set({ push: { tokens: { [key]: { t: token, at: now(), lang: LANG, dev: this.device() } } } }, { merge: true });
    this.st.key = key; this.st.uid = FB.uid; this.save();
  },

  async dropKey(key) {
    try { await FB.userDoc().update({ [`push.tokens.${key}`]: firebase.firestore.FieldValue.delete() }); } catch (e) { }
  },

  async disable() {
    if (this.busy) return;
    this.busy = true; liveRender();
    try {
      if (this.st.key && this.st.uid === FB.uid) await this.dropKey(this.st.key);
      try { await (await this.messaging()).deleteToken(); } catch (e) { }
    } finally {
      Object.assign(this.st, { on: false, key: "", uid: "" }); this.save();
      this.busy = false; toast("Notifications désactivées sur cet appareil"); liveRender();
    }
  },

  /* À chaque connexion : relit les préférences et rafraîchit l'abonnement (le jeton peut changer) */
  async onAuth() {
    if (!this.configured()) return;
    try {
      const s = await FB.userDoc().get();
      const p = (s.exists && s.data().push) || {};
      this.prefs = { off: p.off || {}, mute: p.mute || {} };
    } catch (e) { }
    if (this.state() === "on") this.register(false).catch(e => console.warn("push", e));
  },

  async setPref(kind, on) {
    this.prefs.off[kind] = !on;
    liveRender();
    try { await FB.userDoc().set({ push: { off: { [kind]: !on } } }, { merge: true }); }
    catch (e) { toast(fbErr(e), "bad"); }
  },
  async setMute(code, muted) {
    this.prefs.mute[code] = muted;
    liveRender();
    try { await FB.userDoc().set({ push: { mute: { [code]: muted } } }, { merge: true }); }
    catch (e) { toast(fbErr(e), "bad"); }
  },

  /* Prévenir le relais après une écriture de pari dans un cercle en ligne.
     Les écritures rapprochées (import de plusieurs matchs) partent en un seul appel. */
  onBetWrite(code, id, data, merge) {
    if (!this.configured() || !data) return;
    let type = "";
    if (!merge && data.status === "open" && data.createdAt) type = "bet";
    else if (merge && (data.status === "settled" || data.status === "void")) type = "settle";
    if (!type) return;
    const k = type + "|" + code;
    (this._q[k] = this._q[k] || new Set()).add(id);
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 1500);
  },
  async flush() {
    const q = this._q; this._q = {};
    for (const [k, ids] of Object.entries(q)) {
      const [type, code] = k.split("|");
      try {
        const tok = await FB.user.getIdToken();
        await fetch(PUSH_CFG.worker, {
          method: "POST", keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
          body: JSON.stringify({ type, code, bets: [...ids].slice(0, 20) }),
        });
      } catch (e) { /* sans relais joignable, pas de notification : le jeu continue */ }
    }
  },

  /* Ouverture depuis une notification */
  open(code, bet) {
    if (!code || !MyCircles.has(code)) { if (S.view !== "home") go("home"); return; }
    if (S.code !== code) openCircle(code);
    if (bet) go("bet", { betId: bet });
    else if (S.view !== "circle" || S.tab !== "bets") { S.tab = "bets"; go("circle"); }
  },
};
Push.load();

if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "pronohub-open") Push.open(d.code, d.bet);
});

/* ---------- Écrans ---------- */

function pushPanel() {
  const st = Push.state();
  if (st === "hidden") return "";
  const sw = (k, label, sub) => `<label class="switch-row"><span class="grow"><b>${label}</b><small>${sub}</small></span>
      <input type="checkbox" class="switch" data-a="pushPref" data-k="${k}" ${Push.prefs.off[k] ? "" : "checked"}></label>`;
  let body;
  if (st === "on") body = `<p class="muted">Activées sur cet appareil.</p>
      ${sw("bet", "Nouveaux paris", "Quand quelqu'un lance un pari dans un de tes cercles.")}
      ${sw("settle", "Résultats de mes paris", "Quand un pari sur lequel tu as misé est réglé ou annulé.")}
      <p class="hint">Tu peux aussi couper un seul cercle dans « Gérer ce cercle ».</p>
      <button class="btn ghost" data-a="pushOff" ${Push.busy ? "disabled" : ""}>Désactiver sur cet appareil</button>`;
  else if (st === "off") body = `<p class="muted">Sois prévenu quand tes amis lancent un pari ou quand un de tes paris a un résultat.</p>
      <button class="btn primary" data-a="pushOn" ${Push.busy ? "disabled" : ""}>${BELL_ICON} Activer les notifications</button>`;
  else if (st === "denied") body = `<p class="muted">Les notifications sont bloquées pour Pronohub sur cet appareil. Autorise-les dans les réglages du navigateur (le cadenas à gauche de l'adresse, puis Notifications) ou du téléphone, puis reviens ici.</p>`;
  else if (st === "ios-install") body = `<p class="muted">Sur iPhone, les notifications marchent seulement quand Pronohub est installée : Partager, puis « Sur l'écran d'accueil ». Ouvre ensuite l'app depuis son icône et active-les ici.</p>
      <button class="btn" data-a="install">Installer Pronohub</button>`;
  else body = `<p class="muted">Ce navigateur ne gère pas les notifications. Essaie avec Chrome, Edge, Firefox ou Safari à jour.</p>`;
  return `<div class="panel"><h3>Notifications</h3>${body}</div>`;
}

/* Proposition sur l'accueil, une seule fois, dès qu'on a un cercle en ligne */
function pushHomeCard() {
  if (Push.state() !== "off" || Push.st.asked) return "";
  if (!MyCircles.list().some(c => !c.local)) return "";
  return `<div class="install push-card">
    <span class="install-icon bell" aria-hidden="true">${BELL_ICON}</span>
    <span class="grow"><b>Ne rate aucun pari</b>
      <small>Reçois une notification quand tes amis lancent un pari ou quand un de tes paris a un résultat.</small></span>
    <span class="install-acts">
      <button class="btn primary small" data-a="pushOn" ${Push.busy ? "disabled" : ""}>Activer</button>
      <button class="icon-btn tiny" data-a="pushLater" aria-label="Plus tard">${ICON.x}</button>
    </span>
  </div>`;
}

/* Interrupteur « ce cercle » dans la fenêtre Gérer ce cercle */
function pushCircleRow(cc) {
  if (cc.local || Push.state() !== "on") return "";
  return `<h3>Notifications</h3>
    <label class="switch-row"><span class="grow"><b>Notifications de ce cercle</b><small>Nouveaux paris et résultats de ce cercle.</small></span>
    <input type="checkbox" class="switch" data-a="pushMute" data-code="${esc(cc.code)}" ${Push.prefs.mute[cc.code] ? "" : "checked"}></label>`;
}

function pushAct(a, d) {
  switch (a) {
    case "pushOn": Push.enable(); return true;
    case "pushOff": Push.disable(); return true;
    case "pushLater": Push.st.asked = now(); Push.save(); return true;
    case "pushPref": Push.setPref(d.k, !!$(`[data-a=pushPref][data-k=${d.k}]`).checked); return "keep";
    case "pushMute": Push.setMute(d.code, !$(`[data-a=pushMute]`).checked); return "keep";
  }
  return false;
}

const BELL_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
