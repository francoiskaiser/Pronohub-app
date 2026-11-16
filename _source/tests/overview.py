"""« Paris en cours » sur l'accueil : cercles et duels réunis, filtres, ouverture d'un pari."""
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
        p.evaluate("Store.set('tourDone', 1); Push.st.asked = 1; Store.set('secureHide', Date.now()); Store.set('installHide', Date.now())")
    def home(p):
        p.click(".circle-btn"); p.click(".sheet [data-a=home]"); p.wait_for_timeout(300)

    A = page("A"); onboard(A, "Fanfan", 2)
    ok(A.locator(".ov-list").count() == 0, "pas de section sans pari en cours")
    A.click("[data-a=newCircle] >> nth=0"); A.fill("input[name=name]", "Les potes"); A.click("form[data-f=newCircle] button.primary")
    A.wait_for_selector(".code-big"); code = A.inner_text(".code-big").strip(); A.click(".sheet [data-a=close] >> nth=-1")
    for t in ("Il neige demain ?", "Julie oublie son badge ?"):
        A.click(".fab"); A.click("[data-kind=yesno]"); A.fill("input[name=title]", t); A.click("form[data-f=newBet] button.primary"); A.wait_for_selector(".bet-page")
        if "neige" in t:
            A.click(".opt.can >> nth=0"); A.fill("form[data-f=wager] input[name=amt]", "120"); A.click("form[data-f=wager] button.primary"); A.wait_for_timeout(300)
        A.click("[data-a=back]")
    B = page("B", URL + "?join=" + code); onboard(B, "Julie", 1)
    B.wait_for_selector("form[data-f=join]"); B.click("form[data-f=join] button.primary"); B.wait_for_selector(".ticket")
    uidA = A.evaluate("FB.uid")
    B.click(".tabbar [data-v=rank]"); B.click(f"[data-a=player][data-uid='{uidA}']"); B.click("[data-a=friendAdd]"); B.wait_for_timeout(400)
    A.bring_to_front(); home(A)
    A.wait_for_selector("[data-a=friendAccept]"); A.click("[data-a=friendAccept]"); A.wait_for_selector("[data-a=challenge]")
    A.click("[data-a=challenge]"); A.click("[data-kind=duel]"); A.fill("input[name=title]", "Le Standard gagne le derby"); A.fill("input[name=stake]", "200")
    A.click("form[data-f=newBet] button.primary"); A.wait_for_selector(".bet-page")
    duo, duel = A.evaluate("S.code"), A.evaluate("S.betId")
    home(A)
    A.wait_for_selector(".ov-row >> nth=2")
    rows = A.locator(".ov-row").all_inner_texts()
    ok(len(rows) == 3, f"trois paris en cours réunis sur l'accueil ({len(rows)})")
    ok(any("Duel" in r and "Julie" in r and "Standard" in r for r in rows), "le duel porte l'étiquette « Duel avec Julie »")
    ok(any("neige" in r and "120" in r for r in rows), "ma mise est rappelée")
    ok(any("badge" in r and ("À jouer" in r or "To play" in r) for r in rows), "un pari sans mise est marqué « À jouer »")
    A.wait_for_timeout(500)
    A.screenshot(path=os.path.join(OUT, ("en-" if EN else "") + "90-overview.png"))
    A.click("[data-a=ovFilter][data-v=duel]")
    ok(A.locator(".ov-row").count() == 1 and "Standard" in A.inner_text(".ov-row"), "filtre Duels")
    A.click("[data-a=ovFilter][data-v=todo]")
    ok(A.locator(".ov-row").count() == 1 and "badge" in A.inner_text(".ov-row"), "filtre À jouer")
    A.click(".ov-row"); A.wait_for_selector(".bet-page")
    ok(A.evaluate("S.code") == code and "badge" in A.inner_text(".bet-title"), "toucher une ligne ouvre le pari dans son cercle")

    # Chez Julie : le duel attend sa réponse
    B.bring_to_front(); home(B)
    wait_for(B, lambda: B.evaluate(f"MyCircles.has('{duo}')"))
    B.evaluate("Overview.stale(); render()")
    B.wait_for_selector(".ov-row >> nth=2")
    txt = " | ".join(B.locator(".ov-row").all_inner_texts())
    ok(("À toi de répondre" in txt or "Your turn" in txt) and "Standard" in txt, "le duel reçu demande une réponse")
    B.click(".ov-row:has-text('Standard')"); B.wait_for_selector("[data-a=duelAccept]")
    ok(B.evaluate("S.code") == duo, "le duel s'ouvre depuis l'accueil")
    b.close()
print("ERREURS:", json.dumps(errors, ensure_ascii=False, indent=1) if errors else "aucune")
sys.exit(1 if errors else 0)
