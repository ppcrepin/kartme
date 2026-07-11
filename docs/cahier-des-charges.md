# KartMe — Cahier des charges v0.2

Application de karting amateur avec système Elo, courses entre amis et gamification.
Rédigé à partir des échanges des 11-12 juillet 2026. **Aucun développement ne démarre tant que ce document n'est pas validé.**

## 1. Vision

Démocratiser l'accès au karting amateur via un système "Elo" façon échecs : un administrateur crée une course réelle, invite des joueurs, saisit le classement final, et ce classement fait évoluer l'Elo de chacun. L'application doit devenir **virale** par le partage social, avec une interface simple (peu de texte, beaucoup de graphiques).

## 2. Choix techniques validés

| Sujet | Décision |
|---|---|
| Plateformes | React Native + Web (Expo) — un seul code base pour iOS, Android et Web ; on commence par le web |
| Backend / infra | Supabase (Postgres managé + auth + API + realtime) — coûts prévisibles |
| Authentification | Email/mot de passe + connexion Google + Apple (pas de SMS/téléphone → pas de coût SMS) |
| Langue | Français uniquement au lancement, mais tous les textes passent par un système de traduction (i18n) dès le départ pour ouvrir l'international sans refonte |

## 3. Modèle d'une course

- Une **course = une seule manche/session** (pas de courses multi-manches agrégées au MVP).
- **Individuel uniquement** — pas de courses par équipes au MVP.
- **Pas de catégorisation** par type de karting (indoor/outdoor/électrique...) au MVP — toute course compte pareil.
- **Données saisies par l'admin** : classement final (obligatoire) + temps au tour meilleur/moyen (facultatif, saisie manuelle).
- **Taille d'une course** : minimum 2 participants, pas de maximum imposé.
- **Égalités interdites** : l'admin doit départager en cas d'ex-aequo réel — pas de gestion de match nul dans le calcul Elo.

## 4. Cycle de vie d'une course

1. **Création** — n'importe quel utilisateur inscrit peut créer une course (lieu/circuit, date). Il en devient l'admin, seul à pouvoir saisir/modifier le classement (pas de délégation/co-admin au MVP).
2. **Invitation** — lien ou QR code unique partageable (SMS, WhatsApp...) ; ajout direct possible depuis la liste d'amis.
3. **Participants sans compte** — l'admin peut saisir un simple nom : un **profil fantôme** est créé avec son propre Elo qui évolue. Réclamation sécurisée plus tard : la personne clique sur un lien pointant vers son profil fantôme précis (envoyé par l'admin), crée son compte, et **l'admin de la course confirme** que c'est bien elle avant que l'historique ne soit rattaché.
4. **Saisie du résultat** — l'admin saisit le classement final ; les Elo de tous les participants (comptes réels + fantômes) sont recalculés immédiatement.
5. **Fenêtre de correction** — l'admin peut corriger le classement pendant **24h** après validation ; l'Elo est recalculé automatiquement à chaque correction. Passé ce délai, la course est figée dans l'historique.
6. **Annulation** — possible tant qu'aucun classement n'est saisi (aucun impact Elo). Une fois le classement validé, la course fait partie de l'historique officiel et n'est plus supprimable, pour préserver l'intégrité de l'Elo de tous les participants.
7. **Partage** — génération automatique d'une carte visuelle (podium + variation d'Elo de chacun, ex. `+18` / `-12`) prête à partager sur Instagram/WhatsApp. Version épurée pour le partage externe ; un clic sur le lien qu'elle contient ramène vers la page détaillée de la course dans l'app.

## 5. Système Elo — formule proposée

- **Elo de départ** : 1000 pour tout nouveau joueur (avant sa 1ère course).
- **Un seul Elo global** par joueur (pas d'Elo par circuit au démarrage).
- **Pas de saisons** : Elo continu depuis la première course, pas de reset périodique au MVP.
- **Pas de decay** : l'Elo d'un joueur inactif reste figé jusqu'à sa prochaine course (aucune pénalité d'inactivité).
- **Facteur K fixe** pour tout le monde (pas de K variable selon l'ancienneté au MVP).

**Calcul (comparaisons par paires normalisées)** — à l'issue d'une course de *n* participants classés sans ex-aequo :

Pour un joueur *i* face à chaque autre participant *j* (donc *n − 1* comparaisons) :

- Score attendu : `E(i,j) = 1 / (1 + 10^((Elo_j − Elo_i) / 400))`
- Score réel : `S(i,j) = 1` si *i* a terminé devant *j*, `0` sinon (pas de match nul possible, cf. §3)
- Variation d'Elo : `ΔElo_i = K × Σⱼ [S(i,j) − E(i,j)] / (n − 1)`

La division par `(n − 1)` normalise l'impact d'une course à *n* participants pour qu'il reste comparable à un duel classique 1 contre 1, quelle que soit la taille du groupe.

**Exemple chiffré** — 4 joueurs, K = 32, Elo avant course : A=1000, B=1000, C=1000, D=1000. Classement : A 1er, B 2e, C 3e, D 4e.
Tous les Elo étant égaux, chaque `E(i,j) = 0.5`. A bat les 3 autres (S=1 à chaque fois) : `ΔElo_A = 32 × [(1−0.5)+(1−0.5)+(1−0.5)] / 3 = +16`. D perd 3 fois : `ΔElo_D = 32 × [(0−0.5)×3] / 3 = −16`. B et C, un gain et une perte chacun : `ΔElo_B = 32 × [(1−0.5)+(0−0.5)+(1−0.5)] / 3 ≈ +5.3` (approx.), `ΔElo_C ≈ −5.3`.

*→ Points à valider avec toi avant implémentation : la valeur de K (32 est la convention échecs, on peut tester 16 ou 24 pour des mouvements plus doux vu la fréquence probable des courses) et si on arrondit à l'entier le plus proche à chaque course.*

## 6. Couche sociale

**Amis** — demande d'ami mutuelle (envoi → acceptation), symétrique. Pas d'accès aux contacts du téléphone (uniquement invitation par lien/QR, plus respectueux de la vie privée). Cliquer sur un ami ouvre son profil : historique de courses, classements, courbe d'évolution de son Elo.

**Visibilité des profils** — Elo, historique et badges sont **visibles par tous les utilisateurs inscrits** de l'app (pas seulement les amis), pour favoriser la découverte et la comparaison — mais jamais indexés publiquement sur le web.

**Blocage / signalement** — dès le MVP : bloquer un utilisateur (empêche invitation/ajout en ami), signaler un comportement (modération manuelle au départ).

**Gamification** :
- Elo affiché en chiffre (référence précise) **+ un rang visuel** en complément (ex. "Pilote Bronze/Argent/Or/Platine" selon des paliers d'Elo à définir).
- Badges/trophées (1ère victoire, 10 courses, podiums consécutifs, plus grosse progression Elo...), avec un ton fun et des jeux de mots (voir `PUNS.md` à la racine du repo, à enrichir en continu).

**Mécanique virale** — partage automatique de la carte de résultat en fin de course (cf. §4.7).

**Onboarding** — aucun écran pédagogique : l'utilisateur est mené directement à l'action, l'interface doit rester assez explicite d'elle-même.

## 7. Notifications

Notifications push essentielles uniquement au MVP : invitation à une course, résultat d'une course saisi, demande d'ami reçue/acceptée. Pas de notifications "sociales" (ex. dépassement au classement) dans un premier temps, pour éviter la fatigue de notification.

## 8. Confidentialité, sécurité et légal

- **Suppression de compte (RGPD)** : le compte et les données personnelles sont supprimés ; l'historique des courses passées reste dans la base mais **anonymisé** ("Joueur supprimé"), pour préserver l'intégrité de l'Elo des autres participants.
- **Âge minimum** : non bloqué pour le MVP en interne, mais **prérequis légal à traiter avant tout lancement public** (probable seuil 13-16 ans selon RGPD, à trancher avec un avis juridique).
- **Accessibilité couleurs** : toute information portée par une couleur (victoire/défaite/progression Elo) est **systématiquement doublée d'un icône/signe** (`+`/`−`, `▲`/`▼`) pour rester lisible aux daltoniens (~8% des hommes).
- **Anti-triche MVP** : seul l'admin créateur de la course peut saisir/modifier le classement, dans la fenêtre de correction de 24h (cf. §4.5). Pas de validation multi-joueurs pour l'instant — réserve en cas d'abus constatés.

## 9. Design

Thème sombre premium unique (asphalte/carbone), commun à tous. Accents colorés inspirés des écuries F1 (rouge, argent, bleu marine, orange...) utilisés **contextuellement** (victoire, défaite, progression d'Elo, badges) — pas en personnalisation de profil. Peu de texte, priorité aux graphiques (courbe d'Elo, jauges de rang), toujours accompagnés d'icônes/signes en plus de la couleur (cf. §8).

## 10. Navigation

| Onglet | Contenu |
|---|---|
| Courses | Créer une course, rejoindre via lien/QR, activité récente |
| Classements | Leaderboard, bascule Amis / Global |
| Amis | Liste d'amis, demandes en attente, profil détaillé d'un ami |
| Profil | Mon Elo (chiffre + rang), ma courbe de progression, mes badges, mes courses passées + accès réglages (icône) |

Pas d'onglet réglages séparé : au-delà de 4-5 onglets une barre de navigation mobile devient surchargée ; les réglages vivent dans le profil (pattern Instagram/Strava/Chess.com).

## 11. Modèle économique et maîtrise des coûts

- **Gratuit, sans publicité ni paiement** au démarrage — monétisation étudiée plus tard une fois la traction prouvée.
- **Limites techniques anti-abus/coûts** : nombre de courses créées par utilisateur/jour plafonné, compression automatique des photos (image de partage, éventuelles photos de course) pour garder le stockage léger.
- Pas de coût SMS (authentification par email/Google/Apple uniquement), pas de coût lié aux contacts téléphone (non utilisés).

## 12. Périmètre du MVP

**Inclus** : compte (email + Google/Apple), création/invitation de courses, profils fantômes + réclamation sécurisée, saisie de classement par l'admin avec fenêtre de correction 24h, calcul Elo (formule §5), demandes d'amis, blocage/signalement, profil détaillé d'un ami, leaderboard amis/global, rangs visuels + badges/trophées de base, carte de résultat partageable, notifications push essentielles, limites anti-abus, i18n prêt (FR only au lancement).

**Hors MVP (v2+)** : Elo par circuit, courses multi-manches, courses par équipes, confirmation multi-joueurs du classement, co-admin/délégation, notifications sociales, saisons Elo, statistiques avancées (rival favori, forme du moment), decay d'inactivité.

## 13. Points encore ouverts

- **Valeur exacte du facteur K** et arrondi — à valider avec les exemples chiffrés du §5 avant codage.
- **Paliers exacts des rangs visuels** (Bronze/Argent/Or/Platine...) — quelles bornes d'Elo pour chaque rang ?
- **Modération** — au-delà du blocage/signalement de base, faut-il un processus de revue humaine dès le MVP ou juste une boîte de réception à traiter manuellement ?
- **Âge minimum définitif et conformité juridique** (RGPD, mineurs) — à trancher avant lancement public, potentiellement avec un avis juridique.
- **Nom/marque** — "KartMe" est un nom de travail (nom du repo) : à confirmer comme nom définitif ou provisoire.
