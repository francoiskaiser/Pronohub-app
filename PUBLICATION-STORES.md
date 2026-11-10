# Publier Pronohub sur l'App Store et le Play Store

Objectif : publier Pronohub sur les stores une fois l'app terminée. Ce document liste ce que les stores exigent et ce qui est déjà prêt, pour en tenir compte pendant tout le développement.

## La voie prévue

Une PWA ne peut pas être déposée telle quelle sur l'App Store. On l'emballera avec **Capacitor**, qui produit une vraie app iOS et une vraie app Android à partir du même code. Le site GitHub Pages continuera de fonctionner en parallèle.

Ce qu'il faudra le moment venu :

- **Apple Developer Program** : 99 $ par an.
- **Un Mac avec Xcode** pour compiler l'app iOS, ou un service de compilation en ligne (Codemagic, Ionic Appflow).
- **Google Play Console** : 25 $, une seule fois.

## Les règles qui nous concernent

| Exigence | Où on en est |
|---|---|
| **Pas une simple page web emballée** (Apple, règle 4.2) : l'app doit apporter quelque chose de plus qu'un site. | À faire : notifications push (défi reçu, résultat tombé, bonus du jour), partage natif, retour haptique. |
| **« Se connecter avec Apple »** obligatoire dès qu'on propose Google (Apple, règle 4.8). | À ajouter dans la version iOS. Firebase le gère. |
| **Suppression du compte depuis l'app.** | Fait (Compte > Supprimer mon compte). |
| **Politique de confidentialité** accessible par un lien public. | Le texte existe dans l'app (Mentions et confidentialité). À publier aussi comme page web. |
| **Jeux d'argent simulés** : à déclarer dans le questionnaire d'âge. Apple classera probablement l'app en 17+. | Aucun argent réel, aucun achat de jetons. Ne jamais vendre de jetons : ce serait un achat intégré obligatoire, et l'app deviendrait un jeu d'argent. |
| **Droits sur les contenus.** | Les logos des clubs viennent d'ESPN et sont des marques : à retirer de la version store (on garde les initiales). |
| **Source des résultats fiable.** | L'API ESPN est gratuite mais non officielle : pour une app publique, prévoir une source officielle avant la publication. |
| **Nom de l'app** disponible et sans marque déposée. | Vérifier « Pronohub » sur l'App Store, le Play Store et dans la base des marques de l'EUIPO. |

## Ce qui est déjà pensé pour les stores

- Confirmations et fenêtres intégrées à l'app, sans boîte de dialogue du navigateur.
- Zones sûres de l'écran respectées (encoche, barre du bas), cibles tactiles d'au moins 44 px.
- Fonctionnement hors ligne, thème clair et sombre, français et anglais.
- Comptes Firebase compatibles avec la connexion Apple et les notifications push (Firebase Cloud Messaging).

Les notifications push demandent un petit serveur pour les envoyer : Cloud Functions de Firebase, qui exige l'offre Blaze (paiement à l'usage, avec une large part gratuite). La décision se prendra au moment de préparer la version store.
