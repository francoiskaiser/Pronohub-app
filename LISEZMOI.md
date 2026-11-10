# Pronohub

Les paris entre amis, avec des jetons pour rire : matchs de foot et de NBA importés automatiquement, élections, et paris maison (« qui sera l'employé du mois ? »). Aucune somme d'argent réelle : les jetons sont gratuits et sans valeur.

Application web installable (PWA), en français et en anglais, utilisable sur téléphone, tablette et PC, même hors ligne après la première visite.

## Ce qu'on peut faire

- **Cercles** : un groupe d'amis, rejoint avec un code court (ABC-234) ou un lien d'invitation. Un cercle peut aussi vivre **sur un seul appareil** pour une soirée : on se passe le téléphone.
- **Jetons** : chaque membre démarre la saison avec 1 000 jetons, reçoit un bonus chaque jour, et la banque le renfloue s'il est à sec (en comptant ses faillites).
- **Pari mutuel** : toutes les mises vont dans une cagnotte que se partagent les gagnants. Les cotes bougent toutes seules selon les mises ; la banque ajoute une petite mise sur chaque choix pour que les cotes restent intéressantes.
- **Types de paris** : oui/non, plusieurs choix, match (domicile, nul, extérieur), élection, duel entre deux amis.
- **Import de matchs** : Pro League belge, Ligue 1, Premier League, LaLiga, Serie A, Bundesliga, Eredivisie, coupes d'Europe, NBA, NHL, NFL. Les mises ferment au coup d'envoi et le résultat arrive tout seul après le match.
- **Score exact** en bonus sur les matchs.
- **Résultat juste** : le créateur du pari saisit le résultat ; si la majorité des parieurs le conteste, les gains sont gelés jusqu'à correction.
- **Classement, saisons et palmarès**, avec trophées pour les trois premiers.
- **Fil d'activité** avec commentaires et réactions, **badges** et statistiques personnelles.
- **Compte facultatif** Google ou e-mail pour retrouver ses cercles sur tous ses appareils ; suppression du compte possible à tout moment.

## Installation

1. Publier le contenu de ce dossier sur GitHub Pages (dépôt public, branche `main`, dossier racine).
2. Facultatif mais recommandé : activer Firebase en suivant [FIREBASE.md](FIREBASE.md) pour les cercles en ligne et les comptes.

Sans Firebase, l'app fonctionne avec des cercles « sur cet appareil » uniquement.

## Source des résultats sportifs

Les calendriers et scores viennent de l'API publique d'ESPN (`site.api.espn.com`). Elle est gratuite, sans clé, mais **non officielle** : ESPN peut la modifier ou la couper sans prévenir. Si elle ne répond plus, l'import affiche un message clair et les paris de match restent possibles en saisie manuelle ; le créateur saisit alors le score.

## Reprendre le développement

Le code source est dans `_source/` :

- `src/` : le code (JavaScript sans framework et CSS) ;
- `build_pwa.py` : assemble `src/` en une seule page `index.html` (+ `en/index.html`) ;
- `tools/i18n.js` et `tools/en/*.json` : traduction anglaise à la construction ;
- `tests/` : tests de bout en bout Playwright, avec un faux Firebase (`mockfb.js`).

```
cd _source
python3 build_pwa.py            # reconstruit pwa/
cd pwa && python3 -m http.server 8770
```

À chaque publication : incrémenter `APP_VERSION` (src/settings.js) et `VERSION` (pwa/sw.js), ajouter une entrée au CHANGELOG, ne jamais écraser `firebase-config.js`.
