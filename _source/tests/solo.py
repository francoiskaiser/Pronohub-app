"""Mode solo : Parcours complet (draft, étapes, boutique, bilan) et Défi du jour, sur un faux ESPN historique."""
import sys, os, time, json, re
from playwright.sync_api import sync_playwright
from common import setup, watch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
PREFIX = os.environ.get("PREFIX", "")
OUT = os.path.join(os.path.dirname(__file__), "shots")
errors = []
FR = re.compile(r"\b(jetons?|Étape|Objectif|Fiches|Boutique|Parcours|Défi du jour|Atout|Acheter|Placer|Retour)\b")


def shot(p, name, w=.4):
    time.sleep(w)
    p.screenshot(path=os.path.join(OUT, PREFIX + name + ".png"))
    if PREFIX:
        for m in set(FR.findall(p.evaluate("document.body.innerText"))):
            errors.append(f"français restant ({name}) : {m}")


def ok(c, msg):
    print(("✓ " if c else "✗ ") + msg)
    if not c:
        errors.append("ÉCHEC : " + msg)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE", device_scale_factor=2, service_workers="block")
    setup(ctx)
    p = ctx.new_page()
    watch(p, errors)
    p.goto(URL)
    p.fill("input[name=name]", "Fanfan"); p.click("form[data-f=profile] button")
    p.wait_for_selector(".tour"); p.click(".sheet [data-a=close] >> nth=-1")
    p.wait_for_selector(".solo-card")
    shot(p, "50-home-solo")
    p.click(".solo-card [data-a=soloRun]")
    p.wait_for_selector("[data-a=draftPick]")
    shot(p, "51-draft")
    p.click("[data-a=draftPick] >> nth=0")
    p.wait_for_selector(".gcard", timeout=20000)
    odds = p.evaluate("Solo.s().run.data.games.map(g => g.odds)")
    ok(len(odds) >= 4, f"étape chargée avec {len(odds)} matchs, cotes {odds[:2]}")
    ok(all(1.05 <= v <= 20 for o in odds for v in o.values()), "cotes plausibles")
    shot(p, "52-stage")

    stages = 0
    for step in range(10):
        run = p.evaluate("(() => { const r = Solo.s().run; return r && {phase: r.phase, stage: r.stage, bank: r.bank} })()")
        if not run or run["phase"] == "end":
            break
        if run["phase"] == "bet":
            # Ticket simple sur le favori du premier match, puis combiné de 2
            fav = p.evaluate("(() => { const g = Solo.s().run.data.games; return g.map(x => Object.entries(x.odds).sort((a,b)=>a[1]-b[1])[0][0]); })()")
            boss = p.evaluate("Solo.s().run.boss")
            if step < 3:
                p.evaluate("Solo.s().run.bank += 400; render()")
            p.click(f".gcard >> nth=0 >> [data-o={fav[0]}]")
            if step == 0:
                shot(p, "53-slip")
            p.click("[data-a=slipFrac][data-v='0.5']") if boss != "allin" else p.click("[data-a=slipFrac][data-v='1']")
            p.click("form[data-f=ticket] button.primary")
            if boss not in ("one", "allin"):
                for gi in (1, 2):
                    if boss == "outsider":
                        break
                    p.click(f".gcard >> nth={gi} >> [data-o={fav[gi]}]")
                if p.locator("form[data-f=ticket]").count():
                    p.click("[data-a=slipFrac][data-v='1']")
                    p.click("form[data-f=ticket] button.primary")
            if step == 0:
                shot(p, "54-tickets")
                p.evaluate("window.scrollTo(0, 0)")
            p.click("[data-a=playStage]")
            if p.locator("[data-a=askYes]").count():
                p.click("[data-a=askYes]")
            p.wait_for_selector(".verdict")
            if step == 0:
                shot(p, "55-reveal", 2.8)
                p.evaluate("window.scrollTo(0, 99999)")
                shot(p, "55b-reveal-bottom", .3)
            stages += 1
            btn = p.locator("[data-a=toShop], [data-a=toEnd]").first
            btn.click()
        elif run["phase"] == "shop":
            # Donner des fiches pour tester l'achat
            p.evaluate("Solo.s().run.fiches += 10; render()")
            p.click("[data-a=shopBuy] >> nth=0")
            if step <= 2:
                shot(p, "56-shop")
            p.click("[data-a=nextStage]")
            p.wait_for_selector(".gcard, .verdict, .end-hero", timeout=20000)
        else:
            p.wait_for_timeout(500)
    if p.locator(".end-hero").count() == 0:
        p.click("[data-a=abandonRun]"); p.click("[data-a=askYes]")
    p.wait_for_selector(".end-hero")
    shot(p, "57-end")
    st = p.evaluate("(() => { const s = Solo.s(); return {rep: s.rep, runs: s.runs, trophies: Object.keys(s.trophies)} })()")
    ok(st["runs"] == 1, f"bilan enregistré : {st}")

    # Hub et défi du jour
    p.click("[data-a=soloHub]")
    p.wait_for_selector(".solo-hub")
    shot(p, "58-hub")
    p.click(".mode-card.daily [data-a=soloDaily]")
    p.wait_for_selector(".solo-daily .gcard", timeout=20000)
    n = p.locator(".solo-daily .gcard").count()
    ok(n >= 3, f"défi du jour : {n} matchs")
    p.click(".solo-daily .gcard:not(.locked) .odd >> nth=0")
    p.click("[data-a=slipFrac][data-v='0.5']")
    p.click("form[data-f=ticket] button.primary")
    shot(p, "59-daily")
    # Résultat simulé : le match joué se termine
    res = p.evaluate("""(() => { const d = Daily.cur(); const t = d.tickets[0]; const g = d.games.find(x => x.id === t.sel[0].g);
      g.c = 1; if (t.sel[0].o === 'h') { g.x = 2; g.y = 0; } else if (t.sel[0].o === 'a') { g.x = 0; g.y = 2; } else { g.x = 1; g.y = 1; }
      Daily.settle(); render(); return { res: t.res, pay: t.pay, bank: d.bank }; })()""")
    ok(res["res"] == "won" and res["bank"] > 100, f"ticket du défi réglé : {res}")
    shot(p, "60-daily-won")

    # Tablette et PC
    p.click("[data-a=back]"); p.click("[data-a=soloNewRun], [data-a=soloRun] >> nth=0")
    p.wait_for_selector(".gcard, [data-a=draftPick]", timeout=20000)
    if p.locator("[data-a=draftPick]").count():
        p.click("[data-a=draftPick] >> nth=0"); p.wait_for_selector(".gcard", timeout=20000)
    p.click(".gcard >> nth=0 >> .odd >> nth=0")
    for w, h, nm in [(1024, 768, "61-run-landscape"), (1440, 900, "62-run-desktop")]:
        p.set_viewport_size({"width": w, "height": h})
        shot(p, nm)
    p.set_viewport_size({"width": 390, "height": 844})
    p.evaluate("Prefs.set({theme:'dark'}); render()")
    shot(p, "63-run-dark")
    b.close()

print("ERREURS:", json.dumps(errors, ensure_ascii=False, indent=1) if errors else "aucune")
