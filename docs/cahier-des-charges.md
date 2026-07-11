# KartMe — Cahier des charges v0.1

Application de karting amateur avec système Elo, courses entre amis et gamification.
Rédigé à partir des échanges du 11 juillet 2026. **Aucun développement ne démarre tant que ce document n'est pas validé.**

## 1. Vision

Démocratiser l'accès au karting amateur via un système "Elo" façon échecs : un administrateur crée une course réelle, invite des joueurs, saisit le classement final, et ce classement fait évoluer l'Elo de chacun. L'application doit devenir **virale** par le partage social, avec une interface simple (peu de texte, beaucoup de graphiques).

## 2. Choix techniques validés

| Sujet | Décision |
|---|---|
| Plateformes | React Native + Web (Expo) — un seul code base pour iOS, Android et Web ; on commence par le web |
| Backend / infra | Supabase (Postgres managé + auth + API + realtime) — coûts prévisibles |
| Authentification | Email/mot de passe + connexion Google + Apple |

## 3. Système Elo

- Un **seul Elo global** par joueur (pas d'Elo par circuit au démarrage).
- **Calcul multi-joueurs par comparaisons par paires** : à l'issue d'une course de N joueurs, chaque joueur est comparé à chacun des N-1 autres (mini-duels basés sur le classement relatif et l'écart d'Elo avant course), puis les gains/pertes sont cumulés.
- La formule précise (Elo de départ, facteur K) sera proposée avec des exemples chiffrés avant implémentation.

## 4. Cycle de vie d'une course

1. **Création** — un joueur (admin) crée une course : lieu/circuit, date, nombre de joueurs.
2. **Invitation** — lien ou QR code unique partageable (SMS, WhatsApp...) ; ajout direct possible depuis la liste d'amis.
3. **Participants sans compte** — l'admin peut saisir un simple nom : un **profil fantôme** est créé avec son propre Elo qui évolue. La personne pourra plus tard créer un compte et "réclamer" ce profil pour récupérer son historique.
4. **Saisie du résultat** — seul l'admin de la course saisit le classement final.
5. **Validation** — dès saisie par l'admin, le classement est officiel et les Elo sont recalculés (pas de confirmation multi-joueurs au MVP).
6. **Partage** — génération automatique d'une image de résultat (podium + variation d'Elo) partageable.

## 5. Couche sociale

**Amis** — demande d'ami mutuelle (envoi → acceptation), symétrique. Cliquer sur un ami ouvre son profil : historique de courses, classements, courbe d'évolution de son Elo.

**Gamification** — badges/trophées (1ère victoire, 10 courses, podiums consécutifs, plus grosse progression Elo...), avec un ton fun et des jeux de mots (voir `PUNS.md` à la racine du repo, à enrichir en continu).

**Mécanique virale** — partage automatique de l'image de résultat en fin de course.

## 6. Anti-triche (MVP)

Seul l'admin créateur de la course peut saisir/modifier le classement. Pas de validation multi-joueurs dans un premier temps (réserve en cas d'abus, voir §10).

## 7. Design

Thème sombre premium unique (asphalte/carbone), commun à tous. Accents colorés inspirés des écuries F1 (rouge, argent, bleu marine, orange...) utilisés **contextuellement** (victoire, défaite, progression d'Elo, badges) — pas en personnalisation de profil. Peu de texte, priorité aux graphiques (courbe d'Elo, jauges de rang).

## 8. Navigation (proposition)

| Onglet | Contenu |
|---|---|
| Courses | Créer une course, rejoindre via lien/QR, activité récente |
| Classements | Leaderboard, bascule Amis / Global |
| Amis | Liste d'amis, demandes en attente, profil détaillé d'un ami |
| Profil | Mon Elo, ma courbe de progression, mes badges, mes courses passées + accès réglages (icône) |

Pas d'onglet réglages séparé : au-delà de 4-5 onglets une barre de navigation mobile devient surchargée ; les réglages vivent dans le profil (pattern Instagram/Strava/Chess.com).

## 9. Périmètre du MVP

**Inclus** : compte (email + Google/Apple), création/invitation de courses, profils fantômes, saisie de classement par l'admin, calcul Elo, demandes d'amis, profil détaillé d'un ami, leaderboard amis/global, badges/trophées de base, image de résultat partageable.

**Hors MVP (v2+)** : Elo par circuit, confirmation multi-joueurs du classement, notifications push, statistiques avancées (rival favori, forme du moment), signalement de classement suspect.

## 10. Points encore ouverts

- **Modèle économique** — gratuit au démarrage, ou abonnement/version payante pour organisateurs réguliers dès le départ ?
- **Formule Elo précise** — Elo de départ et facteur K à valider avec exemples chiffrés avant codage.
- **Modération** — que faire en cas de classement contesté/faux saisi par un admin ? (option "signaler" envisagée en v2)
- **Nom/marque** — "KartMe" est un nom de travail (nom du repo) : à confirmer comme nom définitif ou provisoire.
