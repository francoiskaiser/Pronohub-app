/* Pronohub — amis (hors cercle), liens d'invitation, invitations dans un cercle et duels face-à-face.

   Un ami = une fiche friends/{uidA_uidB} visible des deux seulement.
   Un face-à-face = un petit cercle privé à deux (circle.duo), avec 1 000 jetons chacun au départ :
   chaque rivalité a son propre compteur, sans toucher aux soldes des cercles ni du solo. */
"use strict";

const Friends = {
  all: {},        // id de la paire -> fiche
  inbox: {},      // invitations reçues dans un cercle
  loaded: false,
  _u: [],
  _joining: {},

  pair(a, b) { return a < b ? a + "_" + b : b + "_" + a; },
  other(f) { return f.users[0] === FB.uid ? f.users[1] : f.users[0]; },
  nameOf(f, uid = this.other(f)) { return (f.names || {})[uid] || "Ami"; },
  avOf(f, uid = this.other(f)) { return (f.avatars || {})[uid] || ""; },
  person(f) { const uid = this.other(f); return { uid, name: this.nameOf(f, uid), avatar: this.avOf(f, uid) }; },
  list() { return Object.entries(this.all).map(([id, f]) => Object.assign({ id }, f)); },
  ok() { return this.list().filter(f => f.status === "ok").sort((a, b) => this.nameOf(a).localeCompare(this.nameOf(b))); },
  incoming() { return this.list().filter(f => f.status === "pending" && f.from !== FB.uid); },
  outgoing() { return this.list().filter(f => f.status === "pending" && f.from === FB.uid); },
  byUid(uid) { return FB.uid && uid ? this.all[this.pair(FB.uid, uid)] : null; },
  stateOf(uid) {
    const f = this.byUid(uid);
    if (!f) return "none";
    if (f.status === "ok") return "friend";
    return f.from === FB.uid ? "sent" : "received";
  },
  me() { const p = Profile.get(); return { name: p.name || "Joueur", avatar: p.avatar || "" }; },

  /* ---------- Écoute ---------- */
  listen() {
    this._u.forEach(u => { try { u(); } catch (e) { } });
    this._u = [];
    this.all = {}; this.inbox = {}; this.loaded = false;
    if (!FB.ok || !FB.uid) return;
    this._u.push(FB.db.collection("friends").where("users", "array-contains", FB.uid).onSnapshot(s => {
      s.docChanges().forEach(ch => { if (ch.type === "removed") delete this.all[ch.doc.id]; else this.all[ch.doc.id] = ch.doc.data(); });
      this.loaded = true;
      this.refreshNames();
      this.ensureDuos();
      queueRender();
    }, e => { this.loaded = true; console.warn("amis", e); }));
    this._u.push(FB.userDoc().collection("inbox").onSnapshot(s => {
      s.docChanges().forEach(ch => { if (ch.type === "removed") delete this.inbox[ch.doc.id]; else this.inbox[ch.doc.id] = ch.doc.data(); });
      queueRender();
    }, e => console.warn("invitations", e)));
  },

  /* Mon nom et mon avatar à jour sur les fiches d'amis */
  refreshNames() {
    const me = this.me();
    for (const f of this.list()) {
      if ((f.names || {})[FB.uid] === me.name && (f.avatars || {})[FB.uid] === me.avatar) continue;
      FB.db.collection("friends").doc(f.id).set({ names: { [FB.uid]: me.name }, avatars: { [FB.uid]: me.avatar } }, { merge: true }).catch(() => { });
    }
  },

  /* Les face-à-face ouverts par un ami apparaissent automatiquement chez moi */
  async ensureDuos() {
    for (const f of this.ok()) {
      const p = this.person(f);
      if (!f.duo) continue;
      if (MyCircles.has(f.duo)) {
        const meta = MyCircles.list().find(c => c.code === f.duo);
        if (meta.friendName !== p.name || meta.friendAvatar !== p.avatar || !meta.duo) MyCircles.update(f.duo, { duo: true, friend: p.uid, friendName: p.name, friendAvatar: p.avatar });
        continue;
      }
      if (this._joining[f.duo]) continue;
      this._joining[f.duo] = 1;
      try {
        await DB.join(f.duo, { silent: true });
        MyCircles.update(f.duo, { duo: true, friend: p.uid, friendName: p.name, friendAvatar: p.avatar });
        Account.syncCircles();
        queueRender();
      } catch (e) { console.warn("duel", e); }
    }
  },

  /* ---------- Lien personnel (WhatsApp, e-mail…) ---------- */
  base() { return location.origin + location.pathname; },
  async myLink() {
    let key = Store.get("fkey");
    if (!key) { key = rid(10); Store.set("fkey", key); }
    const me = this.me();
    await FB.db.collection("invites").doc(key).set({ uid: FB.uid, name: me.name, avatar: me.avatar, at: now() });
    return this.base() + "?ami=" + key;
  },

  /* ---------- Demandes ---------- */
  async request(p) {
    if (!FB.uid || !p.uid || p.uid === FB.uid) return;
    const cur = this.byUid(p.uid);
    if (cur && cur.status === "pending" && cur.from !== FB.uid) return this.accept(Object.assign({ id: this.pair(FB.uid, p.uid) }, cur));
    if (cur) return;
    const me = this.me(), users = [FB.uid, p.uid].sort();
    try {
      await FB.db.collection("friends").doc(users.join("_")).set({
        users, from: FB.uid, status: "pending", at: now(),
        names: { [FB.uid]: me.name, [p.uid]: p.name || "" }, avatars: { [FB.uid]: me.avatar, [p.uid]: p.avatar || "" },
      });
      Push.event("friend", { to: p.uid });
      toast(`Demande envoyée à ${p.name}`, "good");
    } catch (e) { toast(fbErr(e), "bad"); }
  },
  async accept(f) {
    const me = this.me();
    try {
      await FB.db.collection("friends").doc(f.id).set({ status: "ok", at: now(), names: { [FB.uid]: me.name }, avatars: { [FB.uid]: me.avatar } }, { merge: true });
      Push.event("friend", { to: this.other(f) });
      toast(`${this.nameOf(f)} fait maintenant partie de tes amis`, "good");
    } catch (e) { toast(fbErr(e), "bad"); }
  },
  async remove(f, msg) {
    try { await FB.db.collection("friends").doc(f.id).delete(); if (msg) toast(msg); }
    catch (e) { toast(fbErr(e), "bad"); }
  },

  /* ---------- Ouverture d'un lien ?ami=… ---------- */
  async openLink(key) {
    try {
      const s = await FB.db.collection("invites").doc(key).get();
      if (!s.exists) { toast("Ce lien d'invitation n'est plus valable", "bad"); return; }
      const inv = s.data();
      if (inv.uid === FB.uid) {
        if (inv.duo && MyCircles.has(inv.duo)) { openCircle(inv.duo); if (inv.bet) go("bet", { betId: inv.bet }); }
        else toast("C'est ton propre lien : envoie-le à tes amis");
        return;
      }
      S.modal = { k: "friendLink", key, inv };
      render();
    } catch (e) { toast(fbErr(e), "bad"); }
  },
  async acceptLink(key, inv, takeDuel) {
    const me = this.me(), users = [FB.uid, inv.uid].sort(), id = users.join("_");
    const cur = this.all[id];
    try {
      if (!cur || cur.status !== "ok") {
        const base = { status: "ok", via: key, at: now(), names: { [FB.uid]: me.name, [inv.uid]: inv.name || "" }, avatars: { [FB.uid]: me.avatar, [inv.uid]: inv.avatar || "" } };
        await FB.db.collection("friends").doc(id).set(cur ? base : Object.assign({ users, from: FB.uid }, base), cur ? { merge: true } : undefined);
        this.all[id] = Object.assign({ users, from: cur ? cur.from : FB.uid }, cur || {}, base);
        Push.event("friend", { to: inv.uid });
      }
      if (takeDuel && inv.duo) {
        await DB.join(inv.duo, { silent: true });
        MyCircles.update(inv.duo, { duo: true, friend: inv.uid, friendName: inv.name || "", friendAvatar: inv.avatar || "" });
        await FB.db.collection("friends").doc(id).set({ duo: inv.duo }, { merge: true }).catch(() => { });
        Account.syncCircles();
        S.modal = null;
        openCircle(inv.duo);
        if (inv.bet) go("bet", { betId: inv.bet });
        return;
      }
      S.modal = null;
      toast(`${inv.name} fait maintenant partie de tes amis`, "good");
      go("home");
    } catch (e) { toast(fbErr(e), "bad"); }
  },

  /* ---------- Face-à-face ---------- */
  duoMeta(uid) { return MyCircles.list().find(c => c.duo && c.friend === uid); },
  async duoFor(f) {
    const p = this.person(f);
    const known = f.duo || (this.duoMeta(p.uid) || {}).code;
    if (known) {
      if (!MyCircles.has(known)) { await DB.join(known, { silent: true }); }
      MyCircles.update(known, { duo: true, friend: p.uid, friendName: p.name, friendAvatar: p.avatar });
      if (!f.duo) FB.db.collection("friends").doc(f.id).set({ duo: known }, { merge: true }).catch(() => { });
      return known;
    }
    const code = await this.createDuo(p.uid, `${this.me().name} vs ${p.name}`);
    MyCircles.update(code, { friend: p.uid, friendName: p.name, friendAvatar: p.avatar });
    await FB.db.collection("friends").doc(f.id).set({ duo: code }, { merge: true });
    return code;
  },
  async createDuo(guest, name) {
    let code;
    for (let i = 0; i < 6; i++) { code = newCode(); if (!(await FB.circle(code).get()).exists) break; }
    const me = this.me();
    const circle = Object.assign({}, CIRCLE_DEFAULTS, { name: name.slice(0, 32), emoji: "🤝", owner: FB.uid, createdAt: now(), season: 1, duo: true, guest, daily: 0 });
    await FB.circle(code).set(circle);
    await FB.sub(code, "members").doc(FB.uid).set({ uid: FB.uid, name: me.name, avatar: me.avatar, joinedAt: now() });
    await FB.sub(code, "private").doc("owner").set({ key: rid(10).toUpperCase() });
    MyCircles.add({ code, name: circle.name, emoji: "🤝", local: false, duo: true, friend: guest });
    Account.syncCircles();
    return code;
  },
  async challenge(f) {
    try {
      const code = await this.duoFor(f);
      openCircle(code);
      // La fenêtre de défi a besoin du cercle chargé
      for (let i = 0; i < 60 && !(DB.cur() && DB.cur().code === code && DB.cur().status === "ok"); i++) await new Promise(r => setTimeout(r, 100));
      if (S.code !== code) return;
      S.modal = { k: "newBet", kind: "duel", draft: { closesAt: defaultClose(), cat: "potes", opts: ["", ""], stake: 100 } };
      render();
    } catch (e) { toast(fbErr(e), "bad"); }
  },
  /* Défi envoyé par lien à quelqu'un qui n'a pas encore l'app */
  async challengeByLink(title, stake, closesAt) {
    const code = await this.createDuo("", `Défi de ${this.me().name}`);
    const id = rid(14);
    const bet = { kind: "duel", cat: "potes", closesAt, createdBy: FB.uid, createdAt: now(), season: 1, status: "open", seed: 0, bonus: 0, title, desc: "",
      duel: { to: "", stake }, options: [{ id: "y", label: this.me().name + " a raison" }, { id: "n", label: "L'adversaire a raison" }] };
    await FB.sub(code, "bets").doc(id).set(bet);
    await FB.sub(code, "wagers").doc(`${id}_${FB.uid}`).set({ bet: id, uid: FB.uid, opt: "y", amt: stake, season: 1, at: now() });
    Deadlines.sync(code, id, bet, false);
    const key = rid(10), me = this.me();
    await FB.db.collection("invites").doc(key).set({ uid: FB.uid, name: me.name, avatar: me.avatar, at: now(), duo: code, bet: id, title, stake, closesAt });
    MyCircles.update(code, { linkTitle: title });
    return { url: this.base() + "?ami=" + key, code, id };
  },
  /* Chez le créateur d'un défi par lien : dès que l'adversaire arrive, on fixe le duel à deux */
  _fixed: {},
  fixDuo(cc) {
    if (!cc || cc.local || !cc.circle || !cc.circle.duo || cc.circle.owner !== FB.uid) return;
    const foe = Object.values(cc.members).find(m => m.uid !== FB.uid);
    if (!foe) return;
    if (!cc.circle.guest && !this._fixed[cc.code]) {
      this._fixed[cc.code] = 1;
      DB.setCircle({ guest: foe.uid, name: `${this.me().name} vs ${foe.name}`.slice(0, 32) });
      MyCircles.update(cc.code, { friend: foe.uid, friendName: foe.name, friendAvatar: foe.avatar || "", linkTitle: null });
    }
    // Les défis lancés par lien désignent maintenant l'adversaire
    for (const [id, b] of Object.entries(cc.bets)) {
      if (b.kind !== "duel" || !b.duel || b.duel.to !== "" || b.createdBy !== FB.uid || this._fixed[id]) continue;
      this._fixed[id] = 1;
      DB.put("bets", id, { duel: { to: foe.uid, stake: b.duel.stake }, options: [b.options[0], { id: "n", label: foe.name + " a raison" }] }, true);
    }
  },

  /* ---------- Invitations dans un cercle ---------- */
  async invite(cc, uids) {
    const me = this.me(), c = cc.circle;
    let n = 0;
    for (const uid of uids) {
      try {
        await FB.userDoc(uid).collection("inbox").doc(`${cc.code}_${FB.uid}`).set({ type: "circle", code: cc.code, name: c.name, emoji: c.emoji || "🎯", from: FB.uid, fromName: me.name, fromAvatar: me.avatar, at: now() });
        n++;
      } catch (e) { toast(fbErr(e), "bad"); }
    }
    if (n) { Push.event("invite", { code: cc.code, to: uids }); toast(n > 1 ? `${n} invitations envoyées` : "Invitation envoyée", "good"); }
  },
  async dropInvite(id) { try { await FB.userDoc().collection("inbox").doc(id).delete(); } catch (e) { } delete this.inbox[id]; },
};

/* Échéances des paris, pour les rappels envoyés par le relais */
const Deadlines = {
  ref(code, id) { return FB.db.collection("deadlines").doc(`${code}_${id}`); },
  sync(code, id, data, merge) {
    if (!FB.ok || !FB.uid || !data) return;
    let p;
    if (!merge && data.status === "open" && data.closesAt) p = this.ref(code, id).set({ code, bet: id, closesAt: data.closesAt, createdBy: data.createdBy || FB.uid, at: now(), src: !!data.src });
    else if (merge && (data.status === "settled" || data.status === "void")) p = this.ref(code, id).delete();
    else if (merge && data.closesAt) p = this.ref(code, id).set({ closesAt: data.closesAt }, { merge: true });
    if (p) p.catch(() => { });
  },
  drop(code, id) { if (FB.ok && FB.uid) this.ref(code, id).delete().catch(() => { }); },
};

/* ---------- Partage d'un lien ---------- */
function shareButtons(text, url, subject) {
  const wa = "https://wa.me/?text=" + encodeURIComponent(text + " " + url);
  const mail = "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text + "\n\n" + url);
  return `<div class="share-row">
    <a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON} WhatsApp</a>
    <a class="btn" href="${esc(mail)}">${MAIL_ICON} E-mail</a>
    ${navigator.share ? `<button class="btn" data-a="share" data-url="${esc(url)}" data-text="${esc(text)}">${SHARE_ICON} Autre</button>` : ""}
    <button class="btn ghost" data-a="copy" data-text="${esc(url)}">Copier le lien</button>
  </div>`;
}

/* ---------- Accueil : section « Mes amis » ---------- */
function friendsSection() {
  if (!FB.ok) return "";
  const inv = Object.entries(Friends.inbox).filter(([, x]) => !MyCircles.has(x.code));
  const inc = Friends.incoming(), out = Friends.outgoing(), ok = Friends.ok();
  const links = MyCircles.list().filter(c => c.duo && !c.friend);
  const row = (p, right, sub = "") => `<li class="friend-row">${avatar(p)}<span class="grow"><b>${esc(p.name)}</b>${sub ? `<small>${sub}</small>` : ""}</span><span class="fr-acts">${right}</span></li>`;
  const score = f => {
    const meta = Friends.duoMeta(Friends.other(f)) || (f.duo && MyCircles.list().find(c => c.code === f.duo));
    const s = meta && meta.snap;
    if (!s || !s.faces) return "";
    const foe = s.faces.find(x => x.uid !== FB.uid);
    return foe && foe.bal != null ? `Face-à-face : toi ${nf(s.bal)}, ${esc(Friends.nameOf(f))} ${nf(foe.bal)}` : "";
  };
  const items = [
    ...inv.map(([id, x]) => row({ uid: x.from, name: x.fromName, avatar: x.fromAvatar }, `<button class="btn small primary" data-a="inboxJoin" data-id="${esc(id)}">Rejoindre</button><button class="icon-btn tiny" data-a="inboxDrop" data-id="${esc(id)}" aria-label="Ignorer">${ICON.x}</button>`, `t'invite dans ${esc(x.emoji || "🎯")} ${esc(x.name)}`)),
    ...inc.map(f => row(Friends.person(f), `<button class="btn small primary" data-a="friendAccept" data-id="${esc(f.id)}">Accepter</button><button class="icon-btn tiny" data-a="friendDecline" data-id="${esc(f.id)}" aria-label="Refuser">${ICON.x}</button>`, "veut t'ajouter en ami")),
    ...ok.map(f => row(Friends.person(f), `<button class="btn small" data-a="challenge" data-id="${esc(f.id)}">🤝 Défier</button>`, score(f))),
    ...links.map(c => row({ uid: c.code, name: c.linkTitle || c.name, avatar: "🤝" }, `<button class="btn small ghost" data-a="openCircle" data-code="${esc(c.code)}">Voir</button>`, "Défi envoyé par lien, en attente")),
    ...out.map(f => row(Friends.person(f), `<button class="btn small ghost" data-a="friendCancel" data-id="${esc(f.id)}">Annuler</button>`, "demande envoyée")),
  ];
  return `<div class="sec-head"><h2>Mes amis</h2><button class="btn small ghost" data-a="addFriend">${ICON.plus} Ajouter</button></div>
    ${items.length ? `<ul class="friend-list">${items.join("")}</ul>` : `<div class="empty-friends"><p class="muted">Ajoute tes amis pour les défier en duel, même sans cercle commun. Chaque face-à-face démarre à 1 000 jetons chacun.</p></div>`}
    <div class="row wrap"><button class="btn" data-a="linkDuel">🤝 Défier quelqu'un par lien</button></div>`;
}

/* ---------- Fenêtres ---------- */
function friendsModal(cc) {
  const m = S.modal;
  if (m.k === "addFriend") {
    const sugg = friendSuggestions(cc);
    return `<h2>Ajouter un ami</h2>
      <p class="muted">Envoie ton lien : ton ami t'ajoute en un toucher, même s'il n'a pas encore Pronohub.</p>
      ${m.url ? shareButtons(`${Friends.me().name} t'invite sur Pronohub, pour se lancer des défis entre amis (jetons fictifs) :`, m.url, "Rejoins-moi sur Pronohub") : `<p class="muted">Préparation du lien…</p>`}
      ${sugg.length ? `<h3>Dans tes cercles</h3><ul class="friend-list">${sugg.map(p => `<li class="friend-row">${avatar(p)}<span class="grow"><b>${esc(p.name)}</b><small>${esc(p.circle)}</small></span><span class="fr-acts"><button class="btn small" data-a="friendAdd" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" data-avatar="${esc(p.avatar || "")}">Ajouter</button></span></li>`).join("")}</ul>` : ""}
      <div class="row end"><button class="btn ghost" data-a="close">Fermer</button></div>`;
  }
  if (m.k === "friendLink") {
    const inv = m.inv;
    const st = Friends.stateOf(inv.uid);
    if (inv.duo) return `<h2>🤝 ${esc(inv.name)} te défie</h2>
      <div class="panel duel"><p class="big-q">${esc(quote(inv.title || ""))}</p>
      <p>${nf(inv.stake || 0)} jetons chacun, le gagnant rafle ${nf((inv.stake || 0) * 2)}. Réponse avant le ${esc(fmtDate(inv.closesAt || now()))}.</p></div>
      <p class="muted">Vous jouez en face-à-face, avec 1 000 jetons chacun au départ. ${esc(inv.name)} sera ajouté à tes amis.</p>
      <div class="row end"><button class="btn ghost" data-a="close">Plus tard</button><button class="btn primary" data-a="linkAccept" data-duel="1">Voir le défi</button></div>`;
    return `<h2>${avatar({ uid: inv.uid, name: inv.name, avatar: inv.avatar }, "")} ${esc(inv.name)}</h2>
      <p class="muted">${st === "friend" ? `${esc(inv.name)} fait déjà partie de tes amis.` : `${esc(inv.name)} t'invite à devenir amis sur Pronohub : vous pourrez vous lancer des défis en face-à-face et vous inviter dans vos cercles.`}</p>
      <div class="row end"><button class="btn ghost" data-a="close">${st === "friend" ? "Fermer" : "Plus tard"}</button>${st === "friend" ? "" : `<button class="btn primary" data-a="linkAccept">Ajouter ${esc(inv.name)}</button>`}</div>`;
  }
  if (m.k === "linkDuel") {
    if (m.url) return `<h2>🤝 Défi prêt</h2>
      <p class="muted">Envoie-le : ton adversaire ouvre le lien, choisit son pseudo et relève le défi. Vous jouez en face-à-face avec 1 000 jetons chacun.</p>
      ${shareButtons(`${Friends.me().name} te défie sur Pronohub : ${quote(m.title)}, ${nf(m.stake)} jetons chacun. Tu relèves ?`, m.url, `${Friends.me().name} te défie sur Pronohub`)}
      <div class="row end"><button class="btn ghost" data-a="close">Fermer</button></div>`;
    const ok = Friends.ok();
    return `<h2>🤝 Lancer un défi</h2>
      ${ok.length ? `<p class="muted">À un ami :</p><div class="chips">${ok.map(f => `<button class="chip" data-a="challenge" data-id="${esc(f.id)}">${avatar(Friends.person(f), "sm")} ${esc(Friends.nameOf(f))}</button>`).join("")}</div>
      <h3>Ou par lien, à quelqu'un qui n'a pas encore l'app</h3>` : `<p class="muted">Ton adversaire n'a pas encore Pronohub ? Prépare le défi, puis envoie-le par WhatsApp ou e-mail.</p>`}
      <form data-f="linkDuel" class="stack">
        <label class="fld"><span>Je parie que…</span><input name="title" maxlength="120" required placeholder="Ex. je cours 10 km en moins de 50 minutes"></label>
        <div class="grid2">
          <label class="fld"><span>Mise de chacun</span><input name="stake" type="number" inputmode="numeric" min="1" max="1000" required value="100"></label>
          <label class="fld"><span>Réponse avant le</span><input type="datetime-local" name="closesAt" required value="${esc(defaultClose())}"></label>
        </div>
        <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary" ${m.busy ? "disabled" : ""}>Créer le lien</button></div>
      </form>`;
  }
  return "";
}

/* Joueurs croisés dans mes cercles qui ne sont pas encore mes amis */
function friendSuggestions(cc) {
  const seen = {}, out = [];
  const addP = (p, circle) => {
    if (!p || !p.uid || p.uid === FB.uid || seen[p.uid] || Friends.byUid(p.uid) || /^p_|^me_/.test(p.uid)) return;
    seen[p.uid] = 1; out.push({ uid: p.uid, name: p.name, avatar: p.avatar || "", circle });
  };
  if (cc && !cc.local && cc.circle && !cc.circle.duo) for (const m of visibleMembers(cc)) addP(m, cc.circle.name);
  for (const c of MyCircles.list()) if (!c.local && !c.duo && c.snap && c.snap.faces) for (const f of c.snap.faces) addP(f, c.name);
  return out.slice(0, 12);
}

/* Liste « Inviter des amis » dans un cercle */
function inviteFriendsBlock(cc) {
  if (!FB.ok || cc.local) return "";
  const list = Friends.ok().filter(f => !cc.members[Friends.other(f)]);
  if (!list.length) return "";
  return `<h3>Tes amis</h3>
    <form data-f="inviteFriends" class="stack">
      <div class="pick-list">${list.map(f => { const p = Friends.person(f); return `<label class="pick">${avatar(p, "sm")}<span class="grow">${esc(p.name)}</span><input type="checkbox" name="uid" value="${esc(p.uid)}"></label>`; }).join("")}</div>
      <button class="btn primary">Envoyer l'invitation</button>
    </form>`;
}

/* Bouton « ajouter en ami » sur la fiche d'un joueur */
function friendButton(uid, name, av) {
  if (!FB.ok || !FB.uid || !uid || uid === FB.uid || /^p_|^me_/.test(uid)) return "";
  const st = Friends.stateOf(uid);
  if (st === "friend") return `<button class="btn small" data-a="challenge" data-id="${esc(Friends.pair(FB.uid, uid))}">🤝 Défier</button>`;
  if (st === "sent") return `<span class="tag">Demande envoyée</span>`;
  if (st === "received") return `<button class="btn small primary" data-a="friendAccept" data-id="${esc(Friends.pair(FB.uid, uid))}">Accepter en ami</button>`;
  return `<button class="btn small" data-a="friendAdd" data-uid="${esc(uid)}" data-name="${esc(name)}" data-avatar="${esc(av || "")}">${ICON.plus} Ajouter en ami</button>`;
}

function friendsAct(a, d) {
  const f = d.id && Friends.all[d.id] ? Object.assign({ id: d.id }, Friends.all[d.id]) : null;
  switch (a) {
    case "addFriend":
      S.modal = { k: "addFriend", url: null };
      Friends.myLink().then(url => { if (S.modal && S.modal.k === "addFriend") { S.modal.url = url; render(); } }).catch(e => { toast(fbErr(e), "bad"); });
      return true;
    case "friendAdd": Friends.request({ uid: d.uid, name: d.name, avatar: d.avatar }).then(() => render()); return true;
    case "friendAccept": if (f) Friends.accept(f); return true;
    case "friendDecline": if (f) ask(`Refuser la demande de ${Friends.nameOf(f)} ?`, "Refuser").then(ok => ok && Friends.remove(f)); return true;
    case "friendCancel": if (f) Friends.remove(f, "Demande annulée"); return true;
    case "friendRemove": if (f) ask(`Retirer ${Friends.nameOf(f)} de tes amis ?`, "Retirer", true).then(ok => ok && Friends.remove(f, "Retiré de tes amis")); return true;
    case "challenge": if (f) { S.modal = null; Friends.challenge(f); } return true;
    case "linkDuel": S.modal = { k: "linkDuel" }; return true;
    case "linkAccept": if (S.modal && S.modal.inv) Friends.acceptLink(S.modal.key, S.modal.inv, !!d.duel); return true;
    case "inboxJoin": {
      const x = Friends.inbox[d.id];
      if (!x) return true;
      DB.join(x.code).then(() => { Friends.dropInvite(d.id); toast("Bienvenue dans le cercle !", "good"); openCircle(x.code); })
        .catch(e => toast(e.code === "not-found" ? "Ce cercle n'existe plus" : fbErr(e), "bad"));
      return true;
    }
    case "inboxDrop": Friends.dropInvite(d.id); return true;
  }
  return false;
}

function friendsSubmit(f, fd) {
  const k = f.dataset.f;
  if (k === "inviteFriends") {
    const uids = fd.getAll("uid");
    const cc = DB.cur();
    if (!uids.length) { toast("Coche au moins un ami", "bad"); return true; }
    if (cc) Friends.invite(cc, uids).then(() => { S.modal = null; render(); });
    return true;
  }
  if (k === "linkDuel") {
    const title = String(fd.get("title") || "").trim().slice(0, 120);
    const stake = parseInt(fd.get("stake"), 10);
    const closesAt = new Date(String(fd.get("closesAt"))).getTime();
    if (!title) return true;
    if (!(stake >= 1 && stake <= CIRCLE_DEFAULTS.start)) { toast(`Mise entre 1 et ${nf(CIRCLE_DEFAULTS.start)} jetons`, "bad"); return true; }
    if (!(closesAt > now() + 60000)) { toast("Choisis une date dans le futur", "bad"); return true; }
    S.modal.busy = true; render();
    Friends.challengeByLink(title, stake, closesAt)
      .then(r => { S.modal = { k: "linkDuel", url: r.url, title, stake }; render(); })
      .catch(e => { S.modal.busy = false; toast(fbErr(e), "bad"); render(); });
    return true;
  }
  return false;
}

const WA_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z"/></svg>`;
const MAIL_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
