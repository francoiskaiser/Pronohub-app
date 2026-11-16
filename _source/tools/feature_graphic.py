"""Bannière Play Store 1024 x 500 (store/fr/banniere.png et store/en/banniere.png)."""
import os, base64
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "tests/node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2")
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()
TXT = {"fr": ("Parie entre amis.", "Sport, élections, paris maison. Des jetons fictifs, jamais d'argent réel."),
       "en": ("Bet with friends.", "Sports, elections, your own bets. Play tokens only, never real money.")}
for lang, (h, sub) in TXT.items():
    shot = b64(os.path.join(ROOT, "store", lang, "2-paris.png"))
    html = f"""<style>@font-face{{font-family:B;src:url(data:font/woff2;base64,{b64(FONT)}) format('woff2');font-weight:200 800}}
body{{margin:0;width:1024px;height:500px;overflow:hidden;font-family:B,sans-serif;background:linear-gradient(135deg,#f6a24f,#e8781c);color:#26201b;position:relative}}
.l{{position:absolute;left:64px;top:84px;width:520px}}
.brand{{display:flex;align-items:center;gap:18px;font-size:44px;font-weight:800;letter-spacing:-.02em}}
.brand img{{width:84px;height:84px;border-radius:20px;box-shadow:0 8px 24px rgba(80,40,0,.25)}}
h1{{font-size:62px;line-height:1;margin:44px 0 16px;letter-spacing:-.035em;font-weight:800}}
p{{font-size:24px;line-height:1.35;margin:0;color:#3b2a1c;max-width:470px}}
.ph{{position:absolute;right:70px;top:56px;width:300px;border-radius:34px;border:10px solid #26201b;box-shadow:0 30px 60px rgba(60,25,0,.35);transform:rotate(6deg);background:#26201b}}
.ph img{{width:100%;display:block;border-radius:24px}}</style>
<div class="l"><div class="brand"><img src="data:image/png;base64,{b64(os.path.join(ROOT,'pwa/icon-192.png'))}">Pronohub</div><h1>{h}</h1><p>{sub}</p></div>
<div class="ph"><img src="data:image/png;base64,{shot}"></div>"""
    with sync_playwright() as pw:
        br = pw.chromium.launch(); pg = br.new_page(viewport={"width": 1024, "height": 500})
        pg.set_content(html); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(ROOT, "store", lang, "banniere.png")); br.close()
    print("banniere", lang)
