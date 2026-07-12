# KartMe — Roadmap produit (détaillée)

> Roadmap par **phases jusqu'au lancement**, découpées en **lots livrables**, chaque lot détaillé par agent (Design/UX · Backend · Frontend · Sécurité/Infra · Test) avec ses **critères d'acceptation** et ses **dépendances**. Source de vérité produit : `docs/cahier-des-charges.md`. Méthode de travail : `AGENTS.md`.
>
> **Statut global : planification — rien n'est encore développé.** Chaque lot est `☐ à faire` jusqu'à ce que sa Definition of Done (cf. AGENTS.md §5) soit remplie.
>
> ⚠️ La structure et les priorités ci-dessous sont **stratégiques** → à valider par le Product Owner avant démarrage.

## Vue d'ensemble

| Phase | But | Lots |
|---|---|---|
| **0 · Fondations** | Socle technique prêt à accueillir les features | 0.0 Prérequis · 0.1 Init & CI · 0.2 Design system & i18n · 0.3 Données & sécurité |
| **1 · MVP cœur** | Compte → créer une course → Elo → résultats → profil | 1.1 Auth · 1.2 Création course · 1.3 Moteur Elo · 1.4 Déroulé & résultats · 1.5 Profil & historique |
| **2 · Social & gamification** | La boucle virale complète | 2.1 Amis · 2.2 Classements · 2.3 Badges · 2.4 Notifications · 2.5 Réglages |
| **3 · Beta fermée** | Durcir, mesurer, tester en réel | 3.1 Modération & durcissement · 3.2 Analytics · 3.3 Légal & onboarding beta · 3.4 Campagne beta |
| **4 · Publication stores** | iOS + Android publics | 4.1 Marque & ASO · 4.2 Build & soumission · 4.3 Lancement & suivi |

Légende agents : 🎨 Design/UX · ⚙️ Backend · 📱 Frontend · 🔒 Sécurité/Infra · 🧪 Test.

---

## Phase 0 — Fondations

### Lot 0.0 — Prérequis & vérifications *(bloquant, avant tout code de marque)*
- **Action PO/orchestrateur** : vérifier la **disponibilité du nom « KartMe »** — domaine (kartme.app / .com / .fr) et identifiants App Store / Play Store *(décision D1)*.
- **Action PO** : ouvrir les **comptes développeur** Apple (99 $/an) et Google Play (25 $ une fois) ; définir la **structure juridique** de l'éditeur *(C4)*.
- **Critères d'acceptation** : rapport de disponibilité du nom remis ; go/no-go sur « KartMe » ; comptes développeur créés.
- **Dépend de** : rien.

### Lot 0.1 — Initialisation du projet & CI
- ⚙️📱 Init **monorepo Expo** (React Native + Web) en TypeScript ; navigation (expo-router) avec le **shell à 4 onglets** (Courses/Classements/Amis/Profil) vide ; ESLint + Prettier.
- ⚙️ Init **projet Supabase** (local via Supabase CLI + projet cloud) ; gestion des variables d'environnement/secrets.
- 🔒 **CI GitHub Actions** : lint + typecheck + tests sur chaque push ; protection de branche.
- 🧪 Harnais de test : **Jest + React Native Testing Library** (unit/intégration) + **Playwright** (e2e web).
- **Critères d'acceptation** : l'app démarre sur Web et mobile avec les 4 onglets vides et la barre de navigation ; `npm test` et la CI passent au vert.
- **Dépend de** : 0.0.

### Lot 0.2 — Design system & i18n (socle)
- 🎨 **Tokens Rosso Corsa** figés (fond carbone, rouge #e10600, rampe de grades terracotta→or, blanc cassé, typo serif+sans, espacements, rayons — angles nets + boutons pilule) ; **choix de la police serif définitive** sous licence *(E2, stratégique)*.
- 🎨 **Palette d'états sémantiques** (succès/erreur/avertissement) distincte du rouge de marque *(E3, stratégique)*.
- 📱 Implémentation du **design system en composants** réutilisables (bouton pilule, carte, avatar-initiales, tags, tabbar, filet damier, jauge, médaillon de grade, mini-icônes badges/grades) + thème.
- 📱 **Socle i18n** (français, toutes les chaînes externalisées).
- 🧪 **Galerie de composants** (Storybook ou écran de démo) couvrant tous les composants de base.
- **Critères d'acceptation** : la galerie rend tous les composants conformes aux maquettes (`docs/ecrans-complets.html`) ; changer une chaîne se fait via i18n ; contrastes/focus vérifiés.
- **Dépend de** : 0.1. **Validation PO** : police + palette sémantique.

### Lot 0.3 — Schéma de données & sécurité (socle)
- ⚙️ **Schéma Postgres** + migrations : `profiles` (comptes), `ghost_profiles`, `circuits`, `races`, `participations`, `results`, `friendships`, `badges` + `user_badges`, `reports`, `notifications`, `elo_history`.
- ⚙️ **Seed** : liste des principaux **circuits de karting français**.
- 🔒 **RLS (Row Level Security)** table par table (ex. seul l'admin d'une course écrit ses résultats ; un profil privé n'est lu que par ses amis) ; politique de **rétention des fantômes** ; anonymisation RGPD à la suppression.
- 🧪 Tests de schéma + tests RLS (accès autorisé/refusé).
- **Critères d'acceptation** : schéma déployé, RLS active et testée, circuits seedés, migration reproductible.
- **Dépend de** : 0.1. **Validation PO** : modèle de données (impacte règles produit).

---

## Phase 1 — MVP cœur

### Lot 1.1 — Authentification
- 🎨 Écrans **S0** (connexion), **S0b** (inscription email), **S0c** (mot de passe oublié), **S0d** (choix du pseudo post-OAuth).
- ⚙️ **Supabase Auth** : email/mot de passe + **Google** + **Apple** ; création de profil ; **règles de pseudo** (3–20 car., non unique, filtre de mots) *(B4/B5)*.
- 📱 Écrans d'auth, gestion de session, onboarding pseudo (aucun écran pédagogique).
- 🔒 Config OAuth (Google/Apple), sécurité de session, filtre de mots interdits.
- 🧪 Tests : parcours des 3 méthodes, nouveau compte OAuth → pseudo, règles de pseudo, filtre.
- **Critères d'acceptation** : un utilisateur s'inscrit/se connecte par les 3 voies ; un nouveau compte social passe par S0d ; pseudos filtrés et bornés ; session persistée.
- **Dépend de** : 0.2, 0.3.

### Lot 1.2 — Création de course & participants
- 🎨 Écrans **C1** (accueil courses), **C2** (créer), **C3/C3b** (circuit), **C4** (date/heure), **C5** (feuille « Ajouter des pilotes » : amis / nom libre / lien-QR).
- ⚙️ CRUD courses ; recherche/ajout de circuit ; création de **profils fantômes** ; génération du **lien/QR d'invitation** (token) ; **modification lieu/date avant saisie** *(A4)* ; **limite ~10 courses/jour** *(A5)*.
- 📱 Flux de création, feuille d'ajout unifiée, sélecteur de circuit avec autocomplétion, sélecteur date/heure, liste d'accueil (À venir / Passées).
- 🔒 Contrôle d'accès (seul le créateur = admin), rate-limit courses/jour.
- 🧪 Tests : créer une course, ajouter amis + noms libres (fantômes) + partager le lien, modifier lieu/date, limite quotidienne.
- **Critères d'acceptation** : une course se crée avec circuit + date + participants mixtes ; le lien/QR fonctionne ; modif lieu/date possible avant résultats ; blocage au-delà de 10/jour.
- **Dépend de** : 1.1.

### Lot 1.3 — Moteur Elo (cœur) *(pièce maîtresse)*
- ⚙️ **Fonction de calcul Elo** (comparaisons par paires normalisées, **K=32**, diviseur **400**, plancher **100**) ; **mapping des grades** ; application **atomique** à la validation du classement ; **recalcul** dans la fenêtre de correction 24h.
- 🔒 Seul l'admin écrit les résultats (RLS) ; fenêtre de 24h contrôlée côté serveur ; recalcul serveur (non falsifiable côté client).
- 🧪 **Tests unitaires étendus** : cas de référence (`elo_world.py` : +18/0/−3/−6/−9, détail par paire +6/+5/+4/+3), **somme nulle**, plancher 100, cas limites **2 et 12 joueurs**, propriété « battre plus fort rapporte plus ».
- **Critères d'acceptation** : les résultats correspondent **exactement** aux calculs de référence ; somme des Δ nulle ; grades corrects ; recalcul cohérent après correction.
- **Dépend de** : 0.3.

### Lot 1.4 — Déroulé de course & résultats
- 🎨 Écrans **C6** (détail admin, grille grade+Elo), **C6′** (participant), **C6b** (« Qui était présent ? »), **C7** (saisie glisser-déposer), **C8** (attente, drapeau), **C9** (résultats détaillés), **C10** (détail Elo par paire), **C11** (carte de partage).
- ⚙️ Confirmation des présents ; soumission du classement ; **signalement de classement non-bloquant** *(A2)* ; génération de la **carte de partage** (image : podium + tous les coureurs + date) ; état **temps réel** « en attente » (Supabase realtime).
- 📱 Grille, confirmation des présents, glisser-déposer (+ **tap séquentiel** en alternative accessibilité *(F4)*), écran d'attente animé (drapeau, respecte reduce-motion), résultats complets, détail par paire, carte + **partage natif**.
- 🔒 Écriture réservée à l'admin ; le signalement part en modération sans annuler l'Elo.
- 🧪 Tests e2e du **flux complet** : créer → confirmer présents → saisir → participant voit attente puis résultats → partager.
- **Critères d'acceptation** : le flux marche de bout en bout ; le participant bascule attente→résultats en temps réel ; la carte contient date + tous les finishers ; couleurs toujours doublées d'un signe.
- **Dépend de** : 1.2, 1.3.

### Lot 1.5 — Profil & historique & grades
- 🎨 Écrans **R1** (mon profil : Elo + grade coloré + courbe + stats + badges), **R2** (échelle des grades colorée), **R5** (historique de mes courses).
- ⚙️ Agrégats de profil (Elo courant, nb courses, podiums), courbe d'évolution, historique.
- 📱 Profil, échelle des grades (rampe terracotta→or), historique cliquable vers une course.
- 🧪 Tests : cohérence Elo/grade/stats/historique.
- **Critères d'acceptation** : le profil affiche le bon Elo, grade, stats, courbe et historique ; taper une course ouvre ses résultats.
- **Dépend de** : 1.3, 1.4.

> **Fin de Phase 1 = MVP jouable en interne** : on peut créer une vraie course, saisir un classement, voir son Elo et son grade évoluer.

---

## Phase 2 — Social & gamification

### Lot 2.1 — Amis
- 🎨 Écrans **F1** (amis : reçues/envoyées/liste), **F2** (recherche), **P** (profil d'un pilote + face-à-face), **M1** (motif de signalement).
- ⚙️ **Amitiés** (demande/acceptation/refus/annulation/retrait) ; recherche de pilotes ; **blocage** ; **signalement** → boîte de modération.
- 📱 Liste d'amis (onglets reçues/envoyées), recherche, profil d'autrui avec **face-à-face** ("Toi 2 — 1 Lui"), menu bloquer/signaler/retirer, **règle « si c'est moi → R1 »**.
- 🔒 Application du blocage (empêche invitation/ajout) ; boîte de signalements.
- 🧪 Tests : cycle d'amitié complet, face-à-face, blocage, signalement, redirection self→R1.
- **Critères d'acceptation** : demandes reçues **et** envoyées gérables ; face-à-face correct ; blocage effectif ; se taper soi-même redirige vers R1.
- **Dépend de** : 1.5.

### Lot 2.2 — Classements
- 🎨 Écran **L1** (bascule Amis / Global).
- ⚙️ Requêtes de classement (amis / global) ; **fantômes exclus du classement Amis** *(B1)*, présents en Global ; respect de la **confidentialité « amis uniquement »** *(A6)*.
- 📱 Leaderboard avec bascule, mise en avant de sa propre ligne.
- 🧪 Tests : exactitude des classements, exclusion des fantômes en Amis, confidentialité respectée.
- **Critères d'acceptation** : classements corrects et cohérents avec les Elo post-course ; fantômes seulement en Global ; profils privés respectés.
- **Dépend de** : 1.5, 2.1.

### Lot 2.3 — Badges & gamification
- 🎨 Écrans **R3** (catalogue de badges), **R4** (détail d'un badge) — **icônes déjà dessinées** (`docs/badges-icones.html`).
- ⚙️ **Moteur de déblocage** des **10 badges MVP** (déclencheurs de `BADGES.md`) ; stockage `user_badges` ; horodatage.
- 📱 Catalogue (débloqués/à débloquer), détail, **animation/toast de déblocage** (respecte reduce-motion).
- 🧪 Tests : chaque badge se débloque sur son déclencheur exact (dont « Il est 2h moins le kart », « David contre Goliath »).
- **Critères d'acceptation** : les 10 badges se débloquent correctement et s'affichent avec leur icône ; le détail montre condition + date.
- **Dépend de** : 1.4, 1.5.

### Lot 2.4 — Notifications push
- 🎨 Écran **S3** (réglages notifications, interrupteurs).
- ⚙️ Intégration **Expo Push** ; **3 notifications essentielles** (invitation, résultat saisi, demande d'ami) ; **deep-links** (→ C6′ / C9 / F1) ; **heures de silence 22h–8h** ; ton avec jeu de mots *(G4)*.
- 📱 Réglages (toggles), demande de permission, réception + deep-link.
- 🔒 Respect des préférences et des quiet hours côté envoi.
- 🧪 Tests : déclenchement des 3 notifs, deep-link correct, silence nocturne respecté.
- **Critères d'acceptation** : les 3 notifs partent au bon moment, ouvrent le bon écran, et jamais entre 22h et 8h.
- **Dépend de** : 1.4, 2.1.

### Lot 2.5 — Réglages complets
- 🎨 Écrans **S1** (réglages), **S2 + S2a-e** (compte : pseudo/email/mdp/confidentialité/**suppression RGPD**), **S4 + S4a-d** (aide : FAQ/contact/CGU/confidentialité). *(« Langue » masquée au lancement.)*
- ⚙️ Modifs de compte ; **option profil « amis uniquement »** *(A6)* ; **suppression de compte RGPD** (anonymisation de l'historique) ; contenu d'aide.
- 📱 Toute la branche Réglages.
- 🔒 Suppression RGPD (anonymise « Joueur supprimé », préserve l'Elo des autres) ; application de la confidentialité.
- 🧪 Tests : chaque réglage, suppression → anonymisation, confidentialité.
- **Critères d'acceptation** : tous les réglages fonctionnent ; la suppression anonymise sans casser l'Elo des autres ; pages légales présentes.
- **Dépend de** : 1.1, 2.2.

> **Fin de Phase 2 = boucle virale complète** : amis, classements, badges, notifications, partage.

---

## Phase 3 — Beta fermée

### Lot 3.1 — Modération & durcissement
- 🔒 **Filtre de mots interdits** généralisé (pseudos, circuits, fantômes) ; **boîte de modération** (catégories comportement/fausse invitation/classement/usurpation) ; rate-limits & anti-abus ; **fusion de profils fantômes** à la réclamation *(B3)*.
- 🧪 Régression e2e complète sur tous les flux ; tests de charge basiques.
- **Critères d'acceptation** : boîte de modération exploitable manuellement ; filtres actifs ; réclamation/fusion de fantômes fonctionnelle.
- **Dépend de** : Phase 2.

### Lot 3.2 — Analytics & observabilité
- ⚙️🔒 Intégration **PostHog** ; événements clés + métriques **activation / rétention / coefficient de viralité (K-factor)** ; monitoring d'erreurs (Sentry ou équivalent).
- **Critères d'acceptation** : événements remontés ; tableaux de bord des métriques clés ; alerte d'erreurs.
- **Dépend de** : Phase 2.

### Lot 3.3 — Légal & onboarding beta
- 🎨/📱 Écrans CGU/confidentialité alimentés ; **age gate** (seuil à trancher juridiquement *(C1)*).
- ⚙️ Mécanisme d'invitation beta (TestFlight / Play Console interne ou lien web).
- **Action PO** : **trame CGU + politique de confidentialité** rédigée par nous, **relue par un juriste** *(C2)* ; décision d'âge minimum *(C1)*.
- **Critères d'acceptation** : pages légales en ligne ; testeurs beta intégrables.
- **Dépend de** : 2.5. **Validation PO** : légal.

### Lot 3.4 — Campagne beta
- Test en conditions réelles avec le **groupe d'amis/karteurs** ; boucle de feedback ; triage des bugs ; itérations.
- **Critères d'acceptation** : un premier groupe de testeurs actifs ; retours collectés et priorisés ; bugs bloquants corrigés.
- **Dépend de** : 3.1, 3.2, 3.3.

---

## Phase 4 — Publication stores

### Lot 4.1 — Marque & ASO
- 🎨 **Logo / wordmark définitif** + **icône d'application** *(E1, stratégique)* ; **captures d'écran de store** ; illustrations manquantes (états vides/erreurs) *(E6)*.
- **ASO** : nom affiché, mots-clés, catégorie, description *(G3)*.
- **Critères d'acceptation** : fiches stores prêtes (visuels + textes) ; logo/icône validés par le PO.
- **Dépend de** : 0.0 (nom validé). **Validation PO** : logo/icône, ASO.

### Lot 4.2 — Build & soumission
- 🔒 **EAS Build** (iOS + Android), signature, déclarations de confidentialité, **classification d'âge**, soumission et passage en revue des stores.
- 🧪 Tests sur builds de production (smoke tests device réels).
- **Critères d'acceptation** : apps acceptées par App Store et Play Store.
- **Dépend de** : 3.4, 4.1.

### Lot 4.3 — Lancement & suivi
- 📊 Monitoring post-lancement, préparation hotfix, suivi des métriques d'acquisition/rétention.
- **Critères d'acceptation** : lancement public effectif ; tableau de bord suivi ; process de hotfix prêt.
- **Dépend de** : 4.2.

---

## Reporté en v2+ (hors périmètre de cette roadmap)
Elo par circuit · courses multi-manches · courses par équipes · confirmation multi-joueurs du classement · co-admin/délégation · notifications sociales · saisons Elo · statistiques avancées · decay d'inactivité · temps au tour · **compte « circuit / organisateur professionnel »** · programme de parrainage formel · internationalisation (activation d'autres langues).
