# KartSquad — Roadmap produit (détaillée)

> Roadmap par **phases jusqu'au lancement**, découpées en **lots livrables**, chaque lot détaillé par agent (Design/UX · Backend · Frontend · Sécurité/Infra · Test) avec ses **critères d'acceptation** et ses **dépendances**. Source de vérité produit : `docs/cahier-des-charges.md`. Méthode de travail : `AGENTS.md`.
>
> **Statut global (2026-07-13) : Phase 1 (MVP jouable) TERMINÉE, Phase 2 (social & gamification) quasi bouclée.** Amis, Classements, Badges (12) et l'anti-triche « Elo entre inscrits » sont **en ligne et testés en prod**. Notifications push : déployées, **côté appareil validé** (notif de test OK), envoi serveur à confirmer. Reste en Phase 2 : lot 2.5 Réglages.
>
> ⚠️ La structure et les priorités ci-dessous sont **stratégiques** → à valider par le Product Owner avant démarrage.

---

## 🏁 État d'avancement & reprise

> **À la reprise du projet :** relire d'abord `AGENTS.md` (architecture d'exécution — l'équipe des 6 agents et le pipeline restent le mode de travail), puis `docs/cahier-des-charges.md`, puis cette section.

**Dernière session : 2026-07-13.**

| Lot | État |
|---|---|
| 0.0 Prérequis | 🟡 en cours — *action Product Owner* : acheter `kartsquad.app`, recherche d'antériorité de marque (INPI/EUIPO), ouvrir comptes Apple/Google (non urgents) |
| **0.1 Init & CI** | ✅ **livré** — app Expo (4 onglets), TypeScript strict, ESLint, Jest (vert), Playwright câblé, CI GitHub Actions |
| **0.2 Design system & i18n** | ✅ **livré** — police Fraunces (OFL), tokens figés (rampe grades pierre→rouge, palette d'états), 9 composants de base, socle i18n (fr), galerie en ligne |
| **0.3 Données & sécurité** | ✅ **livré** — 7 tables cœur, RLS anti-triche, seed circuits FR, tests RLS verts. Base Supabase cloud **déployée** ✅ |
| **1.1 Authentification** | ✅ **en ligne & fonctionnel** — email **et Google** testés en prod (OAuth configuré : Google Cloud + Supabase), pseudo + profil + déconnexion. *Apple plus tard (compte dev à 99 $/an).* |
| **1.2 Créer une course** | ✅ **en ligne & testé** — accueil, création (circuit + calendrier), participants (fantômes), partage lien + QR, édition/suppression. |
| **1.3 Moteur Elo** | ✅ **en ligne & testé** — calcul serveur anti-triche déployé sur Supabase, tests DB (canonique +32/+16/0/−16/−32, somme nulle, plancher, 12 joueurs) ; saisie du classement au **tap** + résultats (Δ, grade). *Elo qui monte/descend vérifié en prod.* **Barème révisé le 2026-07-13 → K=64 · diviseur 800 (« Dynamique & amplitude », validé par simulation) : n'affecte que les courses futures, Elo existants conservés.* |
| **1.4 Déroulé & résultats** | ✅ **en ligne & testé** — « Qui était présent ? » (C6b), **glisser-déposer** validé en prod (+ tap en repli, F4), attente animée + **temps réel activé** (C8), podium (C9), détail par paire (C10), partage résultats (C11 v1). *Signalement (A2) → lot modération. Image PNG → polish pré-beta.* |
| **1.5 Profil, historique & grades** | ✅ **en ligne & validé** — profil complet (Elo en grand, médaillon + jauge, stats, **courbe d'Elo**, teaser badges), échelle des grades (R2), historique cliquable (R5). |
| **🏁 PHASE 1 (MVP jouable)** | ✅ **TERMINÉE** — compte → course → classement → Elo → profil, la boucle complète tourne en prod. |
| **2.1 Amis** | ✅ **en ligne, testé & audité** — recherche (privés : grade seul), demandes, fiche pilote + face-à-face **+ stats/courbe/historique de l'ami**, blocage (demandes ET courses), signalement M1, amis sélectionnables dans une course. *Passage Reviewer adversarial effectué (10 correctifs). Déblocage UI → lot 2.5.* |
| **2.2 Classements** | ✅ **en ligne & testé** — écran L1 (bascule Amis/Global, ma ligne surlignée, rang épinglé si hors page, pagination), RPC `get_leaderboard`/`get_my_rank` (amis sans fantômes B1, privés non-amis exclus du Global A6, bloqués masqués, classé = ≥1 course), tests DB. *Passage Reviewer adversarial effectué. SQL collé sur Supabase (« success » PO).* |
| **2.3 Badges** | ✅ **en ligne (12 badges) & testé** — moteur de déblocage serveur, catalogue R3 + détail R4 (SVG natif, 5 icônes neuves), section badges profil + fiche pilote, bandeau « badge débloqué », 12 scénarios de tests DB. **Revue PO 2026-07-13** : 12 badges (Voiture balai, Midi moins le kart, DRS, Safety car, Push ; seuils ±45 ; « course qui compte »). *Reviewer adversarial (bug bloquant de migration attrapé). `elo_integrity_badges.sql` collé (« success » PO).* |
| **🔒 Intégrité Elo** | ✅ **en ligne** — anti-triche « **Elo entre inscrits seulement** » : l'Elo ne s'échange qu'entre comptes inscrits ; fantômes figés + hors classement Global → le farming par faux joueurs ne rapporte plus rien (voir `docs/integrite-elo.md`). Livrée dans la même migration que les 12 badges. *N'affecte que les courses futures ; Elo existants conservés.* |
| **2.4 Notifications** | 🟢 **déployée — côté appareil validé, envoi serveur à confirmer** — **Web Push** complet : réglages S3 (3 interrupteurs + silence 22h–8h, notif de test locale), service worker + abonnement VAPID, tables préférences/abonnements (RLS), Edge Function d'envoi (respecte prefs + silence, purge des abonnés morts), déclencheurs invitation/résultat/demande d'ami. Reviewer (bloquants corrigés : fuite d'abonnement sur appareil partagé, durcissement des droits). 12 scénarios de tests DB (préférences + livraison). **Déployé par le PO** (2 SQL + fonction `push` + 4 secrets + config) ; **notif de test locale OK sur iPhone (PWA)**. *Reste : valider l'envoi serveur (test `enqueue_push` de jour, hors 22h–8h).* |
| **2.5 Réglages** | 🟢 **code prêt, à activer** — Compte (changer pseudo + filtre, profil privé/public A6, pilotes bloqués + déblocage), **suppression RGPD** (confirmation « SUPPRIMER » → anonymise en « Joueur supprimé », purge les données perso, préserve l'Elo des autres), Aide & légal (FAQ + CGU/confidentialité en brouillon). Reviewer adversarial (FAQ corrigée, scrub auth journalisé, a11y, tests durcis) ; 5 scénarios de tests DB. *Reste : coller `settings_rgpd.sql` + test PO (avec un compte jetable).* |
| **2.6 Cycle de vie de course** | ✅ **en ligne** *(SQL collé 2026-07-14)* — **verrou optionnel** « Clôturer les invitations » → état `locked` (grille figée côté serveur via RLS) + **un rappel** push aux inscrits (sens unique, **pas de RSVP**, canal « Invitations »), **réversible** (« Rouvrir les invitations », rappel non renvoyé) ; l'usage spontané (saisie directe) reste possible. **Fenêtre de correction 24 h** *(version sûre restreinte)* : l'admin re-saisit le classement dans les 24 h avec recalcul Elo + **rembobinage des badges**, **uniquement si aucun pilote n'a couru depuis** (sinon refus, pour ne pas fausser l'Elo « à chemin ») ; **décision PO : la correction re-notifie** (l'Elo a réellement bougé). 7 scénarios de tests DB. Reviewer adversarial (farming de badges + impasse absent corrigés). |
| Phase 2 (suite) | ⏭️ ensuite : Phase 3 (beta) — lot 2.6 code prêt |

**Déploiement (aperçu web) :** ✅ en ligne et **automatique à chaque push**.
- **URL publique : https://ppcrepin.github.io/kartme/** (GitHub Pages)
- Chaîne : push → `.github/workflows/deploy-web.yml` → export web (base `/kartme`) → publication Pages.
- CI qualité : `.github/workflows/ci.yml` (typecheck · lint · tests unitaires).
- Doc d'architecture IT : `docs/architecture-it.html`.

**Prochaine étape :** démarrer la **Phase 1 — lot 1.1 (Authentification)**. *(Avant de déployer la base : créer le projet Supabase — je guiderai. Le logo/wordmark reste à planifier dans un lot d'identité dédié.)*

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
- **Action PO/orchestrateur** : vérifier la **disponibilité du nom « KartSquad »** — domaine (kartsquad.app / .com / .fr) et identifiants App Store / Play Store *(décision D1)*.
- **Action PO** : ouvrir les **comptes développeur** Apple (99 $/an) et Google Play (25 $ une fois) ; définir la **structure juridique** de l'éditeur *(C4)*.
- **Critères d'acceptation** : rapport de disponibilité du nom remis ; go/no-go sur « KartSquad » ; comptes développeur créés.
- **Dépend de** : rien.

### Lot 0.1 — Initialisation du projet & CI ✅ *(livré le 2026-07-12)*
- ✅ ⚙️📱 **App Expo** (React Native + Web) en TypeScript ; navigation (expo-router) avec le **shell à 4 onglets** (Courses/Classements/Amis/Profil) ; ESLint (config Expo). *(Prettier : couvert par la config Expo ; à formaliser au 0.2 si besoin.)*
- ✅ ⚙️ **Supabase local** amorcé (`supabase/config.toml`, `migrations/`, `seed.sql`). *(Projet cloud + secrets : à faire au lot 0.3, quand le schéma métier arrive.)*
- ✅ 🔒 **CI GitHub Actions** (`ci.yml`) : typecheck + lint + tests unitaires sur chaque push/PR. **+ déploiement web auto** (`deploy-web.yml`) sur GitHub Pages. *(Protection de branche : à activer côté PO quand on ouvrira les PR.)*
- ✅ 🧪 Harnais de test : **Jest (jest-expo)** — tests Elo→grade au vert ; **Playwright** (e2e web) câblé (`e2e/smoke.spec.ts`, hors CI pour l'instant).
- **Critères d'acceptation** : ✅ l'app démarre sur Web (export vérifié, 4 onglets) ; ✅ `npm test` et la CI passent au vert ; ✅ **bonus : aperçu web public en ligne** → https://ppcrepin.github.io/kartme/
- **Dépend de** : 0.0.
- **Reste à traiter plus tard** (non bloquant) : Prettier explicite, projet Supabase cloud + secrets (→ 0.3), e2e Playwright dans la CI (→ après 0.2), protection de branche.

### Lot 0.2 — Design system & i18n (socle) ✅ *(livré le 2026-07-13)*
- ✅ 🎨 **Tokens figés** (`src/constants/theme.ts`) : fond carbone, rouge #e10600, **rampe de grades pierre→bronze→argent→jaune→orange→rouge** *(révisée avec le PO)*, palette d'états, espacements, rayons. **Police serif définitive : Fraunces** (OFL, libre) via `@expo-google-fonts/fraunces` *(E2 tranché)*.
- ✅ 🎨 **Palette d'états sémantiques** distincte du rouge de marque : succès #5fb27d, avertissement #e9a23b, **erreur #ff3d71 (rose-corsa)**, info #5b9bd5 — toujours doublée d'un signe *(E3 tranché)*.
- ✅ 📱 **Composants réutilisables** (`src/components/ui/`) : Title/Heading/Body/Muted/Label, Button (pilule), Card, Avatar-initiales, Tag, GradeMedal, Gauge, Banner (états), CheckeredRule (filet damier).
- ✅ 📱 **Socle i18n** (`src/i18n/`, français, chaînes externalisées, catalogue swap-ready).
- ✅ 🧪 **Galerie de composants** : écran `/design-system` (accessible depuis l'onglet Profil) rendant tous les composants — visible sur le lien en ligne.
- **Critères d'acceptation** : ✅ galerie rendant tous les composants ; ✅ chaînes via i18n ; ✅ typecheck + lint + tests verts ; ✅ export web OK.
- **Dépend de** : 0.1. **Validé par le PO** : police Fraunces, palette d'erreur, rampe de grades.
- **Reporté** (non bloquant) : détection auto de la langue de l'appareil (à rebrancher au 2e langage) ; icônes de grade définitives (déjà dessinées) en remplacement des monogrammes ; logo/wordmark (lot d'identité dédié).

### Lot 0.3 — Schéma de données & sécurité (socle) ✅ *(livré le 2026-07-13)*
- ✅ ⚙️ **Schéma Postgres cœur** + migrations (`supabase/migrations/`) : `profiles`, `ghost_profiles`, `circuits`, `races`, `participations`, `results`, `elo_history`. *(Les tables sociales/modération — friendships, badges, reports, notifications — arriveront avec leur lot, cf. décision « cœur d'abord ».)*
- ✅ ⚙️ **Seed** : 24 circuits de karting français (`supabase/seed.sql`), enrichi librement ensuite (ajout partagé immédiatement, dédoublonnage au fil de l'eau).
- ✅ 🔒 **RLS** table par table : lecture large (profils publics, courses, circuits, fantômes — lisibles pour l'historique, mais Elo figé et hors classement depuis l'anti-triche) ; écriture verrouillée (**seul l'admin d'une course écrit participants + classement**) ; **Elo non modifiable à la main** (trigger de garde) ; profil privé lu par lui-même (visibilité amis étendue au lot 2.1). Champ `account_type` prévu pour le futur compte « circuit pro ».
- ✅ 🧪 **Tests RLS** (`supabase/tests/`) autorisé/refusé, exécutés sur un vrai Postgres — en local (`npm run db:test`) **et en CI** (job « Schéma · RLS » avec service Postgres 16).
- **Critères d'acceptation** : ✅ migrations reproductibles (rejouées de zéro à chaque test) ; ✅ RLS active et testée ; ✅ circuits seedés. *(Déploiement sur le projet Supabase cloud : au moment où le PO crée le compte — cf. `supabase/README.md`.)*
- **Dépend de** : 0.1. **Validé par le PO** : périmètre cœur, circuits partagés immédiatement, conception avant création du compte.
- **Reporté** (non bloquant) : déploiement cloud (attend le compte Supabase) ; RGPD/anonymisation & rétention fine des fantômes (avec le lot Réglages 2.5) ; visibilité « amis uniquement » complète (avec friendships, 2.1).

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

### Lot 1.2 — Création de course & participants 🟡 *(code livré le 2026-07-13)*
- ✅ 🎨/📱 Écrans **C1** (accueil À venir/Passées), **création** (circuit + date/heure), **détail course** avec feuille d'ajout de pilotes.
- ✅ ⚙️ Création de course, sélection/ajout de circuit (autocomplétion sur les 24 seedés + ajout libre), **profils fantômes** (noms libres), **créateur ajouté d'office** (retirable), édition circuit/date, suppression, limite ~10/jour.
- ✅ 📱 Partage : **lien + QR code** (`react-native-qrcode-svg`).
- ⏳ **Amis** dans la feuille d'ajout : reporté au **lot 2.1** (le système d'amis n'existe pas encore) — décision PO.
- **À tester en ligne** avant de cocher « livré ». **Dépend de** : 1.1.
- *Détail original ci-dessous conservé pour mémoire.*

### Lot 1.2 — Création de course & participants *(spécification d'origine)*
- 🎨 Écrans **C1** (accueil courses), **C2** (créer), **C3/C3b** (circuit), **C4** (date/heure), **C5** (feuille « Ajouter des pilotes » : amis / nom libre / lien-QR).
- ⚙️ CRUD courses ; recherche/ajout de circuit ; création de **profils fantômes** ; génération du **lien/QR d'invitation** (token) ; **modification lieu/date avant saisie** *(A4)* ; **limite ~10 courses/jour** *(A5)*.
- 📱 Flux de création, feuille d'ajout unifiée, sélecteur de circuit avec autocomplétion, sélecteur date/heure, liste d'accueil (À venir / Passées).
- 🔒 Contrôle d'accès (seul le créateur = admin), rate-limit courses/jour.
- 🧪 Tests : créer une course, ajouter amis + noms libres (fantômes) + partager le lien, modifier lieu/date, limite quotidienne.
- **Critères d'acceptation** : une course se crée avec circuit + date + participants mixtes ; le lien/QR fonctionne ; modif lieu/date possible avant résultats ; blocage au-delà de 10/jour.
- **Dépend de** : 1.1.

### Lot 1.3 — Moteur Elo (cœur) *(pièce maîtresse)*
- ⚙️ **Fonction de calcul Elo** (comparaisons par paires normalisées, **K=64**, diviseur **800** — barème « Dynamique & amplitude » retenu le 2026-07-13, plancher **100**) ; **mapping des grades** ; application **atomique** à la validation du classement ; **recalcul** dans la fenêtre de correction 24h.
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
- ⚙️ Requêtes de classement (amis / global) ; **fantômes exclus des DEUX classements** (Elo figé depuis l'anti-triche 2026-07-13 ; à l'origine, décision B1 = exclus d'Amis seulement) ; respect de la **confidentialité « amis uniquement »** *(A6)*.
- 📱 Leaderboard avec bascule, mise en avant de sa propre ligne.
- 🧪 Tests : exactitude des classements, exclusion des fantômes, confidentialité respectée.
- **Critères d'acceptation** : classements corrects et cohérents avec les Elo post-course ; fantômes hors classement ; profils privés respectés.
- **Dépend de** : 1.5, 2.1.

### Lot 2.3 — Badges & gamification
- 🎨 Écrans **R3** (catalogue de badges), **R4** (détail d'un badge) — **icônes déjà dessinées** (`docs/badges-icones.html`).
- ⚙️ **Moteur de déblocage** des **12 badges MVP** (revue PO 2026-07-13 ; déclencheurs de `BADGES.md`) ; stockage `user_badges` ; horodatage. *Badges de perf conditionnés à une « course qui compte » (≥ 2 inscrits).*
- 📱 Catalogue (débloqués/à débloquer), détail, **animation/toast de déblocage** (respecte reduce-motion).
- 🧪 Tests : chaque badge se débloque sur son déclencheur exact (dont « Midi moins le kart », « DRS », « Safety car », « Push »).
- **Critères d'acceptation** : les 12 badges se débloquent correctement et s'affichent avec leur icône ; le détail montre condition + date.
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

### Lot 2.6 — Cycle de vie de course *(nouveau, validé PO 2026-07-14)*
Décisions actées : **verrou optionnel** (choix A) + **rappel à sens unique, pas de RSVP** (choix a).
- 🎨 Bouton **« Clôturer les invitations »** sur l'écran course → nouvel état **« prête »** (roster figé) ; l'admin peut toujours saisir directement le classement sans clôturer (usage spontané préservé).
- ⚙️ Nouvel état de course entre `à venir` et `terminée` (ex. `ready`/`locked`) ; **rappel** aux participants inscrits (« Tu es sur la grille pour [circuit] le [date] ») — 1 notification, pas de confirmation demandée.
- ⚙️ **Fenêtre de correction 24 h** (cahier §4.8, à implémenter) : rendre un classement modifiable par l'admin pendant 24 h après validation, avec recalcul Elo — aujourd'hui un classement validé est définitif (FAQ mise à jour en conséquence).
- 🔒 Rappel/notif dans le respect des préférences + heures de silence (réutilise l'infra 2.4).
- 🧪 Tests : transition d'états, rappel envoyé une seule fois, recalcul Elo dans la fenêtre 24 h.
- **Dépend de** : 1.2, 1.3, 2.4.
- **Rester vigilant** : ne pas rendre le verrou obligatoire (garder le chemin « je saisis tout de suite »).

> **Fin de Phase 2 = boucle virale complète** : amis, classements, badges, notifications, partage. *(Lot 2.6 = amélioration du cycle de vie, planifiable avant ou pendant la beta.)*

---

## Phase 3 — Beta fermée

### Lot 3.1 — Modération & durcissement
Découpé en deux temps testables (décisions PO 2026-07-14).
- **3.1a Durcissement** — 🟢 **code prêt, à activer** *(construit 2026-07-14)* : **filtre de mots interdits côté serveur** (pseudos, fantômes, circuits) à deux passes (pas de faux positif type « Concarneau ») + miroir client ; **rate-limits** par personne (fantômes 30/h, circuits 10/h, demandes d'amis 30/h, signalements 20/j) ; **drapeau `is_moderator`** non auto-attribuable (garde INSERT+UPDATE, ferme aussi le trou anti-triche « elo choisi à l'inscription »). 8 scénarios de tests DB + jest. Reviewer adversarial (BLOQUANT auto-attribution modérateur corrigé). *Reste : coller `20260714170000_moderation_hardening.sql` (+ SQL optionnel « me nommer modérateur »).*
- **3.1b Boîte de modération** — 🔜 **à construire** : écran Modération (super-admin), lecture/traitement des signalements (catégories comportement/fausse course/classement/usurpation), actions de base.
- **Fusion de profils fantômes** *(B3)* — ⏭️ **reportée à son propre lot** (fonctionnalité virale plus que modération, la plus risquée).
- 🧪 Régression e2e complète sur tous les flux ; tests de charge basiques.
- **Critères d'acceptation** : boîte de modération exploitable manuellement ; filtres actifs.
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
