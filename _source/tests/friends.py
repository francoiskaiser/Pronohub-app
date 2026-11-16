"""Amis, face-à-face, invitations dans un cercle, défis par lien, échéances et appels au relais.
Faux Firebase partagé entre les onglets ; relais intercepté."""
import sys, os, time, json, re
from playwright.sync_api import sync_playwright
from common import setup, watch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
EN = "/en/" in URL
OUT = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(OUT, exist_ok=True)
errors, calls = [], []

def shot(p, name, wait=.35):
    time.sleep(wait)
    p.screenshot(path=os.path.join(OUT, ("en-" if EN else "") + name + ".png"))

def ok(cond, msg):
    if not cond: errors.append("ÉCHEC : " + msg)
    print(("✓ " if cond else "✗ ") + msg)

def db(p):
    return p.evaluate("JSON.parse(localStorage.getItem('__mockdb') || '{}')")

def types():
    return [c["body"].get("type") for c in calls]

def wait_for(p, fn, t=8):
    end = time.time() + t
    while not fn() and time.time() < end:
        p.wait_for_timeout(100)
    return fn()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE", device_scale_factor=2, service_workers="block")
    setup(ctx, mockfb=True)
    def relay(route):
        r = route.request
        if r.method == "OPTIONS":
            return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST"})
        calls.append({"body": json.loads(r.post_data or "{}")})
        return route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body='{"ok":true,"sent":1}')
    ctx.route("https://*.workers.dev/**", relay)

    def page(ns, url=URL):
        p = ctx.new_page()
        p.add_init_script(f"window.__PH_NS = '{ns}';")
        watch(p, errors, ns)
        p.goto(url)
        return p

    def onboard(p, name, idx, tour=True):
        p.wait_for_selector("form[data-f=profile]")
        p.fill("input[name=name]", name)
        p.click(f"label.emo >> nth={idx}")
        p.click("form[data-f=profile] button")
        if tour:
            p.wait_for_selector(".tour"); p.click(".sheet [data-a=close] >> nth=-1")
        else:
            p.evaluate("Store.set('tourDone', 1)")

    # A crée un cercle, B le rejoint
    A = page("A"); onboard(A, "Fanfan", 2)
    A.click("[data-a=newCircle] >> nth=0"); A.fill("input[name=name]", "Les potes"); A.click("form[data-f=newCircle] button.primary")
    A.wait_for_selector(".code-big"); code = A.inner_text(".code-big").strip(); A.click(".sheet [data-a=close] >> nth=-1")
    uidA = A.evaluate("FB.uid")
    B = page("B", URL + "?join=" + code); onboard(B, "Julie", 1, tour=False)
    B.wait_for_selector("form[data-f=join]"); B.click("form[data-f=join] button.primary"); B.wait_for_selector(".tabbar")
    uidB = B.evaluate("FB.uid")
    wait_for(B, lambda: "member" in types())
    ok({"type": "member", "code": code} in [c["body"] for c in calls], "relais : nouveau membre annoncé")

    # B ajoute A en ami depuis sa fiche
    B.click(".tabbar [data-v=rank]"); B.click(f"[data-a=player][data-uid='{uidA}']")
    B.wait_for_selector("[data-a=friendAdd]")
    B.click("[data-a=friendAdd]")
    B.wait_for_selector("text=" + ("Request sent" if EN else "Demande envoyée"))
    pair = "_".join(sorted([uidA, uidB]))
    f = db(B).get("friends/" + pair, {})
    ok(f.get("status") == "pending" and f.get("from") == uidB, "demande d'ami enregistrée")
    wait_for(B, lambda: "friend" in types())
    ok({"type": "friend", "to": uidA} in [c["body"] for c in calls], "relais : demande d'ami")

    # A voit la demande sur l'accueil et accepte
    A.click(".circle-btn"); A.click(".sheet [data-a=home]")
    A.wait_for_selector("[data-a=friendAccept]")
    shot(A, "60-friends-request")
    calls.clear()
    A.click("[data-a=friendAccept]")
    A.wait_for_selector("[data-a=challenge]")
    ok(db(A)["friends/" + pair]["status"] == "ok", "amitié acceptée")
    wait_for(A, lambda: "friend" in types())
    ok({"type": "friend", "to": uidB} in [c["body"] for c in calls], "relais : demande acceptée")

    # A défie B en face-à-face
    calls.clear()
    A.click("[data-a=challenge]")
    A.wait_for_selector("[data-kind=duel]")
    ok(A.locator("[data-kind=import]").count() == 1 and A.locator("[data-kind=multi]").count() == 1, "face-à-face : tous les types de paris proposés")
    A.click("[data-kind=duel]")
    A.wait_for_selector("form[data-f=newBet]")
    shot(A, "61-duel-form")
    A.fill("input[name=title]", "Le Standard gagne le derby")
    A.fill("input[name=stake]", "200")
    A.click("form[data-f=newBet] button.primary")
    A.wait_for_selector(".bet-page")
    duo, duel = A.evaluate("S.code"), A.evaluate("S.betId")
    d = db(A)
    ok(d[f"circles/{duo}"].get("duo") is True and d[f"circles/{duo}"].get("guest") == uidB and d[f"circles/{duo}"].get("daily") == 0, "face-à-face créé (cercle privé à deux)")
    ok(d[f"circles/{duo}/bets/{duel}"]["duel"] == {"to": uidB, "stake": 200}, "défi adressé à B")
    ok(d["friends/" + pair].get("duo") == duo, "face-à-face lié à l'amitié")
    ok(f"deadlines/{duo}_{duel}" in d, "échéance du défi enregistrée pour les rappels")
    wait_for(A, lambda: "bet" in types())
    ok({"type": "bet", "code": duo, "bets": [duel]} in [c["body"] for c in calls], "relais : défi annoncé")
    ok(A.locator(".top .cb-name").inner_text().startswith("Fanfan vs Julie"), "nom du face-à-face")
    ok(A.locator(".top [data-a=switcher]").count() == 1 and A.locator(".strip-head").count() == 0, "page du défi ouverte dans le face-à-face")
    shot(A, "62-duel-sent")

    # B reçoit le face-à-face automatiquement et relève le défi
    B.click(".circle-btn"); B.click(".sheet [data-a=home]")
    wait_for(B, lambda: B.evaluate(f"MyCircles.has('{duo}')"))
    ok(B.evaluate(f"MyCircles.has('{duo}')"), "B a rejoint le face-à-face automatiquement")
    ok(B.locator(f".circle-list [data-code='{duo}']").count() == 0, "le face-à-face n'encombre pas « Mes cercles »")
    B.goto(URL + f"?c={duo}&b={duel}")
    B.wait_for_selector("[data-a=duelAccept]")
    shot(B, "63-duel-received")
    calls.clear()
    B.click("[data-a=duelAccept]")
    wait_for(B, lambda: "accept" in types())
    ok({"type": "accept", "code": duo, "bets": [duel]} in [c["body"] for c in calls], "relais : défi relevé")

    # A désigne le gagnant
    A.wait_for_selector("[data-a=settle]")
    calls.clear()
    A.click("[data-a=settle]"); A.click(".choice >> nth=0"); A.click("form[data-f=settle] button.primary")
    wait_for(A, lambda: "settle" in types())
    ok({"type": "settle", "code": duo, "bets": [duel]} in [c["body"] for c in calls], "relais : résultat du défi")
    A.wait_for_timeout(400)
    ok(f"deadlines/{duo}_{duel}" not in db(A), "échéance retirée une fois réglé")
    A.click(".circle-btn"); A.click(".sheet [data-a=home]")
    A.wait_for_selector(".friend-row")
    txt = A.inner_text(".friend-list")
    ok(re.search(r"(?i)(toi|you) 1.?200, Julie 800", txt) is not None, f"score du face-à-face sur l'accueil ({txt!r})")
    shot(A, "64-friends-home")

    # A invite C par son lien d'ami
    A.click("[data-a=addFriend]")
    A.wait_for_selector(".share-row a.wa")
    shot(A, "65-add-friend")
    wa = A.get_attribute(".share-row a.wa", "href")
    link = A.get_attribute(".share-row [data-a=copy]", "data-text")
    ok(wa.startswith("https://wa.me/?text=") and "ami%3D" in wa, "lien WhatsApp prêt")
    ok(A.get_attribute(".share-row a[href^=mailto]", "href").startswith("mailto:?subject="), "lien e-mail prêt")
    ok(A.locator("[data-a=friendAdd]").count() == 0, "pas de suggestion déjà amie")
    A.click(".sheet [data-a=close] >> nth=-1")
    C = page("C", link)
    onboard(C, "Thomas", 3, tour=False)
    C.wait_for_selector("[data-a=linkAccept]")
    shot(C, "66-friend-link")
    calls.clear()
    C.click("[data-a=linkAccept]")
    uidC = C.evaluate("FB.uid")
    pairAC = "_".join(sorted([uidA, uidC]))
    wait_for(C, lambda: db(C).get("friends/" + pairAC, {}).get("status") == "ok")
    ok(db(C).get("friends/" + pairAC, {}).get("status") == "ok", "lien d'ami : amitié directe")
    ok({"type": "friend", "to": uidA} in [c["body"] for c in calls], "relais : nouvel ami prévenu")

    # A invite C dans son cercle
    A.click(f".circle-list [data-code='{code}']")
    A.wait_for_selector(".tabbar")
    A.click(".tabbar [data-v=me]"); A.evaluate("S.modal = {k:'invite'}; render()")
    A.wait_for_selector("form[data-f=inviteFriends]")
    shot(A, "67-invite-friends")
    ok(A.locator("form[data-f=inviteFriends] .pick").count() == 1, "seul Thomas est proposé (Julie est déjà membre)")
    calls.clear()
    A.click("form[data-f=inviteFriends] input[name=uid]"); A.click("form[data-f=inviteFriends] button.primary")
    wait_for(A, lambda: "invite" in types())
    ok({"type": "invite", "code": code, "to": [uidC]} in [c["body"] for c in calls], "relais : invitation dans le cercle")
    ok(f"users/{uidC}/inbox/{code}_{uidA}" in db(A), "invitation déposée chez Thomas")
    C.wait_for_selector("[data-a=inboxJoin]")
    C.click("[data-a=inboxJoin]")
    C.wait_for_selector(".tabbar")
    ok(C.evaluate("S.code") == code and f"users/{uidC}/inbox/{code}_{uidA}" not in db(C), "Thomas a rejoint, invitation retirée")

    # Contestation : B mise, A règle, B conteste
    A.click(".tabbar [data-v=bets]")
    A.click(".fab"); A.click("[data-kind=yesno]"); A.fill("input[name=title]", "Il neige demain ?"); A.click("form[data-f=newBet] button.primary")
    A.wait_for_selector(".bet-page"); bet = A.evaluate("S.betId")
    ok(wait_for(A, lambda: f"deadlines/{code}_{bet}" in db(A)), "échéance d'un pari normal enregistrée")
    B.goto(URL + f"?c={code}&b={bet}"); B.wait_for_selector(".opt.can")
    B.click(".opt.can >> nth=1"); B.fill("form[data-f=wager] input[name=amt]", "50"); B.click("form[data-f=wager] button.primary")
    A.wait_for_timeout(500)
    A.click("[data-a=settle]"); A.click(".choice >> nth=0"); A.click("form[data-f=settle] button.primary")
    B.wait_for_selector("[data-a=flag]")
    calls.clear()
    B.click("[data-a=flag]")
    wait_for(B, lambda: "contest" in types())
    ok({"type": "contest", "code": code, "bets": [bet]} in [c["body"] for c in calls], "relais : contestation")

    # Défi par lien à quelqu'un qui n'a pas l'app
    A.click(".circle-btn"); A.click(".sheet [data-a=home]")
    A.click("[data-a=linkDuel]")
    A.wait_for_selector("form[data-f=linkDuel]")
    shot(A, "68-link-duel")
    A.fill("form[data-f=linkDuel] input[name=title]", "Je finis le semi-marathon")
    A.fill("form[data-f=linkDuel] input[name=stake]", "150")
    A.click("form[data-f=linkDuel] button.primary")
    A.wait_for_selector(".share-row a.wa")
    shot(A, "69-link-duel-ready")
    dlink = A.get_attribute(".share-row [data-a=copy]", "data-text")
    ok("semi-marathon" in json.dumps(A.get_attribute(".share-row a.wa", "href")) or "semi-marathon" in A.get_attribute(".share-row a.wa", "href").replace("%20", " "), "le message WhatsApp contient le défi")
    A.click(".sheet [data-a=close] >> nth=-1")
    ok(A.locator("text=" + ("Challenge sent by link" if EN else "Défi envoyé par lien")).count() == 1, "défi en attente visible sur l'accueil")
    D = page("D", dlink)
    onboard(D, "Magali", 4, tour=False)
    D.wait_for_selector("[data-a=linkAccept][data-duel]")
    shot(D, "70-link-duel-received")
    D.click("[data-a=linkAccept][data-duel]")
    D.wait_for_selector("[data-a=duelAccept]")
    D.click("[data-a=duelAccept]")
    uidD = D.evaluate("FB.uid")
    lduo = D.evaluate("S.code")
    D.wait_for_timeout(600)
    ok(db(D).get(f"circles/{lduo}/wagers/{D.evaluate('S.betId')}_{uidD}", {}).get("opt") == "n", "Magali a relevé le défi par lien")
    # Chez A, le face-à-face se fixe sur Magali
    A.wait_for_selector(".friend-row:has-text('Magali') [data-a=challenge]")
    ok(A.locator(f"[data-a=openCircle][data-code='{lduo}']").count() == 0, "le défi en attente devient l'amie Magali sur l'accueil")
    A.evaluate(f"openCircle('{lduo}')")
    wait_for(A, lambda: db(A)[f"circles/{lduo}"].get("guest") == uidD)
    dd = db(A)
    ok(dd[f"circles/{lduo}"].get("guest") == uidD and dd[f"circles/{lduo}"]["name"] == "Fanfan vs Magali", "face-à-face fixé sur Magali")
    lbet = [k for k in dd if k.startswith(f"circles/{lduo}/bets/")][0]
    wait_for(A, lambda: db(A)[lbet]["duel"]["to"] == uidD)
    ok(db(A)[lbet]["duel"]["to"] == uidD and db(A)[lbet]["options"][1]["label"].startswith("Magali"), "défi rattaché à Magali")
    ok(db(A).get("friends/" + "_".join(sorted([uidA, uidD])), {}).get("status") == "ok", "Magali est devenue amie")
    # Le face-à-face est accessible depuis l'accueil, avec tous les types de paris
    A.click(".circle-btn"); A.click(".sheet [data-a=home]")
    A.wait_for_selector(".friend-row:has-text('Julie') [data-a=openFace]")
    A.click(".friend-row:has-text('Julie') [data-a=openFace]")
    A.wait_for_selector(".tabbar")
    ok(A.evaluate("S.code") == duo, "la ligne de l'ami ouvre le face-à-face")
    ok(A.locator(".strip-head").count() == 1, "matchs à venir proposés dans le face-à-face")
    A.click(".fab"); A.click("[data-kind=multi]")
    A.fill("input[name=title]", "Qui gagne le tournoi ?"); A.fill("input[name=opt0]", "Julie"); A.fill("input[name=opt1]", "Fanfan")
    A.click("form[data-f=newBet] button.primary"); A.wait_for_selector(".bet-page")
    multi = A.evaluate("S.betId")
    B.goto(URL + f"?c={duo}&b={multi}")
    B.wait_for_selector(".opt.can >> nth=1")
    B.click(".opt.can >> nth=0"); B.fill("form[data-f=wager] input[name=amt]", "50"); B.click("form[data-f=wager] button.primary")
    wait_for(B, lambda: f"circles/{duo}/wagers/{multi}_{uidB}" in db(B))
    ok(db(B).get(f"circles/{duo}/wagers/{multi}_{uidB}", {}).get("opt") == "o1", "l'adversaire choisit librement son camp sur un pari à choix multiples")

    # Nom d'utilisateur : choix, unicité, recherche
    B.click(".circle-btn"); B.click(".sheet [data-a=home]")
    B.evaluate("S.modal = { k: 'editProfile' }; render()")
    B.wait_for_selector("input[name=handle]")
    B.fill("input[name=handle]", "Julie_Liège"); B.click("form[data-f=editProfile] button.primary")
    wait_for(B, lambda: "handles/julie_liege" in db(B))
    ok(db(B).get("handles/julie_liege", {}).get("uid") == uidB and db(B)[f"users/{uidB}"].get("handle") == "julie_liege", "nom d'utilisateur réservé (minuscules, sans accent)")
    A.click(".circle-btn"); A.click(".sheet [data-a=home]")
    A.evaluate("S.modal = { k: 'editProfile' }; render()")
    A.fill("input[name=handle]", "julie_liege"); A.click("form[data-f=editProfile] button.primary")
    A.wait_for_timeout(500)
    ok(db(A)["handles/julie_liege"]["uid"] == uidB and A.locator("form[data-f=editProfile]").count() == 1, "un nom déjà pris est refusé")
    A.fill("input[name=handle]", "fanfan"); A.click("form[data-f=editProfile] button.primary")
    wait_for(A, lambda: "handles/fanfan" in db(A))
    E = page("E"); onboard(E, "Enzo", 3)
    E.wait_for_selector("[data-a=addFriend]"); E.click("[data-a=addFriend]")
    E.fill("form[data-f=findUser] input", "@Fanfan"); E.click("form[data-f=findUser] button")
    E.wait_for_selector(".sheet [data-a=friendAdd]")
    shot(E, "70-find-user")
    E.click(".sheet [data-a=friendAdd]")
    uidE = E.evaluate("FB.uid")
    wait_for(E, lambda: "friends/" + "_".join(sorted([uidA, uidE])) in db(E))
    ok(db(E).get("friends/" + "_".join(sorted([uidA, uidE])), {}).get("status") == "pending", "demande d'ami envoyée après une recherche par nom d'utilisateur")
    E.fill("form[data-f=findUser] input", "personne_ici"); E.click("form[data-f=findUser] button")
    E.wait_for_selector("text=" + ("No player has this username" if EN else "Aucun joueur ne porte ce nom"))
    ok(True, "recherche sans résultat signalée")
    b.close()

print("ERREURS:", json.dumps(errors, ensure_ascii=False, indent=1) if errors else "aucune")
