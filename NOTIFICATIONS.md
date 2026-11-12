# Notifications de Pronohub : mise en route

Les notifications (nouveau pari dans un cercle, résultat d'un pari) passent par deux services gratuits :

- **Firebase Cloud Messaging** (déjà inclus dans ton projet Firebase `pronohub-e4464`) livre les notifications aux téléphones.
- **Un petit relais Cloudflare** (offre gratuite, 100 000 appels par jour) décide qui prévenir. Son code est dans `_source/worker/pronohub-notify.js`.

Tant que ces étapes ne sont pas faites, l'app fonctionne normalement et le bloc « Notifications » reste caché.

## 1. Firebase : deux éléments à récupérer

Console Firebase, projet Pronohub, roue dentée ⚙ en haut à gauche, **Paramètres du projet**.

1. Onglet **Cloud Messaging**.
   - Vérifie que « API Firebase Cloud Messaging (V1) » est **Activée**.
   - Section **Configuration Web**, puis **Certificats Web Push**, puis **Générer une paire de clés**.
   - Copie la clé affichée (une longue suite qui commence souvent par `B`). Elle est publique : tu peux me l'envoyer.
2. Onglet **Comptes de service**.
   - Clique **Générer une nouvelle clé privée**, puis **Générer la clé**. Un fichier `.json` se télécharge.
   - Ce fichier est un **mot de passe administrateur** de ton projet. Ne l'envoie à personne (moi compris), ne le mets jamais dans le dépôt GitHub. Il ne servira qu'à l'étape 2.4.

## 2. Cloudflare : créer le relais

1. Crée un compte gratuit sur dash.cloudflare.com (le choix du sous-domaine `….workers.dev` est libre).
2. Menu **Compute (Workers)**, ou **Workers & Pages**, puis **Créer**, puis **Créer un Worker** (modèle « Hello World »).
   - Nom : `pronohub-notify`.
   - Clique **Déployer**.
3. Clique **Modifier le code**.
   - Efface tout le contenu.
   - Colle le code complet de ce fichier : https://raw.githubusercontent.com/francoiskaiser/Pronohub-app/main/_source/worker/pronohub-notify.js
   - Clique **Déployer**.
4. Reviens au Worker, onglet **Paramètres**, section **Variables et secrets**, puis **Ajouter**.
   - Type : **Secret**.
   - Nom : `FIREBASE_SA`.
   - Valeur : ouvre le fichier `.json` de l'étape 1.2 avec le Bloc-notes et colle **tout** son contenu.
   - Clique **Déployer**.
   - Tu peux ensuite supprimer le fichier `.json` de ton ordinateur.
5. Copie l'adresse du Worker, du type `https://pronohub-notify.ton-sous-domaine.workers.dev`.
   - Ouvre-la dans le navigateur. Tu dois voir `{"ok":true,"service":"pronohub-notify"}`.

## 3. Me transmettre

- la clé Web Push (étape 1.1) ;
- l'adresse du Worker (étape 2.5).

Je les ajoute dans l'app et je publie : le bloc « Notifications » apparaît alors dans Réglages.

## Bon à savoir

- **Règles Firestore** : rien à changer. Le relais lit Firestore avec le compte de service ; les jetons de notification sont rangés dans le profil de chaque joueur (`users/{uid}.push`), lisible par lui seul.
- **Sécurité** : le relais vérifie que l'appel vient d'un membre connecté du cercle, depuis l'adresse de l'app. Il ne prévient que pour un vrai nouveau pari ou un vrai résultat, une seule fois par événement.
- **iPhone** : les notifications web exigent iOS 16.4 ou plus et que Pronohub soit installée sur l'écran d'accueil.
- **Clé compromise ?** Console Google Cloud, IAM, Comptes de service : supprime la clé, génère-en une nouvelle et remplace le secret `FIREBASE_SA`.
- **App Store et Play Store** : avec Capacitor, l'app native reçoit un jeton FCM du même type. Le même relais servira, il suffira d'ajouter le module de notifications natif.
