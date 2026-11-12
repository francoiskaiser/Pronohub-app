"""Notifications : activation, préférences, appel du relais après un pari ou un résultat,
étiquette « Nouveau », ouverture depuis une notification. Faux Firebase, faux FCM, faux relais."""
import sys, os, time, json
from playwright.sync_api import sync_playwright
from common import setup, watch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8770/"
OUT = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(OUT, exist_ok=True)
errors = []
calls = []

# Faux navigateur compatible notifications + faux Firebase Messaging
STUB = """
window.PRONOHUB_PUSH = { vapidKey: 'BTEST', worker: 'https://notify.test/' };
(function () {
  window.Notification = function () {};
  Object.defineProperty(window.Notification, 'permission', { get: () => sessionStorage.getItem('__perm') || 'default' });
  window.Notification.requestPermission = async () => { sessionStorage.setItem('__perm', 'granted'); return 'granted'; };
  window.PushManager = function () {};
  const reg = { scope: location.origin + '/' };
  try { Object.defineProperty(navigator, 'serviceWorker', { value: Object.assign(new EventTarget(), { ready: Promise.resolve(reg), register: async () => reg, controller: null }) }); } catch (e) {}
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get: () => fb, set: v => {
    fb = v;
    fb.messaging = () => ({
      getToken: async (o) => { window.__getTokenOpts = o; return 'fcm-token-' + (window.__PH_NS || 'x'); },
      deleteToken: async () => true,
    });
  } });
})();
"""

def shot(p, name, wait=.35):
    time.sleep(wait)
    p.screenshot(path=os.path.join(OUT, name + ".png"))

def ok(cond, msg):
    if not cond:
        errors.append("ÉCHEC : " + msg)
    print(("✓ " if cond else "✗ ") + msg)

def new_page(ctx, ns, url=URL):
    p = ctx.new_page()
    p.add_init_script(f"window.__PH_NS = '{ns}';")
    p.add_init_script(STUB)
    watch(p, errors, ns)
    p.goto(url)
    return p

def onboard(p, name, idx):
    p.wait_for_selector("form[data-f=profile]")
    p.fill("input[name=name]", name)
    p.click(f"label.emo >> nth={idx}")
    p.click("form[data-f=profile] button")

def userdoc(p):
    return p.evaluate("JSON.parse(localStorage.getItem('__mockdb'))['users/' + FB.uid] || {}")

def wait_calls(p, n, t=8):
    end = time.time() + t
    while len(calls) < n and time.time() < end:
        p.wait_for_timeout(100)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE", device_scale_factor=2, service_workers="block")
    setup(ctx, mockfb=True)
    def relay(route):
        r = route.request
        if r.method == "OPTIONS":
            return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST"})
        calls.append({"auth": r.headers.get("authorization"), "body": json.loads(r.post_data or "{}")})
        return route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body='{"ok":true,"sent":1}')
    ctx.route("https://notify.test/**", relay)

    # A crée un cercle en ligne
    A = new_page(ctx, "A")
    onboard(A, "Fanfan", 2)
    A.wait_for_selector(".tour"); A.click(".sheet [data-a=close] >> nth=-1")
    ok(A.locator(".push-card").count() == 0, "pas de proposition tant qu'on n'a pas de cercle en ligne")
    A.click("[data-a=newCircle] >> nth=0")
    A.fill("input[name=name]", "Les potes")
    A.click("form[data-f=newCircle] button.primary")
    A.wait_for_selector(".code-big")
    code = A.inner_text(".code-big").strip()
    A.click(".sheet [data-a=close] >> nth=-1")

    # B rejoint et active les notifications depuis l'accueil
    B = new_page(ctx, "B", URL + "?join=" + code)
    onboard(B, "Julie", 1)
    B.wait_for_selector("form[data-f=join]")
    B.click("form[data-f=join] button.primary")
    B.wait_for_selector(".tabbar")
    B.click(".circle-btn"); B.click(".sheet [data-a=home]")
    B.wait_for_selector(".push-card")
    shot(B, "50-push-home-card")
    B.click(".push-card [data-a=pushOn]")
    B.wait_for_function("Push.state() === 'on'")
    ud = userdoc(B)
    toks = list((ud.get("push") or {}).get("tokens", {}).values())
    ok(len(toks) == 1 and toks[0]["t"] == "fcm-token-B" and toks[0]["lang"] == ("en" if "/en/" in URL else "fr"), f"jeton de l'appareil enregistré dans le profil ({toks})")
    ok(B.evaluate("window.__getTokenOpts && window.__getTokenOpts.vapidKey") == "BTEST", "clé Web Push transmise à Firebase")
    ok(B.locator(".push-card").count() == 0, "la proposition disparaît une fois activé")
    ok(ud.get("name") == "Julie", "le reste du profil est conservé")

    # Réglages : interrupteurs
    B.click(".home-top [data-a=settings]")
    B.wait_for_selector(".switch-row")
    shot(B, "51-push-settings")
    B.click("[data-a=pushPref][data-k=settle]")
    time.sleep(.4)
    ud = userdoc(B)
    ok(ud["push"].get("off", {}).get("settle") is True and len(ud["push"]["tokens"]) == 1, "résultats coupés, jeton conservé")
    ok(not B.locator("[data-a=pushPref][data-k=settle]").is_checked() and B.locator("[data-a=pushPref][data-k=bet]").is_checked(), "interrupteurs à jour")
    B.click("[data-a=pushPref][data-k=settle]"); time.sleep(.3)
    B.click("[data-a=back]")

    # A lance un pari : le relais est prévenu, avec le jeton d'identité de A
    calls.clear()
    A.click(".fab"); A.click("[data-kind=yesno]")
    A.fill("input[name=title]", "Il va neiger avant Noël ?")
    A.click("form[data-f=newBet] button.primary")
    A.wait_for_selector(".bet-page")
    bet_id = A.evaluate("S.betId")
    wait_calls(A, 1)
    uidA = A.evaluate("FB.uid")
    ok(len(calls) == 1 and calls[0]["body"] == {"type": "bet", "code": code, "bets": [bet_id]} and calls[0]["auth"] == "Bearer mock." + uidA,
       f"relais prévenu du nouveau pari ({calls})")

    # Import de deux matchs : un seul appel groupé
    calls.clear()
    A.click("[data-a=back]")
    A.click(".fab"); A.click("[data-kind=import]")
    A.wait_for_selector(".fixtures")
    A.click(".fx >> nth=0"); A.click(".fx >> nth=1")
    A.click("form[data-f=import] button.primary")
    A.wait_for_selector(".ticket >> nth=2")
    wait_calls(A, 1, 12); A.wait_for_timeout(1800)
    ok(len(calls) == 1 and calls[0]["body"]["type"] == "bet" and len(calls[0]["body"]["bets"]) == 2, f"import : un seul appel pour 2 paris ({[c['body'] for c in calls]})")

    # B voit l'étiquette « Nouveau »
    B.click(f"[data-code='{code}']")
    B.wait_for_selector(".ticket")
    time.sleep(.5)
    ok(B.locator(".ticket .tag.new").count() == 3, f"B voit 3 paris « Nouveau » ({B.locator('.ticket .tag.new').count()})")
    shot(B, "52-push-new-tags")
    ok(A.locator(".ticket .tag.new").count() == 0, "A ne voit pas ses propres paris comme nouveaux")
    B.reload(); B.wait_for_selector(".ticket"); time.sleep(.5)
    ok(B.locator(".ticket .tag.new").count() == 0, "à la visite suivante, plus rien de nouveau")

    # Ouverture depuis une notification : lien direct vers le pari
    B.goto(URL + f"?c={code}&b={bet_id}")
    B.wait_for_selector(".bet-page")
    ok("neiger" in B.inner_text(".bet-page"), "la notification ouvre le pari")
    B.go_back(); B.wait_for_selector(".tickets")
    ok(B.evaluate("S.view") == "circle", "retour : liste des paris du cercle")
    B.evaluate(f"Push.open('{code}', '{bet_id}')"); B.wait_for_selector(".bet-page")
    ok(B.evaluate("S.betId") == bet_id, "clic sur une notif, app déjà ouverte : le pari s'ouvre")
    B.click("[data-a=back]")

    # A règle le pari : le relais est prévenu du résultat
    calls.clear()
    A.click(f".ticket:has-text('neiger') .t-link")
    A.click("[data-a=settle]")
    A.click(".choice >> nth=0")
    A.click("form[data-f=settle] button.primary")
    wait_calls(A, 1)
    ok(len(calls) == 1 and calls[0]["body"] == {"type": "settle", "code": code, "bets": [bet_id]}, f"relais prévenu du résultat ({calls})")

    # Sourdine d'un cercle
    B.click(".circle-btn"); B.click(".circle-manage")
    B.wait_for_selector("[data-a=pushMute]")
    shot(B, "53-push-circle-mute")
    B.click("[data-a=pushMute]"); time.sleep(.4)
    ok(userdoc(B)["push"].get("mute", {}).get(code) is True, "cercle mis en sourdine")
    B.click(".sheet [data-a=close] >> nth=-1")

    # Désactivation sur l'appareil
    B.click(".top [data-a=settings]") if B.locator(".top [data-a=settings]").count() else B.evaluate("go('settings')")
    B.wait_for_selector("[data-a=pushOff]")
    B.click("[data-a=pushOff]")
    B.wait_for_selector("[data-a=pushOn]")
    ok(not userdoc(B)["push"].get("tokens"), "désactivation : le jeton est retiré du profil")

    # Navigateur sans notifications et iPhone non installé
    C = ctx.new_page()
    C.add_init_script("window.PRONOHUB_PUSH = { vapidKey: 'BTEST', worker: 'https://notify.test/' }; delete window.PushManager;")
    watch(C, errors, "C")
    C.goto(URL); C.wait_for_selector("form[data-f=profile]")
    ok(C.evaluate("Push.state()") in ("unsupported", "ios-install"), "navigateur sans notifications détecté")
    b.close()

    # Sans configuration du relais : rien ne s'affiche
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="fr-BE", service_workers="block")
    setup(ctx, mockfb=True)
    D = ctx.new_page(); watch(D, errors, "D")
    D.goto(URL); D.wait_for_selector("form[data-f=profile]")
    ok(D.evaluate("Push.state()") == "hidden", "sans configuration : notifications masquées")
    b.close()

print("ERREURS:", json.dumps(errors, ensure_ascii=False, indent=1) if errors else "aucune")
