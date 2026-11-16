"""Mode Play Store (?store=android), liens ?compte=1 / ?retour=1 et pages publiques."""
import sys
from playwright.sync_api import sync_playwright
from common import setup, watch
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
errors = []
def ok(c, m):
    print(("✓ " if c else "✗ ") + m)
    if not c: errors.append(m)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 640}, locale="fr-BE", service_workers="block")
    setup(ctx, mockfb=True)
    p = ctx.new_page(); p.add_init_script("window.__PH_NS='S'"); watch(p, errors, "S")
    p.goto(URL + "?store=android")
    p.wait_for_selector("form[data-f=profile]")
    ok(p.evaluate("isNative()") and "store=" not in p.url, "mode Android mémorisé, adresse nettoyée")
    p.fill("input[name=name]", "Léa"); p.click("form[data-f=profile] button"); p.wait_for_timeout(300)
    p.evaluate("Store.set('tourDone',1)")
    html = p.evaluate("matchTitle({home:'Genk',away:'Gent',homeLogo:'https://a.espncdn.com/x.png',awayLogo:'https://a.espncdn.com/y.png'})")
    ok("<img" not in html and "crest" in html, "logos des clubs remplacés par des initiales")
    ok("<img" not in p.evaluate("teamLogo('https://a.espncdn.com/x.png','Genk')"), "logos remplacés aussi dans le mode solo")
    p.goto(URL + "?compte=1"); p.wait_for_selector("[data-a=accGoogle]")
    ok(True, "?compte=1 ouvre le compte")
    p.goto(URL + "?retour=1"); p.wait_for_selector("form[data-f=feedback]")
    ok(True, "?retour=1 ouvre le formulaire de retour")
    for page in ("confidentialite.html", "supprimer-compte.html"):
        r = p.goto(URL + page)
        ok(r.status == 200 and p.locator("#en h1").count() == 1, f"{page} en ligne, français et anglais")
        ok(p.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{page} sans défilement horizontal à 360 px")
    q = ctx.new_page(); q.add_init_script("window.__PH_NS='T'"); q.goto(URL)
    ok(not q.evaluate("isNative()"), "site web normal : logos conservés")
    b.close()
print("\n".join(errors) if errors else "OK"); sys.exit(1 if errors else 0)
