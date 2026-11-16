/* Pronohub — « Paris en cours » sur l'accueil : tous mes paris ouverts, cercles et duels réunis.

   L'accueil ne charge qu'un cercle à la fois ; ici on lit, pour chaque cercle, les paris de la saison
   et mes mises (trois lectures par cercle), au plus toutes les 20 secondes. Le dernier résultat est
   gardé sur l'appareil pour s'afficher tout de suite au lancement. */
"use strict";

const Overview = {
  items: null,
  at: 0,
  busy: false,
  stale() { this.at = 0; },
  list() { return this.items || Store.get("ov") || []; },

  async refresh() {
    if (this.busy || Date.now() - this.at < 20000) return;
    this.busy = true;
    const out = [];
    for (const c of MyCircles.list()) {
      try {
        let bets = {}, mine = {}, me, season;
        if (c.local) {
          const d = Store.get("local." + c.code);
          if (!d) continue;
          me = Profile.get().id; season = d.circle.season; bets = d.bets || {};
          for (const w of Object.values(d.wagers || {})) if (w.uid === me) mine[w.bet] = w;
        } else {
          if (!FB.ok || !FB.uid) continue;
          me = FB.uid;
          const cs = await FB.circle(c.code).get();
          if (!cs.exists || cs.data().deleted) continue;
          season = cs.data().season;
          (await FB.sub(c.code, "bets").where("season", "==", season).get()).forEach(x => { bets[x.id] = x.data(); });
          (await FB.sub(c.code, "wagers").where("uid", "==", me).get()).forEach(x => { const w = x.data(); mine[w.bet] = w; });
        }
        for (const [id, b] of Object.entries(bets)) {
          if (b.season !== season || b.status === "settled" || b.status === "void") continue;
          const open = b.status === "open" && b.closesAt > Date.now();
          const w = mine[id];
          // Mises fermées : on ne garde que ce qui attend une action de ma part
          if (!open && !(b.createdBy === me && !b.src)) continue;
          const opt = w && (b.options || []).find(o => o.id === w.opt);
          out.push({
            code: c.code, cname: c.duo ? (c.friendName || c.linkTitle || c.name) : c.name, emoji: c.emoji || "🎯", duo: !!c.duo, id,
            title: b.kind === "match" && b.home ? b.home + " – " + b.away : b.title, closesAt: b.closesAt,
            state: open ? "open" : "todo", amt: w ? w.amt : 0, pick: opt ? opt.label : "",
            answer: open && b.kind === "duel" && !w && b.createdBy !== me,
            waiting: open && b.kind === "duel" && b.createdBy === me,
          });
        }
      } catch (e) { /* cercle injoignable : on garde les autres */ }
    }
    out.sort((x, y) => (x.state === "todo" ? 0 : 1) - (y.state === "todo" ? 0 : 1) || x.closesAt - y.closesAt);
    const changed = JSON.stringify(out) !== JSON.stringify(this.list());
    this.items = out; this.at = Date.now(); this.busy = false;
    Store.set("ov", out);
    if (changed) queueRender();
  },
};

/* À jouer = j'ai quelque chose à faire : miser, répondre à un duel ou saisir un résultat */
const ovTodo = x => x.state === "todo" || x.answer || (!x.amt && !x.waiting);

function openBetsSection() {
  Overview.refresh();
  const all = Overview.list().filter(x => MyCircles.has(x.code) && (x.state === "todo" || x.closesAt > Date.now()));
  if (!all.length) return "";
  const groups = { all, todo: all.filter(ovTodo), duel: all.filter(x => x.duo) };
  const f = S.ovFilter in groups && groups[S.ovFilter].length ? S.ovFilter : "all";
  const list = groups[f], max = S.ovAll ? 50 : 5;
  const seg = (k, l) => groups[k].length || k === "all" ? `<button class="seg ${f === k ? "on" : ""}" data-a="ovFilter" data-v="${k}" aria-pressed="${f === k}">${l}<span class="count">${groups[k].length}</span></button>` : "";
  const status = x => x.state === "todo" ? `<span class="ov-st hot">Résultat à saisir</span>`
    : x.answer ? `<span class="ov-st hot">À toi de répondre</span>`
    : x.amt ? `<span class="ov-st">Ta mise : ${nf(x.amt)}${x.pick && !x.waiting ? ` sur ${esc(x.pick)}` : ""}</span>`
    : `<span class="ov-st hot">À jouer</span>`;
  return `<div class="sec-head"><h2>Paris en cours</h2></div>
    ${groups.todo.length || groups.duel.length ? `<div class="segs ov-segs" role="group" aria-label="Filtrer les paris en cours">${seg("all", "Tous")}${seg("todo", "À jouer")}${seg("duel", "Duels")}</div>` : ""}
    <ul class="ov-list">${list.slice(0, max).map(x => `<li><button class="ov-row" data-a="ovOpen" data-code="${esc(x.code)}" data-id="${esc(x.id)}">
      <span class="ov-main"><span class="ov-tag ${x.duo ? "duel" : ""}">${x.duo ? "🤝 Duel" : esc(x.emoji)} ${x.duo ? (LANG === "en" ? "with" : "avec") : ""} ${esc(x.cname)}</span>
        <b>${esc(x.title)}</b>${status(x)}</span>
      <span class="ov-time">${x.state === "open" ? `${ICON.clock}${countdown(x.closesAt)}` : ""}</span>
    </button></li>`).join("")}</ul>
    ${list.length > max ? `<button class="btn small ghost wide" data-a="ovMore">Tout voir <span class="count">${list.length}</span></button>` : ""}`;
}

function overviewAct(a, d) {
  switch (a) {
    case "ovFilter": S.ovFilter = d.v; S.ovAll = false; return true;
    case "ovMore": S.ovAll = true; return true;
    case "ovOpen": openCircle(d.code); go("bet", { betId: d.id }); return true;
  }
  return false;
}
