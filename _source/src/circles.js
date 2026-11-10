/* Pronohub — bienvenue, cercles, invitations, saisons */
"use strict";

function welcomeView() {
  const p = Profile.get();
  const sel = S.pickAvatar || p.avatar || AVATARS[0];
  return `<section class="page welcome">
    <div class="welcome-hero">
      <div class="logo-mark" aria-hidden="true">${TICKET_SVG}</div>
      <h1 class="brand">Pronohub</h1>
      <p class="lead">Les paris entre amis, avec des jetons pour rire. Sport, élections, ou « qui arrivera en retard lundi ? ».</p>
    </div>
    <form data-f="profile" class="panel stack welcome-form">
      <label class="fld"><span>Ton pseudo</span><input name="name" maxlength="24" required autocomplete="nickname" placeholder="Ex. Fanfan" value="${esc(p.name)}"></label>
      <fieldset class="fld"><legend>Ton avatar</legend>
        <div class="emoji-grid">${AVATARS.map(e => `<label class="emo ${e === sel ? "on" : ""}"><input type="radio" name="avatar" value="${e}" ${e === sel ? "checked" : ""}><span>${e}</span></label>`).join("")}</div>
      </fieldset>
      <button class="btn primary big">C'est parti</button>
    </form>
  </section>`;
}

/* Écran d'état clair quand le cercle n'est pas prêt */
function circleStateView(cc) {
  const st = cc ? cc.status : "loading";
  const box = (title, text, actions) => `<section class="page state"><div class="state-box"><h2>${title}</h2><p>${text}</p><div class="row center wrap">${actions}</div></div></section>`;
  const home = `<button class="btn" data-a="home">Mes cercles</button>`;
  switch (st) {
    case "loading": return box("Ouverture du cercle…", "On récupère les paris et le classement.", home);
    case "auth": return box("Connexion impossible", FB.error ? fbErr({ code: FB.error }) : "La connexion à Firebase n'a pas abouti. Vérifie ta connexion internet.", `<button class="btn primary" data-a="retry">Réessayer</button>${home}`);
    case "nofb": return box("Cercle en ligne indisponible", "Cette installation n'a pas encore Firebase. Les cercles en ligne reviendront quand il sera configuré.", home);
    case "missing": return box("Cercle introuvable", "Ce code ne correspond à aucun cercle, ou il a été supprimé.", `<button class="btn" data-a="forgetCircle" data-code="${esc(cc.code)}">Retirer de ma liste</button>${home}`);
    case "notmember": return box("Tu ne fais pas partie de ce cercle", "Tu as peut-être été retiré, ou tu viens d'un autre appareil. Tu peux le rejoindre à nouveau avec son code.", `<button class="btn primary" data-a="rejoin" data-code="${esc(cc.code)}">Rejoindre ${esc(cc.code)}</button>${home}`);
    case "denied": return box("Accès refusé", (cc.err || "") + " Si tu viens d'activer Firebase, publie les règles de firestore.rules dans la console.", `<button class="btn primary" data-a="retry">Réessayer</button>${home}`);
    case "offline": return box("Pas de connexion", "Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.", `<button class="btn primary" data-a="retry">Réessayer</button>${home}`);
  }
  return box("Oups", "État inattendu.", home);
}

/* ---------- Fenêtres ---------- */

function newCircleModal() {
  const m = S.modal;
  const emo = m.emoji || CIRCLE_EMOJIS[0];
  const online = FB.ok && m.where !== "local";
  return `<h2>Nouveau cercle</h2>
    <form data-f="newCircle" class="stack">
      <label class="fld"><span>Nom du cercle</span><input name="name" maxlength="32" required placeholder="Ex. Les collègues du 3e" value="${esc(m.name || "")}"></label>
      <fieldset class="fld"><legend>Emblème</legend>
        <div class="emoji-grid small">${CIRCLE_EMOJIS.map(e => `<label class="emo ${e === emo ? "on" : ""}"><input type="radio" name="emoji" value="${e}" ${e === emo ? "checked" : ""}><span>${e}</span></label>`).join("")}</div>
      </fieldset>
      <fieldset class="fld"><legend>Où jouez-vous ?</legend>
        <div class="choice-list">
          <label class="choice ${online ? "on" : ""} ${FB.ok ? "" : "disabled"}"><input type="radio" name="where" value="online" ${online ? "checked" : ""} ${FB.ok ? "" : "disabled"}>
            <span><b>En ligne</b><small>Chacun sur son téléphone, on rejoint avec un code</small></span></label>
          <label class="choice ${online ? "" : "on"}"><input type="radio" name="where" value="local" ${online ? "" : "checked"}>
            <span><b>Sur cet appareil</b><small>Pour une soirée : on se passe le téléphone</small></span></label>
        </div>
      </fieldset>
      <details class="adv"><summary>Règles du jeu</summary>
        <div class="grid2">
          ${numField("start", "Jetons de départ", CIRCLE_DEFAULTS.start, 100, 100000)}
          ${numField("daily", "Bonus quotidien", CIRCLE_DEFAULTS.daily, 0, 10000)}
          ${numField("rescue", "Renflouement si à sec", CIRCLE_DEFAULTS.rescue, 0, 10000)}
          ${numField("bonus", "Bonus score exact", CIRCLE_DEFAULTS.bonus, 0, 10000)}
        </div>
      </details>
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary">Créer le cercle</button></div>
    </form>`;
}

function numField(name, label, val, min, max) {
  return `<label class="fld"><span>${label}</span><input type="number" inputmode="numeric" name="${name}" value="${val}" min="${min}" max="${max}" step="1" required></label>`;
}

function joinModal() {
  const m = S.modal;
  return `<h2>Rejoindre un cercle</h2>
    <p class="muted">Demande le code à un membre du cercle. Il ressemble à ABC-234.</p>
    ${m.err ? `<p class="err">${esc(m.err)}</p>` : ""}
    <form data-f="join" class="stack">
      <label class="fld"><span>Code du cercle</span><input name="code" class="code-input" required maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC-234" value="${esc(m.code || "")}"></label>
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary" ${m.busy ? "disabled" : ""}>${m.busy ? "Recherche…" : "Rejoindre"}</button></div>
    </form>`;
}

function inviteModal() {
  const code = S.code;
  const meta = MyCircles.list().find(c => c.code === code) || { name: "" };
  const url = location.origin + location.pathname + "?join=" + code;
  return `<h2>Inviter des amis</h2>
    <p class="muted">Envoie ce code ou ce lien : tes amis rejoindront « ${esc(meta.name)} » en un clic.</p>
    <div class="code-big" aria-label="Code du cercle">${esc(code)}</div>
    <div class="row center wrap">
      ${navigator.share ? `<button class="btn primary" data-a="share" data-url="${esc(url)}">Partager le lien</button>` : ""}
      <button class="btn" data-a="copy" data-text="${esc(url)}">Copier le lien</button>
      <button class="btn ghost" data-a="copy" data-text="${esc(code)}">Copier le code</button>
    </div>
    <div class="row end"><button class="btn ghost" data-a="close">Fermer</button></div>`;
}

function switcherModal() {
  const list = MyCircles.list();
  return `<h2>Mes cercles</h2>
    <div class="circle-list compact">${list.map(c => `
      <button class="circle-card ${c.code === S.code ? "on" : ""}" data-a="openCircle" data-code="${esc(c.code)}">
        <span class="cc-emoji" aria-hidden="true">${esc(c.emoji || "🎯")}</span>
        <span class="cc-body"><b>${esc(c.name)}</b><small>${c.local ? "Sur cet appareil" : "Code " + esc(c.code)}</small></span>
      </button>`).join("")}</div>
    <div class="row wrap">
      <button class="btn" data-a="newCircle">${ICON.plus} Créer</button>
      <button class="btn" data-a="joinCircle" ${FB.ok ? "" : "disabled"}>Rejoindre</button>
      <button class="btn ghost" data-a="home">Accueil</button>
    </div>`;
}

function circleModal() {
  const cc = DB.cur(), c = cc.circle, owner = isOwner(cc);
  const a = analysis(cc);
  const mem = visibleMembers(cc).sort((x, y) => x.name.localeCompare(y.name));
  const m = S.modal;
  return `<h2>${esc(c.emoji || "🎯")} ${esc(c.name)}</h2>
    <p class="muted">${cc.local ? "Cercle sur cet appareil" : "Code " + esc(cc.code)}, saison ${c.season}, ${mem.length} ${pl(mem.length, "membre", "membres")}</p>
    ${owner ? `<form data-f="circleEdit" class="stack">
      <label class="fld"><span>Nom</span><input name="name" maxlength="32" required value="${esc(c.name)}"></label>
      <fieldset class="fld"><legend>Emblème</legend>
        <div class="emoji-grid small">${CIRCLE_EMOJIS.map(e => `<label class="emo ${e === c.emoji ? "on" : ""}"><input type="radio" name="emoji" value="${e}" ${e === c.emoji ? "checked" : ""}><span>${e}</span></label>`).join("")}</div>
      </fieldset>
      <div class="grid2">
        ${numField("daily", "Bonus quotidien", c.daily, 0, 10000)}
        ${numField("rescue", "Renflouement si à sec", c.rescue, 0, 10000)}
        ${numField("bonus", "Bonus score exact", c.bonus, 0, 10000)}
        ${numField("seed", "Mise de la banque par choix", c.seed, 0, 10000)}
      </div>
      <p class="hint">Les jetons de départ (${nf(c.start)}) s'appliquent à toute la saison. La mise de la banque rend les cotes intéressantes même quand peu de joueurs ont misé.</p>
      <div class="row end"><button class="btn primary">Enregistrer</button></div>
    </form>` : `<p>Seul le créateur du cercle peut en changer les règles.</p>`}

    <h3>Membres</h3>
    <ul class="member-list">${mem.map(x => `<li>${avatar(x)}<span class="grow">${esc(x.name)}${x.uid === c.owner ? ` <small class="tag">créateur</small>` : ""}${cc.local && x.uid === myId(cc) ? ` <small class="tag">joue</small>` : ""}</span>
      ${owner && x.uid !== c.owner ? `<button class="btn tiny ghost" data-a="giveOwner" data-uid="${esc(x.uid)}" title="Donner la main">Donner la main</button><button class="btn tiny danger ghost" data-a="kick" data-uid="${esc(x.uid)}">Retirer</button>` : ""}</li>`).join("")}</ul>
    ${cc.local ? `<form data-f="addPlayer" class="row">
      <input name="name" maxlength="24" required placeholder="Ajouter un joueur" aria-label="Nom du joueur">
      <button class="btn">Ajouter</button></form>` : ""}

    ${owner ? `<h3>Saison</h3>
      <p class="muted">Clôture la saison ${c.season} : le classement est archivé, les trois premiers reçoivent un trophée et tout le monde repart avec ${nf(c.start)} jetons.</p>
      <button class="btn" data-a="newSeason">Démarrer la saison ${c.season + 1}</button>` : ""}

    ${owner && !cc.local ? `<h3>Clé de récupération</h3>
      <p class="muted">Garde-la précieusement : elle te permet de reprendre la main sur ce cercle depuis un autre appareil.</p>
      ${m.key ? `<div class="code-big small">${esc(m.key)}</div>` : `<button class="btn ghost" data-a="showKey">Afficher la clé</button>`}` : ""}
    ${!owner && !cc.local ? `<p class="hint">Tu as créé ce cercle sur un autre appareil ? <button class="link" data-a="recover">Reprendre la main avec la clé</button></p>` : ""}

    <div class="row between wrap modal-foot">
      ${owner ? (cc.local ? `<button class="btn danger ghost" data-a="deleteLocal">Supprimer le cercle</button>` : `<span></span>`) : `<button class="btn danger ghost" data-a="leave">Quitter le cercle</button>`}
      <button class="btn" data-a="close">Fermer</button>
    </div>`;
}

function recoverModal() {
  const m = S.modal;
  return `<h2>Reprendre la main</h2>
    <p class="muted">Entre la clé de récupération affichée chez le créateur du cercle.</p>
    ${m.err ? `<p class="err">${esc(m.err)}</p>` : ""}
    <form data-f="recover" class="stack">
      <label class="fld"><span>Clé</span><input name="key" required autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary">Valider</button></div>
    </form>`;
}

function actorModal() {
  const cc = DB.cur();
  return `<h2>Qui joue ?</h2>
    <p class="muted">Passe le téléphone : les mises sont faites au nom du joueur choisi.</p>
    <div class="choice-list">${visibleMembers(cc).map(x => `<button class="choice ${x.uid === myId(cc) ? "on" : ""}" data-a="setActor" data-uid="${esc(x.uid)}">${avatar(x)}<span><b>${esc(x.name)}</b></span></button>`).join("")}</div>
    <div class="row end"><button class="btn ghost" data-a="close">Fermer</button></div>`;
}

/* ---------- Actions ---------- */

async function openCircle(code) {
  if (S.pendingMatch && !S.pendingMatch.code) S.pendingMatch.code = code;
  S.code = code;
  S.view = "circle";
  S.tab = "bets";
  S.modal = null;
  S.actor = null;
  Store.set("last", code);
  DB.open(code);
  render();
}

async function newSeason() {
  const cc = DB.cur(), a = analysis(cc), c = cc.circle;
  const open = Object.values(a.bets).filter(x => x.state === "open" || x.state === "closed").length;
  if (!(await ask(`Démarrer la saison ${c.season + 1} ?${open ? ` ${open} pari(s) encore en cours seront annulés et remboursés.` : ""}`, "Démarrer la saison"))) return;
  const standings = a.standings.map(s => ({ uid: s.uid, name: s.name, avatar: s.avatar || "", bal: s.bal }));
  for (const x of Object.values(a.bets)) if (x.state === "open" || x.state === "closed") await DB.put("bets", x.id, { status: "void", settledAt: now(), settledBy: myId(cc) }, true);
  await DB.putSeason(c.season, { n: c.season, endedAt: now(), standings });
  await DB.setCircle({ season: c.season + 1 });
  S.modal = null;
  S.tab = "rank";
  toast(`Saison ${c.season + 1} lancée : bonne chance à tous !`, "good");
  render();
}

function circlesAct(a, d) {
  const cc = DB.cur();
  switch (a) {
    case "home": DB.close(); S.code = null; S.view = "home"; S.modal = null; Store.del("last"); return true;
    case "openCircle": openCircle(d.code); return true;
    case "newCircle": S.modal = { k: "newCircle" }; return true;
    case "joinCircle": S.modal = { k: "join" }; return true;
    case "switcher": S.modal = { k: "switcher" }; return true;
    case "invite": S.modal = { k: "invite" }; return true;
    case "circleInfo": S.modal = { k: "circle" }; return true;
    case "recover": S.modal = { k: "recover" }; return true;
    case "actor": S.modal = { k: "actor" }; return true;
    case "setActor": S.actor = d.uid; S.modal = null; toast(LANG === "en" ? memberOf(cc, d.uid).name + "'s turn" : "À " + memberOf(cc, d.uid).name + " de jouer"); return true;
    case "retry": { const c = S.code; DB.close(); DB.open(c); return true; }
    case "forgetCircle": MyCircles.remove(d.code); Account.syncCircles(); circlesAct("home", {}); return true;
    case "rejoin": S.modal = { k: "join", code: d.code }; return true;
    case "share": navigator.share({ title: "Pronohub", text: "Rejoins mon cercle de paris sur Pronohub", url: d.url }).catch(() => { }); return true;
    case "copy": copyText(d.text); return true;
    case "showKey":
      FB.sub(cc.code, "private").doc("owner").get().then(s => { S.modal.key = s.exists ? s.data().key : "?"; render(); }).catch(e => toast(fbErr(e), "bad"));
      return true;
    case "newSeason": newSeason(); return true;
    case "giveOwner":
      ask(`Donner la main à ${memberOf(cc, d.uid).name} ? Tu ne pourras plus changer les règles du cercle.`, "Donner la main")
        .then(ok => ok && DB.setCircle({ owner: d.uid }).then(ok => ok && toast("C'est fait")));
      return true;
    case "kick":
      ask(`Retirer ${memberOf(cc, d.uid).name} du cercle ?`, "Retirer", true).then(ok => ok && DB.del("members", d.uid));
      return true;
    case "leave":
      ask("Quitter ce cercle ? Tu pourras revenir avec le code.", "Quitter le cercle", true).then(ok => ok && DB.del("members", myId(cc))).then(ok => {
        if (!ok) return;
        MyCircles.remove(cc.code); Account.syncCircles(); circlesAct("home", {}); render();
      });
      return true;
    case "deleteLocal":
      ask("Supprimer définitivement ce cercle et tous ses paris ?", "Supprimer le cercle", true).then(ok => {
        if (!ok) return;
        Store.del("local." + cc.code); MyCircles.remove(cc.code); circlesAct("home", {}); render();
      });
      return true;
  }
  return false;
}

function circlesSubmit(f, fd) {
  const k = f.dataset.f;
  const num = (n, def) => Math.max(0, Math.min(100000, parseInt(fd.get(n), 10) || def || 0));
  if (k === "profile") {
    const name = String(fd.get("name") || "").trim().slice(0, 24);
    if (!name) return true;
    Profile.set({ name, avatar: fd.get("avatar") || "" });
    Account.pushProfile();
    if (S.pendingJoin && FB.ok) { S.modal = { k: "join", code: S.pendingJoin }; S.pendingJoin = null; }
    else if (!Store.get("tourDone")) { S.modal = { k: "tour", step: 0 }; Store.set("tourDone", 1); }
    render();
    return true;
  }
  if (k === "newCircle") {
    const name = String(fd.get("name") || "").trim().slice(0, 32);
    const emoji = fd.get("emoji") || "🎯";
    const st = { start: Math.max(100, num("start", 1000)), daily: num("daily"), rescue: num("rescue"), bonus: num("bonus"), seed: CIRCLE_DEFAULTS.seed };
    const local = fd.get("where") !== "online" || !FB.ok;
    (local ? DB.createLocal(name, emoji, st) : DB.createOnline(name, emoji, st))
      .then(code => { openCircle(code); S.modal = { k: local ? "circle" : "invite" }; toast("Cercle créé", "good"); render(); })
      .catch(e => toast(fbErr(e), "bad"));
    return true;
  }
  if (k === "join") {
    const code = normCode(fd.get("code"));
    if (!code) { S.modal.err = "Le code a 6 caractères, par exemple ABC-234."; render(); return true; }
    S.modal.busy = true; S.modal.code = code; render();
    DB.join(code).then(() => { toast("Bienvenue dans le cercle !", "good"); openCircle(code); })
      .catch(e => { S.modal.busy = false; S.modal.err = e.code === "not-found" ? "Aucun cercle avec ce code. Vérifie les lettres et les chiffres." : fbErr(e); render(); });
    return true;
  }
  if (k === "circleEdit") {
    DB.setCircle({ name: String(fd.get("name")).trim().slice(0, 32), emoji: fd.get("emoji") || "🎯", daily: num("daily"), rescue: num("rescue"), bonus: num("bonus"), seed: num("seed") })
      .then(ok => { if (ok) { toast("Règles enregistrées", "good"); Account.syncCircles(); } });
    return true;
  }
  if (k === "addPlayer") {
    const name = String(fd.get("name") || "").trim().slice(0, 24);
    if (!name) return true;
    const id = "p_" + rid(6);
    DB.put("members", id, { uid: id, name, avatar: AVATARS[hashStr(id) % AVATARS.length], joinedAt: now() });
    toast(name + " rejoint le cercle");
    return true;
  }
  if (k === "recover") {
    const key = String(fd.get("key") || "").trim().toUpperCase();
    const cc = DB.cur();
    FB.circle(cc.code).set({ owner: FB.uid, proof: key }, { merge: true })
      .then(async () => {
        const nk = rid(10).toUpperCase();
        await FB.sub(cc.code, "private").doc("owner").set({ key: nk });
        await FB.circle(cc.code).update({ proof: firebase.firestore.FieldValue.delete() });
        S.modal = { k: "circle", key: nk };
        toast("Tu as repris la main. Nouvelle clé générée.", "good");
        render();
      })
      .catch(() => { S.modal.err = "Clé incorrecte."; render(); });
    return true;
  }
  return false;
}
