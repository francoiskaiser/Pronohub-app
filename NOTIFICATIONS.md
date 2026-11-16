# Notifications de Pronohub : mise en route et mises à jour

Les notifications passent par deux services gratuits :

- **Firebase Cloud Messaging** (déjà inclus dans ton projet Firebase `pronohub-e4464`) livre les notifications aux téléphones.
- **Un petit relais Cloudflare** (`pronohub-notify`, offre gratuite) décide qui prévenir. Son code est dans `_source/worker/pronohub-notify.js`.

Ce que le relais envoie :
- nouveau pari dans un cercle ;
- résultat ou annulation d'un pari sur lequel on a misé ;
- défi reçu, défi relevé ;
- invitation dans un cercle, demande d'ami acceptée ;
- contestation d'un résultat ;
- nouveau membre dans un cercle qu'on a créé ;
- toutes les 15 minutes : rappel « ce pari ferme dans l'heure et tu n'as pas misé », et rappel au créateur d'un pari terminé depuis un jour sans résultat.

## Mise à jour 1.5.0 (amis, duels, invitations, rappels) : 3 actions

### A. Republier les règles Firestore

1. Console Firebase, **Firestore Database**, onglet **Règles**.
2. Efface tout le contenu.
3. Colle le contenu complet de ce fichier : https://raw.githubusercontent.com/francoiskaiser/Pronohub-app/main/firestore.rules
4. Clique **Publier**.

Sans cette étape, les nouvelles fonctions affichent « Accès refusé ».

### B. Remplacer le code du relais

1. Cloudflare, **Workers & Pages**, puis `pronohub-notify`, puis **Modifier le code**.
2. Efface tout le contenu.
3. Colle le code complet de ce fichier : https://raw.githubusercontent.com/francoiskaiser/Pronohub-app/main/_source/worker/pronohub-notify.js
4. Clique **Déployer**.
5. Ouvre l'adresse du Worker dans le navigateur. Tu dois voir `{"ok":true,"service":"pronohub-notify","v":2}`.

Le secret `FIREBASE_SA` reste en place : rien à refaire.

### C. Ajouter le déclencheur des rappels (toutes les 15 minutes)

1. Dans le Worker, onglet **Paramètres**, section **Déclencheurs** (ou **Trigger Events**), puis **Ajouter**, puis **Déclencheurs Cron** (Cron Triggers).
2. Choisis « Toutes les… 15 minutes », ou colle l'expression : `*/15 * * * *`
3. Clique **Ajouter** (ou **Déployer**).

Pour vérifier, onglet **Logs** du Worker : toutes les 15 minutes, une ligne `rappels {...}` apparaît.

## Mise en route initiale (déjà faite)

1. Firebase, Paramètres du projet :
   - onglet Cloud Messaging : clé Web Push générée ;
   - onglet Comptes de service : clé privée `.json` générée. Si cette page ne charge pas, passe par Google Cloud, Comptes de service, avec les rôles « Utilisateur Cloud Datastore » et « Administrateur de l'API Firebase Cloud Messaging ».
2. Cloudflare :
   - Worker `pronohub-notify` créé avec le code ci-dessus ;
   - secret `FIREBASE_SA` = contenu complet du fichier `.json`.
3. La clé Web Push et l'adresse du Worker sont intégrées à l'app (`src/push.js`).

## Bon à savoir

- **Données** :
  - les jetons de notification sont rangés dans le profil de chaque joueur (`users/{uid}.push`), lisible par lui seul ;
  - les échéances des paris (`deadlines`) ne sont lisibles que par le relais ;
  - les fiches d'amis (`friends`) ne sont visibles que des deux amis.
- **Sécurité** :
  - le relais vérifie que l'appel vient d'un joueur connecté, depuis l'adresse de l'app ;
  - il relit les données pour confirmer chaque événement et ne l'envoie qu'une fois.
- **Limites gratuites** : Cloudflare autorise 100 000 appels par jour et 50 appels à Google par exécution. Le relais regroupe ses lectures pour rester bien en dessous.
- **iPhone** : les notifications web exigent iOS 16.4 ou plus et que Pronohub soit installée sur l'écran d'accueil.
- **Clé compromise ?** Console Google Cloud, IAM, Comptes de service : supprime la clé, génère-en une nouvelle et remplace le secret `FIREBASE_SA`.
- **App Store et Play Store** : avec Capacitor, l'app native reçoit un jeton FCM du même type. Le même relais servira, il suffira d'ajouter le module de notifications natif.
