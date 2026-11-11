# Journal des versions de Pronohub

## 1.2.0 — 11 novembre 2026

Nouveau : le mode solo, accessible depuis l'accueil.

- **Parcours** : 8 étapes sur de vrais matchs des saisons passées, au résultat caché. À chaque étape, place jusqu'à 3 tickets (simples ou combinés) pour atteindre l'objectif de jetons. Les étapes 4 et 8 imposent une règle spéciale.
- **Atouts** : choisis un atout de départ, puis achète-en d'autres à la boutique avec les fiches gagnées. 15 atouts changent les règles : chasseur d'outsiders, filet de sécurité, accumulateur, seconde chance…
- **Progression** : chaque Parcours rapporte de la réputation. Les niveaux débloquent des compétitions, des atouts, des avatars et des titres. 11 trophées à collectionner.
- **Défi du jour** : les mêmes vrais matchs pour tout le monde, 100 jetons et 3 tickets. Ton score apparaît dans l'onglet Classement de tes cercles.
- En solo, les cotes sont calculées par Pronohub d'après la forme des équipes au moment du match.

## 1.1.3 — 10 novembre 2026

- Correction : sur certains téléphones Android, Chrome croyait l'app déjà installée et refusait de l'installer. L'app a maintenant un identifiant neuf, ce qui permet une installation propre.

## 1.1.2 — 10 novembre 2026

- Étapes d'installation sur Android plus complètes : que faire quand la page s'ouvre depuis WhatsApp ou une autre app, et quand Chrome indique que l'appli est déjà installée.

## 1.1.1 — 10 novembre 2026

- Les matchs à venir couvrent maintenant les trois prochaines semaines, pour ne pas afficher un bandeau vide pendant les trêves internationales.

## 1.1.0 — 10 novembre 2026

- Nouvel accueil : chaque cercle affiche ton solde, ton rang, les paris ouverts, les résultats à saisir et le bonus du jour disponible.
- Les prochains matchs s'affichent sur l'accueil et dans l'onglet Paris : un bouton « Parier » crée le pari en un geste (Pro League, Ligue des champions, Ligue 1, Premier League, LaLiga, NBA).
- Correction : l'import de matchs fonctionne à nouveau (la source des résultats avait changé sa façon de répondre).
- Nouveau bouton « Installer » avec les étapes adaptées à ton téléphone (iPhone, Android, navigateur de WhatsApp ou Messenger) et à l'ordinateur.

## 1.0.0 — 10 novembre 2026

Première version.

- Crée un cercle d'amis en ligne et invite-les avec un code ou un lien, ou joue sur un seul téléphone qu'on se passe.
- Chacun reçoit 1 000 jetons fictifs par saison, un bonus chaque jour, et la banque renfloue ceux qui sont à sec.
- Parie sur des questions oui/non, à plusieurs choix, des élections, des matchs, ou défie un ami en duel.
- Importe les matchs du championnat belge, des grands championnats européens, des coupes d'Europe, de la NBA, de la NHL et de la NFL : les mises ferment au coup d'envoi et le résultat arrive tout seul.
- Les cotes bougent selon les mises de chacun (pari mutuel) ; bonus si tu trouves le score exact.
- Conteste un résultat qui te semble faux : si la majorité des parieurs est d'accord, les gains sont gelés jusqu'à correction.
- Classement, saisons avec palmarès et trophées, fil d'activité avec commentaires et réactions, badges et statistiques.
- Compte facultatif Google ou e-mail pour retrouver tes cercles sur tous tes appareils ; suppression du compte à tout moment.
- Thème clair ou sombre, français ou anglais, installable sur l'écran d'accueil et utilisable hors ligne.

**Action de ton côté** : pour les cercles en ligne, active Firebase et publie les règles `firestore.rules` (voir FIREBASE.md).
