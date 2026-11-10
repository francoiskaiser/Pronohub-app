# Source de Pronohub

Pour reconstruire : recopier le contenu de la racine du dépôt (index.html, sw.js, icônes…) dans `_source/pwa/`,
ou plus simplement garder un dossier de travail local avec `src/`, `pwa/` et `tools/`.

```
cd tools && npm install          # acorn, pour la traduction
cd .. && python3 build_pwa.py    # génère pwa/index.html et pwa/en/index.html
cd tests && npm install && pip install playwright && python3 -m playwright install chromium
python3 smoke.py ; python3 online.py ; python3 offline.py   # avec un serveur sur le port 8770
```
