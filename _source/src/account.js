/* Pronohub — compte : anonyme par défaut, Google ou e-mail facultatif */
"use strict";

const Account = {
  async onAuth(u) {
    // Récupère le profil et la liste des cercles enregistrés sur le compte
    try {
      const s = await FB.userDoc().get();
      const p = Profile.get();
      if (s.exists) {
        Solo.mergeRemote(s.data().solo);
        const d = s.data();
        if (d.name && !p.name) Profile.set({ name: d.name, avatar: d.avatar || "" });
        for (const c of d.circles || []) if (!MyCircles.has(c.code)) MyCircles.add(Object.assign({}, c, { local: false }));
      }
      this.syncCircles();
      Solo._sum = ""; Solo.syncSoon();
    } catch (e) { /* hors ligne : on garde la liste locale */ }
  },

  syncCircles: debounce(async function () {
    if (!FB.ok || !FB.uid) return;
    const p = Profile.get();
    const circles = MyCircles.list().filter(c => !c.local).map(c => ({ code: c.code, name: c.name, emoji: c.emoji || "🎯" }));
    try { await FB.userDoc().set({ name: p.name || "", avatar: p.avatar || "", circles, updatedAt: now() }, { merge: true }); }
    catch (e) { }
  }, 800),

  /* Met à jour mon nom/avatar dans tous mes cercles en ligne */
  async pushProfile() {
    const p = Profile.get();
    this.syncCircles();
    if (!FB.ok || !FB.uid) return;
    for (const c of MyCircles.list().filter(c => !c.local)) {
      try { await FB.sub(c.code, "members").doc(FB.uid).set({ name: p.name, avatar: p.avatar || "" }, { merge: true }); } catch (e) { }
    }
  },

  async linkGoogle() {
    const prov = new firebase.auth.GoogleAuthProvider();
    try {
      await FB.auth.currentUser.linkWithPopup(prov);
      await FB.auth.currentUser.reload();
      FB.user = FB.auth.currentUser;
      toast("Compte Google lié : tes paris te suivent partout", "good");
    } catch (e) {
      if (e.code === "auth/credential-already-in-use" && e.credential) {
        await this.switchTo(() => FB.auth.signInWithCredential(e.credential)).catch(err => toast(fbErr(err), "bad"));
      } else toast(fbErr(e), "bad");
    }
    S.modal = null; render();
  },

  async email(mode, email, pass) {
    try {
      if (mode === "create") {
        const cred = firebase.auth.EmailAuthProvider.credential(email, pass);
        await FB.auth.currentUser.linkWithCredential(cred);
        await FB.auth.currentUser.reload();
        FB.user = FB.auth.currentUser;
        toast("Compte créé", "good");
      } else {
        await this.switchTo(() => FB.auth.signInWithEmailAndPassword(email, pass));
      }
      S.modal = null; render();
    } catch (e) {
      if (e.code === "auth/email-already-in-use" || e.code === "auth/credential-already-in-use") {
        S.modal = Object.assign({}, S.modal, { mode: "login", err: "Cet e-mail a déjà un compte : entre ton mot de passe pour te connecter." });
      } else S.modal = Object.assign({}, S.modal, { err: fbErr(e) });
      render();
    }
  },

  /* Bascule sur un compte existant en emportant ce qui appartenait à l'identité anonyme.
     Preuve : un secret stocké dans claims/{ancienUid}, lisible seulement par l'ancienne identité,
     recopié dans la fiche membre et vérifié par les règles Firestore. */
  async switchTo(signIn) {
    const old = FB.uid;
    const wasAnon = FB.user && FB.user.isAnonymous;
    const secret = rid(24);
    const circles = MyCircles.list().filter(c => !c.local);
    if (wasAnon && circles.length) {
      try { await FB.db.collection("claims").doc(old).set({ secret, at: now() }); } catch (e) { }
    }
    DB.close();
    let res;
    try { res = await signIn(); }
    catch (e) { if (S.code) DB.open(S.code); throw e; }
    if (res && res.user) { FB.user = res.user; FB.uid = res.user.uid; }
    const p = Profile.get();
    for (const c of circles) {
      try {
        const ref = FB.sub(c.code, "members").doc(FB.uid);
        const data = { uid: FB.uid, name: p.name || "Joueur", avatar: p.avatar || "" };
        const ex = await ref.get();
        if (!ex.exists) data.joinedAt = now();
        if (wasAnon && (!ex.exists || !ex.data().alias)) { data.alias = old; data.aliasKey = secret; }
        await ref.set(data, { merge: true });
      } catch (e) { }
    }
    if (wasAnon && circles.length) { try { await FB.db.collection("claims").doc(old).delete(); } catch (e) { } }
    this.syncCircles();
    toast("Connecté : tes cercles sont rattachés à ton compte", "good");
    if (S.code) DB.open(S.code);
  },

  async signOut() {
    if (!(await ask("Te déconnecter ? Sur cet appareil, tu repartiras avec une identité anonyme vierge.", "Se déconnecter"))) return;
    DB.close();
    await FB.auth.signOut();
    MyCircles.save(MyCircles.list().filter(c => c.local));
    S.code = null; S.view = "home"; S.modal = null;
    toast("Déconnecté");
    render();
  },

  async deleteAccount() {
    if (!(await ask("Supprimer ton compte ? Tu quittes tous tes cercles en ligne et ton profil est effacé. C'est définitif.", "Supprimer mon compte", true))) return;
    try {
      for (const c of MyCircles.list().filter(c => !c.local)) {
        try {
          const cs = await FB.circle(c.code).get();
          if (cs.exists && cs.data().owner === FB.uid) continue; // un cercle ne peut pas rester sans propriétaire
          await FB.sub(c.code, "members").doc(FB.uid).delete();
        } catch (e) { }
      }
      await FB.userDoc().delete();
      await FB.auth.currentUser.delete();
      for (const k of Store.keys()) if (!k.startsWith("local.") && k !== "prefs") Store.del(k);
      MyCircles.save(MyCircles.list().filter(c => c.local));
      DB.close();
      S.code = null; S.view = "home"; S.modal = null;
      toast("Compte supprimé");
    } catch (e) { toast(fbErr(e), "bad"); }
    render();
  },

  modal() {
    const m = S.modal;
    if (!FB.ok) {
      return `<h2>Compte</h2>
        <p class="muted">Les comptes et les cercles en ligne ne sont pas encore activés sur cette installation. Tes cercles « sur cet appareil » fonctionnent normalement.</p>
        <div class="row end"><button class="btn" data-a="close">Fermer</button></div>`;
    }
    const prov = FB.provider();
    if (m.mode === "email" || m.mode === "login") {
      const login = m.mode === "login";
      return `<h2>${login ? "Se connecter avec un e-mail" : "Créer un compte e-mail"}</h2>
        ${m.err ? `<p class="err">${esc(m.err)}</p>` : ""}
        <form data-f="email" data-mode="${login ? "login" : "create"}" class="stack">
          <label class="fld"><span>E-mail</span><input type="email" name="email" autocomplete="email" required value="${esc(m.email || "")}"></label>
          <label class="fld"><span>Mot de passe</span><input type="password" name="pass" minlength="6" autocomplete="${login ? "current-password" : "new-password"}" required></label>
          <div class="row end">
            <button type="button" class="btn ghost" data-a="accMode" data-mode="${login ? "email" : "login"}">${login ? "Créer un compte" : "J'ai déjà un compte"}</button>
            <button class="btn primary">${login ? "Se connecter" : "Créer le compte"}</button>
          </div>
        </form>`;
    }
    const who = prov === "anon"
      ? `<p>Tu joues avec une <b>identité anonyme</b> liée à cet appareil. Crée un compte pour retrouver tes cercles sur ton téléphone, ta tablette et ton PC.</p>`
      : `<p>Connecté avec <b>${prov === "google" ? "Google" : "un e-mail"}</b>${FB.user && FB.user.email ? ` (${esc(FB.user.email)})` : ""}. Tes cercles te suivent sur tous tes appareils.</p>`;
    return `<h2>Compte</h2>
      ${who}
      ${prov === "anon" ? `<div class="stack">
        <button class="btn primary wide" data-a="accGoogle"><span class="g">G</span> Continuer avec Google</button>
        <button class="btn wide" data-a="accMode" data-mode="email">Continuer avec un e-mail</button>
      </div>` : `<div class="stack">
        <button class="btn wide" data-a="accSignOut">Se déconnecter</button>
        <button class="btn danger wide" data-a="accDelete">Supprimer mon compte</button>
      </div>`}
      <div class="row end"><button class="btn ghost" data-a="close">Fermer</button></div>`;
  },
};

function accountAct(a, d) {
  switch (a) {
    case "account": S.modal = { k: "account" }; return true;
    case "accMode": S.modal = { k: "account", mode: d.mode }; return true;
    case "accGoogle": Account.linkGoogle(); return true;
    case "accSignOut": Account.signOut(); return true;
    case "accDelete": Account.deleteAccount(); return true;
  }
  return false;
}

function accountSubmit(f, fd) {
  if (f.dataset.f !== "email") return false;
  const email = String(fd.get("email") || "").trim(), pass = String(fd.get("pass") || "");
  S.modal.email = email;
  Account.email(f.dataset.mode, email, pass);
  return true;
}
