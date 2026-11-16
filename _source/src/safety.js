/* Pronohub — signaler un contenu, bloquer un joueur, protéger son compte.

   Un signalement = une fiche reports/{id} (création seule), lue par le développeur.
   Les joueurs bloqués sont rangés dans le profil (users/{uid}.blocked) et sur l'appareil :
   leurs commentaires sont masqués, leurs demandes d'ami et invitations ignorées. */
"use strict";

const Block = {
  all() { return Store.get("blocked") || {}; },
  has(uid) { return !!uid && Object.prototype.hasOwnProperty.call(this.all(), uid); },
  add(uid, name) {
    if (!uid || uid === FB.uid) return;
    const map = this.all(); map[uid] = String(name || "Joueur").slice(0, 24);
    Store.set("blocked", map);
    if (FB.ok && FB.uid) FB.userDoc().set({ blocked: { [uid]: map[uid] } }, { merge: true }).catch(() => { });
    const f = Friends.byUid(uid);
    if (f) Friends.remove(Object.assign({ id: Friends.pair(FB.uid, uid) }, f));
  },
  remove(uid) {
    const map = this.all(); delete map[uid];
    Store.set("blocked", map);
    if (FB.ok && FB.uid) FB.userDoc().update({ [`blocked.${uid}`]: firebase.firestore.FieldValue.delete() }).catch(() => { });
  },
};

/* Commentaires que j'ai signalés : masqués chez moi tout de suite */
const Hidden = {
  has(id) { return !!(Store.get("hiddenC") || {})[id]; },
  add(id) { const m = Store.get("hiddenC") || {}; m[id] = 1; Store.set("hiddenC", m); },
};
const commentShown = (id, c) => !Block.has(c.uid) && !Hidden.has(id);

const REPORT_REASONS = [["insult", "Insultes ou harcèlement"], ["shock", "Contenu choquant ou haineux"], ["spam", "Spam ou arnaque"], ["other", "Autre"]];

function reportButton(type, id, label) {
  if (!FB.ok || !FB.uid) return "";
  return `<button class="icon-btn tiny report-btn" data-a="report" data-type="${type}" data-id="${esc(id)}" aria-label="${label}">${ICON.flag}</button>`;
}

function reportModal() {
  const m = S.modal;
  if (m.sent) return `<h2>Merci</h2>
    <p>Ton signalement est bien envoyé.${m.blocked ? ` ${esc(m.name)} est bloqué : tu ne verras plus ses commentaires.` : ""}</p>
    <div class="row end"><button class="btn primary" data-a="close">Fermer</button></div>`;
  const what = m.type === "comment" ? "Signaler ce commentaire" : m.type === "bet" ? "Signaler ce pari" : "Signaler ce joueur";
  return `<h2>${what}</h2>
    ${m.text ? `<p class="report-quote">${esc(m.text)}</p>` : ""}
    <form data-f="report" class="stack">
      <fieldset class="fld"><legend>Quel est le problème ?</legend>
        ${REPORT_REASONS.map(([v, l], i) => `<label class="choice"><input type="radio" name="reason" value="${v}" ${i === 0 ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </fieldset>
      <label class="fld"><span>Précisions (facultatif)</span><textarea name="note" rows="2" maxlength="500"></textarea></label>
      ${m.uid && m.uid !== FB.uid && !Block.has(m.uid) ? `<label class="check"><input type="checkbox" name="block" checked><span>Bloquer aussi ${esc(m.name)}</span></label>` : ""}
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary" ${m.busy ? "disabled" : ""}>Envoyer le signalement</button></div>
    </form>`;
}

/* Carte d'accueil : un joueur anonyme risque de tout perdre en changeant d'appareil */
function secureCard() {
  if (!FB.ok || !FB.uid || FB.provider() !== "anon") return "";
  if (!MyCircles.list().some(c => !c.local)) return "";
  const t = Store.get("secureHide");
  if (t && Date.now() - t < 14 * 86400000) return "";
  return `<div class="install secure-card">
    <span class="install-icon bell" aria-hidden="true">${ICON.user}</span>
    <span class="grow"><b>Protège ton compte</b>
      <small>Sans compte, tu perds tes cercles et tes amis si tu changes de téléphone.</small></span>
    <span class="install-acts">
      <button class="btn primary small" data-a="account">Protéger</button>
      <button class="icon-btn tiny" data-a="secureHide" aria-label="Masquer pendant deux semaines">${ICON.x}</button>
    </span>
  </div>`;
}

/* Réglages : liste des joueurs bloqués */
function blockedPanel() {
  const list = Object.entries(Block.all());
  if (!list.length) return "";
  return `<div class="panel">
      <h3>Joueurs bloqués</h3>
      <ul class="blocked-list">${list.map(([uid, name]) => `<li><span class="grow">${esc(name)}</span><button class="btn small" data-a="unblock" data-uid="${esc(uid)}">Débloquer</button></li>`).join("")}</ul>
    </div>`;
}

/* Fiche d'un autre joueur : bloquer, signaler */
function playerSafety(cc, uid) {
  if (!FB.ok || !FB.uid || cc.local || uid === FB.uid || /^p_|^me_/.test(uid)) return "";
  const m = memberOf(cc, uid);
  return `<div class="row wrap safety-row">
    ${Block.has(uid) ? `<button class="btn small" data-a="unblock" data-uid="${esc(uid)}">Débloquer</button>` : `<button class="btn small ghost" data-a="block" data-uid="${esc(uid)}" data-name="${esc(m.name)}">Bloquer</button>`}
    <button class="btn small ghost" data-a="report" data-type="player" data-id="${esc(uid)}">Signaler</button>
  </div>`;
}

function safetyAct(a, d) {
  const cc = DB.cur();
  switch (a) {
    case "report": {
      const m = { k: "report", type: d.type, id: d.id, code: cc ? cc.code : "" };
      if (d.type === "comment" && cc) { const c = cc.comments[d.id]; if (!c) return true; Object.assign(m, { uid: c.uid, name: memberOf(cc, c.uid).name, text: c.text }); }
      else if (d.type === "bet" && cc) { const b = cc.bets[d.id]; if (!b) return true; Object.assign(m, { uid: b.createdBy, name: memberOf(cc, b.createdBy).name, text: b.title }); }
      else if (d.type === "player" && cc) Object.assign(m, { uid: d.id, name: memberOf(cc, d.id).name, text: "" });
      S.modal = m;
      return true;
    }
    case "block":
      ask(`Bloquer ${d.name} ? Tu ne verras plus ses commentaires, ses demandes d'ami ni ses invitations. Vos paris communs restent visibles.`, "Bloquer", true)
        .then(ok => { if (ok) { Block.add(d.uid, d.name); toast(`${d.name} est bloqué`); render(); } });
      return true;
    case "unblock": Block.remove(d.uid); toast("Joueur débloqué"); return true;
    case "secureHide": Store.set("secureHide", Date.now()); toast("Tu peux créer ton compte à tout moment dans les Réglages"); return true;
  }
  return false;
}

function safetySubmit(f, fd) {
  if (f.dataset.f !== "report") return false;
  const m = S.modal;
  const rep = { type: m.type, code: m.code || "", target: m.id || "", uid: m.uid || "", name: String(m.name || "").slice(0, 24), text: String(m.text || "").slice(0, 400),
    reason: String(fd.get("reason") || "other"), note: String(fd.get("note") || "").slice(0, 500), from: FB.uid, at: now(), v: APP_VERSION, lang: LANG };
  const block = !!fd.get("block");
  m.busy = true; render();
  FB.db.collection("reports").add(rep).then(() => {
    if (m.type === "comment") Hidden.add(m.id);
    if (block) Block.add(m.uid, m.name);
    S.modal = { k: "report", sent: true, blocked: block, name: m.name };
    render();
  }).catch(e => { m.busy = false; toast(fbErr(e), "bad"); render(); });
  return true;
}
