/* Pronohub — réglages, thème, langue, sauvegarde, retours, mentions légales */
"use strict";

const APP_VERSION = "1.1.3";

const Prefs = {
  get() { return Object.assign({ theme: "auto" }, Store.get("prefs", {})); },
  set(p) { Store.set("prefs", Object.assign(this.get(), p)); applyTheme(); },
};

function applyTheme() {
  const t = Prefs.get().theme;
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const m = $('meta[name="theme-color"]');
  if (m) m.content = dark ? "#121a33" : "#f3f5fb";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

function setLang(l) {
  Store.set("lang", l);
  if (l === LANG) return;
  location.href = l === "en" ? "./en/" : "../";
}

function settingsView() {
  const p = Prefs.get();
  const seg = (k, v, label) => `<button class="seg ${p[k] === v ? "on" : ""}" data-a="pref" data-k="${k}" data-v="${v}" aria-pressed="${p[k] === v}">${label}</button>`;
  const prov = FB.ok ? FB.provider() : "";
  return `<section class="page narrow">
    <div class="pagehead"><button class="icon-btn" data-a="back" aria-label="Retour">${ICON.back}</button><h1>Réglages</h1></div>

    <div class="panel">
      <h3>Apparence</h3>
      <div class="segs">${seg("theme", "auto", "Automatique")}${seg("theme", "light", "Clair")}${seg("theme", "dark", "Sombre")}</div>
      <h3>Langue</h3>
      <div class="segs">
        <button class="seg ${LANG === "fr" ? "on" : ""}" data-a="lang" data-v="fr">Français</button>
        <button class="seg ${LANG === "en" ? "on" : ""}" data-a="lang" data-v="en">English</button>
      </div>
    </div>

    ${Install.standalone() ? "" : `<div class="panel">
      <h3>Installer l'app</h3>
      <p class="muted">Ajoute Pronohub à ton écran d'accueil pour l'ouvrir comme une vraie app, en plein écran.</p>
      <button class="btn" data-a="install">Installer Pronohub</button>
    </div>`}

    <div class="panel">
      <h3>Compte</h3>
      <p class="muted">${!FB.ok ? "Mode hors ligne : tes cercles restent sur cet appareil." : prov === "anon" ? "Identité anonyme sur cet appareil." : "Compte connecté : tes cercles te suivent partout."}</p>
      <button class="btn" data-a="account">Gérer mon compte</button>
    </div>

    <div class="panel">
      <h3>Sauvegarde</h3>
      <p class="muted">Exporte ton profil et tes cercles « sur cet appareil » dans un fichier, pour les transférer ou les garder au chaud. Les cercles en ligne sont déjà sauvegardés.</p>
      <div class="row wrap">
        <button class="btn" data-a="export">Exporter mes données</button>
        <label class="btn">Importer un fichier<input type="file" accept="application/json,.json" data-f="import" hidden></label>
      </div>
    </div>

    <div class="panel">
      <h3>Une idée, un bug ?</h3>
      <p class="muted">Dis-nous ce qui coince ou ce qui manque.</p>
      <button class="btn" data-a="feedback">Envoyer un retour</button>
    </div>

    <div class="panel">
      <h3>À propos</h3>
      <p class="muted">Pronohub ${APP_VERSION}. Jetons fictifs uniquement : ils ne s'achètent pas, ne se revendent pas et n'ont aucune valeur.</p>
      <div class="row wrap">
        <button class="btn ghost" data-a="legal">Mentions et confidentialité</button>
        <button class="btn ghost" data-a="tour">Revoir la présentation</button>
      </div>
    </div>
  </section>`;
}

function feedbackModal() {
  const m = S.modal;
  if (m.sent) return `<h2>Merci !</h2><p>Ton retour est bien arrivé.</p><div class="row end"><button class="btn primary" data-a="close">Fermer</button></div>`;
  return `<h2>Envoyer un retour</h2>
    <form data-f="feedback" class="stack">
      <div class="segs" role="radiogroup">
        ${[["bug", "🐞 Bug"], ["idea", "💡 Idée"], ["other", "💬 Autre"]].map(([v, l], i) => `<label class="seg radio"><input type="radio" name="type" value="${v}" ${i === 1 ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </div>
      <label class="fld"><span>Message</span><textarea name="msg" rows="5" required maxlength="2000" placeholder="Décris ce que tu as vu ou ce que tu aimerais"></textarea></label>
      <label class="fld"><span>E-mail (facultatif, pour te répondre)</span><input type="email" name="email" autocomplete="email"></label>
      ${FB.ok ? "" : `<p class="muted">L'envoi en ligne n'est pas activé : ton message sera copié, colle-le où tu veux.</p>`}
      <div class="row end"><button type="button" class="btn ghost" data-a="close">Annuler</button><button class="btn primary">Envoyer</button></div>
    </form>`;
}

function legalModal() {
  return `<h2>Mentions et confidentialité</h2>
    <div class="prose">
      <p><b>Un jeu entre amis, sans argent réel.</b> Pronohub utilise des jetons fictifs. Ils sont distribués gratuitement, ne peuvent être ni achetés ni échangés contre de l'argent ou un lot. Aucune mise réelle n'est possible.</p>
      <p><b>Données enregistrées.</b> Ton pseudo, ton avatar, les cercles que tu rejoins, tes paris, mises et commentaires. Sans compte, elles restent dans ton navigateur. Avec un compte ou un cercle en ligne, elles sont stockées chez Google Firebase (Union européenne ou États-Unis selon la configuration) et visibles par les membres de tes cercles uniquement.</p>
      <p><b>E-mail.</b> Si tu crées un compte e-mail ou Google, l'adresse sert seulement à te connecter. Elle n'est jamais montrée aux autres joueurs.</p>
      <p><b>Suppression.</b> Tu peux supprimer ton compte à tout moment depuis Compte. Tes mises passées restent dans l'historique des cercles sous le nom « Ancien membre ».</p>
      <p><b>Résultats sportifs.</b> Les matchs importés viennent de l'API publique d'ESPN, utilisée sans garantie. En cas d'erreur, le pari peut être contesté ou corrigé à la main.</p>
      <p><b>Mesure d'audience.</b> Aucune publicité, aucun traceur.</p>
    </div>
    <div class="row end"><button class="btn primary" data-a="close">Fermer</button></div>`;
}

function exportData() {
  Store.flush();
  const data = {};
  for (const k of Store.keys()) data[k] = Store.get(k);
  download(`pronohub-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "pronohub", v: APP_VERSION, at: now(), data }, null, 1));
  toast("Données exportées");
}

function importData(file) {
  const r = new FileReader();
  r.onload = async () => {
    try {
      const j = JSON.parse(r.result);
      if (j.app !== "pronohub" || !j.data) throw 0;
      if (!(await ask("Importer ce fichier ? Ton profil et tes cercles sur cet appareil seront remplacés.", "Importer"))) return;
      for (const [k, v] of Object.entries(j.data)) Store.set(k, v);
      toast("Import terminé", "good");
      setTimeout(() => location.reload(), 600);
    } catch (e) { toast("Ce fichier n'est pas une sauvegarde Pronohub", "bad"); }
  };
  r.readAsText(file);
}

async function sendFeedback(fd) {
  const d = { type: fd.get("type"), msg: String(fd.get("msg") || "").slice(0, 2000), email: String(fd.get("email") || "").slice(0, 200), app: "pronohub", v: APP_VERSION, lang: LANG, at: now(), ua: navigator.userAgent.slice(0, 200) };
  if (!FB.ok) { copyText(`[Pronohub ${APP_VERSION}] ${d.type} : ${d.msg}`); S.modal = null; render(); return; }
  try {
    d.uid = FB.uid;
    await FB.db.collection("feedback").add(d);
    S.modal = { k: "feedback", sent: true };
  } catch (e) { toast(fbErr(e), "bad"); }
  render();
}

function settingsAct(a, d) {
  switch (a) {
    case "settings": go("settings"); return true;
    case "pref": Prefs.set({ [d.k]: d.v }); return true;
    case "lang": setLang(d.v); return true;
    case "export": exportData(); return true;
    case "feedback": S.modal = { k: "feedback" }; return true;
    case "legal": S.modal = { k: "legal" }; return true;
    case "tour": S.modal = { k: "tour", step: 0 }; return true;
  }
  return false;
}
