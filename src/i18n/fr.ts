/**
 * Catalogue français — langue de lancement.
 * Toutes les chaînes visibles de l'app passent par ici (socle i18n).
 * Pour ajouter une langue : dupliquer ce fichier (ex. en.ts) et l'enregistrer
 * dans le catalogue de src/i18n/index.ts.
 */
export const fr = {
  app: {
    name: 'KartSquad',
    tagline: 'Le karting entre amis, façon Elo.',
  },
  tabs: {
    races: 'Courses',
    // Singulier : « Classements » déborde du libellé d'onglet sur iPhone
    // (390 px → « Classem… »).
    rankings: 'Classement',
    // « Circuits » et non « Kartings » (décision PO 2026-08-01) : c'est déjà le
    // mot employé PARTOUT ailleurs — fiche circuit, suggérer un circuit,
    // signaler un circuit. L'onglet était le seul endroit à en dire un autre.
    tracks: 'Circuits',
    profile: 'Profil',
  },
  common: {
    createRace: 'Créer une course',
    cancel: 'Annuler',
    soon: 'Bientôt disponible',
  },
  screens: {
    racesEmpty: 'Aucune course pour le moment. Crée la première !',
    friendsEmpty: 'Invite tes amis pour lancer la compétition.',
    profileSubtitle: 'Ton Elo, tes grades et tes badges apparaîtront ici.',
  },
  states: {
    success: 'Succès',
    warning: 'Avertissement',
    error: 'Erreur',
    info: 'Information',
  },
  auth: {
    signInTitle: 'Content de te revoir',
    signUpTitle: 'Rejoins la grille',
    // Affiché sur l'inscription ET la connexion quand une invitation d'ami
    // attend : entre le lien et son retour sur l'invitation, le nouveau venu
    // traverse deux écrans qui, sans cela, n'en parlent nulle part.
    // L'invitant n'est pas nommé — il faudrait l'interroger avant toute
    // connexion, donc exposer un pseudo à quiconque fabrique une URL.
    inviteWaiting: '🤝 Une invitation t’attend — crée ton compte et vous serez amis.',
    forgotTitle: 'Mot de passe oublié',
    usernameTitle: 'Choisis ton pseudo',
    email: 'Email',
    password: 'Mot de passe',
    username: 'Pseudo',
    signIn: 'Se connecter',
    signUp: 'Créer mon compte',
    google: 'Continuer avec Google',
    // « Se connecter avec Apple » — le libellé du bouton vient d'Apple
    // lui-même (composant système), donc rien à traduire ici : seuls les
    // messages d'échec sont à nous.
    appleUnavailable: 'La connexion Apple n’existe que sur iPhone et iPad.',
    appleNoToken: 'Apple n’a pas renvoyé de jeton. Réessaie.',
    appleFailed: 'La connexion Apple a échoué. Réessaie.',
    forgotLink: 'Mot de passe oublié ?',
    noAccount: 'Pas encore de compte ? Créer un compte',
    hasAccount: 'Déjà un compte ? Se connecter',
    sendReset: 'Envoyer le lien',
    resetSent: 'Si un compte existe, un lien vient de partir par email.',
    backToSignIn: 'Retour à la connexion',
    usernameHint: '3 à 20 caractères. Tu pourras le changer plus tard.',
    confirm: 'Valider',
    signOut: 'Se déconnecter',
    // Consentement obligatoire (lot 3.3).
    consentLabel: 'J’accepte les conditions d’utilisation et la politique de confidentialité',
    consentPre: 'J’ai lu et j’accepte les ',
    consentMid: ' et la ',
    consentPost: '.',
    notConfigured: 'Connexion bientôt active (base non encore branchée).',
    errors: {
      empty: 'Ce champ est requis.',
      too_short: 'Pseudo trop court (3 caractères minimum).',
      too_long: 'Pseudo trop long (20 caractères maximum).',
      banned: 'Ce pseudo n’est pas autorisé.',
      generic: 'Une erreur est survenue. Réessaie.',
    },
  },
  races: {
    homeEmpty: 'Aucune course pour le moment. Crée la première !',
    // Nom accessible d'une carte de course sur l'accueil.
    cardAria: 'Course du',
    upcoming: 'À venir',
    past: 'Passées',
    create: 'Créer une course',
    newRace: 'Nouvelle course',
    circuit: 'Circuit',
    circuitSearch: 'Rechercher un circuit…',
    // Référentiel de circuits maîtrisé (pas d'ajout libre) : sections du sélecteur.
    circuitRecents: 'Tes circuits',
    circuitAll: 'Tous les circuits',
    circuitEmpty: 'Aucun circuit trouvé. Cherche par nom ou par ville — et signale-nous une piste manquante !',
    // « Près de moi » (A12a) : la position n'est demandée QUE sur ce bouton,
    // pour que la fenêtre du navigateur arrive quand le pilote l'a voulue.
    circuitNear: 'Près de moi',
    // Onglet Circuits (A12b) — carte Leaflet + fond OpenStreetMap.
    //
    // TOUS ces libellés disaient « karting » quand l'onglet a été rebaptisé
    // « Circuits » : le titre annonçait « Circuits » et la ligne juste en
    // dessous « 277 kartings en France ». Un renommage à moitié fait est pire
    // que pas de renommage — l'application parle maintenant d'une seule voix.
    mapTitle: 'Circuits',
    mapSubtitle: '%n circuits en France',
    mapLoading: 'Chargement de la carte…',
    mapLocate: 'Me localiser',
    mapCreateHere: 'Créer une course ici',
    mapAttribution: 'Fond de carte et données : © contributeurs OpenStreetMap',
    mapFailed: 'Impossible de charger les circuits.',
    mapAria: 'Carte des circuits de France',
    mapTiles: 'Fond de carte indisponible — la liste ci-dessous reste utilisable.',
    mapNoPos: 'Quelques circuits',
    mapSearch: 'Chercher un circuit par nom ou par ville…',
    mapNone: 'Aucun circuit ne correspond.',
    mapViewMap: 'Carte',
    mapViewList: 'Liste',
    mapPickTitle: 'Choisir un circuit',
    mapPickConfirm: 'Choisir ce circuit',
    mapChooseOnMap: 'Choisir sur la carte',
    // Signalement de circuit (demande PO 2026-07-29) : le référentiel vient
    // d'OpenStreetMap, il est incomplet par nature et il vieillit. Les
    // pilotes, eux, savent.
    reportCircuitLink: 'Un circuit manque ou a fermé ? Signale-le',
    reportCircuitFor: 'Signaler un problème sur cette fiche',
    reportTitle: 'Signaler un circuit',
    reportKindLabel: 'Que signales-tu ?',
    reportKinds: {
      manquant: 'Il manque',
      ferme: 'Il a fermé',
      erreur: 'Le nom ou la ville sont faux',
    } as Record<string, string>,
    reportName: 'Nom du circuit',
    reportNamePh: 'Ex. : Karting du Bocage',
    reportCity: 'Ville (ou la plus proche)',
    reportCityPh: 'Ex. : Vire',
    reportTarget: 'Fiche concernée',
    // Champ libre (arbitrage PO 2026-08-01, contre la décision d'origine) :
    // le nom et la ville ne disent pas CE QUI cloche, et le modérateur reçoit
    // un signalement qu'il ne peut pas traiter. L'objection d'origine — « une
    // porte d'entrée pour les insultes » — est levée par le fait que ce texte
    // n'est JAMAIS public : il ne sort pas de la file de modération.
    reportComment: 'Précisions (facultatif)',
    reportCommentPh: 'Ex. : fermé depuis mars, le portail est condamné.',
    reportCommentHint: 'Lu par la modération uniquement — jamais affiché aux autres pilotes.',
    // %n arrive déjà accordé (« 1 caractère », « 12 caractères »).
    reportCommentLeft: 'Il reste %n',
    reportSend: 'Envoyer le signalement',
    reportDone: 'Merci ! Un modérateur va regarder. Le référentiel profite à tous les pilotes.',
    reportNeedName: 'Indique au moins le nom du circuit.',
    reportBack: 'Retour à la carte',
    // Un visiteur sans jeton d'invitation : le lien nu ouvre bien la page (elle
    // n'est pas secrète), mais n'ouvre pas la grille. Le dire, plutôt que de
    // laisser un bouton qui échouera.
    joinNeedsInvite: 'Seul l’organisateur peut inviter sur cette course.',
    // Fiche circuit (A11).
    circuitPage: {
      alsoKnown: 'Aussi connu : %a',
      indoor: 'Indoor',
      record: 'Record du circuit',
      privatePilot: 'Pilote privé',
      myBest: 'Ton meilleur tour ici : %t',
      topTimes: 'Meilleurs tours',
      periodAll: 'Toujours',
      periodYear: 'Cette année',
      periodMonth: 'Ce mois-ci',
      empty: 'Aucun chrono ici. Sois le premier à inscrire ton nom.',
      life: 'Vie du circuit',
      lifeLine: '%r courses · %p pilotes · dernière : %d',
      myRaces: 'Tes courses ici : %n',
      website: 'Site web',
      call: 'Appeler',
      loadError: 'Impossible de charger la fiche.',
      notFound: 'Circuit introuvable.',
      openPage: 'Voir la fiche',
      // Le « métier » importé du relevé PO (A16). Pas de libellés
      // « Longueur »/« Largeur » : la fiche affiche « 1 200 m × 8 m », qui se
      // lit seul — un mot devant chaque nombre allongeait l'écran sans rien
      // apprendre, et l'objectif du lot de densité est l'inverse.
      meters: '%n m',
      // Servi SEULEMENT quand la longueur manque : « 8 m » nu se lirait
      // comme une longueur de piste de huit mètres.
      width: 'Largeur %n m',
      envKinds: {
        indoor: 'Indoor',
        outdoor: 'Extérieur',
        temporaire: 'Piste temporaire',
      } as Record<string, string>,
      // La pastille mise en avant sur la fiche, réservée à l'électrique : elle
      // est là pour le PROMOUVOIR (C13), pas pour décrire — d'où l'éclair, qui
      // double la couleur pour ceux qui ne la distinguent pas.
      electriqueTag: '⚡ Électrique',
      motorKinds: {
        thermique: 'Karts thermiques',
        electrique: 'Karts électriques',
        mixte: 'Thermique et électrique',
      } as Record<string, string>,
      usageKinds: {
        loisir: 'Loisir',
        competition: 'Compétition',
        mixte: 'Loisir et compétition',
      } as Record<string, string>,
      homologated: 'Homologué %h',
      tracks: 'Plusieurs tracés : %t',
      route: 'Itinéraire',
    },
    circuitTruncated: '%n circuits affichés sur %t — précise ta recherche (nom ou ville).',
    circuitNearTitle: 'Autour de toi',
    circuitLocating: 'Recherche de ta position…',
    circuitNearEmpty: 'Aucun circuit connu à moins de 150 km. Cherche par nom ou par ville.',
    // Message volontairement NEUTRE : nommer Safari était faux pour qui
    // navigue sous Chrome, et prêtait à confusion. La marche à suivre dépend
    // du navigateur ; on décrit le principe, pas un chemin de menus.
    circuitGeoDenied:
      'Position refusée. Ton navigateur a mémorisé le refus : rouvre-lui l’accès dans ses réglages de site (et vérifie que la localisation lui est autorisée dans les réglages du téléphone). Sinon, cherche par nom ou par ville ci-dessous.',
    // iOS a mémorisé le refus : la fenêtre ne reviendra plus, et le message
    // ci-dessus parlerait de « réglages de site » à quelqu'un qui n'a pas de
    // navigateur sous les yeux. Le chemin est nommé, parce qu'il est le seul.
    circuitGeoReglages:
      'Position refusée. Pour la rouvrir : Réglages du téléphone → KartSquad → Position. Sinon, cherche par nom ou par ville ci-dessous.',
    circuitGeoTimeout:
      'Pas de réponse à la demande de position. Réessaie — et laisse la fenêtre d’autorisation ouverte le temps de choisir.',
    circuitGeoUnavailable: 'Position indisponible pour le moment. Cherche par nom ou par ville.',
    circuitGeoUnsupported: 'Ton navigateur ne sait pas donner ta position. Cherche par nom ou par ville.',
    date: 'Date',
    time: 'Heure',
    dateHint: 'JJ/MM/AAAA',
    timeHint: 'HH:MM',
    confirmCreate: 'Créer la course',
    participants: 'Pilotes',
    add: 'Ajouter',
    you: 'toi',
    // Invité sans compte : son Elo est gelé et exclu des classements — on
    // n'affiche donc aucun score, qui laisserait croire à un vrai classement.
    guest: 'Invité · hors classement',
    guestShort: 'Invité',
    privatePilot: 'Pilote privé',
    privateProfileHint: 'Profil privé',
    // ── Grille : UN SEUL champ qui suggère (retour de test réel 2026-08-01).
    // Il y avait trois blocs empilés — « Tes amis », « Un autre pilote
    // inscrit », « Quelqu'un sans compte » — et la personne testée s'est
    // perdue : elle ne savait pas dans lequel taper. L'ordre des blocs disait
    // pourtant quelque chose d'utile (l'invité sans compte n'échange aucun
    // point Elo, on le veut en dernier recours) — cet ordre survit, non plus
    // en marches numérotées mais dans le RANG des suggestions : amis d'abord,
    // autres inscrits ensuite, « comme invité » en dernière ligne.
    addSearchLabel: 'Qui court ?',
    addSearchPlaceholder: 'Un prénom, un pseudo…',
    addSearchHint: 'Tes amis sont déjà là. Tape un pseudo pour trouver n’importe quel inscrit.',
    addSearching: 'Recherche…',
    // Une recherche qui n'a pas abouti ne dit PAS « personne ne s'appelle
    // comme ça » : elle dit qu'elle n'a pas pu regarder. La nuance décide si
    // l'on ajoute un fantôme homonyme du pilote inscrit qu'on cherchait.
    addSearchDown: 'Recherche indisponible — impossible de vérifier les pilotes inscrits.',
    addGuestUnverified: 'Hors classement Elo. Attention : on n’a pas pu vérifier s’il a déjà un compte.',
    addMoreResults: 'Et %n autres — précise le nom.',
    addFriendsEmpty: 'Tes amis sont tous sur la grille. Tape un nom pour ajouter quelqu’un d’autre.',
    addNoFriendsYet: 'Tape le nom de la personne à ajouter.',
    addNoMatch: 'Aucun pilote inscrit sous ce pseudo.',
    // Une lettre ne déclenche aucune recherche : on n'a rien à conclure, et
    // surtout rien à affirmer.
    addKeepTyping: 'Continue à taper pour chercher un pilote inscrit…',
    invitePilotAlready: 'Ce pilote est déjà sur la grille.',
    // L'invité (fantôme) : on dit franchement ce qu'il ne fait PAS, sinon
    // l'admin croit inscrire un vrai pilote et s'étonne que l'Elo ne bouge pas.
    addGuestRow: '➕ Ajouter « %n » comme invité',
    addGuestRowHint: 'Hors classement Elo : il court et figure au résultat, mais n’échange aucun point.',
    guestNudge: 'Invite-le à s’inscrire : ses prochaines courses compteront vraiment.',
    leaveRace: 'Quitter la course',
    actionError: 'Action impossible pour le moment.',
    remove: 'Retirer',
    rejoin: 'Je participe',
    share: 'Partager la course',
    shareHint: 'Envoie ce lien ou fais scanner le QR code.',
    copyLink: 'Copier le lien',
    copied: 'Lien copié !',
    edit: 'Modifier',
    save: 'Enregistrer',
    delete: 'Supprimer la course',
    deleteConfirm: 'Supprimer cette course ? C’est définitif.',
    deleteConfirmBtn: 'Supprimer',
    joinRace: 'Rejoindre la course',
    joinError: 'Impossible de rejoindre cette course.',
    deleteError: 'Suppression impossible pour le moment.',
    circuitRecord: 'Record du circuit : %t · %n',
    lapAdd: 'Ajouter mon temps',
    lapAddOther: 'Ajouter un temps',
    lapEdit: 'Modifier',
    lapLabel: 'Meilleur tour — chiffres seuls, vide pour effacer',
    lapSave: 'Enregistrer',
    // Saisie groupée (A9) : huit pilotes = huit ouvertures de champ auparavant.
    lapBulk: 'Saisir tous les temps',
    lapBulkHint: 'Tape seulement les chiffres, de gauche à droite : 0 5 2 3 4 8 → 0:52.348. Laisse vide pour ne pas mettre de temps.',
    lapInvalid: 'Temps invalide (entre 10 s et 20 min, secondes < 60).',
    limitReached: 'Limite de %n courses par jour atteinte.',
    errorDate: 'Date ou heure invalide.',
    errorCircuit: 'Choisis un circuit.',
    noCircuit: 'Circuit à définir',
    nameErrors: {
      empty: 'Le nom est requis.',
      too_short: 'Nom trop court.',
      too_long: 'Nom trop long (40 caractères maximum).',
      banned: 'Ce nom n’est pas autorisé.',
      generic: 'Nom invalide.',
    },
    enterRanking: 'Saisir le classement',
    // Refonte densité (A17, décisions PO 2026-07-30) : sections rares en
    // feuille glissante, vues segmentées, menu ⋯ pour les actions d'admin.
    menu: 'Options',
    addPilots: 'Ajouter des pilotes',
    // Partage du podium en image (lot C4, décision PO 2026-08-01 : « le
    // podium, avec les points échangés »). Un message texte collé dans une
    // conversation ne se distingue de rien et n'apprend rien à qui ne connaît
    // pas l'application ; une image se regarde, et elle porte l'adresse.
    podiumImageTitle: 'Partager le podium',
    podiumImageHint: 'Une image à envoyer dans la conversation — le podium, les points échangés, et où s’inscrire.',
    podiumImageShare: 'Partager l’image',
    podiumImageSaved: 'Image enregistrée ✓',
    podiumImageLoading: 'Préparation de l’image…',
    podiumImageAria: 'Aperçu de l’image à partager : podium de la course à %c, %d',
    // Écrit DANS l'image : elle circule chez des gens qui n'ont pas l'app, et
    // « +24 » tout seul ne dit rien. %n arrive déjà accordé.
    podiumImageResume: '%n · les points ne s’échangent qu’entre pilotes inscrits',
    // DISTINCT de `shareResults`, qui titre la carte de lien À L'INTÉRIEUR de
    // la feuille : deux commandes au texte identique dans la même vue, et un
    // lecteur d'écran annonce deux fois la même chose.
    shareResultsOpen: 'Partager cette course',
    shareResultsOpenHint: 'Le podium en image, ou le lien de la course.',
    shareOpen: 'Inviter la bande',
    shareOpenHint: 'Lien, QR code — la course en un tap.',
    vueRanking: 'Classement',
    vueLaps: 'Chronos',
    // « Duels » disait un affrontement ; l'écran montre en fait D'OÙ VIENNENT
    // les points, pilote par pilote (décision PO 2026-08-01).
    vueDuels: 'Évolution Elo',
    duelsHint: 'Touche un pilote pour voir d’où viennent ses points.',
    youResult: 'Toi : %p · %d',
    presentsTitle: 'Qui était présent ?',
    presentsHint: 'Décoche les pilotes qui n’ont finalement pas couru — ils seront retirés de la course (leur Elo ne bouge pas).',
    present: 'Présent',
    absent: 'Absent',
    continue: 'Continuer',
    rankingTitle: 'Ordre d’arrivée',
    dragHint: 'Glisse les pilotes pour les mettre dans l’ordre d’arrivée (1er en haut).',
    tapHint: 'Touche les pilotes dans l’ordre d’arrivée (1er d’abord).',
    // Le geste de SECOURS, en un lien discret sous le mode d'emploi.
    //
    // C'étaient deux grandes pastilles côte à côte, mises en avant dès
    // l'ouverture. Le PO les a retirées le 2026-08-01 : « glisser-déposer en
    // premier, toucher en secours », « plus les 2 grandes icônes en avant au
    // début ». Poser une question à quelqu'un qui n'a pas encore vu la liste,
    // c'est lui demander de choisir entre deux gestes qu'il ne connaît pas.
    //
    // Le lien reste HAUT dans l'écran — au-dessus de la liste, pas sous elle :
    // sous six pilotes il retombait hors écran, ce qui avait bloqué un testeur
    // le 2026-07-30. Discret ne veut pas dire caché.
    modeVersTap: '👆 Plutôt toucher les pilotes dans l’ordre',
    modeVersDrag: '✥ Revenir au glisser-déposer',
    // Lus à voix haute : le pictogramme ne s'énonce pas, et « bouton » seul ne
    // dit pas qu'on change de mode de saisie.
    modeVersTapAria: 'Mode glisser-déposer actif. Passer au mode toucher : pointer les pilotes dans l’ordre d’arrivée',
    modeVersDragAria: 'Mode toucher actif. Revenir au mode glisser-déposer',
    reset: 'Recommencer',
    validateRanking: 'Valider le classement',
    // Brouillon local de saisie (A10) : le réseau au circuit est mauvais, une
    // coupure ne doit pas effacer un ordre saisi à la main.
    draftRestored: 'Saisie reprise',
    draftRestoredHint: 'On a retrouvé ton classement en cours sur cet appareil.',
    draftDiscard: 'Repartir de zéro',
    // Abandons (A6). Décision PO : classé dernier — la règle la plus simple,
    // et la seule qu'on ne puisse pas exploiter pour protéger son Elo.
    dnfTitle: 'Un pilote n’a pas fini ?',
    dnfHint: 'Sélectionne-le : il sera classé dernier, comme s’il avait fini dernier. Plusieurs abandons sont à égalité entre eux.',
    dnfShort: 'ABD',
    dnf: 'Abandon',
    needOneFinisher: 'Il faut au moins un pilote à l’arrivée.',
    // La liste s'ouvre dans l'ordre des inscriptions : tant que personne n'a
    // été déplacé, ce n'est pas un classement. Le dire, plutôt que laisser un
    // bouton grisé sans explication.
    // « 1er en haut » est ICI aussi : c'est le message d'OUVERTURE, et le sens
    // de la liste ne doit pas s'apprendre après avoir déjà rangé son vainqueur
    // en bas.
    dragUntouched: 'Place les pilotes dans l’ordre d’arrivée, 1er en haut : appui long, puis glisse.',
    needTwoPilots: 'Ajoute au moins 2 pilotes pour saisir le classement.',
    // Cycle de vie (lot 2.6) : verrou + rappel, correction 24 h.
    lock: 'Clôturer les invitations',
    // Le MÊME geste, promu en bouton principal tant que la grille est ouverte
    // (décision PO 2026-08-01 : « valider la grille avant de saisir le
    // classement »). Le mot change avec le rôle : ce n'est plus une option
    // discrète parmi d'autres, c'est l'étape suivante.
    validateGrid: 'Valider la grille',
    validateGridHint: 'Le classement se saisira ensuite — la grille sera figée.',
    reopen: 'Rouvrir les invitations',
    lockedBanner: 'Grille figée — la course est prête. Rouvre les invitations pour ajouter ou retirer un pilote.',
    correctRanking: 'Corriger le classement',
    correctWindowHint: 'Une erreur de saisie ? Tu peux corriger le classement pendant 24 h après validation.',
    correctTitle: 'Corriger le classement',
    correctHint: 'Remets les pilotes dans le bon ordre d’arrivée, puis confirme. L’Elo sera recalculé.',
    confirmCorrection: 'Confirmer la correction',
    results: 'Résultats',
    completed: 'Course terminée',
    grade: 'Grade',
    rematch: 'Prendre les mêmes et on recommence',
    rematchError: 'Impossible de relancer la course.',
    waitingTitle: 'En attente du drapeau',
    waitingHint: 'L’admin saisira le classement après la course. Cet écran basculera tout seul sur les résultats.',
    pairTitle: 'D’où viennent tes points ?',
    pairTitleOther: 'D’où viennent ses points ?',
    pairBeat: 'devant',
    pairLost: 'derrière',
    pairTied: 'ex æquo avec',
    pairClose: 'Fermer le détail',
    shareResults: 'Partager les résultats',
    shareResultsHint: 'Envoie le résumé dans le groupe.',
  },
  friends: {
    // « Trouver un ami » (décision PO 2026-08-01). Le champ cherche AUSSI des
    // inconnus — c'est la porte d'entrée du réseau — mais c'est bien ce qu'on
    // vient y faire, et « pilote » est un mot d'application, pas un mot d'usage.
    search: 'Trouver un ami',
    searchClear: 'Effacer la recherche',
    searchEmpty: 'Aucun pilote trouvé.',
    actionFailed: 'Action impossible pour l’instant. Réessaie.',
    // Un échec réseau laissait l'écran vide, sans un mot : le classement
    // disparaît dès le 2e caractère, il ne restait donc rien du tout.
    searchFailed: 'Recherche impossible pour l’instant — vérifie ta connexion.',
    received: 'Demandes reçues',
    sent: 'Demandes envoyées',
    accept: 'Accepter',
    decline: 'Refuser',
    cancel: 'Annuler',
    add: 'Demander en ami',
    pendingSent: 'Demande envoyée',
    friendsBadge: 'Amis ✓',
    remove: 'Retirer des amis',
    block: 'Bloquer',
    blocked: 'Pilote bloqué.',
    // Deux états DISTINCTS, et c'est le point : la fiche restait sur un
    // squelette gris muet, sans fin, quelle que soit la cause. On y arrive
    // d'un tap sur « Voir son profil » juste après avoir accepté un lien
    // d'ami — le geste qui suit la conversion.
    loadError: 'Impossible de charger cette fiche. Vérifie ta connexion.',
    notFound: 'Ce pilote n’est plus là.',
    report: 'Signaler',
    reportTitle: 'Pourquoi signales-tu ce pilote ?',
    reportSent: 'Signalement envoyé. Merci.',
    reportCategories: {
      comportement: 'Comportement',
      fausse_course: 'Fausse course',
      classement: 'Classement suspect',
      usurpation: 'Usurpation d’identité',
      photo: 'Photo de profil',
      autre: 'Autre',
    },
    privateProfile: 'Profil privé — deviens son ami pour voir ses stats.',
    faceToFace: 'Face-à-face',
    faceToFaceEmpty: 'Aucune course commune pour l’instant.',
    // %c = « 1 course » / « 3 courses » composé par `pluriel()` : la forme
    // « %n course(s) » laissait la parenthèse VISIBLE en pleine phrase.
    faceToFaceDraws: 'Dont %c où aucun des deux n’a fini.',
    you: 'Toi',
    addToRace: 'Ajouter un ami à la course',
  },
  rankings: {
    scopeFriends: 'Amis',
    scopeGlobal: 'Global',
    // Vue « autour de moi » par défaut (A17, décision PO 2026-07-30).
    seeTop: 'Voir le haut du classement',
    backToMe: 'Revenir autour de moi',
    me: '(toi)',
    myRank: 'Ta place : %r · %e Elo',
    myPosition: 'Ma position',
    topPercent: 'Top %p%',
    // Les amis que `get_leaderboard` ne renvoie pas : il filtre sur
    // « au moins une course ». Sans cette section, quelqu'un qu'on vient
    // d'inviter restait invisible jusqu'à sa première course — donc aucune
    // preuve que le lien d'invitation a fonctionné.
    friendsUnranked: 'Pas encore classés',
    noRaceYet: 'Aucune course pour l’instant',
    searching: 'Recherche…',
    notRankedYet: 'Termine ta première course pour entrer au classement.',
    emptyFriends: 'Aucun pilote classé parmi tes amis — courez ensemble !',
    emptyGlobal: 'Aucun pilote classé pour l’instant.',
    loadMore: 'Afficher la suite',
    loadError: 'Impossible de charger le classement. Vérifie ta connexion et réessaie.',
    retry: 'Réessayer',
  },
  profile: {
    // Photo de profil (A7). Stockage privé + liens signés : la photo suit
    // exactement les règles de visibilité du profil.
    photoAdd: 'Ajouter une photo',
    photoChange: 'Changer ma photo',
    photoRemove: 'Retirer',
    photoBusy: 'Envoi en cours…',
    photoError: 'Impossible d’envoyer cette photo.',
    photoTooBig: 'Photo trop lourde — choisis-en une plus légère (20 Mo maximum).',
    photoNotAnImage: 'Ce fichier n’est pas une image.',
    photoUnreadable: 'Format non reconnu (HEIC d’iPhone ?). Essaie un JPEG ou un PNG.',
    photoRemoveA11y: 'Retirer ma photo de profil',
    eloLabel: 'Elo',
    // %s = l'Elo à atteindre. Le repère chiffré manquait : « plus que 90 »
    // ne dit pas 90 vers QUOI (retour de test 2026-08-01).
    nextGrade: 'Encore %n pts → %g, à partir de %s',
    maxGrade: 'Grade maximal atteint 🏆',
    // Période de calibration : les 5 premières courses, le niveau se règle vite.
    calibrating: 'En calibration',
    curveDnf: '○ abandon',
    // Le trait pointillé coloré de la courbe : sans légende, deux pointillés
    // (départ 1000 en gris, palier visé en couleur) ne se distinguaient pas.
    curveSeuil: '┄ palier %s',
    // Le palier est HORS du cadre : le trait est posé sur le bord, la flèche
    // dit qu'il continue au-delà. Sans elle, on lirait le bord comme le
    // palier lui-même, et donc comme « j'y suis presque ».
    curveSeuilLoin: '┄ palier %s ↑',
    calibratingHint: 'En calibration : ton niveau se règle plus vite (encore %c).',
    stats: 'Statistiques',
    races: 'Courses',
    wins: 'Victoires',
    podiums: 'Podiums',
    // « Ta courbe » et non « Évolution de l'Elo » : le segment de la fiche
    // course s'appelle désormais « Évolution Elo » (décision PO), et deux
    // libellés quasi identiques désignaient deux écrans différents.
    curve: 'Ta courbe',
    curveEmpty: 'Ta courbe apparaîtra après ta première course.',
    history: 'Mes courses',
    historyOther: 'Ses courses',
    historyEmpty: 'Aucune course terminée pour l’instant.',
    historySeeAll: 'Voir tout l’historique (%n)',
    badges: 'Badges',
    gradesLadder: 'Échelle des grades',
    gradesLadderSub: 'Six grades, du bitume à la légende. Ton Elo décide.',
    you: 'toi',
  },
  // Les fiches qui s'ouvrent au tap sur un médaillon de grade ou un badge
  // (retour de test 2026-08-01 : « je ne comprends pas ce que valent les
  // grades »). Le vocabulaire y est celui d'un joueur, pas celui d'un moteur
  // de classement : ni « somme nulle », ni « palier », ni « borne ».
  explications: {
    // DEUX jeux de libellés, et ce n'est pas de la coquetterie : le même
    // médaillon s'ouvre depuis MON profil et depuis la fiche d'un autre
    // pilote. Un tutoiement en dur y affichait « Ton Elo : 1450 » sur la fiche
    // de quelqu'un d'autre — un chiffre faux, présenté comme le sien.
    gradeTitre: 'Ton niveau',
    gradeTitreAutre: 'À propos de ce grade',
    gradeAria: '%g — voir ce que vaut ce grade',
    // %e = plage d'Elo du grade.
    plage: 'Elo %e',
    plageOuverte: 'Elo %m et au-delà',
    quoi:
      'Ton Elo est un compteur de points : tu en gagnes en battant des pilotes inscrits, tu en perds quand ils te battent. Le grade, c’est le nom que prend ce compteur.',
    quoiAutre:
      'L’Elo est un compteur de points : on en gagne en battant des pilotes inscrits, on en perd quand ils vous battent. Le grade, c’est le nom que prend ce compteur.',
    tonElo: 'Ton Elo : %e',
    // %p = pseudo du pilote regardé.
    eloDe: 'Elo de %p : %e',
    // Sans pronom : sert aux deux cas.
    ilTeReste: 'Encore %n avant %g.',
    auSommet: 'Tu es tout en haut de l’échelle. Il n’y a plus rien au-dessus.',
    auSommetAutre: 'C’est le dernier grade : personne ne monte plus haut.',
    calibration:
      'Encore %c de calibration : le grade et les points restent provisoires tant que le niveau se cherche.',
    echelle: 'Les six grades',
    badgeTitre: 'À propos de ce badge',
    badgeObtenu: 'Décroché le %d.',
    // Sur la vitrine d'un AUTRE pilote : sans le pseudo, « Décroché le 12
    // juil. » se lit comme sa propre date.
    badgeObtenuPar: 'Décroché par %p le %d.',
    badgeAFaire: 'Pas encore décroché.',
  },
  badges: {
    title: 'Badges',
    // Pas de nombre en toutes lettres : le compteur juste dessous en donne
    // un, et les deux se contredisaient dès qu'un badge s'ajoutait (« Neuf
    // trophées » au-dessus de « 0 sur 11 débloqués »).
    subtitle: 'Des trophées à décrocher sur la piste.',
    progress: '%u sur %t débloqués',
    locked: 'À débloquer',
    unlockedBanner: 'Badge gagné sur cette course : %s 🏆',
    unlockedBannerMany: 'Badges gagnés sur cette course : %s 🏆',
    seeAll: 'Voir tous les badges',
    none: 'Aucun badge débloqué pour l’instant — ça se gagne en piste.',
    items: {
      kart_didentite: { name: 'Kart d’identité', condition: 'Jouer sa première course.' },
      habitue_stands: { name: 'Habitué des stands', condition: 'Jouer 10 courses.' },
      champagne: { name: 'Champagne !', condition: 'Remporter sa première victoire.' },
      chapeaux_de_roues: { name: 'Sur les chapeaux de roues', condition: 'Gagner 3 courses d’affilée.' },
      midi_moins_le_kart: { name: 'Midi moins le kart', condition: 'Participer à une course en matinée (6 h – midi).' },
      chef_ecurie: { name: 'Chef d’écurie', condition: 'Organiser 10 courses classées (2 inscrits ou plus).' },
      drs: { name: 'DRS', condition: 'Battre un pilote inscrit parti 300 Elo (ou plus) au-dessus de soi.' },
      safety_car: { name: 'Safety car', condition: 'Finir devant tous les pilotes inscrits mieux classés que toi.' },
      push: { name: 'Push', condition: 'Gagner au moins 45 points d’Elo en une course.' },
      // Le circuit doit être ÉLECTRIQUE, pas « mixte » : sur un mixte, rien ne
      // dit qu'on a pris un kart électrique.
      sous_tension: { name: 'Sous tension', condition: 'Courir sur un circuit de karting électrique.' },
      haute_tension: { name: 'Haute tension', condition: 'Courir 5 fois sur un circuit de karting électrique.' },
    },
  },
  // Centre de notifications in-app (A5) : la boîte de réception, indépendante
  // du push (qui n'arrive pas partout et ne se rattrape pas).
  inbox: {
    // Titre distinct de l'écran de RÉGLAGES « Notifications » : les deux
    // écrans existent, ils ne doivent pas porter le même mot en gros.
    // « Quoi de neuf » et non « Ta boîte » (décision PO 2026-08-01) : la
    // métaphore de la boîte aux lettres promettait du courrier à traiter, là
    // où l'écran raconte ce qui a bougé autour de toi.
    title: 'Quoi de neuf',
    now: 'à l’instant',
    emptyTitle: 'Rien de neuf',
    emptyBody:
      'Les invitations à une course, les classements et les demandes d’amis atterriront ici — même si tu as coupé les alertes push.',
    error: 'Impossible de charger tes notifications.',
    retry: 'Réessayer',
    more: 'Voir plus ancien',
    loading: 'Chargement…',
  },
  settings: {
    title: 'Réglages',
    notifications: 'Notifications',
    notificationsSub: 'Tes alertes push.',
    account: 'Compte',
    accountSub: 'Pseudo, confidentialité, suppression.',
    help: 'Aide & légal',
    helpSub: 'FAQ, conditions, confidentialité.',
    moderation: 'Modération',
    moderationSub: 'Signalements à examiner.',
    stats: 'Stats',
    statsSub: 'Activation, rétention, K-factor.',
  },
  stats: {
    title: 'Tableau de bord',
    overview: 'Vue d’ensemble',
    users: 'Inscrits',
    active7: 'Actifs 7j',
    races: 'Courses',
    ghosts: 'Invités',
    viralityTitle: 'Viralité',
    kFactor: 'K-factor',
    referred: 'Inscrits parrainés',
    shares: 'Partages',
    signups: 'Inscriptions',
    viralityNote: 'K-factor = part des inscriptions arrivées via un lien de parrainage.',
    inviteTitle: 'Lien d’ami',
    inviteAccepts: 'Liens acceptés',
    inviteSignups: 'dont nouveaux comptes',
    inviteNote:
      'Un lien accepté par un pilote déjà inscrit compte dans « Liens acceptés », pas dans « nouveaux comptes ».',
    loadError: 'Impossible de charger le tableau de bord.',
    activationTitle: 'Activation',
    activationRate: 'Ont une course',
    racedRate: 'Ont couru',
    retentionTitle: 'Rétention',
    retention7: 'Reviennent (7j)',
    cohort7: 'Cohorte > 7j',
    retentionNote: 'Part des comptes de plus de 7 jours ayant rouvert l’app récemment.',
    engagementTitle: 'Engagement',
    rematches: 'Revanches',
    friends: 'Amis',
    badges: 'Badges',
    errorsTitle: 'Erreurs (7j)',
    errors7: 'Erreurs',
    noErrors: 'Aucune erreur récente. ✨',
  },
  moderation: {
    title: 'Modération',
    tabOpen: 'À traiter',
    tabAll: 'Tous',
    empty: 'Aucun signalement.',
    by: 'Signalé par',
    unknownPilot: 'Pilote inconnu',
    // Section « référentiel des circuits » de la boîte de modération.
    circuitsTitle: 'Circuits signalés',
    circuitsEmpty: 'Aucun circuit signalé.',
    circuitKinds: {
      manquant: 'Manquant',
      ferme: 'Fermé',
      erreur: 'Fiche à corriger',
    } as Record<string, string>,
    circuitDone: 'Traité',
    circuitReject: 'Écarter',
    circuitTargetGone: 'fiche supprimée depuis',
    suspendedTag: 'suspendu',
    categories: {
      comportement: 'Comportement',
      fausse_course: 'Fausse course',
      classement: 'Classement truqué',
      usurpation: 'Usurpation',
      photo: 'Photo de profil',
      autre: 'Autre',
    } as Record<string, string>,
    status: { open: 'À traiter', handled: 'Traité', dismissed: 'Rejeté' } as Record<string, string>,
    removePhoto: 'Retirer la photo',
    removePhotoConfirm: 'Confirmer le retrait',
    rename: 'Renommer',
    renameLabel: 'Nouveau pseudo',
    renameConfirm: 'Renommer',
    renameInvalid: 'Pseudo invalide (3–20 caractères, sans mot interdit).',
    suspend: 'Suspendre',
    suspendConfirmQ: 'Suspendre ce compte ?',
    suspendConfirm: 'Suspendre',
    reactivate: 'Réactiver',
    openRace: 'Ouvrir la course',
    deleteRace: 'Supprimer la course signalée',
    deleteConfirmQ: 'Supprimer définitivement ?',
    deleteConfirm: 'Supprimer',
    markHandled: 'Marquer traité',
    dismiss: 'Rejeter',
    reopen: 'Rouvrir',
  },
  account: {
    title: 'Compte',
    username: 'Pseudo',
    save: 'Enregistrer',
    saved: 'Pseudo mis à jour ✓',
    usernameError: 'Pseudo invalide (3–20 caractères, sans mot interdit).',
    privacy: 'Confidentialité',
    private: 'Profil privé (amis uniquement)',
    privacyHint:
      'En privé, ton Elo, tes stats et tes badges ne sont visibles que par tes amis acceptés.',
    blocked: 'Pilotes bloqués',
    blockedEmpty: 'Tu n’as bloqué personne.',
    unblock: 'Débloquer',
    danger: 'Zone sensible',
    delete: 'Supprimer mon compte',
  },
  deleteAccount: {
    title: 'Supprimer mon compte',
    warning:
      'Cette action est définitive. Ton profil devient « Joueur supprimé » et tes données personnelles (amis, blocages, notifications, badges) sont effacées.',
    keptNote:
      'Tes courses passées restent dans l’historique des autres pilotes, mais anonymisées — pour ne pas fausser leur Elo.',
    confirmLabel: 'Pour confirmer, tape SUPPRIMER en majuscules :',
    word: 'SUPPRIMER',
    confirm: 'Supprimer définitivement',
    deleting: 'Suppression…',
    error: 'La suppression a échoué. Réessaie.',
  },
  help: {
    title: 'Aide & légal',
    // Obligation de licence ODbL, pas une politesse : les données des circuits
    // viennent d'OpenStreetMap, la source doit rester visible pour l'utilisateur.
    creditsTitle: 'Sources des données',
    creditsOsm:
      'Les circuits de karting proviennent d’OpenStreetMap, sous licence ODbL. Un circuit manquant, fermé ou mal nommé ? La correction se fait sur openstreetmap.org — elle profite à tout le monde, KartSquad compris.',
    // Le relevé consolidé (A16) s'appuie sur la FFSA et des annuaires publics :
    // citer ses sources est la même hygiène que l'attribution ODbL.
    creditsReferentiel:
      'Caractéristiques des pistes (longueurs, homologations, types) : relevé consolidé à partir des données FFSA « Où pratiquer » et d’annuaires publics de circuits, vérifié en juillet 2026.',
    creditsFont: 'Police Fraunces, sous licence SIL Open Font License.',
    faqTitle: 'Questions fréquentes',
    faq: [
      // Réécrit sans jargon (retour de test 2026-08-01 : « l'explication de
      // l'Elo est trop technique »). « Somme nulle » disait la vérité, mais
      // pas à quelqu'un qui vient de finir sa première course.
      { q: 'Comment mon Elo est-il calculé ?', a: 'À chaque course, les pilotes inscrits se passent des points selon l’ordre d’arrivée : ceux que tu bats t’en donnent, ceux qui te battent t’en prennent. Battre plus fort que soi rapporte beaucoup ; battre plus faible rapporte peu. Ce que tu gagnes, quelqu’un le perd : rien n’est créé, rien ne disparaît.' },
      { q: 'Pourquoi un joueur non inscrit ne me fait pas gagner de points ?', a: 'Pour empêcher la triche, l’Elo ne s’échange qu’entre comptes inscrits. Les pilotes « invités » comptent dans la course mais pas dans l’Elo.' },
      { q: 'Qui peut voir mon profil ?', a: 'Par défaut tout le monde. Passe ton profil en « privé » dans Compte pour ne le montrer qu’à tes amis.' },
      { q: 'Comment corriger un classement erroné ?', a: 'Une fois validé, un classement est définitif — pour préserver l’Elo de tous. Vérifie bien l’ordre avant de valider ; en cas d’erreur manifeste, contacte l’éditeur.' },
    ],
    cgu: 'Conditions d’utilisation',
    privacy: 'Politique de confidentialité',
    lastUpdated: 'Dernière mise à jour : 14 juillet 2026.',
    cguBody: [
      'Bienvenue sur KartSquad. En créant un compte et en utilisant l’application, tu acceptes les présentes conditions d’utilisation.',
      'KartSquad est un service amateur de suivi de courses de karting entre amis, avec un classement de type Elo. Les résultats sont saisis librement par l’administrateur de chaque course ; l’application n’organise pas l’activité de karting sur piste et ne saurait être tenue responsable de son déroulement ni d’éventuels dommages.',
      'Tu t’engages à utiliser un pseudo respectueux, à ne pas usurper l’identité d’autrui, à ne pas publier de contenu injurieux ou illicite (pseudos, noms de circuits ou d’invités), et à ne pas fausser volontairement les classements.',
      'Un système de modération peut examiner les signalements et, en cas d’abus, renommer un contenu, supprimer une course ou suspendre un compte. Un compte suspendu ne peut plus créer ni modifier de contenu.',
      'Le service est fourni « en l’état », sans garantie de disponibilité continue. Nous pouvons faire évoluer ou interrompre le service, et modifier ces conditions ; les changements substantiels te seront signalés.',
    ],
    privacyBody: [
      'KartSquad collecte le minimum de données nécessaires : ton adresse e-mail (connexion), ton pseudo, ton Elo et l’historique des courses auxquelles tu participes. La date d’acceptation des présentes conditions est conservée comme preuve de consentement.',
      'Nous n’utilisons AUCUN service d’analytics tiers (pas de Google Analytics, PostHog, etc.). Des statistiques d’usage strictement internes (ouvertures d’app, partages, erreurs techniques) sont mesurées dans notre propre base pour améliorer le service ; elles ne sont ni revendues ni partagées.',
      'Si tu actives les notifications, un abonnement push (propre à ton navigateur) est enregistré pour t’envoyer des alertes ; tu peux le désactiver à tout moment.',
      'Tes données ne sont ni vendues ni cédées à des tiers à des fins commerciales. Elles transitent par des prestataires techniques (hébergement de la base et des notifications, connexion Google) agissant pour notre compte.',
      'Tu peux à tout moment passer ton profil en privé, ou supprimer ton compte depuis Compte → Supprimer mon compte : tes données personnelles sont alors effacées et ton historique anonymisé (pour préserver l’Elo des autres pilotes). Conformément au RGPD, tu disposes d’un droit d’accès, de rectification et d’effacement.',
      'Pour toute question relative à tes données, contacte l’éditeur.',
    ],
  },
  notifications: {
    title: 'Notifications',
    intro: 'Reçois une alerte quand ça bouge pour toi.',
    enable: 'Activer les notifications',
    enabling: 'Activation…',
    enabledOnDevice: 'Activées sur cet appareil.',
    disable: 'Désactiver sur cet appareil',
    test: 'Envoyer une notification de test',
    testSent: 'Regarde tes notifications 🏁',
    types: 'Ce que tu reçois',
    // Depuis A5, couper un type n'empêche plus la ligne d'apparaître dans la
    // boîte de réception : le réglage gouverne l'INTRUSION (alerte poussée),
    // pas la consultation. Sans cette phrase, un pilote qui a coupé les
    // résultats et voit sa cloche s'allumer conclut que le réglage est cassé.
    typesSub: 'Ces réglages concernent les alertes poussées sur ton écran. Tout reste consultable dans ta boîte, même désactivé ici.',
    invites: 'Invitation à une course',
    invitesSub: 'Quand un pilote t’ajoute à sa course.',
    results: 'Résultat de course',
    resultsSub: 'Quand un classement est validé et que ton Elo bouge.',
    friendRequests: 'Demandes d’amis',
    friendRequestsSub: 'Demande reçue ou acceptée.',
    quiet: 'Heures de silence',
    quietValue: 'Aucune notification entre 22 h et 8 h.',
    permissionDenied:
      'Les notifications sont bloquées dans ton navigateur. Réactive-les dans les réglages du site, puis reviens ici.',
    unsupported: 'Ton navigateur ne gère pas les notifications push.',
    iosInstall:
      'Sur iPhone : ajoute d’abord KartSquad à ton écran d’accueil (Partager → « Sur l’écran d’accueil »), puis rouvre l’app depuis l’icône pour activer les notifications.',
    error: 'Impossible d’activer les notifications. Réessaie.',
  },
  gallery: {
    title: 'Design System',
    subtitle: 'Les briques visuelles de KartSquad (lot 0.2).',
    open: 'Voir le design system',
    typography: 'Typographie',
    buttons: 'Boutons',
    card: 'Carte de course',
    avatars: 'Avatars',
    tags: 'Tags & filtres',
    grades: 'Médaillons de grade',
    gauge: 'Jauge de progression',
    banners: 'Bandeaux d’état',
  },
  // Fil d'actualité (A15, décisions PO 2026-07-30) : montées ET chutes des
  // amis annoncées, badges inclus, invités comptés jamais nommés.
  feed: {
    title: 'Ça bouge',
    seeAll: 'Tout voir',
    empty: 'Rien de neuf chez tes amis pour l’instant.',
    upcoming: '%a a prévu une course',
    resultWin: '🏆 %w gagne à %c',
    resultDone: 'Course terminée à %c',
    resultYou: 'Toi : %p · %d',
    pilots: '%n pilotes',
    pilotOne: '1 pilote',
    guests: '%n invités',
    guestOne: '1 invité',
    gradeUp: '%a passe %g',
    gradeDown: '%a retombe %g',
    meUp: 'Tu passes %g !',
    meDown: 'Retombé %g',
    meDownGoal: '%n points pour remonter',
    badge: '%a décroche « %b »',
    tabYou: 'Pour toi',
    tabFriends: 'Tes amis',
  },
  // Lien d'amitié (A19, demande PO 2026-07-30).
  invite: {
    shareTitle: 'Inviter un ami',
    shareHint: 'Envoie ce lien : la personne s’inscrit et vous êtes amis directement.',
    shareCta: 'Partager mon lien d’ami',
    title: 'Invitation',
    from: '%s t’invite à le rejoindre sur KartSquad.',
    accept: 'Devenir ami de %s',
    accepted: 'C’est fait, vous êtes amis 🤝',
    already: 'Vous étiez déjà amis.',
    seeProfile: 'Voir son profil',
    self: 'C’est ton propre lien d’invitation — partage-le à quelqu’un d’autre !',
    unknown: 'Cette invitation n’est plus valable.',
    loadError: 'Impossible de charger l’invitation. Vérifie ta connexion.',
    error: 'Impossible d’ajouter ce pilote pour le moment.',
    // Destination réelle depuis la fusion du 2026-08-01 : le classement.
    // « Voir mes amis » désignait un écran qui n'existe plus, et pouvait
    // ouvrir la portée Global — un bouton qui ment sur ce qu'il fait.
    toFriends: 'Voir le classement',
  },
  // ── Prise en main (retour de test réel 2026-08-01) ────────────────────────
  // « La plateforme pour un nouvel utilisateur n'est pas si simple. » Le geste
  // qui fait tout — créer, remplir la grille, saisir l'arrivée — n'est écrit
  // NULLE PART : chaque écran est clair pris isolément, mais rien ne dit dans
  // quel ordre les enchaîner. Trois lignes qui se cochent le disent, une fois.
  onboarding: {
    firstRaceTitle: 'Ta première course',
    firstRaceLead: 'Trois étapes, et tes premiers points Elo sont en jeu.',
    firstRaceProgress: '%n/3',
    // Nom accessible des lignes : « Créer une course » existe aussi en gros
    // bouton au bas de l'accueil. Deux commandes du même nom sur un même écran
    // ne se distinguent pas au lecteur d'écran — la ligne dit donc son rang.
    stepAria: 'Étape %n sur 3 · %t · %e',
    stepDone: 'fait',
    stepTodo: 'à faire',
    step1: 'Créer une course',
    step1Hint: 'Un circuit, une date. Trente secondes.',
    step2: 'Ajouter des pilotes',
    step2Hint: 'Tes amis en un tap ; les autres, au pseudo ou en invité.',
    // L'étape 3 couvre les DEUX gestes depuis C11 : valider la grille, puis
    // saisir l'arrivée. Elle disait « Saisir le classement » et envoyait sur
    // une course dont le bouton principal est « Valider la grille » — un geste
    // que la checklist n'avait jamais mentionné, au nez du nouveau venu
    // qu'elle est précisément là pour guider.
    step3: 'Valider la grille, puis le classement',
    step3Hint: 'On fige les partants, puis on met l’ordre d’arrivée — les points s’échangent tout seuls.',
    hide: 'Masquer cette aide',
    go: 'C’est parti',
    resume: 'Continuer',
  },
  notFound: {
    title: 'Page introuvable',
    body: 'Cette adresse ne mène à aucun stand. Le lien est peut-être périmé ou mal recopié.',
    home: 'Retour à l’accueil',
  },
} as const;
