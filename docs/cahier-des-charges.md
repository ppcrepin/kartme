# KartMe — Cahier des charges v0.3 (brouillon de travail)

> **Statut : non définitif.** Ce document évolue en continu à mesure des échanges. Il reste au minimum deux chantiers avant une v1 figée : la validation des écrans détaillés dans le nouveau langage graphique retenu, et les nombreuses questions listées en fin de document (§16). Ne rien coder à partir de ce document tant qu'il n'a pas été explicitement validé point par point.

Application de karting amateur avec système Elo, courses entre amis et gamification.
Rédigé à partir des échanges des 11-12 juillet 2026.

---

## 1. Vision

Démocratiser l'accès au karting amateur via un système "Elo" façon échecs : un administrateur crée une course réelle, invite des joueurs, saisit le classement final, et ce classement fait évoluer l'Elo de chacun. L'application doit devenir **virale** par le partage social, avec une interface très soignée visuellement, élégante, peu bavarde, et clairement inspirée de l'univers course.

## 2. Choix techniques

| Sujet | Décision |
|---|---|
| Plateformes | React Native + Web (Expo) — un seul code base pour iOS, Android et Web ; on commence par le web |
| Backend / infra | Supabase (Postgres managé + auth + API + realtime) — coûts prévisibles |
| Authentification | Email/mot de passe + connexion Google + Apple (pas de SMS/téléphone → pas de coût SMS) |
| Langue | Français uniquement au lancement, mais architecture i18n dès le départ pour ouvrir l'international sans refonte |

*Non détaillé pour l'instant (voir §16.4) : schéma de base de données précis, politique de sécurité Supabase (RLS), choix du service de notifications push, choix de l'outil d'analytics.*

## 3. Modèle d'une course

- Une **course = une seule manche/session** (pas de courses multi-manches agrégées au MVP).
- **Individuel uniquement** — pas de courses par équipes au MVP.
- **Pas de catégorisation** par type de karting (indoor/outdoor/électrique...) au MVP — toute course compte pareil.
- **Données saisies par l'admin** : classement final (obligatoire) + temps au tour meilleur/moyen (facultatif, saisie manuelle). Pas de photo de course au MVP.
- **Taille d'une course** : minimum 2 participants, pas de maximum imposé.
- **Égalités interdites** : l'admin doit départager en cas d'ex-aequo réel — pas de gestion de match nul dans le calcul Elo.
- **Lieu** : sélectionné dans une liste de circuits préremplie (les circuits de karting français les plus connus, constituée en amont), avec ajout libre si le circuit est absent — la liste s'enrichit ensuite avec l'usage réel. *(Ouvert : qui modère les doublons/fautes de frappe dans cette liste à mesure qu'elle grandit — voir §16.4.)*

## 4. Cycle de vie d'une course

1. **Création** — n'importe quel utilisateur inscrit peut créer une course (écran à un seul niveau : circuit + date/heure), et en devient l'admin, seul à pouvoir saisir/modifier le classement (pas de délégation/co-admin au MVP).
2. **Pré-liste des participants** — dès la création, l'admin ajoute les participants attendus (amis de l'app ou noms libres). Pas besoin de tout ressaisir à la fin : à la fin de la course, l'admin coche qui était effectivement présent (retire les absents, ajoute les imprévus).
3. **Invitation** — lien ou QR code unique partageable (SMS, WhatsApp...) ; ajout direct possible depuis la liste d'amis.
4. **Participants sans compte** — un **profil fantôme** est créé avec son propre Elo qui évolue. Réclamation sécurisée : la personne clique sur un lien pointant vers son profil précis (envoyé par l'admin), crée son compte, et **l'admin de la course confirme** que c'est bien elle avant rattachement de l'historique.
5. **Saisie du résultat** — l'admin réordonne les participants par **glisser-déposer** jusqu'à obtenir le classement réel ; les Elo de tous les participants sont recalculés immédiatement.
6. **Fenêtre de correction** — l'admin peut corriger pendant **24h**, l'Elo est recalculé automatiquement. Passé ce délai, la course est figée dans l'historique.
7. **Annulation** — possible tant qu'aucun classement n'est saisi. Une fois validée, la course reste dans l'historique officiel et n'est plus supprimable, pour préserver l'intégrité de l'Elo de tous les participants. *(Ouvert : peut-on encore modifier le lieu/la date d'une course avant saisie du classement, sans l'annuler complètement ? — voir §16.4.)*
8. **Partage** — carte visuelle automatique (podium + variation d'Elo de chacun, ex. `+18` / `-12`, toujours doublée d'un signe ▲/▼) ; version épurée pour l'externe, un clic ramène vers la page détaillée de la course dans l'app.

## 5. Système Elo

### 5.1 Paramètres retenus

- **Elo de départ** : 1000 pour tout nouveau joueur.
- **Un seul Elo global** par joueur (pas d'Elo par circuit au démarrage).
- **Pas de saisons**, pas de decay d'inactivité — Elo continu, figé jusqu'à la prochaine course.
- **Facteur K = 32** (convention échecs, mouvements marqués).
- **Diviseur = 400** (convention Elo standard).
- **Plancher = 100** (l'Elo ne descend jamais en dessous).

### 5.2 Formule (comparaisons par paires normalisées)

Pour un joueur *i* face à chaque autre participant *j* d'une course à *n* joueurs (donc *n − 1* comparaisons) :

```
E(i,j) = 1 / (1 + 10^((Elo_j − Elo_i) / 400))
S(i,j) = 1 si i devant j, sinon 0
ΔElo_i = K × Σⱼ [S(i,j) − E(i,j)] / (n − 1)
```

La division par `(n − 1)` normalise l'impact d'une course à *n* participants pour rester comparable à un duel 1 contre 1, quelle que soit la taille du groupe.

**Propriété importante confirmée par simulation** : plus l'écart d'Elo entre deux joueurs est grand, plus une victoire du plus faible sur le plus fort rapporte de points (car cette victoire est statistiquement plus improbable, donc plus informative). Exemple chiffré : à écart nul, une victoire "à la régulière" rapporte 16 points (K=32) ; à 800 points d'écart, l'exploit du plus faible en rapporte près de 32.

### 5.3 Amplitude réelle de l'échelle (validée par simulation, pas choisie arbitrairement)

Une simulation (60-300 joueurs, plusieurs milliers de courses, tailles de groupe 4-8) montre que l'amplitude de l'Elo n'est pas un paramètre qu'on fixe directement — c'est une **conséquence émergente** du diviseur (400), du nombre de courses cumulées dans la communauté, et de l'hétérogénéité réelle des niveaux :

- **En tout début de vie de l'app** (petit groupe d'amis, peu de courses cumulées) : amplitude naturelle resserrée, environ **350 à 1700**.
- **À plus grande échelle** (communauté large, historique de plusieurs milliers de courses cumulées, écart de niveau réellement marqué entre un très bon et un très faible joueur) : un joueur exceptionnel converge naturellement vers **~2300-2550**, le plancher à 100 capte les cas extrêmes en bas.
- **Cible retenue** : range affiché 100-2500, avec le diviseur standard (400) — validé comme atteignable à terme, sans avoir besoin d'étirer artificiellement l'échelle (option envisagée un temps, écartée).

*Cette amplitude s'élargira donc naturellement avec l'usage réel de l'app — exactement comme aux échecs, où le range 100-2900 n'existe que parce qu'il y a des millions de parties cumulées.*

### 5.4 Paliers de rang (visuel, en complément du chiffre)

- **6 paliers**, bornes espacées d'environ 250 points chacune (Elo brut, référence à 1000 = départ = milieu de tableau).
- **Style de nom retenu** : univers karting/course pur, progression narrative façon "de débutant à légende" (ex. Rookie → Confirmé → Pro → Légende du bitume).
- **⚠️ Ouvert** : les bornes exactes des 6 paliers doivent être recalculées maintenant que la cible finale est 100-2500 (les bornes discutées initialement étaient calées sur l'ancienne amplitude ~1600) — voir §16.2. Idem pour les 6 noms définitifs, à proposer et choisir.

## 6. Couche sociale

**Amis** — demande d'ami mutuelle (envoi → acceptation), symétrique. Pas d'accès aux contacts du téléphone (uniquement invitation par lien/QR). Cliquer sur un ami ouvre son profil : historique de courses, classements, courbe d'évolution de son Elo.

**Face-à-face** — le profil d'un ami affiche en tête un résumé direct des confrontations ("Toi 2 — 1 Lui") plutôt qu'un simple historique brut.

**Visibilité des profils** — Elo, historique et badges sont **visibles par tous les utilisateurs inscrits** de l'app (pas seulement les amis), pour favoriser la découverte et la comparaison — mais jamais indexés publiquement sur le web.

**Blocage / signalement** — dès le MVP : bloquer un utilisateur (empêche invitation/ajout en ami), signaler un comportement. Modération : boîte de réception simple, traitée manuellement au départ (pas de back-office dédié au MVP).

**Gamification** :
- Elo affiché en chiffre (référence précise) **+ un rang visuel** en complément (cf. §5.4).
- Badges/trophées avec un ton fun et des jeux de mots. Catalogue de départ (~10 badges, brouillon dans `PUNS.md` à la racine du repo, à valider/enrichir) :

| Badge | Déclencheur |
|---|---|
| Premier tour de piste | 1ère course jouée |
| Champagne ! | 1ère victoire |
| Habitué des stands | 10 courses jouées |
| Pilier du paddock | 50 courses jouées |
| Centurion du bitume | 100 courses jouées |
| Triple champagne | 3 podiums d'affilée |
| Remontada | Plus grosse remontée d'Elo en une course |
| Chute libre | Plus grosse chute d'Elo en une course |
| Premier coéquipier | Premier ami ajouté |
| Effet boule de neige | Une de tes invitations a fait rejoindre un nouveau joueur à l'appli |

**Onboarding** — aucun écran pédagogique : l'utilisateur est mené directement à l'action, l'interface doit rester assez explicite d'elle-même.

## 7. Notifications

Notifications push essentielles uniquement au MVP : invitation à une course, résultat d'une course saisi, demande d'ami reçue/acceptée. Pas de notifications "sociales" (ex. dépassement au classement) dans un premier temps, pour éviter la fatigue de notification.

*⚠️ Ouvert : service technique retenu (Expo Push / FCM / APNs), heures de silence ("quiet hours"), formulation exacte des messages — voir §16.4.*

## 8. Confidentialité, sécurité et légal

- **Suppression de compte (RGPD)** : le compte et les données personnelles sont supprimés ; l'historique des courses passées reste dans la base mais **anonymisé** ("Joueur supprimé"), pour préserver l'intégrité de l'Elo des autres participants.
- **Âge minimum** : non bloqué pour le MVP en interne, mais **prérequis légal à traiter avant tout lancement public** (probable seuil 13-16 ans selon RGPD, à trancher avec un avis juridique).
- **Accessibilité couleurs** : toute information portée par une couleur (victoire/défaite/progression Elo) est **systématiquement doublée d'un icône/signe** (`+`/`−`, `▲`/`▼`) pour rester lisible aux daltoniens (~8% des hommes).
- **Anti-triche MVP** : seul l'admin créateur de la course peut saisir/modifier le classement, dans la fenêtre de correction de 24h. Pas de validation multi-joueurs pour l'instant — réserve en cas d'abus constatés.
- **Responsabilité** : pas de mention légale spécifique sur le risque physique du karting au MVP — CGU génériques suffisantes pour l'instant, à réévaluer avant lancement public.

## 9. Identité visuelle — Design system

### 9.1 Direction retenue : "Editorial Grand Prix" (teintes Ferrari — Rosso Corsa)

Après une première piste jugée trop générique ("sport premium épuré", écartée), la direction validée s'inspire d'une référence visuelle apportée par le client : registre **éditorial/affiche de course** plutôt que "UI d'application standard".

**Palette** (validée — variante E, rouge pur) :

| Rôle | Valeur |
|---|---|
| Fond principal | Noir chaud avec vignette radiale (`#0a0706` → `#241210`) |
| Accent unique | Rouge Ferrari — Rosso Corsa (`#e10600`) |
| Encre / texte principal | Blanc cassé chaud (`#f2ede9`) |
| Texte secondaire / discret | Brun-gris sourd (`#8a6b66`) |

**Typographie** : titres en serif bold à fort contraste (registre éditorial/magazine, empilement Georgia/Times New Roman en attendant le choix d'une police définitive sous licence) ; labels, boutons et texte courant en sans-serif système — pairing display serif + utilitaire sans-serif.

**Motifs et composants distinctifs** :
- Filet en haut/bas d'écran façon **damier abstrait** (tirets alternés, pas un vrai damier figuratif).
- Illustrations en **traits fins** (line art), jamais en aplats pleins ou en emoji — ex. une montre stylisée pour l'humour "il est 2h moins le kart".
- Boutons d'action principaux en **pilule à contour** (fond transparent, bordure et texte colorés) plutôt qu'en pastille pleine.
- Titres à emphase bicolore (un mot clé en rouge au sein d'une phrase blanche).
- Labels "eyebrow" en petites capitales espacées.

### 9.2 ⚠️ Ce qui reste à valider avant les écrans détaillés

Les décisions suivantes avaient été prises pour l'ancienne direction ("sport premium épuré") et **n'ont pas encore été revalidées** dans le nouveau langage "Editorial Grand Prix" — elles sont probablement à revoir :
- Style de navigation (barre d'onglets icônes + labels ? Toujours pertinent avec une identité aussi éditoriale, ou faut-il quelque chose de plus sur-mesure ?)
- Langage de formes (coins 8-12px choisis pour l'ancienne direction — l'esprit "affiche/filet géométrique" de la nouvelle direction pourrait appeler des coins plus nets, voire carrés)
- Densité par écran (le principe "aéré, peu d'éléments" reste probablement valide mais à reconfirmer)
- Les **13 écrans mockés en v1** (connexion, accueil courses, création de course, invitation, saisie du classement, résultat/partage, classements, amis, profil d'un ami, mon profil, badges, réglages, état vide) ont été produits dans l'ancien style et **doivent être refaits** dans "Editorial Grand Prix" avant validation finale — voir §16.1.

## 10. Modèle économique et maîtrise des coûts

Gratuit, sans publicité ni paiement au démarrage — monétisation étudiée plus tard une fois la traction prouvée. Limites anti-abus/coûts : nombre de courses créées par utilisateur/jour plafonné (valeur exacte non fixée, voir §16.5), compression automatique des photos (image de partage). Pas de coût SMS (auth email/Google/Apple uniquement), pas de coût lié aux contacts téléphone (non utilisés).

## 11. Stratégie de lancement

- **Pas de deadline fixe** — priorité à la qualité/précision du cahier des charges et du MVP.
- **Beta fermée** avec le groupe d'amis/karteurs du porteur de projet, avant toute ouverture plus large ou publication sur les stores.

## 12. Anticipé pour plus tard (hors MVP, mais à garder en tête dans le modèle de données)

- **Compte "circuit/organisateur professionnel"** : un circuit de karting pourrait à terme avoir son propre compte pour créer des événements, promouvoir l'app auprès de ses clients, etc. Pas développé au MVP, mais le modèle de données ne doit pas fermer cette porte (ex. distinguer dès maintenant un type de compte, même si un seul type existe en pratique au lancement).

## 13. Périmètre du MVP

**Inclus** : compte (email + Google/Apple), création/invitation de courses avec pré-liste des participants, profils fantômes + réclamation sécurisée, saisie de classement par glisser-déposer avec fenêtre de correction 24h, calcul Elo (formule §5), demandes d'amis, blocage/signalement, profil détaillé d'un ami avec face-à-face, leaderboard amis/global, rangs visuels + badges, carte de résultat partageable, notifications push essentielles, limites anti-abus, i18n prêt (FR only), identité visuelle Editorial Grand Prix.

**Hors MVP (v2+)** : Elo par circuit, courses multi-manches, courses par équipes, confirmation multi-joueurs du classement, co-admin/délégation, notifications sociales, saisons Elo, statistiques avancées, decay d'inactivité, compte circuit professionnel.

## 14. État d'avancement du chantier design

| Étape | Statut |
|---|---|
| Style général (palette, typographie, motifs) | ✅ Validé — Editorial Grand Prix, Rosso Corsa |
| Composants de navigation (barre d'onglets, formes, densité) | ⏳ À revalider dans le nouveau style |
| Écrans détaillés (13 écrans identifiés) | ⏳ À refaire dans le nouveau style, puis à valider un par un |
| Charte complète (logo définitif, icône d'app, typographie sous licence) | ⏳ Non commencé |

---

## 15. Ce qui est donc figé aujourd'hui (résumé rapide)

Stack technique · formule et paramètres Elo (K=32, diviseur 400, plancher 100, range cible 100-2500) · cycle de vie complet d'une course · système d'amis et de profils fantômes · principes de modération/RGPD/accessibilité · style graphique général (Editorial Grand Prix, Rosso Corsa) · périmètre du MVP · stratégie de lancement en beta fermée.

## 16. Questions ouvertes (exhaustif)

### 16.1 Design & écrans détaillés
- Refaire les 13 écrans identifiés (connexion, état vide, accueil courses, création de course, invitation QR, saisie du classement, résultat/partage, classements, liste d'amis, profil d'un ami, mon profil, catalogue de badges, réglages) dans le style Editorial Grand Prix.
- Style de navigation (barre d'onglets) à revalider dans ce nouveau langage graphique.
- Langage de formes (coins arrondis vs angles nets) à revalider — l'ancien choix (8-12px) datait de la direction abandonnée.
- Choix d'une police serif définitive sous licence commerciale (Georgia est un placeholder de mockup).
- Conception du logo/wordmark définitif et de l'icône d'application (App Store / Play Store).
- Style d'illustration complet au-delà de l'icône "montre" (ex. illustrations pour les badges, les états vides, les écrans d'erreur).
- Palette complémentaire pour les états sémantiques (succès/erreur/avertissement) cohérente avec le rouge Ferrari déjà très utilisé comme accent principal — comment distinguer visuellement "victoire" de "erreur" si les deux tentent d'utiliser une teinte proche du rouge ?
- Avatars utilisateurs : photo de profil réelle autorisée (upload) ou uniquement avatars génériques/initiales ?

### 16.2 Elo & gamification
- Bornes exactes des 6 paliers de rang, recalculées sur la cible 100-2500 (à proposer).
- Noms définitifs des 6 paliers (à proposer, style "univers karting pur").
- Validation finale du catalogue de badges (~10 proposés dans `PUNS.md`) — noms, déclencheurs, et cohérence avec les nouveaux paliers.
- Faut-il des badges liés à des seuils d'Elo (ex. "atteindre tel palier") en plus des badges liés au nombre de courses ?
- Enrichissement continu de `PUNS.md` (jeux de mots) — à faire au fil de l'eau avec le client.

### 16.3 Modération & légal
- Process concret derrière "boîte de réception simple" : qui la consulte, sous quel délai, quelles catégories de signalement (comportement, fausse invitation, classement contesté...) ?
- Âge minimum définitif et conformité RGPD/mineurs — à trancher avec un avis juridique avant tout lancement public.
- Rédaction effective des CGU et de la politique de confidentialité (actuellement juste évoquées comme "génériques").
- Faut-il un filtre de contenu (modération automatique) sur les champs libres (noms de circuits, pseudos, noms de profils fantômes) ?
- Règles d'unicité/format des pseudos utilisateurs.
- Politique de conservation des données pour les profils fantômes jamais réclamés (suppression au bout d'un certain temps ? conservés indéfiniment ?).
- Un profil fantôme non réclamé est-il visible publiquement dans les classements au même titre qu'un compte réel ?

### 16.4 Données & architecture technique
- Schéma de base de données précis (tables : utilisateurs, courses, participations, profils fantômes, amitiés, badges, notifications...).
- Politique de sécurité Supabase (Row Level Security) à définir table par table.
- Choix du service de notifications push (Expo Push Notification service, ou direct FCM/APNs).
- Choix de l'outil d'analytics produit (ex. PostHog, Amplitude, ou tables Supabase custom) et liste des métriques suivies (activation, rétention, coefficient de viralité...).
- Modération des doublons/fautes de frappe dans la liste de circuits qui s'enrichit avec l'usage.
- Peut-on modifier le lieu/la date d'une course après création mais avant saisie du classement, sans l'annuler complètement ?
- Gestion des doublons de profils fantômes (deux admins créent-ils indépendamment un profil fantôme pour la même personne réelle ?).
- Gestion multi-session (utilisateur connecté simultanément sur mobile et web).
- Politique de sauvegarde/reprise après incident des données Supabase.
- Fuseau horaire : comment gérer l'heure d'une course si les utilisateurs changent de fuseau (moins critique vu le marché France-only, mais à trancher).
- Alternative au glisser-déposer pour la saisie du classement (accessibilité motrice) ?

### 16.5 Croissance & business
- Valeur exacte de la limite "nombre de courses créées par utilisateur/jour" (mentionnée en principe, jamais chiffrée).
- Programme de parrainage/récompense au-delà du badge "Effet boule de neige" — faut-il un mécanisme plus formel ?
- Stratégie ASO (App Store Optimization) : nom affiché, mots-clés, catégorie, captures d'écran de store.
- Heures de silence ("quiet hours") pour les notifications push, formulation exacte des messages.
- Détail du futur compte "circuit/organisateur professionnel" évoqué en v2 (modèle tarifaire, processus de vérification, fonctionnalités).

### 16.6 Contenu & marque
- "KartMe" confirmé comme nom de marque — vérifier la disponibilité réelle du nom de domaine et des identifiants sur les stores avant de s'engager définitivement.
- Ton éditorial complet au-delà des jeux de mots badges/écrans vides (ex. ton des CGU, des emails transactionnels, des messages d'erreur).
- Constitution/structure juridique de l'éditeur de l'application (non traité dans ce document, hors périmètre produit).
