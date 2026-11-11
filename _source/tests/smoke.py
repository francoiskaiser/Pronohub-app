"""Test rapide : parcours local (sans Firebase), erreurs console, captures."""
import sys, os, time
from playwright.sync_api import sync_playwright
from common import setup, watch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
OUT = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(OUT, exist_ok=True)
errors = []

PREFIX = os.environ.get("PREFIX", "")
import re
FR = re.compile(r"\b(jetons?|Classement|Réglages|Annuler|Fermer|cercles?|Retour|Créer|Nouveau|parieurs?|Terminés|Ouvert|Miser|Résultat|Saison|Bonus du jour|Récupérer|Moi)\b")
def shot(p, name):
    time.sleep(.35)
    p.screenshot(path=os.path.join(OUT, PREFIX + name + ".png"), full_page=False)
    if PREFIX:
        txt = p.evaluate("document.body.innerText")
        for m in set(FR.findall(txt)):
            errors.append(f"français restant ({name}) : {m}")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE", device_scale_factor=2)
    setup(ctx)
    p = ctx.new_page()
    watch(p, errors)
    p.goto(URL)
    p.wait_for_selector("form[data-f=profile]")
    shot(p, "01-welcome")
    p.fill("input[name=name]", "Fanfan")
    p.click("label.emo:nth-child(3)")
    p.click("form[data-f=profile] button")
    p.wait_for_selector(".tour")
    shot(p, "02-tour")
    p.click("[data-a=close] >> nth=-1")
    shot(p, "03-home")
    p.click("[data-a=newCircle] >> nth=0")
    p.fill("input[name=name]", "Les collègues")
    shot(p, "04-newcircle")
    p.click("form[data-f=newCircle] button.primary")
    p.wait_for_selector("form[data-f=addPlayer]")
    for n in ["Julie", "Thomas", "Magali"]:
        p.fill("form[data-f=addPlayer] input", n)
        p.click("form[data-f=addPlayer] button")
    p.click(".sheet [data-a=close] >> nth=-1")
    shot(p, "05-empty-bets")
    # Bonus du jour
    pass
    # Pari oui/non
    p.click(".fab")
    shot(p, "06-kinds")
    p.click("[data-kind=yesno]")
    p.fill("input[name=title]", "Thomas arrivera-t-il à l'heure lundi ?")
    p.click("form[data-f=newBet] button.primary")
    p.wait_for_selector(".bet-page")
    p.click(".opt.can >> nth=0")
    p.fill("form[data-f=wager] input[name=amt]", "200")
    shot(p, "07-wager")
    p.click("form[data-f=wager] button.primary")
    # Changer de joueur et miser
    for i, (who, opt, amt) in enumerate([("Julie", 1, "100"), ("Thomas", 1, "300")]):
        p.click("[data-a=actor]")
        p.click(f".choice:has-text('{who}')")
        p.click(f".opt.can >> nth={opt}" if p.locator(".opt.can").count() > 1 else ".opt.can")
        p.fill("form[data-f=wager] input[name=amt]", amt)
        p.click("form[data-f=wager] button.primary")
    shot(p, "08-bet-detail")
    # Match manuel
    p.click("[data-a=back]")
    p.click(".fab")
    p.click("[data-kind=match]")
    p.fill("input[name=home]", "Standard")
    p.fill("input[name=away]", "Anderlecht")
    p.click("form[data-f=newBet] button.primary")
    p.wait_for_selector(".bet-page")
    p.click(".opt.can >> nth=2")
    p.fill("form[data-f=wager] input[name=amt]", "150")
    p.fill("input[name=sh]", "1"); p.fill("input[name=sa]", "2")
    p.click("form[data-f=wager] button.primary")
    # Pari multiple
    p.click("[data-a=back]")
    p.click(".fab")
    p.click("[data-kind=multi]")
    p.fill("input[name=title]", "Qui sera l'employé du mois ?")
    p.fill("input[name=opt0]", "Julie"); p.fill("input[name=opt1]", "Thomas")
    p.click("[data-a=optAdd]")
    p.fill("input[name=opt2]", "Magali")
    p.click("form[data-f=newBet] button.primary")
    p.wait_for_selector(".bet-page")
    p.click("[data-a=back]")
    shot(p, "09-tickets")
    p.evaluate("window.scrollTo(0, 600)")
    shot(p, "09b-tickets-scroll")
    p.evaluate("window.scrollTo(0, 0)")
    # Régler le pari oui/non : Fanfan est actuellement Thomas -> repasser à Fanfan (créateur)
    p.click("[data-a=actor]"); p.click(".choice:has-text('Fanfan')")
    p.click(".t-link >> nth=0")
    p.click("[data-a=settle]")
    p.click(".choice >> nth=1")
    p.click("form[data-f=settle] button.primary")
    shot(p, "10-settled")
    p.click("[data-a=back]")
    p.click("[data-a=settle]") if False else None
    # Match : saisir le score 1-2
    tickets = p.locator(".t-link")
    for i in range(tickets.count()):
        tickets.nth(i).click()
        if p.locator(".bet-title .match").count():
            break
        p.click("[data-a=back]")
    p.click("[data-a=settle]")
    p.fill("input[name=sh]", "1"); p.fill("input[name=sa]", "2")
    p.click("form[data-f=settle] button.primary")
    p.fill("form[data-f=comment] input", "Trop facile 😎")
    p.press("form[data-f=comment] input", "Enter")
    p.click("[data-a=react] >> nth=0")
    shot(p, "11-match-settled")
    p.click("[data-a=back]")
    p.click(".tabbar [data-v=rank]")
    shot(p, "12-rank")
    p.click(".tabbar [data-v=feed]")
    shot(p, "13-feed")
    p.click(".tabbar [data-v=me]")
    shot(p, "14-me")
    p.evaluate("window.scrollTo(0, 700)")
    shot(p, "14b-me-badges")
    p.click("[data-a=settings] >> nth=0")
    shot(p, "15-settings")
    # Dark
    p.click("[data-a=pref][data-v=dark]")
    p.click("[data-a=back]")
    p.click(".tabbar [data-v=bets]")
    p.click("[data-a=filter][data-v=done]")
    shot(p, "16-dark-done")
    # Accueil enrichi + pari en un clic sur un vrai match
    p.click("[data-a=back]") if p.locator("[data-a=back]").count() else None
    p.click(".circle-btn"); p.click(".sheet [data-a=home]")
    p.wait_for_selector(".mcard .btn")
    shot(p, "40-home-rich")
    p.click(".mcard [data-a=matchBet] >> nth=0")
    p.wait_for_selector(".bet-page")
    shot(p, "41-match-from-home")
    p.click("[data-a=back]")
    p.click("[data-a=filter][data-v=open]")
    shot(p, "42-bets-strip")
    p.click("[data-a=settings] >> nth=0"); p.click("[data-a=install] >> nth=0")
    shot(p, "43-install")
    p.click(".sheet [data-a=close] >> nth=-1"); p.click("[data-a=back]")
    # Tablette et PC
    for w, h, n in [(768, 1024, "17-tablet-portrait"), (1024, 768, "18-tablet-landscape"), (1440, 900, "19-desktop")]:
        p.set_viewport_size({"width": w, "height": h})
        p.click("[data-a=filter][data-v=open] >> nth=0") if p.locator("[data-a=filter][data-v=open]").count() else None
        time.sleep(.2)
        shot(p, n)
    b.close()

print("ERREURS:", errors if errors else "aucune")
