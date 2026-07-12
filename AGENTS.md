# AGENTS.md — Architecture d'exécution de KartSquad

> **À lire en premier au démarrage de chaque session.** Ce document décrit *comment* on travaille sur KartSquad : les rôles, le pipeline, ce qui doit être validé par le Product Owner, et comment garder une exécution cohérente d'une session à l'autre. La source de vérité *produit* reste `docs/cahier-des-charges.md`.

## Contexte projet

KartSquad — application de karting amateur avec système Elo, courses entre amis, gamification.
Stack : **React Native + Web via Expo** (frontend) · **Supabase** (Postgres, auth, API, realtime, stockage) · notifications **Expo Push** · analytics **PostHog**. Français au lancement, i18n prête.

## 1. Rôles & hiérarchie

- **Product Owner — l'utilisateur (toi).** Vision, priorités, validation de **toute décision stratégique** (cf. §3). Rien de stratégique n'avance sans son feu vert.
- **Orchestrateur — Claude Code (moi).** Découpe le travail, dispatche aux agents, assemble, garde la cohérence avec le cahier des charges, et reporte au Product Owner. Code peu lui-même : il coordonne et arbitre.
- **6 agents spécialisés** :

| Agent | Domaine |
|---|---|
| **Backend** | Supabase : schéma, migrations, logique Elo (fonction de calcul), API, notifications, stockage |
| **Frontend** | Expo (React Native + Web) : écrans, composants, navigation, état applicatif, i18n, intégration API |
| **Design/UX** | Design system Rosso Corsa, maquettes, iconographie, décisions visuelles, cohérence UX — en amont du Frontend |
| **Sécurité/Infra** | RLS Supabase, RGPD/données personnelles, anti-triche, infra & coûts, déploiement/CI |
| **Reviewer** | Revue de code adversariale : bugs, sécurité, simplicité, cohérence avec le cahier. Avant tout merge |
| **Testeur (QA)** | Tests (Elo unitaire, intégration, e2e des flux), exécution réelle, vérification des chiffres. Garant de la Definition of Done |

> Reviewer et Testeur formalisent l'**agent « challenge »** déjà utilisé systématiquement : rien ne passe sans audit adversarial + vérification.

## 2. Pipeline, par fonctionnalité / lot

1. **Cadrage** — l'orchestrateur extrait du cahier les critères d'acceptation, découpe en tâches (design → backend/frontend), et soumet les points stratégiques au Product Owner.
2. **Design/UX** (si l'UI est concernée) — maquette + décisions visuelles validées avant le code.
3. **Build** — Backend et Frontend travaillent (en parallèle quand indépendants) sur une **branche dédiée au lot**.
4. **Revue** — le Reviewer audite le diff ; corrections en boucle jusqu'au vert.
5. **Test** — le Testeur écrit/exécute les tests et **exerce réellement les flux** (pas juste « ça compile ») ; vérifie les chiffres Elo.
6. **Assemblage & rapport** — l'orchestrateur vérifie la cohérence globale, reporte au Product Owner, et pousse une fois tout vert (PR seulement sur demande).

### Mode d'orchestration : workflows structurés
L'orchestration se fait via des **workflows déterministes** (pipeline codé : design → build → review → test, avec fan-out quand utile), dès le départ, pour une exécution reproductible. **Le Product Owner a donné son accord explicite et permanent** à l'orchestration multi-agents (workflows) sur ce projet. Les petits correctifs isolés peuvent rester en agent simple à la demande.

## 3. Portail de décision

Règle d'or : le Product Owner veut **peu de liberté déléguée** — en cas de doute sur la classification, **on remonte**.

**◆ Stratégique → validation du Product Owner obligatoire :**
- Périmètre & priorités de la roadmap
- Tout ce qui est **visible par l'utilisateur** (écrans, flux, textes clés)
- **Règles du jeu** : Elo, grades, badges, cycle de course
- Toute nouvelle **dépendance** ou tout ce qui a un **coût**
- **Sécurité, RGPD, données personnelles**
- **Marque, nom, identité**
- Tout **écart au cahier des charges**

**○ Tactique → l'orchestrateur décide & documente :**
- Structure du code, nommage, découpage
- Refactors internes sans impact produit
- Choix de libs mineures (sans coût / sans risque)
- Détails d'implémentation, optimisations
- Organisation des tests
- Corrections de bugs conformes au cahier

## 4. Cohérence entre sessions

Tout vit dans le repo. **Fichiers à lire au démarrage, dans cet ordre :**
1. `AGENTS.md` (ce fichier) — l'architecture d'exécution.
2. `docs/cahier-des-charges.md` — la source de vérité produit.
3. `docs/roadmap.md` — la roadmap + l'état d'avancement (statut par lot), mise à jour à chaque session.
4. `docs/decisions.html` — le registre des décisions déjà tranchées.

**Git :** une **branche par lot**, commits clairs et descriptifs, audit Reviewer + Testeur avant tout merge, **PR uniquement sur demande** du Product Owner. Branche de développement courante : `claude/karting-app-requirements-d5xm1t`.

## 5. Definition of Done

Une tâche n'est « finie » que si :
- ✓ **Conforme au cahier** et aux critères d'acceptation du lot
- ✓ **Reviewer** : aucun bug bloquant, code cohérent et simple, sécurité OK
- ✓ **Testeur** : tests passent + flux exercé réellement + chiffres Elo vérifiés
- ✓ **Accessibilité** respectée (couleur + signe, contrastes, focus clavier)
- ✓ **Docs à jour** (cahier / roadmap / décisions) et poussé sur GitHub

## 6. Reporting

À chaque étape clé : un **résumé concis** (fait / en cours / bloqué) + les décisions stratégiques présentées en **questions cliquables**. Aucune décision stratégique n'avance sans le clic du Product Owner. L'état est toujours dans le repo pour reprendre le fil à tout moment.
