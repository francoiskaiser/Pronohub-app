/* Pronohub — Firebase (facultatif) */
"use strict";

const FB = {
  ok: false,        // Firebase configuré et initialisé
  ready: false,     // première réponse d'authentification reçue
  uid: null,
  user: null,
  db: null,
  auth: null,
  error: "",
  _hooks: [],
  onAuth(fn) { this._hooks.push(fn); },

  init() {
    const cfg = window.FIREBASE_CONFIG;
    if (!window.firebase || !cfg || !cfg.apiKey) { this.ready = true; return; }
    try {
      firebase.initializeApp(cfg);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      this.ok = true;
    } catch (e) {
      this.error = String(e.message || e);
      this.ready = true;
      return;
    }
    this.auth.onAuthStateChanged(async u => {
      if (!u) {
        try { await this.auth.signInAnonymously(); }
        catch (e) { this.error = e.code || String(e); this.ready = true; liveRender(); }
        return;
      }
      this.user = u;
      this.uid = u.uid;
      this.ready = true;
      for (const f of this._hooks) { try { await f(u); } catch (e) { console.warn(e); } }
      liveRender();
    });
    // Ne jamais rester bloqué : au bout de 8 s, on affiche l'état réel
    setTimeout(() => { if (!this.ready) { this.ready = true; this.error = this.error || "timeout"; liveRender(); } }, 8000);
  },

  /* Raccourcis */
  circle(code) { return this.db.collection("circles").doc(code); },
  sub(code, coll) { return this.circle(code).collection(coll); },
  userDoc(uid = this.uid) { return this.db.collection("users").doc(uid); },

  /* Type de connexion lisible */
  provider() {
    const u = this.user;
    if (!u) return "";
    if (u.isAnonymous) return "anon";
    const p = (u.providerData || []).map(x => x.providerId);
    if (p.includes("google.com")) return "google";
    if (p.includes("password")) return "password";
    return "other";
  },
};

/* Message d'erreur Firebase compréhensible */
function fbErr(e) {
  const c = e && (e.code || "");
  if (/permission-denied/.test(c)) return "Accès refusé : vérifie que les règles Firestore sont publiées (voir FIREBASE.md).";
  if (/unavailable|network/.test(c)) return "Pas de connexion. Réessaie quand tu es en ligne.";
  if (/wrong-password|invalid-credential|invalid-login/.test(c)) return "E-mail ou mot de passe incorrect.";
  if (/user-not-found/.test(c)) return "Aucun compte avec cet e-mail.";
  if (/email-already-in-use/.test(c)) return "Cet e-mail a déjà un compte : connecte-toi plutôt.";
  if (/weak-password/.test(c)) return "Mot de passe trop court (6 caractères minimum).";
  if (/invalid-email/.test(c)) return "Adresse e-mail invalide.";
  if (/popup-blocked/.test(c)) return "Fenêtre bloquée par le navigateur : autorise les pop-ups et réessaie.";
  if (/popup-closed|cancelled-popup/.test(c)) return "Connexion annulée.";
  if (/requires-recent-login/.test(c)) return "Par sécurité, déconnecte-toi puis reconnecte-toi avant de supprimer le compte.";
  if (/operation-not-allowed/.test(c)) return "Ce mode de connexion n'est pas activé dans la console Firebase.";
  return "Erreur : " + (c || (e && e.message) || e);
}
