# Publier Pronohub sur l'App Store et le Play Store

Objectif : publier Pronohub sur les stores une fois l'app terminée. Ce document liste ce que les stores exigent et ce qui est déjà prêt, pour en tenir compte pendant tout le développement.

## La voie prévue

- **Play Store (Android)** : emballage léger du site (Trusted Web Activity) fabriqué avec PWABuilder. Guide complet : `PLAY-STORE.md`.
- **App Store (iOS)** : une PWA ne peut pas y être déposée telle quelle. On l'emballera avec **Capacitor**, qui produit une vraie app iOS à partir du même code.

Le site GitHub Pages continue de fonctionner en parallèle.

Ce qu'il faudra le moment venu :

- **Apple Developer Program** : 99 $ par an.
- **Un Mac avec Xcode** pour compiler l'app iOS, ou un service de compilation en ligne (Codemagic, Ionic Appflow).
- **Google Play Console** : 25 $, une seule fois.

## Les règles qui nous concernent

| Exigence | Où on en est |
|---|---|
| **Pas une simple page web emballée** (Apple, règle 4.2) : l'app doit apporter quelque chose de plus qu'un site. | Notifications push faites. Pour iOS, à compléter : partage natif, retour haptique. |
| **« Se connecter avec Apple »** obligatoire dès qu'on propose Google (Apple, règle 4.8). | À ajouter dans la version iOS. Firebase le gère. |
| **Suppression du compte depuis l'app.** | Fait (Compte > Supprimer mon compte). |
| **Politique de confidentialité** accessible par un lien public. | Fait : `confidentialite.html`, en français et en anglais. |
| **Page web de demande de suppression du compte** (Google). | Fait : `supprimer-compte.html`. |
| **Jeux d'argent simulés** : à déclarer dans le questionnaire d'âge. Apple classera probablement l'app en 17+. | Aucun argent réel, aucun achat de jetons. Ne jamais vendre de jetons : ce serait un achat intégré obligatoire, et l'app deviendrait un jeu d'argent. |
| **Droits sur les contenus.** | Fait pour Android : dans l'app du Play Store, les logos des clubs (marques, fournis par ESPN) sont remplacés par leurs initiales. À reprendre pour iOS. |
| **Source des résultats fiable.** | L'API ESPN est gratuite mais non officielle : pour une app publique, prévoir une source officielle avant la publication. |
| **Nom de l'app** disponible et sans marque déposée. | Vérifier « Pronohub » sur l'App Store, le Play Store et dans la base des marques de l'EUIPO. |

## Ce qui est déjà pensé pour les stores

- Confirmations et fenêtres intégrées à l'app, sans boîte de dialogue du navigateur.
- Zones sûres de l'écran respectées (encoche, barre du bas), cibles tactiles d'au moins 44 px.
- Fonctionnement hors ligne, thème clair et sombre, français et anglais.
- Comptes Firebase compatibles avec la connexion Apple et les notifications push (Firebase Cloud Messaging).

Les notifications push passent par un relais Cloudflare gratuit (voir `NOTIFICATIONS.md`) : rien à ajouter pour Android.
