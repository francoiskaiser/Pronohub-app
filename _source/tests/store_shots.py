"""Captures d'écran pour la fiche Play Store (1080 x 1920) : un cercle animé entre quatre amis.
Usage : python3 store_shots.py [URL]   (URL /en/ pour la version anglaise)"""
import sys, os, time
from playwright.sync_api import sync_playwright
from common import setup, watch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
EN = "/en/" in URL
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "store", "en" if EN else "fr")
os.makedirs(OUT, exist_ok=True)
errors = []
T = (lambda fr, en: en) if EN else (lambda fr, en: fr)

def shot(p, name):
    p.wait_for_timeout(500)
    p.evaluate("window.scrollTo(0,0); document.querySelectorAll('.toast').forEach(e => e.remove())")
    p.screenshot(path=os.path.join(OUT, name + ".png"))
    print("📸", name)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 640}, device_scale_factor=3,
                        locale="en-GB" if EN else "fr-BE", service_workers="block")
    setup(ctx, mockfb=True)
    ctx.route("https://*.workers.dev/**", lambda r: r.fulfill(status=200, content_type="application/json",
              headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"}, body='{"ok":true}'))

    def page(ns, url=URL):
        p = ctx.new_page()
        p.add_init_script(f"window.__PH_NS = '{ns}';")
        watch(p, errors, ns)
        p.goto(url)
        return p

    def onboard(p, name, idx):
        p.wait_for_selector("form[data-f=profile]")
        p.fill("input[name=name]", name)
        p.click(f"label.emo >> nth={idx}")
        p.click("form[data-f=profile] button")
        p.wait_for_timeout(300)
        if p.locator(".tour").count():
            p.click(".sheet [data-a=close] >> nth=-1")
        p.evaluate("Store.set('tourDone',1); Store.set('native','android'); Store.set('installHide', Date.now()); Push.st.asked = 1")

    def wager(p, title, opt, amt):
        sel = f".ticket:has(.match) >> nth={title[1:]}" if title.startswith("#") else f".ticket:has-text(\"{title}\")"
        p.locator(sel).locator(".t-link").click()
        p.click(f".opt.can >> nth={opt}")
        p.fill("form[data-f=wager] input[name=amt]", str(amt))
        p.click("form[data-f=wager] button.primary")
        p.wait_for_timeout(250)

    def back(p):
        p.click("[data-a=back]"); p.wait_for_timeout(200)

    def comment(p, txt):
        p.fill("form[data-f=comment] input", txt)
        p.press("form[data-f=comment] input", "Enter")
        p.wait_for_timeout(200)

    SNOW = T("Il neige à Liège avant Noël ?", "Snow in Liège before Christmas?")
    LATE = T("Tom arrive à l'heure jeudi ?", "Tom shows up on time on Thursday?")

    A = page("A"); onboard(A, "Léa", 4)
    A.click("[data-a=newCircle] >> nth=0")
    A.fill("input[name=name]", T("Les potes du jeudi", "Thursday crew"))
    A.click("label.emo:has-text('⚽')")
    A.click("form[data-f=newCircle] button.primary")
    A.wait_for_selector(".code-big"); code = A.inner_text(".code-big").strip()
    A.click(".sheet [data-a=close] >> nth=-1")

    # Paris : deux questions maison et deux matchs importés
    for title in (LATE, SNOW):
        A.click(".fab"); A.click("[data-kind=yesno]")
        A.fill("input[name=title]", title)
        A.click("form[data-f=newBet] button.primary"); A.wait_for_selector(".bet-page")
        back(A)
    A.click(".fab"); A.click("[data-kind=import]")
    A.wait_for_selector(".fx"); A.click(".fx >> nth=0"); A.click(".fx >> nth=1")
    A.click("form[data-f=import] button.primary"); A.wait_for_selector(".ticket >> nth=3")

    wager(A, LATE, 1, 200); back(A)
    wager(A, SNOW, 0, 150); back(A)
    wager(A, "#0", 0, 300); back(A)

    friends = [("B", "Tom", 1), ("C", "Nico", 2), ("D", "Sarah", 3)]
    pages = {}
    for ns, name, idx in friends:
        p = page(ns, URL + "?join=" + code); onboard(p, name, idx)
        p.wait_for_selector("form[data-f=join]"); p.click("form[data-f=join] button.primary")
        p.wait_for_selector(".ticket")
        pages[ns] = p

    B, C, D = pages["B"], pages["C"], pages["D"]
    wager(B, LATE, 0, 400); comment(B, T("Je serai là à 19 h pile, promis", "I'll be there at 7 sharp, promise")); back(B)
    wager(B, "#0", 1, 250); comment(B, T("Mechelen va les surprendre", "Mechelen will surprise them")); back(B)
    wager(C, LATE, 1, 300); comment(C, T("On parle bien de Tom ?", "Are we talking about Tom?")); back(C)
    wager(C, "#0", 0, 200); back(C)
    wager(C, SNOW, 1, 100); back(C)
    wager(D, LATE, 1, 250); back(D)
    wager(D, "#0", 2, 150); back(D)
    wager(D, SNOW, 0, 200); back(D)
    wager(D, "#1", 0, 120); back(D)

    # Tom est arrivé en retard : Léa règle le pari
    A.bring_to_front()
    A.wait_for_timeout(600)
    A.click(f".ticket:has-text(\"{LATE}\") .t-link")
    A.click("[data-a=settle]"); A.click(".choice >> nth=1"); A.click("form[data-f=settle] button.primary")
    A.wait_for_timeout(500); back(A)

    # Léa et Tom deviennent amis
    B.bring_to_front()
    B.click(".tabbar [data-v=rank]")
    uidA = A.evaluate("FB.uid")
    B.click(f"[data-a=player][data-uid='{uidA}']"); B.wait_for_selector("[data-a=friendAdd]"); B.click("[data-a=friendAdd]")
    B.wait_for_timeout(400)
    A.bring_to_front()
    A.click(".circle-btn"); A.click(".sheet [data-a=home]")
    A.wait_for_selector("[data-a=friendAccept]"); A.click("[data-a=friendAccept]")
    A.wait_for_selector(".friend-row")
    shot(A, "1-accueil")

    A.click(f"[data-code='{code}']"); A.wait_for_selector(".ticket")
    A.click(".tabbar [data-v=bets]")
    shot(A, "2-paris")

    A.locator(".ticket:has(.match) >> nth=0").locator(".t-link").click(); A.wait_for_selector(".bet-page")
    shot(A, "3-match")
    back(A)

    A.click(".tabbar [data-v=rank]"); A.wait_for_selector(".ranking li >> nth=3")
    shot(A, "4-classement")

    A.click(".tabbar [data-v=bets]"); A.click(".fab"); A.wait_for_selector("[data-kind=yesno]")
    shot(A, "5-nouveau-pari")
    A.click(".sheet [data-a=close] >> nth=-1") if A.locator(".sheet [data-a=close]").count() else None

    b.close()

print("\n".join(errors) if errors else "OK, captures dans " + OUT)
sys.exit(1 if errors else 0)
