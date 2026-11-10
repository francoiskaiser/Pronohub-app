import time
from playwright.sync_api import sync_playwright
from common import setup
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":844},locale="fr-BE",service_workers="block")
    setup(ctx, mockfb=True)
    p=ctx.new_page(); p.add_init_script("window.__PH_NS='A'")
    p.on("console", lambda m: print("CONSOLE", m.type, m.text)); p.on("pageerror", lambda e: print("ERR", e))
    p.goto("http://localhost:8770/")
    p.fill("input[name=name]","Fanfan"); p.click("form[data-f=profile] button")
    p.click(".sheet [data-a=close] >> nth=-1")
    p.click("[data-a=newCircle] >> nth=0"); p.fill("input[name=name]","X"); p.click("form[data-f=newCircle] button.primary")
    p.wait_for_selector(".code-big"); p.click(".sheet [data-a=close] >> nth=-1")
    time.sleep(1)
    print(p.evaluate("JSON.stringify({st:DB.cur()&&DB.cur().status, code:S.code, view:S.view, uid:FB.uid})"))
    p.click(".fab"); p.click("[data-kind=yesno]"); p.fill("input[name=title]","Test ?"); p.click("form[data-f=newBet] button.primary")
    time.sleep(1.5)
    print(p.evaluate("JSON.stringify({st:DB.cur().status, view:S.view, bets:Object.keys(DB.cur().bets), modal:S.modal})"))
    p.screenshot(path="shots/dbg.png")
