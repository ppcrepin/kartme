# Reprise de session — KartSquad

> **À lire en premier** dans une nouvelle session Claude Code.
> Dernière mise à jour : 28/07/2026.

---

## 1. Le produit

**KartSquad** — application de karting entre amis avec un **classement Elo façon échecs**.
Web-first (PWA), en français, design **F1 / Rosso Corsa** avec police d'affichage **Fraunces**.

- **URL publique** : https://ppcrepin.github.io/kartme/ (GitHub Pages, déploiement auto à chaque push)
- **Dépôt** : `ppcrepin/kartme` — branche de travail `claude/karting-app-requirements-d5xm1t` (identique à `main`)

---

## 2. Conventions de travail (IMPORTANT)

Le Product Owner (ppcrepin) travaille de façon très cadrée. À respecter :

1. **Beaucoup de questions cliquables avant toute décision** (AskUserQuestion), avec une option recommandée. **Peu d'autonomie** : ne rien décider seul sur le produit.
2. **Livraison lot par lot**, testée en production par le PO entre chaque lot.
3. **Agent Reviewer adversarial OBLIGATOIRE** avant tout push touchant l'UI, les textes ou le schéma. Il a déjà attrapé plusieurs bloquants réels (auto-attribution modérateur, auto-dé-suspension, deep-link cassé, farming de badges).
4. **Vérifications systématiques** avant push : `npx tsc --noEmit`, `npx eslint src/`, `npx jest`, et le harnais DB.
5. **Le PO colle lui-même le SQL** dans Supabase (SQL Editor → Run). Toujours lui fournir le fichier de migration prêt à coller, avec des instructions simples.
6. Le PO est **souvent sur iPhone** → privilégier les instructions courtes et le contenu collable directement dans le chat plutôt que des fichiers à ouvrir.

### Commandes utiles

```bash
npx tsc --noEmit          # typecheck
npx eslint src/           # lint
npx jest                  # tests unitaires
# Harnais DB (Postgres local jetable) :
su postgres -c "pg_ctlcluster 16 main start"
su postgres -c "PGHOST=/var/run/postgresql bash supabase/tests/run.sh"
```

---

## 3. Stack

- **Expo SDK 57** / React Native **web-first**, expo-router (routes typées), TypeScript strict
- **Supabase** : Postgres + Auth (email + Google) + RLS + RPC `SECURITY DEFINER` + Edge Functions (Deno)
- **Web Push** (VAPID, service worker `public/sw.js`, Edge Function `push`, déclencheurs via `pg_net`)
- Tests : **jest** (unitaires) + harnais **SQL** maison (`supabase/tests/*.sql`, émulation Supabase locale)

---

## 4. État : tout est EN LIGNE ✅

Phases 1, 2 et 3 (code) sont déployées et le SQL est collé en production.

| Bloc | Contenu |
|---|---|
| **Phase 1** | Auth, profils, courses, moteur Elo, saisie du classement |
| **2.1–2.3** | Amis / blocage / signalements · Classements (Amis+Global) · **12 badges** |
| **2.4** | Notifications Web Push (3 types + silence 22h–8h) |
| **2.5** | Réglages : pseudo, profil privé, déblocage, **suppression RGPD** (anonymisation) |
| **2.6** | Cycle de vie de course : verrou optionnel + rappel, **correction 24 h** |
| **3.1a** | Durcissement : filtre de mots **serveur**, rate-limits, drapeau modérateur |
| **3.1b** | **Boîte de modération** (super-admin) + suspension serveur dure |
| **3.2** | **Analytics 100 % maison** (aucun tiers) + écran Stats (K-factor, activation, rétention, erreurs) |
| **3.3** | **Consentement CGU/confidentialité** à l'inscription + pages légales finalisées |
| **UX** | Refonte post-audit : deep-link d'invitation, rejoindre une course, ⚙︎ Réglages, listes plafonnées, icônes d'onglets, **carte « Ma position » + Top X%** |
| **Temps au tour** | Meilleur tour par pilote (**hors Elo**) + record du circuit |

---

## 5. Décisions produit à connaître

- **Elo** : K=64, diviseur D=800, plancher 100 / plafond 2500, somme nulle (arrondi au plus grand reste).
- **Anti-triche central** : l'Elo ne s'échange **qu'entre comptes inscrits**. Les invités « fantômes » comptent dans la course mais leur Elo est **figé** et ils sont **hors du classement Global**.
- **12 badges** nommés par le PO : Voiture balai, Midi moins le kart, DRS, Safety car, Push… (seuils ±45).
- **Suppression RGPD** = anonymisation en place (« Joueur supprimé »), **jamais** de delete du profil (cela casserait l'Elo des autres).
- **Correction de classement** : fenêtre 24 h, refusée si un pilote a couru depuis (Elo « à chemin »). Elle rembobine aussi les badges et **préserve les temps au tour**.
- **Temps au tour** : informatif / prestige, **n'affecte pas l'Elo**. Chacun édite le sien, l'admin peut saisir pour tous.
- **Beta** : lien ouvert, **aucune barrière d'âge**, pages légales publiées **sans relecture juriste** (risque assumé par le PO — à réviser en incrémentant `TERMS_VERSION`).
- **Analytics** : aucun service tiers (pas de PostHog/Sentry). Tout est dans Supabase.
- Le PO est **modérateur** (`is_moderator`) → accès aux écrans Modération et Stats via Réglages.

---

## 6. Ce qui reste à faire

1. **Test du push serveur** — à faire **de jour** (hors 22h–8h) : vérifier qu'une notification part réellement (invitation / résultat / signalement).
2. **Lot 3.4 — Campagne beta** : ouvrir l'app au groupe de karteurs, collecter les retours, trier les bugs. Surtout de l'animation, peu de code.
3. **Idées rétention validées par le PO**, à construire :
   - **Carte de podium partageable en image** (× viralité sur WhatsApp)
   - **Onboarding guidé** au premier lancement (checklist 3 étapes)
4. **Reporté** : fusion des profils fantômes à la réclamation (décision B3, la plus risquée).
5. **Phase 4** : logo/icône, EAS Build iOS/Android, soumission aux stores.

---

## 7. Comparaison avec l'app de Maggie

Une amie (**Maggie**, GitHub `Magui1004`) a développé une app de karting en parallèle : `Magui1004/kartme` (privé, le PO y a accès).

- Le PO en a fait un **fork** : **`ppcrepin/kartme-maggie`**
- **Objectif** : comparer les deux applications, **sans jamais modifier** le fork. Tout développement reste sur `ppcrepin/kartme`.
- **À comparer** : modèle de données, calcul d'Elo et anti-triche, architecture/stack, parcours utilisateur, sécurité (RLS). Livrable attendu : une short-list de ce qui vaudrait le coup d'être repris — **validée point par point par le PO**.
- ⚠️ Reprendre du code chez elle = question de paternité/licence → le signaler au PO le moment venu.

**Pour l'ajouter dans la nouvelle session** : demander l'ajout de `ppcrepin/kartme-maggie` (même propriétaire que la source → l'ajout est autorisé).

---

## 8. Note sur l'accès GitHub

L'ancienne session s'authentifiait auprès de GitHub avec le compte **`ppceiffel`** (compte professionnel Eiffel), alors que le dépôt appartient à **`ppcrepin`** (compte perso). C'est pour ça que le fork `ppcrepin/kartme-maggie`, tout juste créé, était invisible.

Le PO a choisi de **rebrancher la connexion GitHub de son compte Claude sur `ppcrepin`**. Conséquence assumée : ce compte Claude perd l'accès GitHub aux dépôts Eiffel (environnement `BESS`, org `Eiffel-Investment-Group-SAS`).

Si un problème d'accès réapparaît, vérifier d'abord l'identité réelle du jeton avec l'outil GitHub `get_me`.
