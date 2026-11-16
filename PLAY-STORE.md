# Publier Pronohub sur le Play Store : pas à pas

L'app Android est un emballage léger autour du site (une « Trusted Web Activity »). Elle affiche Pronohub en plein écran, sans barre d'adresse. Conséquence pratique : **chaque mise à jour du site arrive aussi dans l'app Android, sans repasser par Google**. Il ne faut renvoyer un paquet que si le nom, l'icône ou les couleurs changent.

Compte environ **trois semaines** au total, dont 14 jours de test fermé imposés par Google.

Ce qu'il te faut :
- 25 $ (une seule fois) pour le compte développeur ;
- une pièce d'identité, et un téléphone Android pour la vérification du compte ;
- **une adresse e-mail dédiée à l'app**, par exemple une nouvelle adresse Gmail. Google l'affiche publiquement sur la fiche : n'utilise pas ton adresse personnelle ;
- 12 amis avec un téléphone Android et un compte Google, prêts à installer l'app de test.

Les textes, images et réponses aux formulaires sont prêts dans `_source/store/` (fichier `FICHE-PLAY-STORE.md`).

---

## Étape 1 : créer le compte développeur (à lancer en premier)

La vérification d'identité peut prendre quelques jours, donc commence par là.

1. Va sur https://play.google.com/console et connecte-toi avec ton compte Google.
2. Choisis **Compte personnel** (« Pour vous-même »).
3. Renseigne :
   - le nom de développeur affiché sur le store, par exemple « Pronohub » ;
   - l'adresse e-mail de contact dédiée.
4. Paie les 25 $ et suis la vérification d'identité.
5. Vérifie ton téléphone Android quand la console le demande (via l'app Play Console).

## Étape 2 : fabriquer le paquet Android avec PWABuilder

1. Ouvre https://www.pwabuilder.com et colle l'adresse `https://francoiskaiser.github.io/Pronohub-app/`, puis **Start**.
2. Clique **Package for stores**, puis **Android**, puis **Generate Package**.
3. Ouvre **All settings** et règle :

| Réglage | Valeur |
|---|---|
| Package ID | `io.github.francoiskaiser.pronohub` (définitif) |
| App name | Pronohub |
| Short name | Pronohub |
| App version | `1.8.0` |
| App version code | `1` (à augmenter de 1 à chaque nouveau paquet) |
| Host | `francoiskaiser.github.io` |
| Start URL | `/Pronohub-app/?store=android` |
| Theme color | `#F49239` |
| Background color | `#F49239` |
| Nav color | `#1B1916` |
| Display mode | Standalone |
| Notification delegation | **activé** (les notifications passent par Android) |
| Location delegation | désactivé |
| Google Play billing | désactivé |
| Fallback behavior | Custom Tabs |
| Signing key | **Create new** : renseigne ton nom, « Pronohub » comme organisation et BE comme pays |

4. Clique **Download** : tu obtiens un fichier `.zip`.

Dans ce zip :
- `*.aab` : le paquet à envoyer à Google ;
- `assetlinks.json` : la preuve de propriété, pour l'étape 3 ;
- `signing.keystore` et `signing-key-info.txt` : **ta clé de signature et ses mots de passe**.

> **Range la clé et ses mots de passe en lieu sûr**, par exemple dans ton gestionnaire de mots de passe et sur ton NAS. Ne les mets jamais sur GitHub. Sans elle, tu ne peux plus publier de mise à jour du paquet sans passer par le support de Google.

Le paramètre `?store=android` de l'adresse de départ indique à Pronohub qu'elle tourne dans l'app Android. Elle remplace alors les logos des clubs par leurs initiales : ces logos sont des marques et n'ont pas leur place dans une app publiée.

## Étape 3 : créer le dépôt de preuve `francoiskaiser.github.io`

Android vérifie que l'app et le site ont le même propriétaire grâce à un fichier placé à la racine du domaine. Ton site Pronohub est dans un sous-dossier, donc il faut un second dépôt, gratuit, qui ne sert qu'à ça.

1. Sur GitHub, clique **New repository**.
2. Nom du dépôt : exactement `francoiskaiser.github.io`. Choisis **Public**, puis **Create repository**.
3. Clique **Add file**, puis **Create new file**.
   - Nom : `.nojekyll`. Laisse le contenu vide.
   - Clique **Commit changes**.

   Ce fichier vide est indispensable : sans lui, GitHub ignore les dossiers dont le nom commence par un point.
4. Clique à nouveau **Add file**, puis **Create new file**.
   - Nom : `.well-known/assetlinks.json` (en tapant le `/`, GitHub crée le dossier).
   - Contenu : colle le contenu du fichier `assetlinks.json` du zip de PWABuilder.
   - Clique **Commit changes**.
5. Va dans **Settings**, puis **Pages**. Vérifie que la source est la branche `main`, dossier `/ (root)`.
6. Après une minute, ouvre https://francoiskaiser.github.io/.well-known/assetlinks.json : tu dois voir le contenu du fichier.

Ton site Pronohub reste à la même adresse : ce nouveau dépôt n'y touche pas.

## Étape 4 : créer l'app dans la Play Console

1. Clique **Créer une application**. Renseigne :
   - Nom : `Pronohub : paris entre amis` ;
   - Langue par défaut : Français (France) ;
   - Type : Application, Gratuite.

   Accepte les déclarations.
2. Dans **Tableau de bord**, déroule « Configurer votre application » et remplis chaque rubrique avec `FICHE-PLAY-STORE.md` :
   - politique de confidentialité ;
   - accès à l'application ;
   - annonces ;
   - classification du contenu ;
   - public cible : 18 ans et plus ;
   - sécurité des données ;
   - suppression du compte : coche « Oui » et colle le lien de la page de suppression.
3. Dans **Fiche principale du Play Store**, colle les textes français, l'icône, la bannière et les 5 captures.
4. Ajoute l'anglais :
   - clique **Gérer les traductions**, puis **Ajouter des traductions** et choisis Anglais (Royaume-Uni) ;
   - colle les textes anglais et les captures du dossier `en/`.

## Étape 5 : lancer le test fermé (12 testeurs, 14 jours)

1. Menu **Tester et publier**, puis **Tests**, puis **Tests fermés**. Ouvre la piste proposée (souvent « Alpha »).
2. Onglet **Testeurs** :
   - crée une liste d'adresses e-mail : les comptes Google Android de tes amis ;
   - copie le **lien d'inscription**.
3. **Créer une release**, puis glisse le fichier `.aab` du zip.
   - Google active la « signature des applications par Google Play » : accepte.
   - Notes de version : « Première version de test ».
   - Envoie la release en examen. La première validation prend quelques heures à quelques jours.
4. Envoie le lien d'inscription à tes testeurs. Chacun doit :
   - ouvrir le lien et accepter de devenir testeur ;
   - installer Pronohub depuis le Play Store ;
   - **rester inscrit 14 jours d'affilée**. S'il se désinscrit, son compteur repart à zéro. Ouvrir l'app de temps en temps aide aussi.

### Ajouter la seconde empreinte (important)

Google re-signe l'app avec sa propre clé. Il faut donc ajouter son empreinte à la preuve, sinon une barre d'adresse s'affiche en haut de l'app installée depuis le store.

1. Play Console, menu **Tester et publier**, **Configuration**, puis **Intégrité de l'application**. Onglet **Signature de l'application**.
2. Copie l'**empreinte du certificat SHA-256** de la « clé de signature de l'application ».
3. Dans le dépôt `francoiskaiser.github.io`, modifie `.well-known/assetlinks.json` :
   - ajoute cette empreinte dans la liste `sha256_cert_fingerprints`, entre guillemets et séparée de la première par une virgule ;
   - le modèle `_source/store/assetlinks-modele.json` montre le résultat attendu.

### Ce que les testeurs doivent vérifier

- La connexion avec Google et avec un e-mail.
- Les notifications, après les avoir activées dans Réglages.
- Les liens d'invitation reçus par WhatsApp : ils doivent ouvrir l'app.
- L'absence de barre d'adresse en haut de l'écran.

## Étape 6 : demander la mise en production

Après 14 jours avec au moins 12 testeurs inscrits :
1. **Tableau de bord**, puis **Demander l'accès à la production**.
2. Google pose quelques questions sur le test : comment tu as recruté les testeurs, ce qu'ils ont remonté et ce que tu as corrigé.
3. Après validation (souvent quelques jours), crée une release en **Production** avec le même `.aab`, choisis les pays (Belgique, France, etc.) et publie.

## Plus tard : mettre à jour l'app

- **Changement dans l'app** (écrans, fonctions) : rien à faire côté Play Store. La mise à jour du site suffit.
- **Changement d'icône, de nom ou de couleurs** : régénère un paquet dans PWABuilder.
  - Utilise la même clé : « Use mine », avec `signing.keystore` et ses mots de passe.
  - Augmente l'« App version code » de 1.
  - Envoie le nouveau `.aab` en production.
