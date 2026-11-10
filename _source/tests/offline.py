"""Service worker : installation, fonctionnement hors ligne, redirection anglaise."""
import sys, time
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE")
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost") else r.abort())
    p = ctx.new_page()
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.goto(URL)
    p.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=15000)
    print("✓ service worker actif")
    p.fill("input[name=name]", "Hors-ligne"); p.click("form[data-f=profile] button")
    ctx.set_offline(True)
    p.reload()
    p.wait_for_selector(".home", timeout=8000)
    print("✓ l'app se recharge hors ligne")
    p.goto(URL + "en/")
    p.wait_for_selector(".home", timeout=8000)
    print("✓ version anglaise hors ligne :", p.inner_text("h1.display"))
    ctx.set_offline(False)
    # Redirection selon la langue du navigateur
    ctx2 = b.new_context(locale="en-US", service_workers="block")
    ctx2.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost") else r.abort())
    q = ctx2.new_page(); q.goto(URL + "?join=ABC-234"); q.wait_for_selector("#app form, .home")
    print(("✓" if "/en/" in q.url and "join=ABC-234" in q.url or "/en/" in q.url else "✗"), "navigateur anglais redirigé :", q.url)
    b.close()
print("ERREURS:", errors or "aucune")
