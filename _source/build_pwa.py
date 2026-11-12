#!/usr/bin/env python3
"""Construit Pronohub : assemble src/ en une page unique pwa/index.html (+ pwa/en/index.html).

Usage :
  python3 build_pwa.py          # construction normale
  python3 build_pwa.py --demo   # + version de démonstration autonome (build/demo.html, sans Firebase)
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
PWA = os.path.join(ROOT, "pwa")
TOOLS = os.path.join(ROOT, "tools")
BUILD = os.path.join(TOOLS, "build")

FILES = [
    "util.js", "data.js", "store.js", "fb.js", "db.js", "engine.js", "sports.js",
    "account.js", "settings.js", "circles.js", "bets.js", "feed.js", "profile.js", "home.js", "odds.js", "solo.js", "push.js", "app.js",
]
FIREBASE_VERSION = "10.12.2"
FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap"

SHELL = {
    "fr": {
        "desc": "Paris entre amis avec des jetons fictifs : sport, élections et paris maison.",
        "update": "Nouvelle version disponible",
        "reload": "Recharger",
        "noscript": "Pronohub a besoin de JavaScript pour fonctionner.",
        "loading": "Chargement…",
    },
    "en": {
        "desc": "Friendly bets with play tokens: sports, elections and your own bets.",
        "update": "New version available",
        "reload": "Reload",
        "noscript": "Pronohub needs JavaScript to run.",
        "loading": "Loading…",
    },
}


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def js_bundle(lang, base):
    head = f'"use strict";\nconst LANG = "{lang}";\nconst BASE = "{base}";\n'
    body = "\n".join(f"/* ===== {f} ===== */\n" + read(os.path.join(SRC, f)) for f in FILES)
    return head + body.replace('"use strict";\n', "")


def redirect_script(lang):
    # Langue : choix enregistré, sinon langue du navigateur (première visite)
    if lang == "fr":
        return ("(function(){try{var k=(window.__PH_NS||'ph')+'.lang',l=JSON.parse(localStorage.getItem(k)||'null');"
                "if(!l)l=/^fr/i.test(navigator.language||'fr')?'fr':'en';"
                "if(l==='en')location.replace('en/'+location.search);}catch(e){}})();")
    return ("(function(){try{var k=(window.__PH_NS||'ph')+'.lang',l=JSON.parse(localStorage.getItem(k)||'null');"
            "if(l==='fr')location.replace('../'+location.search);}catch(e){}})();")


def page(lang, js, base, demo=False):
    t = SHELL[lang]
    css = read(os.path.join(SRC, "style.css"))
    sdk = "" if demo else "\n".join(
        f'<script src="https://www.gstatic.com/firebasejs/{FIREBASE_VERSION}/firebase-{m}-compat.js"></script>'
        for m in ("app", "auth", "firestore"))
    cfg = '<script>var FIREBASE_CONFIG = {apiKey:""};</script>' if demo else f'<script src="{base}firebase-config.js"></script>'
    redirect = "" if demo else f"<script>{redirect_script(lang)}</script>"
    links = "" if demo else f'''<link rel="manifest" href="{base}manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="{base}icon-192.png">
<link rel="apple-touch-icon" href="{base}apple-touch-icon.png">'''
    js = js.replace("</script", "<\\/script")
    return f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Pronohub</title>
<meta name="description" content="{t["desc"]}">
<meta name="theme-color" content="#f3f5fb">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Pronohub">
{redirect}
{links}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
{css}
</style>
</head>
<body data-view="home">
<div id="app"><div id="splash" aria-live="polite">{t["loading"]}</div></div>
<div id="overlay" hidden></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div id="update" hidden><span>{t["update"]}</span><button class="btn primary small" data-a="reload">{t["reload"]}</button></div>
<noscript>{t["noscript"]}</noscript>
{sdk}
{cfg}
<script>
{js}
boot();
</script>
</body>
</html>
'''


def translate(js_fr):
    os.makedirs(BUILD, exist_ok=True)
    fin, fout = os.path.join(BUILD, "app.fr.js"), os.path.join(BUILD, "app.en.js")
    write(fin, js_fr)
    subprocess.run(["node", os.path.join(TOOLS, "i18n.js"), fin, fout, os.path.join(TOOLS, "en"),
                    os.path.join(BUILD, "missing.json")], check=True)
    js = read(fout)
    js = js.replace('const LANG = "fr";', 'const LANG = "en";', 1).replace('const BASE = "./";', 'const BASE = "../";', 1)
    return js


def main():
    demo = "--demo" in sys.argv
    js_fr = js_bundle("fr", "./")
    write(os.path.join(PWA, "index.html"), page("fr", js_fr, "./"))
    js_en = translate(js_fr)
    write(os.path.join(PWA, "en", "index.html"), page("en", js_en, "../"))
    if demo:
        write(os.path.join(BUILD, "demo.html"), page("fr", js_fr, "./", demo=True))
        write(os.path.join(BUILD, "demo-en.html"), page("en", js_en, "../", demo=True))
    # Ne jamais écraser une configuration Firebase remplie
    cfg = os.path.join(PWA, "firebase-config.js")
    if not os.path.exists(cfg):
        write(cfg, read(os.path.join(ROOT, "firebase-config.template.js")))
    sw = read(os.path.join(PWA, "sw.js"))
    m = re.search(r'VERSION = "([^"]+)"', sw)
    v = re.search(r'APP_VERSION = "([^"]+)"', read(os.path.join(SRC, "settings.js")))
    print(f"Pronohub {v.group(1) if v else '?'} construit — cache {m.group(1) if m else '?'}")


if __name__ == "__main__":
    main()
