# Activer les comptes et les cercles en ligne (Firebase)

Sans Firebase, Pronohub fonctionne déjà : les cercles « sur cet appareil » marchent hors ligne et on se passe le téléphone. Firebase ajoute les cercles en ligne (chacun sur son téléphone), les comptes Google ou e-mail et la synchronisation entre appareils. L'offre gratuite **Spark** suffit largement pour un groupe d'amis.

Compte environ 15 minutes.

## 0. Si ton compte Google a atteint la limite de projets

Firebase limite le nombre de projets par compte Google. Trois solutions :

- **Supprimer un projet inutilisé** : console Firebase > le projet > ⚙️ Paramètres du projet > tout en bas « Supprimer le projet ». Attention : un projet supprimé continue de compter pendant 30 jours.
- **Demander une augmentation du quota** : quand la console refuse la création, elle propose un lien vers un formulaire Google Cloud ; la réponse arrive en général en un ou deux jours.
- **Utiliser un autre compte Google** (par exemple un compte dédié à tes apps).

Ne réutilise pas le projet d'une autre app : les règles de sécurité sont uniques par projet et celles de Pronohub remplaceraient les autres.

## 1. Créer le projet

1. Va sur <https://console.firebase.google.com> et clique **Créer un projet**.
2. Nom : `pronohub` (ou ce que tu veux). Google Analytics : **désactivé** (inutile ici).

## 2. Ajouter l'app web et récupérer la configuration

1. Sur la page d'accueil du projet, clique l'icône **Web** (`</>`).
2. Surnom : `Pronohub`. Ne coche pas « Firebase Hosting » (on utilise GitHub Pages).
3. Firebase affiche un objet `firebaseConfig = { apiKey: "...", ... }`.
4. Ouvre `firebase-config.js` à la racine du dépôt et remplace les valeurs vides par celles-ci :

```js
var FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "pronohub-xxxx.firebaseapp.com",
  projectId: "pronohub-xxxx",
  storageBucket: "pronohub-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

La clé `apiKey` n'est pas un secret : elle peut être publique. La sécurité repose sur les règles de l'étape 4.

## 3. Activer la connexion

Console > **Authentication** > **Commencer**, puis onglet **Mode de connexion** :

1. **Anonyme** : activer (indispensable, c'est le mode par défaut).
2. **Google** : activer, choisir ton adresse comme « e-mail d'assistance ».
3. **Adresse e-mail/Mot de passe** : activer (la première option seulement).

Puis onglet **Paramètres** > **Domaines autorisés** > **Ajouter un domaine** : `<ton-pseudo>.github.io`.

## 4. Créer la base Firestore et publier les règles

1. Console > **Firestore Database** > **Créer une base de données**.
2. Emplacement : `eur3 (europe-west)` ou `europe-west1 (Belgique)`. Ce choix est définitif.
3. Mode : **production**.
4. Onglet **Règles** : efface tout, colle le contenu du fichier `firestore.rules` du dépôt, clique **Publier**.

Aucun index composé n'est nécessaire.

## 5. Publier et tester

1. Pousse le `firebase-config.js` rempli sur GitHub (il ne sera plus jamais écrasé par les mises à jour).
2. Ouvre l'app, crée un cercle : l'option **En ligne** est maintenant proposée.
3. Envoie le lien d'invitation à un ami ou ouvre-le sur un autre appareil.

## En cas de souci

| Ce que tu vois | Solution |
|---|---|
| « Accès refusé » | Les règles ne sont pas publiées ou sont anciennes : refais l'étape 4. |
| « Connexion impossible » | Le mode Anonyme n'est pas activé (étape 3), ou un bloqueur de publicité bloque Firebase. |
| La connexion Google s'ouvre puis échoue | Le domaine `github.io` n'est pas dans les domaines autorisés (étape 3). |
| « Ce mode de connexion n'est pas activé » | Active Google ou E-mail/Mot de passe (étape 3). |

## Quand les règles changent

Chaque fois que le `CHANGELOG.md` signale une modification de `firestore.rules`, recopie le fichier dans la console (étape 4) et clique **Publier**.
