"""Outils communs aux tests : police locale, faux Firebase, faux ESPN, blocage du reste d'internet."""
import os, json, time

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "node_modules/@fontsource-variable/bricolage-grotesque/files")
FONT_CSS = """
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:200 800;font-display:swap;
src:url(https://fonts.gstatic.com/local/latin.woff2) format('woff2-variations');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:200 800;font-display:swap;
src:url(https://fonts.gstatic.com/local/latin-ext.woff2) format('woff2-variations');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}
"""


def fixtures_json():
    """Faux calendrier ESPN : 4 matchs dans les jours qui viennent + 1 terminé."""
    now = time.time()
    def ev(i, h, a, dt, state="pre", sh="0", sa="0", completed=False, name="STATUS_SCHEDULED"):
        iso = time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime(now + dt))
        return {"id": str(9000 + i), "date": iso, "name": f"{a} at {h}",
                "status": {"type": {"state": state, "completed": completed, "name": name}},
                "competitions": [{"competitors": [
                    {"homeAway": "home", "score": sh, "team": {"displayName": h, "shortDisplayName": h, "logo": ""}},
                    {"homeAway": "away", "score": sa, "team": {"displayName": a, "shortDisplayName": a, "logo": ""}}]}]}
    return {"events": [
        ev(1, "Club Brugge", "Anderlecht", 3600 * 26),
        ev(2, "Standard", "Genk", 3600 * 27),
        ev(3, "Union SG", "Gent", 3600 * 50),
        ev(4, "Charleroi", "Antwerp", 3600 * 74),
    ]}


def setup(ctx, mockfb=False, espn_result=None):
    """Interceptions réseau d'un contexte Playwright."""
    mock_js = open(os.path.join(HERE, "mockfb.js"), encoding="utf-8").read() if mockfb else ""

    def handle(route):
        url = route.request.url
        if mockfb and url.startswith("http://localhost") and url.split("?")[0].endswith("firebase-config.js"):
            return route.fulfill(status=200, content_type="application/javascript",
                                 body='var FIREBASE_CONFIG = {apiKey:"test-key", authDomain:"x", projectId:"pronohub-test", appId:"1"};')
        if url.startswith("http://localhost"):
            return route.continue_()
        if "fonts.googleapis.com" in url:
            return route.fulfill(status=200, content_type="text/css", body=FONT_CSS)
        if "fonts.gstatic.com/local/" in url:
            f = "bricolage-grotesque-latin-ext-wght-normal.woff2" if "latin-ext" in url else "bricolage-grotesque-latin-opsz-normal.woff2"
            return route.fulfill(status=200, content_type="font/woff2", body=open(os.path.join(FONT_DIR, f), "rb").read(),
                                 headers={"access-control-allow-origin": "*"})
        if "gstatic.com/firebasejs" in url:
            if mockfb and "firebase-app-compat" in url:
                return route.fulfill(status=200, content_type="application/javascript", body=mock_js)
            return route.fulfill(status=200, content_type="application/javascript", body="/* mock */")
        if "site.api.espn.com" in url:
            body = espn_result() if espn_result else fixtures_json()
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(body),
                                 headers={"access-control-allow-origin": "*"})
        return route.abort()
    ctx.route("**/*", handle)


def watch(page, errors, tag=""):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console: {m.text}"))
