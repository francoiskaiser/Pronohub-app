"""Parcours en ligne avec le faux Firebase : deux joueurs, cercle par code, import de matchs,
mises, duel, contestation, règlement automatique, comptes, nouvelle saison."""
import sys, os, time, json
from playwright.sync_api import sync_playwright
from common import setup, watch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
OUT = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(OUT, exist_ok=True)
errors = []
espn = {"mode": "fixtures"}

def espn_body():
    from common import fixtures_json
    j = fixtures_json()
    if espn["mode"] == "final":
        for e in j["events"]:
            if e["id"] == "9001":
                e["status"]["type"] = {"state": "post", "completed": True, "name": "STATUS_FULL_TIME"}
                e["competitions"][0]["competitors"][0]["score"] = "3"
                e["competitions"][0]["competitors"][1]["score"] = "1"
    return j

def shot(p, name, wait=.35):
    time.sleep(wait)
    p.screenshot(path=os.path.join(OUT, name + ".png"))

def new_page(ctx, ns, url=URL):
    p = ctx.new_page()
    p.add_init_script(f"window.__PH_NS = '{ns}';")
    watch(p, errors, ns)
    p.goto(url)
    return p

def onboard(p, name, avatar_idx):
    p.wait_for_selector("form[data-f=profile]")
    p.fill("input[name=name]", name)
    p.click(f"label.emo >> nth={avatar_idx}")
    p.click("form[data-f=profile] button")

def ok(cond, msg):
    if not cond:
        errors.append("ÉCHEC : " + msg)
    print(("✓ " if cond else "✗ ") + msg)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE", device_scale_factor=2, service_workers="block")
    setup(ctx, mockfb=True, espn_result=espn_body)

    # --- Joueur A crée un cercle en ligne
    A = new_page(ctx, "A")
    onboard(A, "Fanfan", 2)
    A.wait_for_selector(".tour"); A.click(".sheet [data-a=close] >> nth=-1")
    A.click("[data-a=newCircle] >> nth=0")
    A.fill("input[name=name]", "Les potes du foot")
    A.click("label.emo:has-text('⚽')")
    ok(A.locator("input[name=where][value=online]").is_checked(), "En ligne proposé par défaut")
    A.click("form[data-f=newCircle] button.primary")
    A.wait_for_selector(".code-big")
    code = A.inner_text(".code-big").strip()
    ok(len(code) == 7 and code[3] == "-", f"code de cercle lisible : {code}")
    shot(A, "20-invite")
    A.click(".sheet [data-a=close] >> nth=-1")

    # Pari oui/non
    A.click(".fab"); A.click("[data-kind=yesno]")
    A.fill("input[name=title]", "Il va neiger à Ouffet avant Noël ?")
    A.click("form[data-f=newBet] button.primary")
    A.wait_for_selector(".bet-page")
    A.click(".opt.can >> nth=0"); A.fill("form[data-f=wager] input[name=amt]", "200")
    A.click("form[data-f=wager] button.primary")
    A.click("[data-a=back]")

    # Import de matchs
    A.click(".fab"); A.click("[data-kind=import]")
    A.wait_for_selector(".fixtures")
    shot(A, "21-import")
    A.click(".fx >> nth=0"); A.click(".fx >> nth=1")
    A.click("form[data-f=import] button.primary")
    A.wait_for_selector(".ticket >> nth=2")
    ok(A.locator(".ticket").count() == 3, "2 matchs importés + 1 pari")
    shot(A, "22-bets-online")

    # --- Joueur B rejoint par le lien
    B = new_page(ctx, "B", URL + "?join=" + code)
    onboard(B, "Julie", 1)
    B.wait_for_selector("form[data-f=join]")
    ok(B.input_value("input[name=code]") == code, "code prérempli depuis le lien")
    B.click("form[data-f=join] button.primary")
    B.wait_for_selector(".ticket")
    ok(B.locator(".ticket").count() == 3, "B voit les 3 paris")
    # B mise sur Non et sur un match avec score
    B.click(".ticket:has-text('neiger') .t-link")
    B.click(".opt.can >> nth=1"); B.fill("form[data-f=wager] input[name=amt]", "300")
    B.click("form[data-f=wager] button.primary")
    B.click("[data-a=back]")
    B.click(".ticket:has-text('Club Brugge') .t-link")
    B.click(".opt.can >> nth=0"); B.fill("form[data-f=wager] input[name=amt]", "100")
    B.fill("input[name=sh]", "3"); B.fill("input[name=sa]", "1")
    shot(B, "23-wager-score")
    B.click("form[data-f=wager] button.primary")
    B.fill("form[data-f=comment] input", "Bruges va les écraser")
    B.press("form[data-f=comment] input", "Enter")
    B.click("[data-a=back]")

    # --- A voit B en direct et lance un duel
    A.bring_to_front()
    A.click(".tabbar [data-v=rank]")
    A.wait_for_selector(".ranking li >> nth=1")
    ok(A.locator(".ranking li").count() == 2, "A voit B dans le classement en direct")
    A.click(".tabbar [data-v=bets]")
    A.click(".fab"); A.click("[data-kind=duel]")
    A.fill("input[name=title]", "Le Standard finit devant Genk")
    A.fill("input[name=stake]", "150")
    A.click("form[data-f=newBet] button.primary")
    A.wait_for_selector(".bet-page")
    shot(A, "24-duel-wait")
    A.click("[data-a=back]")

    B.bring_to_front()
    B.wait_for_selector(".ticket:has-text('Genk')")
    B.click(".ticket:has-text('Standard finit') .t-link")
    B.wait_for_selector("[data-a=duelAccept]")
    shot(B, "25-duel-accept")
    B.click("[data-a=duelAccept]")
    B.wait_for_selector(".bettors li >> nth=1")
    B.click("[data-a=back]")

    # --- A règle le oui/non (Oui), B conteste
    A.bring_to_front()
    A.click(".ticket:has-text('neiger') .t-link")
    A.click("[data-a=settle]"); A.click(".choice >> nth=0"); A.click("form[data-f=settle] button.primary")
    A.wait_for_selector(".banner.good")
    B.bring_to_front()
    B.click(".ticket:has-text('neiger') .t-link") if B.locator(".ticket:has-text('neiger')").count() else None
    if not B.locator(".bet-page").count():
        B.click("[data-a=filter][data-v=done]"); B.click(".ticket:has-text('neiger') .t-link")
    B.wait_for_selector("[data-a=flag]")
    B.click("[data-a=flag]")
    B.wait_for_selector(".banner.bad")
    ok(B.locator(".banner.bad").count() == 1, "contestation majoritaire : gains gelés")
    shot(B, "26-contested")
    # A corrige : Non
    A.bring_to_front()
    A.wait_for_selector(".banner.bad")
    A.click("[data-a=settle] >> nth=0"); A.click(".choice >> nth=1"); A.click("form[data-f=settle] button.primary")
    A.wait_for_selector(".banner.good")
    ok("Non" in A.inner_text(".banner.good"), "résultat corrigé, contestation levée")
    A.click("[data-a=back]")

    # --- Règlement automatique du match Bruges (on avance la clôture dans le passé)
    A.evaluate("""() => { const cc = DB.cur(); const id = Object.keys(cc.bets).find(k => cc.bets[k].src && cc.bets[k].src.event === '9001');
        return DB.put('bets', id, { closesAt: Date.now() - 3 * 3600000 }, true); }""")
    espn["mode"] = "final"
    A.evaluate("Sports.tried = {}; Sports.autoSettle()")
    time.sleep(1)
    st = A.evaluate("""() => { const cc = DB.cur(); const b = Object.values(cc.bets).find(b => b.src && b.src.event === '9001'); return [b.status, b.result, b.score]; }""")
    ok(st[0] == "settled" and st[1] == "h" and st[2] == {"h": 3, "a": 1}, f"match réglé automatiquement : {st}")
    B.bring_to_front()
    B.click(".tabbar [data-v=me]")
    B.wait_for_selector(".badge.got:has-text('Score exact')")
    ok(True, "badge Score exact attribué à B")
    shot(B, "27-me-online")
    B.click(".tabbar [data-v=feed]")
    shot(B, "28-feed-online")

    # --- Comptes : A lie Google, B crée un compte e-mail
    A.bring_to_front()
    A.click("[data-a=settings] >> nth=0"); A.click("[data-a=account]")
    shot(A, "29-account-anon")
    A.click("[data-a=accGoogle]")
    A.wait_for_selector(".toast.show")
    ok(A.evaluate("FB.provider()") == "google", "compte Google lié sans perdre l'identité")
    B.bring_to_front()
    B.click(".tabbar [data-v=me]"); B.click("[data-a=settings] >> nth=0"); B.click("[data-a=account]")
    B.click("[data-a=accMode][data-mode=email]")
    B.fill("input[name=email]", "julie@example.test"); B.fill("input[name=pass]", "secret123")
    B.click("form[data-f=email] button.primary")
    B.wait_for_selector(".toast.show")
    ok(B.evaluate("FB.provider()") == "password", "compte e-mail créé")

    # --- Un nouvel appareil (C) se connecte avec le compte de B et retrouve le cercle
    C = new_page(ctx, "C")
    onboard(C, "Julie (tablette)", 1)
    C.click(".sheet [data-a=close] >> nth=-1") if C.locator(".tour").count() else None
    C.click("[data-a=settings] >> nth=0") if C.locator("[data-a=settings]").count() else None
    C.goto(URL)
    C.wait_for_selector(".home, .ticket")
    C.evaluate("S.modal = {k:'account', mode:'login'}; render()")
    C.fill("input[name=email]", "julie@example.test"); C.fill("input[name=pass]", "secret123")
    C.click("form[data-f=email] button.primary")
    time.sleep(1.2)
    C.evaluate("render()")
    ok(C.evaluate(f"MyCircles.has('{code}')"), "le cercle suit le compte sur un autre appareil")
    C.click(f"[data-code='{code}']") if C.locator(f"[data-code='{code}']").count() else None
    time.sleep(.8)
    bal_c = C.evaluate("(() => { const a = analysis(); return a ? a.players[FB.uid].bal : null })()")
    bal_b = B.evaluate("(() => { const a = analysis(); return a ? a.players[FB.uid].bal : null })()")
    ok(bal_c == bal_b and bal_c is not None, f"même solde sur les deux appareils ({bal_b} / {bal_c})")
    C.close()

    # --- Nouvelle saison
    A.bring_to_front()
    A.click("[data-a=back]") if A.locator("[data-a=back]").count() else None
    A.click(".tabbar [data-v=rank]")
    A.click("[data-a=circleInfo]")
    A.click("[data-a=newSeason]")
    A.click("[data-a=askYes]")
    A.wait_for_selector(".honours")
    ok(A.locator(".honours li").count() == 1, "saison archivée dans le palmarès")
    time.sleep(1)
    bals = A.evaluate("analysis().standings.map(s => s.bal)")
    ok(all(x == 1000 for x in bals), f"tout le monde repart à 1000 : {bals}")
    shot(A, "30-new-season")

    # --- B retiré du cercle : écran clair
    A.click("[data-a=circleInfo]")
    A.click("[data-a=kick] >> nth=0")
    shot(A, "35-ask")
    A.click("[data-a=askYes]")
    B.bring_to_front()
    B.keyboard.press("Escape")
    B.click("[data-a=back]") if B.locator("[data-a=back]").count() else None
    B.wait_for_selector("text=Tu ne fais pas partie de ce cercle", timeout=5000)
    shot(B, "31-notmember")

    # --- Cercle introuvable
    B.evaluate("MyCircles.add({code:'ZZZ-999', name:'Fantôme', local:false}); openCircle('ZZZ-999')")
    B.wait_for_selector("text=Cercle introuvable")
    ok(True, "cercle introuvable : état clair")

    # Mises en page tablette / PC en ligne
    A.bring_to_front(); A.keyboard.press("Escape")
    for w, h, n in [(768, 1024, "32-online-tablet"), (1024, 768, "33-online-landscape"), (1440, 900, "34-online-desktop")]:
        A.set_viewport_size({"width": w, "height": h})
        A.click("[data-v=bets] >> visible=true")
        shot(A, n)
        # Bouton retour du téléphone : ferme la fenêtre, puis revient à l'écran précédent
    A.set_viewport_size({"width": 390, "height": 844})
    A.click(".tabbar [data-v=bets]")
    A.click(".fab"); A.click("[data-kind=yesno]")
    A.fill("input[name=title]", "Test retour ?"); A.click("form[data-f=newBet] button.primary")
    A.wait_for_selector(".bet-page"); A.go_back(); A.wait_for_selector(".tickets")
    A.click(".ticket .t-link >> nth=0"); A.wait_for_selector(".bet-page")
    A.go_back(); A.wait_for_selector(".tickets")
    ok(A.evaluate("S.view") == "circle", "retour : détail du pari → liste des paris")
    A.click(".tabbar [data-v=rank]"); A.click(".tabbar [data-v=feed]")
    A.click(".circle-btn")
    ok(A.locator("#overlay:not([hidden])").count() == 1, "fenêtre ouverte")
    A.go_back(); time.sleep(.3)
    ok(A.locator("#overlay[hidden]").count() == 1 and A.evaluate("S.tab") == "feed", "retour : ferme la fenêtre sans changer d'écran")
    A.go_back(); time.sleep(.3)
    ok(A.evaluate("S.tab") == "bets", "retour : onglet Fil → Paris")
    for _ in range(12):
        if A.evaluate("S.view") == "home": break
        A.go_back(); time.sleep(.3)
    ok(A.evaluate("S.view") == "home" and A.locator(".home").count() == 1, "retour : on finit par revenir à l'accueil")

    # Suppression du cercle par son créateur
    A.click(f"[data-code='{code}']")
    A.wait_for_selector(".top")
    A.evaluate("S.modal = {k:'circle'}; render()")
    A.click("[data-a=deleteCircle]")
    shot(A, "36-delete-ask")
    A.click("[data-a=askYes]")
    A.wait_for_selector(".home")
    time.sleep(1)
    left = A.evaluate(f"Object.keys(JSON.parse(localStorage.getItem('__mockdb'))).filter(k => k.startsWith('circles/{code}/'))")
    ok(not A.evaluate(f"MyCircles.has('{code}')"), "cercle retiré de la liste du créateur")
    ok(all(k.split('/')[2] in ('ledger', 'flags', 'reacts', 'claims') for k in left), f"contenu effacé (reste : {sorted(set(k.split('/')[2] for k in left))})")
    B.bring_to_front()
    B.evaluate(f"MyCircles.add({{code:'{code}', name:'x', local:false}}); openCircle('{code}')")
    B.wait_for_selector("text=Cercle supprimé")
    ok(not B.evaluate(f"MyCircles.has('{code}')"), "chez un ancien membre : « Cercle supprimé » et retiré de sa liste")
    b.close()

print("ERREURS:", json.dumps(errors, ensure_ascii=False, indent=1) if errors else "aucune")
