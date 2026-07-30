# KartSquad — Roadmap produit (détaillée)

> Roadmap par **phases jusqu'au lancement**, découpées en **lots livrables**, chaque lot détaillé par agent (Design/UX · Backend · Frontend · Sécurité/Infra · Test) avec ses **critères d'acceptation** et ses **dépendances**. Source de vérité produit : `docs/cahier-des-charges.md`. Méthode de travail : `AGENTS.md`.
>
> **Statut global (2026-07-13) : Phase 1 (MVP jouable) TERMINÉE, Phase 2 (social & gamification) quasi bouclée.** Amis, Classements, Badges (12) et l'anti-triche « Elo entre inscrits » sont **en ligne et testés en prod**. Notifications push : déployées, **côté appareil validé** (notif de test OK), envoi serveur à confirmer. Reste en Phase 2 : lot 2.5 Réglages.
>
> ⚠️ La structure et les priorités ci-dessous sont **stratégiques** → à valider par le Product Owner avant démarrage.

---

## 🏁 État d'avancement & reprise

> **À la reprise du projet :** relire d'abord `AGENTS.md` (architecture d'exécution — l'équipe des 6 agents et le pipeline restent le mode de travail), puis `docs/cahier-des-charges.md`, puis cette section.

**Dernière session : 2026-07-28.**

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
| **Refonte UX (pré-beta)** | ✅ **en ligne** *(SQL collés 2026-07-14 ; audit UX → 12 correctifs)* — deep-link d'invitation réparé, **rejoindre une course** (invité), Réglages en ⚙︎ + listes plafonnées (fin du scroll sans fin), confirmation de suppression, 4 icônes d'onglet, tagline, skeletons, a11y, **carte « Ma position » + Top X%** dans Classements. Reviewer (bloquant deep-link corrigé). |
| **Temps au tour** | ✅ **en ligne** *(SQL collé 2026-07-14 ; décision PO)* — meilleur tour par pilote (informatif, **hors Elo**) : chacun édite le sien, l'admin celui de tous ; **record du circuit** ; format m:ss.mmm. Reviewer (perte de données à la correction corrigée). |
| **Photo de profil (A7 + A7b)** | ✅ **en ligne** *(SQL collés 2026-07-28)* — upload avec recadrage et ré-encodage côté navigateur, **stockage privé + liens signés**, retrait par la modération, purge RGPD ; photo affichée **partout** (profil, fiche pilote, grille, podium, classements, amis, recherche, saisie du classement). |
| Phase 2 (suite) | ⏭️ ensuite : **A8** (suppression de compte annulable), puis ouvrir la **beta** (lot 3.4). L'**import des kartings de France géocodés** débloquerait d'un coup A11 (meilleurs tours par circuit) et A12 (carte + « près de moi »). |

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
- **3.1b Boîte de modération** — 🟢 **code prêt, à activer** *(construit 2026-07-14)* : écran Modération (Réglages, réservé aux modérateurs, pastille de signalements ouverts) ; actions **résoudre/rejeter · renommer le pilote · suspendre/réactiver (blocage SERVEUR dur) · supprimer la course signalée** (remise à zéro Elo si sûr) ; **push aux modérateurs** à chaque signalement (nouveau type `report` dans l'Edge Function). 8 scénarios de tests DB. Reviewer adversarial (BLOQUANT auto-dé-suspension + MAJEUR garde INSERT-only corrigés). *Reste : coller `20260714190000_moderation_box.sql` + recoller l'Edge Function `push` mise à jour.*
- **Fusion de profils fantômes** *(B3)* — ⏭️ **reportée à son propre lot** (fonctionnalité virale plus que modération, la plus risquée).
- 🧪 Régression e2e complète sur tous les flux ; tests de charge basiques.
- **Critères d'acceptation** : boîte de modération exploitable manuellement ; filtres actifs.
- **Dépend de** : Phase 2.

### Lot 3.2 — Analytics & observabilité
✅ **en ligne** *(SQL collé 2026-07-14 — décision PO : 100 % maison, aucun tiers)*. Tables `analytics_events` + `error_logs` (écriture seule client, lecture réservée modérateur) ; **`get_metrics`** dérive **activation / rétention / K-factor / engagement** des tables existantes + événements instrumentés (`app_open`, `signup`+parrain `?ref=`, `share_clicked`, `rematch`) ; **garde-fou d'erreurs** global. **Écran Stats** (modérateur). Best-effort silencieux (ne casse jamais un flux). 3 scénarios de tests DB. Reviewer adversarial (K-factor non falsifiable, erreurs anon non exposées, cohérence RGPD). *Pas de PostHog/Sentry pour l'instant — réévaluable à l'échelle. Métriques non rétroactives : comptage depuis l'activation.*
- **Critères d'acceptation** : métriques consultables in-app ; erreurs capturées ; zéro tiers.
- **Dépend de** : Phase 2.

### Lot 3.3 — Légal & onboarding beta
✅ **en ligne** *(SQL collé 2026-07-14 — décisions PO)*. **Consentement obligatoire** CGU + confidentialité à l'inscription (case à cocher + liens, sur les 2 chemins email/Google), **horodaté + versionné** et **exigé côté serveur**. Pages légales **finalisées** (bandeau « brouillon » retiré, contenu à jour : push, analytics 100 % maison, modération/suspension, RGPD) et rendues **publiques** (lisibles pendant l'inscription). **Beta en lien ouvert** (pas de barrière d'accès) + **aucune barrière d'âge** *(choix PO — rien à coder)*. Tests DB (consentement requis / seed exempté). Reviewer adversarial (BLOQUANT liens légaux inaccessibles corrigé). Reste : coller `20260714230000_legal_consent.sql`.
- ⚠️ **Décision PO assumée** : pages légales publiées **sans relecture juriste** *(C2 en attente)* et **sans âge minimum** *(C1)* — à réviser quand un juriste passe (incrémenter `TERMS_VERSION`).
- **Critères d'acceptation** : consentement exigé ; pages légales en ligne ; testeurs beta intégrables (lien).
- **Dépend de** : 2.5.

### Lot 3.4 — Campagne beta
- Test en conditions réelles avec le **groupe d'amis/karteurs** ; boucle de feedback ; triage des bugs ; itérations.
- **Critères d'acceptation** : un premier groupe de testeurs actifs ; retours collectés et priorisés ; bugs bloquants corrigés.
- **Dépend de** : 3.1, 3.2, 3.3.

---

## 🔧 Backlog d'améliorations *(validé PO 2026-07-28)*

Issu de **deux sources** : la comparaison front-end/UX avec l'app de Maggie (`ppcrepin/kartme-maggie`, stack Vite + Firebase) et les **premiers retours de test** des beta-testeurs.

### 🔥 Priorité — en cours

| # | Amélioration | Origine | État |
|---|---|---|---|
| **A1** | **Invités sans Elo affiché** — « Invité · hors classement » au lieu de « Rookie · 1000 » (grille, résultats, médaille de grade masquée) ; les invités sont aussi **exclus du détail des duels**, puisqu'aucun point ne s'échange avec eux | retour de test | ✅ **fait** *(front-end seul)* |
| **A2** | **Inviter un pilote sans être ami** — recherche par pseudo directement dans la course (anti-rebond 300 ms, exclut ceux déjà sur la grille) ; les amis restent en raccourci. *La RLS autorisait déjà l'admin à ajouter tout pilote non bloqué : la limitation était purement dans l'interface.* | retour de test | ✅ **fait** *(front-end seul)* |
| **A3** | **Calibration des nouveaux** — K **doublé (128)** sur les **5 premières courses** ; K appliqué à un duel = **moyenne des K** des deux pilotes → l'échange reste symétrique, la **somme nulle entre inscrits est préservée** (anti-triche intact). Compteur `profiles.races` maintenu par le moteur (protégé comme l'Elo ; cohérent avec correction 24 h et suppression modération). Libellé **« En calibration »** (grille, classements, « Ma position », profil) à la place d'un grade encore vide de sens. **Badges Push / Kart-astrophe suspendus pendant la calibration** (les gros écarts y sont attendus). | retour de test + barème Maggie | ✅ **fait** *(SQL à coller)* |
| **A4** | **Circuits en RÉFÉRENTIEL maîtrisé** *(décision PO 2026-07-28 : plus d'ajout libre → fini les doublons ; alimentation par seed/SQL, import « kartings de France » à planifier par ce canal)* + recherche **tolérante** (accents/casse/tirets) sur le **nom ET la ville**, et **« Tes circuits »** (pistes déjà courues, récentes d'abord) proposés avant la saisie. *« Près de moi » (géoloc) reporté : nécessite de géocoder le référentiel.* | retour de test | ✅ **fait** *(SQL à coller)* |
| **A5** | **Centre de notifications in-app + cloche** — boîte de réception persistante (RLS « les miennes seulement », contenu **immuable** côté client, **clé primaire comprise**), cloche + pastille « 99+ », écran N1 paginé, marquage **ciblé** (seules les lignes affichées), rétention 90 j purgée **globalement** (`pg_cron`, hors chemin de lecture). **Point d'injection unique : `enqueue_push`** → tous les déclencheurs existants alimentent la boîte sans être réécrits.<br>*Le passage du push éphémère au stockage persistant a ouvert 5 failles, toutes fermées avant livraison :* **inondation** (rejoindre/quitter en boucle → 300 lignes chez l'admin) → index de **déduplication** + plafond horaire ; **RGPD** (le pseudo d'un compte supprimé survivait chez les autres) et **modération** (un pseudo renommé restait lisible) → colonne `actor_id` + purge dans les deux sens ; **chemin critique** (une écriture de notification en échec annulait l'inscription à la course) → bloc d'exception ; **garde d'immuabilité** (crash sur GUC vide, corrections serveur silencieusement annulées) → verrou basé sur `current_user` ; **lien mort** vers `settings/moderation`. | app Maggie | ✅ **fait** *(SQL à coller)* |
| **A2b** | **Grille : les trois façons d'ajouter, hiérarchisées** *(décision PO 2026-07-28)* — **1 · Tes amis** (un tap) → **2 · Un autre pilote inscrit** (par pseudo, sans amitié) → **3 · Quelqu'un sans compte**, en retrait et **explicitement annoncé hors Elo** (« il apparaît au classement de la course mais n'échange aucun point ») + incitation à l'inscription. *L'ancien ordre mettait l'invité sans compte en premier : le chemin le plus coûteux pour le produit était le plus facile à prendre.* | retour de test | ✅ **fait** *(front-end seul)* |

### ⏭️ Ensuite

| # | Amélioration | Origine |
|---|---|---|
| **A10** | ✅ **fait** — **Brouillon hors-ligne de la saisie** *(front-end seul)* : l'ordre en cours (présents, mode glisser/tap, classement) est enregistré localement à chaque geste et restauré au retour, avec bandeau « Saisie reprise » + bouton « Repartir de zéro ». Rejeté automatiquement si la grille a changé (un ordre bâti sur un autre plateau donnerait un classement faux) ou après 24 h ; effacé dès que le classement part en base. La **correction** ne se brouillonne pas — la référence, c'est le classement enregistré. *7 tests unitaires.* | app Maggie |
| **A6** | ✅ **fait** — **Abandons (DNF)** *(décision PO : classé DERNIER)*. Rang de calcul distinct du rang d'affichage : les abandons sont **ex æquo** entre eux (score 0,5 par duel) → échange symétrique, **somme nulle préservée**. Le serveur refuse un abandon placé devant un pilote à l'arrivée, une liste malformée (doublon/NULL — elle faussait le nombre d'arrivants et rendait un pilote ARRIVÉ ex æquo avec un abandon), et une course sans arrivée. Podium, partage, stats de profil, face-à-face, détail par paire et 4 badges rendus conscients de l'abandon. `correct_race_results` **conserve** les abandons quand le client n'en envoie pas (bundle PWA en cache). | app Maggie |
| **A9** | ✅ **fait** — **Saisie groupée des temps** : tous les chronos d'une course dans un seul formulaire, un seul enregistrement, seuls les champs modifiés partent au serveur. *(Le classement déduit des chronos a été écarté par le PO : au karting, le meilleur tour ne fait pas le vainqueur.)* | app Maggie |
| **A7** | ✅ **fait & en ligne** — **Photo de profil**. *Décisions PO : stockage **privé** + liens **signés** (jamais d'URL publique devinable) ; modération par **signalement + retrait par un modérateur**.* Recadrage carré et ré-encodage JPEG **côté navigateur** (300 Ko max en base, la photo d'origine ne quitte jamais l'appareil), chemin `<mon-id>/<aléa>.jpg` validé par une **expression exacte** côté table ET côté trigger, ramasse-miettes des fichiers remplacés, retrait par la modération **persistant et levable**, purge RGPD à la suppression de compte. *Cinq failles fermées avant livraison :* **usurpation** (le garde ne couvrait que l'UPDATE — un INSERT de profil pointait sur la photo d'autrui), **traversée** `../` (un simple préfixe ne prouve rien), **policies `for all`** (les permissives d'une même commande sont OR-ées : le retrait par la modération était un coup d'épée dans l'eau), **compte supprimé** reposant une photo avec un jeton encore valide, **chemin renvoyé** à un non-ami sur profil privé. | app Maggie |
| **A7b** | ✅ **fait** *(SQL collé — « la query a run », 2026-07-28)* — **La photo là où on regarde vraiment** *(retour PO : « je l'ajoute mais je ne la vois nulle part »)*. A7 ne l'affichait que sur le profil, la fiche pilote, la grille et le podium ; elle manquait aux **classements**, à la **liste d'amis**, à la **recherche** et à l'écran de **saisie du classement** — c'est-à-dire partout où l'on parcourt beaucoup de monde d'un coup. `get_leaderboard` renvoie désormais le chemin (pas la photo : sans lien signé il n'ouvre rien), ce qui permet **une seule** demande de signature par écran. *Trois défauts attrapés par la revue :* les liens signés expirant en 5 min **mouraient définitivement** sur le seul écran qui cumule ses pages au lieu de tout redemander au focus (retour six minutes plus tard → plus une seule tête jusqu'au rechargement complet) → chaque signature est datée et renouvelée avant échéance ; le chemin était renvoyé sur une **demande d'ami en attente** alors que la lecture exige une amitié acceptée (signature perdue d'avance, et aveu qu'un profil privé a une photo) ; l'avatar restait **bloqué sur ses initiales** après un premier échec. **Régression évitée de justesse** : la fonction avait été reprise de la version d'avant l'anti-triche — les fantômes seraient revenus au classement Global. Figée par un test. | retour de test |
| **A8** | **Suppression de compte annulable** (délai de grâce) au lieu d'immédiate | app Maggie |
| **A12** | **Carte des kartings + « près de moi »** *(idée PO 2026-07-28)* : à la création d'une course, proposer d'abord les pistes **les plus proches**, et offrir une **carte** plutôt qu'une liste. Une fois les kartings de France importés, une liste alphabétique de 400 lignes est inutilisable — la géographie est le seul tri qui a du sens pour « où court-on samedi ? ». C'est aussi le premier écran qui donnerait envie d'ouvrir l'app sans avoir de course en cours.<br>**Faisable, mais en deux temps.** *(a) « Près de moi »* : ajouter `lat`/`lon` aux circuits, trier par distance calculée côté serveur, demander la position du navigateur (une permission, refusable → repli sur la recherche actuelle). Sans dépendance nouvelle. *(b) La carte elle-même* : nécessite un fond de plan. Trois options à arbitrer — **Leaflet + OpenStreetMap** (gratuit, sans compte, mais rendu correct plutôt que beau), **MapLibre + tuiles vectorielles** (plus élégant, style personnalisable aux couleurs Ferrari, un fournisseur de tuiles à choisir), **Google/Mapbox** (le plus beau, mais compte, clé d'API et facturation à l'usage). Attention : la carte ne fonctionne pas en natif avec la même bibliothèque qu'en web.<br>**Prérequis bloquant : géocoder le référentiel.** Aucun circuit n'a de coordonnées aujourd'hui ; l'import « kartings de France » doit les apporter, sinon ni le tri par distance ni la carte n'ont de données. | idée PO |
| **A4b** | ✅ **fait** — **Import des kartings de France** *(OpenStreetMap, ODbL)*. Le référentiel passe de 24 noms approximatifs à **251 kartings réels, tous géolocalisés**. 1 214 objets bruts → regroupement géographique à 600 m (un karting est cartographié en plusieurs morceaux : tracé, voie des stands, stand, parfois « Pro » et « Amateur ») → filtrage de ce qui n'est pas du karting chronométrable → ville par géocodage inverse. **Aucun des 24 noms d'origine n'existait réellement** : « Karting de Salbris » est Sologne Karting, « Racing Kart de Cormeilles » est RKC Karting, et 12 ne désignaient rien. Décisions PO : 12 mis à jour EN PLACE (l'identifiant ne bouge pas → les courses jouées gardent leur circuit), 12 supprimés, outre-mer inclus. **Index unique (nom normalisé, ville normalisée)** : la garantie d'unicité que A4 promettait sans jamais la poser. Attribution OpenStreetMap affichée dans Aide & légal — l'ODbL l'exige (voir `docs/credits.md`).<br>*Bloquant attrapé par la revue : `kart_normalize` n'était appliqué que d'un côté de la comparaison, donc la suppression ne supprimait rien — en annonçant « 0 supprimé », ce qui se lit « rien à faire ». Aucun test ne pouvait le voir : le harnais applique les migrations sur une base VIDE, la réconciliation ne rencontrait jamais un circuit. Corrigé en la sortant dans une **fonction** que le test appelle en rejouant le chemin de production complet.* | idée PO |
| **A12a** | ✅ **fait** — **« Près de moi »** *(décisions PO 2026-07-29)*. Colonnes `lat`/`lon` sur les circuits, RPC `nearby_circuits` (haversine en SQL — pas de PostGIS : à quelques centaines de lignes, un balayage complet coûte moins qu'une extension à faire vivre), coordonnées renvoyées aussi par la recherche pour afficher une distance sans second aller-retour. **Rayon 150 km**, **distance affichée partout** où on la connaît, et la position demandée **uniquement sur le bouton « Près de moi »** — une fenêtre de permission qui surgit sans raison se solde par un refus, et sur iOS un refus ne se redemande pas. Position **arrondie au centième de degré** avant l'envoi (≈ 1 km) : sans effet sur l'ordre des kartings, et le serveur n'a aucun usage d'une précision au mètre.<br>*Piège attrapé par le test et non à la relecture : un `CHECK` qui s'évalue à `NULL` est **accepté** par Postgres — la contrainte laissait passer une latitude sans longitude, très exactement ce qu'elle interdisait. Réécrite avec `num_nonnulls`.* | idée PO |
| **A12b** | ✅ **fait** — **Onglet Kartings : la carte de France des pistes** *(décisions PO : Leaflet + OpenStreetMap — zéro compte, zéro clé, zéro facturation — et un onglet à part entière, « le premier écran qui donne envie d'ouvrir l'app »)*. 277 kartings en épingles (taille selon le zoom), « Me localiser » sur geste explicite, recherche nom/ville/**alias** (« BRK » trouve le Circuit Beltoise-Trappes — 38 circuits portent leurs sigles et enseignes tirés d'OpenStreetMap), bascule Carte/Liste, « Créer une course ici » qui présélectionne la piste.<br>*Livré trois fois avec des défauts que le PO a trouvés au téléphone (carte vide, page figée, épingles en tache rouge, message Safari sous Chrome). La leçon est outillée : **tests Playwright qui ouvrent la page dans un vrai Chromium**, cliquent, mesurent le défilement — six scénarios. Un export qui se génère ne prouve pas qu'une page fonctionne.* | idée PO |
| **A13** | ✅ **fait** — **Signaler un karting manquant / fermé / mal fiché** *(demande PO 2026-07-29 ; décisions : nom + ville seulement, corrections incluses, modérateurs prévenus cloche + push)*. Table dédiée (RLS auteur/modération), filtre de mots, plafond 5/h, déduplication des signalements ouverts, file « Circuits signalés » dans la boîte de modération avec classement signé et daté. Deux entrées : lien générique (manquant) et fiche d'un circuit (fermé / erreur).<br>*Deux pièges fermés avant livraison : le push partait avec un type que l'Edge Function aurait rejeté en silence (→ type 'report', comme les signalements) ; et la purge RGPD ne pouvait PAS venir du `on delete cascade` — `delete_my_account` anonymise sans supprimer la ligne, c'est le test qui l'a montré.* | demande PO |
| **A11** | ✅ **fait** *(SQL à coller)* — **Fiche circuit : record, meilleurs tours, vie du circuit** *(arbitrages PO 2026-07-29, révisé 2026-07-30 : tous les pilotes sont NOMMÉS aux tableaux — le masque « Pilote privé » a été retiré quand la revue a montré que l'anonymat n'était qu'une protection d'écran, contournable au niveau API ; on ne promet pas ce qu'on ne tient pas ; seules les courses ≥ 2 inscrits alimentent les tableaux — la règle des badges, réutilisée ; invités exclus des tableaux publics, ils gardent leur temps sur l'écran de leur course)*. Le pratique importé d'OpenStreetMap : **site web (137 circuits), téléphone (79), indoor (37)** — pas d'horaires (15 % de couverture et un horaire périmé fait faire 50 km pour rien), et l'étude a établi que **longueur et cylindrées n'existent dans aucune donnée** (1/277 et 0/277) → saisie communautaire plus tard, via A13. **Règle d'or : aucune section vide** — une fiche sans chrono lance « Sois le premier à inscrire ton nom » (le cas de ~275 circuits sur 277 en beta), et les onglets Année/Mois n'apparaissent qu'à partir de 5 pilotes éligibles. `get_circuit_record` harmonisé sur les mêmes règles (l'exception « pseudo affiché même privé » tombait). UX unifiée au passage : UN explorateur partagé (onglet + choix sur carte depuis la création, formulaire préservé à l'aller-retour), « Tes circuits » en tête d'onglet. | idée PO |
| **A14** | ✅ **fait** — **Barre d'onglets persistante + audit total** *(demandes PO 2026-07-30 : « les logos des onglets disparaissent dans pas mal de cas », sélection sur la carte en DEUX temps, « ← Courses » muet, « fais un audit total, clique partout »)*. Chaque onglet porte désormais **sa propre pile d'écrans** : la barre reste visible sur tous les écrans de détail (fiche circuit, course, réglages…), les URL ne changent pas, et l'on saute directement d'une section à l'autre. La carte de choix montre la fiche du karting au tap et n'engage rien sans « Choisir ce karting » ; tous les « ← » sont blindés pour les liens profonds (PWA relancée).<br>*La première version (écrans en onglets cachés, `href: null`) a été **démolie par la revue adversariale** : les écrans restaient montés à vie alors qu'ils sont écrits pour être démontés en repartant — `busy` bloqué après création/revanche (boutons morts), pilote B affiché « bloqué » après blocage de A, champ SUPPRIMER pré-rempli des jours plus tard. La refonte en piles règle la famille entière ; un test e2e « second passage » la verrouille.*<br>**Audit navigateur total** (viewport iPhone, 103 captures, tous les parcours cliqués) : **aucun bug bloquant** ; les 6 anomalies relevées sont corrigées — « ← » des sous-pages Réglages en lien profond (pile imbriquée), onglet « Classem… » tronqué (singulier + police 10), **page 404 maison en français** (l'écran anglophone d'expo-router recevait les liens mal recopiés), doublon label/placeholder de la recherche kartings, pastille « ABD » repliée sur deux lignes. | demande PO |
| **A15** | ✅ **fait** *(SQL à coller)* — **Fil d'actualité « Ça bouge »** *(arbitrages PO 2026-07-30 : bandeau de 3 items en tête de l'accueil — pas un écran entier, l'étude ayant mesuré 5 à 8 nouvelles/mois pour un groupe de 10 — + écran Actu à deux onglets (Pour toi / Tes amis) + DOUBLE compteur sur la cloche (rouge « on t'attend », or « ça bouge ») ; 5 types : course à venir d'un ami, résultat d'un ami, grade d'un ami — montées ET CHUTES, dès la première course —, mon propre grade, badges des amis ; visibilité rétroactive 90 j ; amis acceptés seulement ; invités comptés jamais nommés)*. Fil CALCULÉ À LA LECTURE (aucune table d'événements) : suppression de compte, renommage de modération, suspension et blocage s'appliquent rétroactivement par construction — décisif dans un dépôt où `delete_my_account` anonymise sans supprimer.<br>*Bloquant fermé par la revue : l'acteur d'un résultat était l'ADMIN de la course — potentiellement un inconnu privé, nommé malgré la RLS par la fonction SECURITY DEFINER ; l'acteur est désormais l'AMI qui a couru. L'audit navigateur a ensuite attrapé la pastille or qui recouvrait la rouge, et le fil marqué « vu » sans avoir été montré.* | idée PO |
| **A16** | ✅ **fait** *(SQL à coller)* — **Référentiel karting enrichi** *(fichier PO du 2026-07-30, relevé consolidé de 310 pistes sur 270 lieux ; arbitrages : un circuit par lieu — piste la plus longue —, rapprochement automatique avec alias de sécurité, le fichier gagne les conflits, tout importer et géocoder, statuts inconnus inclus, pas de filtres pour l'instant)*. Le référentiel passe de **277 à 378 circuits**, et la longueur de piste de **1 à 142** — c'est la donnée que l'étude A11 avait déclarée introuvable dans OpenStreetMap. Aussi : intérieur/extérieur (262), thermique/électrique, loisir/compétition, **homologation FFSA/CIK-FIA (63)**, 150 adresses postales, et la liste des tracés pour les 33 lieux à plusieurs pistes. Les deux jeux se sont révélés complémentaires : OSM donne le *où* (aucune coordonnée dans le fichier), le relevé donne le *quoi*.<br>*Quatre pièges fermés avant livraison : 27 de nos circuits s'appelaient « Piste de Karting » ou « Karting » (objets OSM sans nom) et ont enfin leur nom commercial, l'ancien partant en alias pour que la recherche le trouve encore ; un second passage sur les villes annotées (« Neuilly (Oise) ») a rattrapé 5 doublons ; et quatre circuits étaient visés DEUX FOIS, la seconde mise à jour écrasant la première en silence — dont un faux positif (« Karting Évasion » de Bully, Rhône, rapproché d'un circuit du Creusot, Saône-et-Loire).* Et le plus coûteux, invisible pour tous les tests d'alors : **le garde-fou d'idempotence du seed portait sur (nom, ville)** — or A16 RENOMME 106 circuits, si bien qu'aucun de leurs anciens noms ne se reconnaissait plus et que le seed les réinsérait en lignes NEUVES. **106 doublons physiques**, deux fiches par piste aux coordonnées identiques, que le test d'unicité (nom, ville) ne pouvait pas voir puisque les noms diffèrent bien. Le garde-fou est désormais GÉOGRAPHIQUE autant que nominal : un lieu ne se dédouble pas parce qu'on l'a rebaptisé.<br>*Deux bloquants attrapés par la revue adversariale avant cela : **7 circuits « déplacés » de 40 à 470 km** par un rapprochement sur le seul nom (communes homonymes — Saint-Cyprien, Aigues-Vives, Neuilly : nom et ville réécrits, coordonnées gardées) → validation géographique ajoutée, un rapprochement est rejeté si la ville du fichier géocode à plus de 30 km de nos coordonnées ; et **~10 doublons physiques** que l'index (nom, ville) ne voyait pas → passe nom + proximité (moins de 3 km avec jeton distinctif ou emboîtement). Le référentiel a maintenant ses assertions géographiques : cadre France outre-mer compris, cohérence code postal/position, et zéro paire proche à nom emboîté.* Sources créditées dans Aide & légal (FFSA + annuaires), l'attribution ODbL restant due pour la géographie. | idée PO |
| **A19** | ✅ **fait** *(SQL à coller)* — **Lien d'amitié partageable** *(demande PO 2026-07-30 : « un lien qu'on puisse partager pour qu'il rejoigne l'app en tant qu'ami directement », même pour qui n'a pas encore l'app ; arbitrages : un tap de confirmation à l'arrivée, lien PERMANENT porté par l'identifiant, le même lien pour les nouveaux et les inscrits)*. L'invité voit QUI l'invite, confirme d'un tap, et l'amitié est acceptée d'emblée — aucun aller-retour de validation. Le parcours complet est couvert : lien → connexion → inscription → retour sur l'invitation (`pending-route` étendu à `invite/`).<br>*Cinq pièges fermés : `notify_friend` ne réagissant qu'aux demandes `pending`, une amitié créée directement en `accepted` n'aurait prévenu PERSONNE — l'invitant est notifié explicitement, sans quoi il ne saurait jamais que son lien fonctionne (avec une url décalée `amis?invite`, sinon l'index de déduplication l'avalait). Le plafond de 20 acceptations par heure ferme l'usage automatisé que le lien permanent rendait possible. **L'INVITÉ est le demandeur**, pas l'invitant : dans l'autre sens, un lien partagé à une soirée épuisait le quota de 30/h de l'invitant et le 31ᵉ invité lisait « Trop de demandes d'amis » — un message accusant quelqu'un n'ayant rien demandé, exactement dans le scénario viral voulu. **Le PO ouvrant son propre lien lisait « invitation plus valable »** — `get_inviter` filtrait l'appelant, et l'écran « c'est ton lien » était du code mort ; c'est pourtant le premier geste de qui vient d'en générer un : la fonction renvoie désormais `is_me`. Et un lien tronqué par une messagerie se présentait comme une panne réseau, avec un « Réessayer » sans issue.*<br>*Deux corrections de fond issues de la revue : un lien mort renvoie un CODE (`gone`) au lieu de lever — le bouton disparaît au lieu de rester actif sous un message d'erreur —, et les quatre refus (inconnu, parti, suspendu, **bloqué**) donnent la MÊME réponse : deux messages distincts formaient un oracle qui laissait déduire qu'un identifiant existe et qu'il nous a bloqué, ce que `get_inviter` refuse déjà de dire. Enfin le canal est MESURÉ : `friend_invite_accepted` était émis et jamais relu, le tableau de bord ne pouvait pas répondre à « est-ce que le lien convertit ? » — deux compteurs désormais, taps aboutis et comptes réellement gagnés, un lien accepté entre habitués n'étant pas de la croissance.* | demande PO |
| **A17** | ✅ **fait** *(arbitrages PO 2026-07-30 sur maquettes avant/après : lignes serrées 44 px « tableau de Grand Prix » plutôt que cartes · action du jour en barre FIXE en bas · sections rares en FEUILLE glissante · titres resserrés 23 px avec damier à côté · classement « autour de moi » par défaut · historique 5 + écran dédié)* — **Tout visible sans défiler**. Mesuré avant/après dans un vrai navigateur : détail de course **2 045 → ~772 px** (−62 %, zéro défilement à 8 pilotes, « Saisir le classement » visible d'entrée), profil **1 708 → ~814 px** (−52 %, tient d'un coup). Course terminée en 3 vues segmentées (Classement/Chronos/Duels — les mêmes pilotes étaient listés trois fois), ajout de pilotes et partage QR en feuilles, menu ⋯ pour les actions rares, photo/e-mail/déconnexion déménagés vers Réglages→Compte. Écrans où le défilement est LÉGITIME laissés en paix (saisie du classement, documents, listes longues).<br>*L'audit navigateur a attrapé un plantage TOTAL de l'écran de course sur web (`useAnimatedValue` absent de react-native-web — le hook préexistait sur un état jamais testé, la refonte l'avait mis sur le chemin de tous les rendus) : corrigé, et l'écran a désormais ses tests.* | idée PO |
| ~~**A11**~~ | ~~**Page « Kartings » — tableaux des meilleurs tours**~~ *(spécification d'origine — les quatre arbitrages ci-dessus sont tranchés)* *(idée PO 2026-07-28)* : par circuit, le **top 10 du mois, de l'année et de tous les temps**, avec le pseudo du pilote, ajoutable en ami d'un tap. Transforme un chrono (aujourd'hui purement décoratif) en objectif, et fait se rencontrer des karteurs qui ne se connaissent pas — c'est le premier écran du produit qui déborde du cercle d'amis. Réutilise `results.best_lap_ms` et le référentiel de circuits déjà fermé.<br>**À trancher avant de construire :** (1) **confidentialité** — `get_circuit_record` renvoie déjà le pseudo d'un profil privé (contournement assumé pour UN record) ; un classement public en fait une exposition permanente : opt-out, ou exclusion des profils privés ? (2) **anti-triche** — un chrono est saisi à la main et ne coûte rien ; adossé à un classement public, il devient intéressant à falsifier. Faut-il exiger un témoin (l'admin de la course), ou accepter le folklore ? (3) **invités** — les fantômes ont un temps mais pas de compte : au tableau ou pas ? (4) **circuits sans activité** — un top 10 vide sur 400 kartings importés fait un écran mort ; n'afficher que les pistes fréquentées. | idée PO |

### 📋 Notes du vérificateur (mineurs assumés, à reprendre plus tard)
- **Abandons : un abandon ne rapporte JAMAIS de points** *(décision PO 2026-07-28)* — son gain est plafonné à 0 et le surplus revient aux pilotes arrivés (somme nulle préservée). Ce qui subsiste, assumé : à plusieurs abandons, l'égalité amortit la perte du dernier réel (−21 au lieu de −32 à 4 pilotes). Les départager supposerait de classer deux pilotes qu'aucun classement ne sépare.
- ~~⚠️ **Abandons : limite assumée de l'ex æquo.**~~ *(traité ci-dessus pour la partie « gain » ; le reste est assumé.)* « Un abandon coûte exactement une dernière place » n'est vrai que pour un abandon UNIQUE. À deux, l'égalité redistribue : 4 pilotes à 1000, C et D abandonnent → −21 chacun au lieu de −32 pour le dernier réel (il économise 11 points) ; et un pilote faible ex æquo avec un fort peut **gagner** des points (+4 mesuré). Deux pilotes peuvent donc amortir la perte du dernier en se déclarant tous deux « abandon », sans que rien ne le signale. Traiter deux abandons différemment supposerait de les départager — ce qu'aucun classement ne permet. Le cas est **figé par un test** (scénario 2bis) pour qu'un changement de barème soit une décision, pas une surprise. **À arbitrer par le PO.**
- **Bornage Elo 100/2500 : la somme nulle dérive légèrement** (défaut préexistant). Mesuré par le vérificateur sur 300 rosters aux bornes : sans abandon la dérive est quasi neutre (le plancher crée des points, le plafond en détruit, ça se compense) ; **avec des abandons ex æquo elle devient systématiquement négative** (~−1 Elo détruit par course). Le correctif propre est d'appliquer le bornage AVANT l'arrondi à somme nulle et de redistribuer le résidu écrêté — lot à part.
- **`elo_history` ne porte pas le drapeau `dnf`** : la courbe de progression montre une chute sans explication, et un audit sur `elo_history` seul ne peut plus reconstituer le classement de calcul.
- **`src/lib/elo.ts` (détail par paire) utilise K=64 en dur** alors que le serveur double le K pendant la calibration : l'explication « d'où viennent tes points » affiche la moitié des points réels pour un pilote de moins de 5 courses. Préexistant, à aligner.
- **Boîte de réception & compte suspendu** : une notification émise par un pilote depuis suspendu reste visible (le blocage, lui, la masque). Assumé : l'événement a bien eu lieu, et le masquer priverait le destinataire d'un résultat de course légitime.
- **`guard_rate_limit` ne couvre pas l'UPDATE des amitiés** : basculer `accepted`↔`pending` en boucle reste possible côté table (la boîte, elle, est protégée par la déduplication). À durcir hors périmètre A5.
- **`pg_cron`** doit être activé sur Supabase (Database → Extensions) pour que la purge à 90 jours tourne ; sans lui, `purge_notifications()` reste appelable à la main.
- **Plancher Elo 100** : un duel contre un pilote au plancher peut laisser un léger résidu de somme (préexistant, amplifié en calibration) — rare, à documenter ou redistribuer un jour.
- ~~**Fiche pilote publique** : n'affiche pas « En calibration »~~ → **corrigé** : `get_pilot` et `search_pilots` renvoient désormais `races`, la fiche affiche « En calibration » et masque la médaille de grade sous 5 courses.
- **`get_leaderboard(null, …)` ne lève pas d'exception** (préexistant, prouvé par le vérificateur sur une base migrée jusqu'au 2026-07-13) : `p_scope not in (…)` vaut `NULL` sur une portée `NULL`, la garde ne se déclenche pas et l'on retombe silencieusement sur « amis ». Aucune fuite (on n'obtient que soi et ses amis) et le client n'envoie jamais `NULL` — dette de robustesse.
- ~~**Le classement ne filtre ni `suspended_at` ni `deleted_at`**~~ → **tranché et corrigé** *(décision PO 2026-07-29)* : les comptes suspendus et supprimés sortent du classement. `get_leaderboard` **et** `get_my_rank` ont été modifiées ensemble — si elles filtraient différemment, la carte « Ma position » annoncerait un rang que la liste juste en dessous contredirait (et le Top X% pourrait dépasser 100 %).
- **`races_delete_admin`** : l'API permet à un admin de supprimer une course terminée (l'UI le cache) — un garde `status='upcoming'` serait sain.
- Les invités figurent sur le podium avec l'étiquette « Invité » (sans delta) : comportement voulu — ils ont bien couru.

- **ODbL : remonter les corrections en amont.** Le canal de COLLECTE existe désormais (A13 : bouton « signale-le », file de modération). Reste le second temps : porter dans OpenStreetMap les corrections validées — geste manuel du modérateur pour l'instant (voir `docs/credits.md`).
- **⚠️ Anonymat des tableaux de temps : protection d'ÉCRAN, pas d'API** *(revue A11, 2026-07-30)*. La règle PO (« le temps d'un privé s'affiche, son nom jamais ») est tenue dans l'application, mais un compte technique peut la contourner en deux requêtes : les tables `results`/`participations` sont lisibles par tout inscrit (RLS `using (true)` depuis le lot 0.3), et un chrono à la milliseconde y est joignable ; `search_pilots`/`get_pilot` donnent ensuite le pseudo — qui est de fait un identifiant PUBLIC de l'app (sans quoi on ne pourrait pas trouver quelqu'un pour l'ajouter en ami). Le vrai correctif est un chantier : restreindre la lecture de `results`/`participations` et passer les écrans concernés (course, invitation, face-à-face) par des RPC. *Décision PO 2026-07-30 : le masque a été retiré des tableaux — plus de promesse non tenue. Le verrouillage RLS+RPC reste recommandé avant l'ouverture large, comme durcissement et non plus comme correctif d'une promesse.*
- **Le fil coûte deux agrégations par ouverture d'accueil** *(revue A15, 2026-07-30)* : le bandeau appelle `get_feed(3)` et la cloche `unread_feed_count()` — qui exécute `get_feed(20)` en interne. Négligeable à 15 utilisateurs (fenêtre 90 j indexée sur les quatre sources), à regrouper en UNE RPC (`items + compteur`) avant l'ouverture large. Même famille : le curseur de pagination est strict sur `at` (jumeaux de timestamp possibles en frontière de page) — neutralisé en servant la fenêtre entière en une page de 50, à revoir seulement si le volume explose.
- **Liens profonds : défaut de fond corrigé le 2026-07-30** *(audit A19)* — la destination mémorisée pour un visiteur non connecté était construite depuis `useSegments()`, qui rend les segments du PATRON de route : elle valait « race/[id] », « pilot/[id] », « invite/[id] », littéralement. Tout visiteur arrivant par un lien PARTAGÉ (le canal d'acquisition n°1) retombait donc après inscription sur une page inexistante. Corrigé par `usePathname()` (chemin résolu) et verrouillé par un test e2e qui part SANS session — le trou exact par lequel le défaut avait survécu à la « réparation du deep-link d'invitation » du lot Refonte UX.
- **Le lien d'amitié n'est pas révocable** *(décision PO 2026-07-30, assumée)* : il porte l'identifiant du compte, donc il ne peut pas être coupé — et il est DÉDUCTIBLE de tout lien de course déjà partagé, ceux-ci portant `?ref=<uid>` pour le parrainage. Les protections restantes : le tap de confirmation de l'invité, le plafond de 20 acceptations par heure, la suppression d'amitié et le blocage. Un jeton révocable (colonne sur `profiles`, régénérable) est la solution si le PO constate un abus.
- **La feuille glissante ne gère pas le clavier iPhone** *(revue A17, 2026-07-30)* : le champ « invité » (3ᵉ marche, bas de feuille) peut passer sous le clavier en PWA iOS. À traiter avec la gestion du viewport visuel si le PO le constate au téléphone.
- **Quatre paires de kartings à moins de 2 km** subsistent dans le référentiel (BattleKart / Pro'Kart à Dreux, le trio de Cap Malo, Monky / Sport-In Park à Laval). Ce sont vraisemblablement des établissements distincts — les fusionner serait pire que les garder — mais à trancher si un pilote signale la confusion.
- **Le contrôle géographique de l'import tirait la mauvaise conclusion** *(revue A16, 2026-07-30, corrigé)* : un rapprochement dont la ville du fichier géocode à plus de 30 km de nos coordonnées était rejeté — puis **inséré comme circuit neuf, avec le géocodage fautif**. « Je ne sais pas situer cette ligne » avait été traduit par « ce n'est pas le même circuit ». Deux lieux sont ainsi passés d'un risque de renommage abusif à un doublon franc : Kart'Are Aigues-Vives (Ariège annoncée par son adresse et son code postal, coordonnées dans l'Aude, 59 km) et Karting Loisirs Neuilly (ville « Neuilly » qui n'est pas une commune, 85 km de Neuilly-sous-Clermont) — ce dernier avec son **code postal retiré**, ce qui rendait précisément aveugle l'assertion de cohérence code postal/position : elle passait faute de pièce à conviction. Les deux sont fusionnés, l'import corrigé, et le test resserré (120 km au lieu de 300, et les préfixes 97/98/20 comparés sur trois chiffres — sinon la Guadeloupe, la Martinique et la Guyane formaient un même « département », de même que les deux Corses, et le test échouait sur de la donnée juste).
- **Deux paires de kartings partagent une position au mètre près** *(revue A16, 2026-07-30)* : Kart'Eam et Team Marius Karting héritent tous deux du centroïde du code postal 54000 (adresse absente du relevé, géocodage retombé au niveau du code postal) ; BKI Brest et Speed Park sont à 317 m. Ce ne sont PAS des doublons — les noms n'ont aucun rapport — mais des coordonnées imprécises : « Autour de toi » les annonce à la même distance. Le test 99d plafonne ce compte à 2, donc un futur import qui en ajoute échoue au lieu de passer inaperçu. Correctif : géocoder ces adresses à la rue, ou les saisir à la main.
- **Les tests de bout en bout tournaient en LOCAL uniquement** *(revue A19, 2026-07-30)* — donc jamais sur une pull request, alors que ce sont eux qui ont attrapé les deux régressions les plus chères du produit (un écran de course entièrement blanc, un lien profond sans session retombant sur une page morte), invisibles pour les tests unitaires comme pour les tests SQL. Ajoutés à la CI, avec dépôt des traces en cas d'échec.
- **⚠️ Licence des données du relevé PO : à trancher avec le PO** *(revue A16, 2026-07-30)*. Le relevé consolidé vient d'annuaires commerciaux et de la FFSA — ce ne sont PAS des données ouvertes, et rien ne dit qu'elles soient redistribuables. Par ailleurs les 9 nouvelles colonnes vivent dans la MÊME table que les coordonnées OpenStreetMap, sous ODbL : la clause de partage à l'identique s'applique aux bases dérivées, et la frontière entre « base dérivée » et « collection » n'a pas été analysée — elle a été déclarée résolue sans l'être. Deux questions pour le PO : d'où vient exactement ce relevé, et l'app est-elle destinée à publier ces données (une API, un export) ou seulement à les afficher ? Tant que l'app ne fait qu'afficher, le risque est faible ; il change de nature à la première ouverture large.

### 💡 À l'étude

Écran « course en cours » (chrono, « j'ai fini / j'abandonne ») · signalement avec preuve photo + arbitrage par l'organisateur · profil enrichi (prénom, circuit favori, taux de complétion) · XP + thèmes déblocables · badges à niveaux · annulation de course avec motif.

### ❌ Écarté pour KartSquad

Back-office admin à 11 écrans (surdimensionné : la boîte de modération + l'écran Stats suffisent) · application bilingue (le français est assumé) · **Elo par discipline** (complexité forte, format unique chez nous) · quota (la limite de courses/jour existe déjà).

### 🛡️ Atouts à ne pas casser

**Pilotes fantômes** (invités sans compte — Maggie exige un compte pour tous : friction majeure le jour de la course) · temps au tour + record du circuit · carte « Ma position » + Top X% · grades et médailles · courbe d'Elo · face-à-face · revanche en un tap · **anti-triche** (Elo entre inscrits seulement) · **le ton karting** (Kart-astrophe, Voiture balai, Safety car… — l'app de Maggie a une copie neutre, c'est notre signature).

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
