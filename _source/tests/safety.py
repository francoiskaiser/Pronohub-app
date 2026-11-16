"""Signaler un contenu, bloquer un joueur, carte « Protège ton compte »."""
import sys, os, time, json
from playwright.sync_api import sync_playwright
from common import setup, watch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
EN = "/en/" in URL
OUT = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(OUT, exist_ok=True)
errors = []
def ok(c, m):
    print(("✓ " if c else "✗ ") + m)
    if not c: errors.append("ÉCHEC : " + m)
def db(p): return p.evaluate("JSON.parse(localStorage.getItem('__mockdb') || '{}')")
def wait_for(p, fn, t=8):
    end = time.time() + t
    while not fn() and time.time() < end: p.wait_for_timeout(100)
    return fn()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE", device_scale_factor=2, service_workers="block")
    setup(ctx, mockfb=True)
    ctx.route("https://*.workers.dev/**", lambda r: r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"}, body='{"ok":true}'))
    def page(ns, url=URL):
        p = ctx.new_page(); p.add_init_script(f"window.__PH_NS = '{ns}';"); watch(p, errors, ns); p.goto(url); return p
    def onboard(p, name, idx):
        p.wait_for_selector("form[data-f=profile]"); p.fill("input[name=name]", name); p.click(f"label.emo >> nth={idx}"); p.click("form[data-f=profile] button")
        p.wait_for_timeout(300)
        if p.locator(".tour").count(): p.click(".sheet [data-a=close] >> nth=-1")
        p.evaluate("Store.set('tourDone', 1); Push.st.asked = 1")

    A = page("A"); onboard(A, "Fanfan", 2)
    ok(A.locator(".secure-card").count() == 0, "pas de carte « Protège ton compte » sans cercle en ligne")
    A.click("[data-a=newCircle] >> nth=0"); A.fill("input[name=name]", "Les potes"); A.click("form[data-f=newCircle] button.primary")
    A.wait_for_selector(".code-big"); code = A.inner_text(".code-big").strip(); A.click(".sheet [data-a=close] >> nth=-1")
    A.click(".fab"); A.click("[data-kind=yesno]"); A.fill("input[name=title]", "Il neige demain ?"); A.click("form[data-f=newBet] button.primary")
    A.wait_for_selector(".bet-page"); bet = A.evaluate("S.betId")
    B = page("B", URL + "?join=" + code); onboard(B, "Relou", 1)
    B.wait_for_selector("form[data-f=join]"); B.click("form[data-f=join] button.primary"); B.wait_for_selector(".ticket")
    uidA, uidB = A.evaluate("FB.uid"), B.evaluate("FB.uid")
    B.click(".ticket .t-link"); B.fill("form[data-f=comment] input", "Commentaire vraiment pas sympa"); B.press("form[data-f=comment] input", "Enter")
    B.click("[data-a=back]"); B.click(".tabbar [data-v=feed]"); B.fill("form[data-f=comment] input", "Encore un message pénible"); B.press("form[data-f=comment] input", "Enter")

    # A signale le commentaire et bloque son auteur
    A.wait_for_selector(".cmt .report-btn")
    ok(A.locator(".cmt [data-a=delComment]").count() == 1, "le créateur du cercle peut toujours supprimer un commentaire")
    A.click(".cmt .report-btn")
    A.wait_for_selector("form[data-f=report]"); A.wait_for_timeout(600)
    A.screenshot(path=os.path.join(OUT, ("en-" if EN else "") + "80-report.png"))
    A.click("input[name=reason][value=insult]"); A.fill("textarea[name=note]", "Insulte gratuite")
    A.click("form[data-f=report] button.primary")
    wait_for(A, lambda: any(k.startswith("reports/") for k in db(A)))
    rep = [v for k, v in db(A).items() if k.startswith("reports/")]
    ok(len(rep) == 1 and rep[0]["type"] == "comment" and rep[0]["uid"] == uidB and rep[0]["from"] == uidA and rep[0]["reason"] == "insult" and "pas sympa" in rep[0]["text"] and rep[0]["code"] == code, "signalement enregistré avec le contenu concerné")
    A.click(".sheet [data-a=close] >> nth=-1")
    ok(A.locator(".cmt").count() == 0, "commentaire signalé masqué")
    ok(db(A)[f"users/{uidA}"].get("blocked", {}).get(uidB) == "Relou", "auteur bloqué, rangé dans le profil")
    A.click("[data-a=back]"); A.click(".tabbar [data-v=feed]")
    ok(A.locator("text=Encore un message pénible").count() == 0, "messages du joueur bloqué masqués dans le fil")
    ok(A.locator("text=Relou").count() >= 1, "les autres événements du joueur restent visibles")

    # B, non bloqué par lui-même, voit toujours ses messages ; il signale le pari de A
    B.bring_to_front(); B.click(".tabbar [data-v=rank]"); B.click(".tabbar [data-v=feed]"); B.wait_for_timeout(300)
    ok(B.locator("text=Encore un message pénible").count() >= 1, "le joueur bloqué ne voit aucune différence")
    B.click(".tabbar [data-v=bets]"); B.click(".ticket .t-link"); B.wait_for_selector("[data-a=report][data-type=bet]")
    B.click("[data-a=report][data-type=bet]"); B.wait_for_selector("form[data-f=report]")
    B.click("input[name=block]"); B.click("form[data-f=report] button.primary")
    wait_for(B, lambda: len([k for k in db(B) if k.startswith("reports/")]) == 2)
    ok(any(v["type"] == "bet" and v["target"] == bet for k, v in db(B).items() if k.startswith("reports/")), "un pari peut être signalé")
    ok(not db(B).get(f"users/{uidB}", {}).get("blocked"), "signaler sans bloquer est possible")
    B.click(".sheet [data-a=close] >> nth=-1")

    # Réglages : débloquer
    A.bring_to_front()
    A.click("[data-a=settings] >> nth=0"); A.wait_for_selector(".blocked-list")
    A.click(".blocked-list [data-a=unblock]")
    wait_for(A, lambda: not db(A)[f"users/{uidA}"].get("blocked"))
    ok(not db(A)[f"users/{uidA}"].get("blocked") and A.locator(".blocked-list").count() == 0, "joueur débloqué depuis les Réglages")
    A.click("[data-a=back]"); A.click(".tabbar [data-v=feed]")
    ok(A.locator("text=Encore un message pénible").count() >= 1, "ses messages réapparaissent")

    # Fiche d'un joueur : bloquer
    A.click(".tabbar [data-v=rank]"); A.click(f"[data-a=player][data-uid='{uidB}']"); A.wait_for_selector(".safety-row")
    A.click(".safety-row [data-a=block]"); A.click(".sheet button.danger, .sheet button.primary")
    wait_for(A, lambda: db(A)[f"users/{uidA}"].get("blocked", {}).get(uidB))
    ok(db(A)[f"users/{uidA}"].get("blocked", {}).get(uidB) == "Relou", "blocage depuis la fiche du joueur")

    # Carte « Protège ton compte » pour un joueur anonyme, jusqu'à la création du compte
    A.click("[data-a=back]"); A.click(".circle-btn"); A.click(".sheet [data-a=home]")
    A.wait_for_selector(".secure-card")
    A.screenshot(path=os.path.join(OUT, ("en-" if EN else "") + "81-secure.png"))
    A.click(".secure-card [data-a=account]"); A.click("[data-a=accGoogle]")
    wait_for(A, lambda: A.evaluate("FB.provider()") == "google")
    A.wait_for_timeout(300)
    ok(A.locator(".secure-card").count() == 0, "la carte disparaît une fois le compte créé")
    b.close()

print("ERREURS:", json.dumps(errors, ensure_ascii=False, indent=1) if errors else "aucune")
sys.exit(1 if errors else 0)
