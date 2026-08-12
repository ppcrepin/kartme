#!/usr/bin/env bash
#
# Premier build iOS de KartSquad, de bout en bout.
#
# POURQUOI CE SCRIPT existe plutôt qu'une liste de commandes dans un message :
# le PO discute depuis son iPhone et compile sur un ordinateur. Recopier à la
# main des lignes qui manipulent des clés d'API d'un écran à l'autre, c'est la
# faute de frappe assurée — et une faute de frappe sur une clé Supabase produit
# une application qui se lance et n'affiche rien, sans le moindre message.
#
# Il ne fait RIEN de secret et RIEN d'irréversible sans le dire. Chaque étape
# annonce ce qu'elle va faire.
#
#   bash scripts/build-ios.sh
#
set -euo pipefail

bleu()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }
vert()  { printf '\033[0;32m  ✔ %s\033[0m\n' "$1"; }
jaune() { printf '\033[0;33m  ! %s\033[0m\n' "$1"; }
rouge() { printf '\033[0;31m  ✖ %s\033[0m\n' "$1"; }

# ── 0. Le terrain ───────────────────────────────────────────────────────────
bleu "Vérification de l'environnement"

if ! command -v node >/dev/null 2>&1; then
  rouge "Node.js n'est pas installé. Installe-le depuis https://nodejs.org (version 20 ou plus)."
  exit 1
fi
vert "Node $(node --version)"

# ── Le proxy qui réécrit les certificats ────────────────────────────────────
#
# Sur un poste d'entreprise, le pare-feu déchiffre le HTTPS et le re-signe avec
# son propre certificat racine. Windows lui fait confiance — d'où un navigateur
# et un Git qui fonctionnent — mais Node embarque SA liste d'autorités et ignore
# celle du système : il refuse tout, avec un
# `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` qui ne dit rien à personne.
#
# Vécu : deux tentatives de trente minutes avant de comprendre, parce que npm
# réessaie longtemps avant d'avouer. `--use-system-ca` (Node 22.15+) lui fait
# lire le magasin de Windows.
#
# On teste l'option au lieu de comparer des numéros de version : un Node trop
# ancien refuse de DÉMARRER avec une option inconnue, ce qui casserait tout.
if [ -z "${NODE_OPTIONS:-}" ] || ! printf '%s' "${NODE_OPTIONS:-}" | grep -q -- '--use-system-ca'; then
  if node --use-system-ca -e '' >/dev/null 2>&1; then
    export NODE_OPTIONS="${NODE_OPTIONS:-} --use-system-ca"
    vert "Certificats du système activés (proxy d'entreprise géré)"
  else
    jaune "Ce Node ne connaît pas --use-system-ca (il faut la 22.15 ou plus)."
    jaune "Si tu vois UNABLE_TO_GET_ISSUER_CERT_LOCALLY, c'est de là que ça vient :"
    jaune "mets Node à jour, ou passe par le partage de connexion de ton téléphone."
  fi
fi

if [ ! -f package.json ] || [ ! -f eas.json ]; then
  rouge "Lance ce script depuis la RACINE du dépôt kartme (là où se trouve package.json)."
  exit 1
fi

if [ ! -d node_modules ]; then
  bleu "Installation des dépendances (quelques minutes la première fois)"
  npm install
fi
vert "Dépendances en place"

# Les modules Expo natifs sont livrés PRÉ-COMPILÉS. Deux versions du même SDK
# qui ne se correspondent pas produisent un binaire qui se construit sans une
# erreur, passe la validation d'Apple, s'installe — et meurt à la seconde où on
# le touche, sur un « Symbol not found » que seul le rapport de plantage de
# l'iPhone révèle.
#
# Vécu, build 1 : expo-modules-core 57.0.3 face à expo-location 57.0.7. La
# signature interne `_decorateModule(object:in:)` avait changé entre les deux.
# Les plages `~57.0.x` de package.json autorisaient parfaitement cette paire.
#
# Cette vérification ne coûte rien et aurait épargné un build entier. Elle
# n'interrompt PAS : sans réseau vers api.expo.dev elle échoue, et ce n'est pas
# une raison de bloquer un build.
bleu "Cohérence des versions Expo"
if npx --yes expo install --check >/dev/null 2>&1; then
  vert "Versions alignées sur le SDK"
else
  jaune "Versions non alignées, ou vérification impossible (réseau)."
  jaune "En cas de plantage AU LANCEMENT sur l'iPhone, commence par ici :"
  jaune "  npx expo install --fix"
fi

# `npx eas-cli@latest` plutôt qu'une installation globale : pas de droits
# administrateur à demander, et on est certain d'avoir une version qui connaît
# le champ `environment` d'eas.json (postérieur à eas-cli 12).
EAS="npx --yes eas-cli@latest"

# Le PREMIER appel télécharge eas-cli, et c'est un gros paquet : plusieurs
# minutes sur une connexion d'entreprise. On le fait ici, À VOIX HAUTE, plutôt
# qu'au premier `whoami` dont la sortie est masquée — sinon le script paraît
# figé pendant tout le téléchargement, sans un mot. Vécu.
bleu "Outil EAS (premier lancement : téléchargement de quelques minutes)"
$EAS --version
vert "EAS prêt"

# ── 1. Le compte Expo ───────────────────────────────────────────────────────
bleu "Compte Expo"
if $EAS whoami >/dev/null 2>&1; then
  vert "Déjà connecté : $($EAS whoami 2>/dev/null)"
else
  jaune "Connexion nécessaire. Le compte Expo est GRATUIT et n'a rien à voir"
  jaune "avec ton compte Apple — crée-le sur expo.dev si tu n'en as pas."
  $EAS login
fi

# ── 2. Le projet EAS ────────────────────────────────────────────────────────
bleu "Projet EAS"
if node -e "process.exit(require('./app.json').expo?.extra?.eas?.projectId ? 0 : 1)" 2>/dev/null; then
  vert "Projet déjà relié"
else
  jaune "Premier passage : création du projet. Cela ÉCRIT un identifiant dans"
  jaune "app.json — pense à committer et pousser le fichier ensuite, sinon la"
  jaune "session Claude et ton ordinateur divergeront."
  $EAS init
fi

# ── 3. Les clés Supabase ────────────────────────────────────────────────────
#
# LE piège de ce build. Le site web tire ces deux valeurs des secrets GitHub,
# mécanisme auquel un build natif n'a aucun accès. Sans elles, `lib/supabase`
# retombe sur un `placeholder.supabase.co` codé en dur : l'application se lance,
# n'affiche aucune erreur, et RIEN ne fonctionne — pas même la connexion, donc
# refus immédiat à la revue Apple.
bleu "Clés Supabase (environnement « preview »)"

manque=0
for cle in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY; do
  if $EAS env:list --environment preview 2>/dev/null | grep -q "$cle"; then
    vert "$cle : présente"
  else
    jaune "$cle : ABSENTE"
    manque=1
  fi
done

if [ "$manque" = "1" ]; then
  echo
  jaune "Ces valeurs se trouvent dans Supabase → ton projet → Project Settings"
  jaune "→ API. Ce ne sont PAS des secrets : la clé « anon » est déjà publique"
  jaune "dans le site web. Elle ne donne accès qu'à ce que les règles de"
  jaune "sécurité de la base autorisent."
  echo
  # `</dev/tty` et `|| true` : voir la note sur la confirmation plus bas. Les
  # commandes EAS qui précèdent peuvent avoir vidé l'entrée standard, et sans
  # ces deux gardes le script MEURT ici sans afficher quoi que ce soit.
  read -r -p "  URL du projet (https://xxxx.supabase.co) : " url </dev/tty || url=""
  read -r -p "  Clé anon (eyJ...) : " anon </dev/tty || anon=""
  if [ -z "$url" ] || [ -z "$anon" ]; then
    rouge "Valeurs vides — j'arrête plutôt que de produire une application inerte."
    exit 1
  fi
  # `env:set`, PAS `env:create` : cette dernière est purement et simplement
  # abandonnée par les eas-cli récents (« This command is deprecated. Use eas
  # env:set instead. ») et refuse même de s'exécuter. Deux pièges de suite ont
  # bloqué le PO en plein milieu de la saisie de ses clés :
  #   1. `env:create` n'existe plus du tout ;
  #   2. L'ENVIRONNEMENT (`preview`/`production`) est un argument POSITIONNEL
  #      de `env:set`, pas une valeur de `--environment` — `--environment` sur
  #      cette commande sert à autre chose (project|account) et la confusion
  #      produit « Unexpected arguments ».
  # Vérifié contre `eas env:set --help` en direct, pas deviné.
  for env in preview production; do
    $EAS env:set "$env" --name EXPO_PUBLIC_SUPABASE_URL \
      --value "$url" --visibility plaintext --non-interactive
    $EAS env:set "$env" --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
      --value "$anon" --visibility plaintext --non-interactive
  done
  vert "Clés enregistrées pour preview et production"
fi

# ── 4. Le build ─────────────────────────────────────────────────────────────
bleu "Build iOS"
cat <<'TXT'
  Ce qui va se passer :
    · Apple va te demander de te connecter (identifiants saisis par TOI, ici,
      jamais partagés ailleurs) ;
    · EAS génère tout seul le certificat de distribution et le profil de
      provisionnement — rien à faire dans le portail Apple ;
    · la compilation part sur les serveurs d'Expo : 15 à 30 minutes d'attente
      sur le palier gratuit. Tu peux fermer le terminal, le build continue.

  ⚠ Le premier build est le juge de deux choses que personne n'a pu vérifier
    jusqu'ici : que react-native-maps compile face à React Native 0.86, et que
    les épingles de la carte s'affichent réellement.

TXT
# `</dev/tty` : les commandes EAS qui précèdent consomment l'entrée standard,
# si bien que `read` recevait une FIN DE FLUX au lieu d'attendre une touche.
# `read` renvoie alors 1, et `set -e` tuait le script SANS UN MOT, juste après
# avoir affiché la question — le PO a vu la question, tapé « o », et sa réponse
# est tombée dans le terminal (« bash: o: command not found »). Lire le
# terminal directement, et ne jamais laisser un `read` faire mourir le script.
reponse=""
read -r -p "  On y va ? [o/N] " reponse </dev/tty || reponse=""
case "$reponse" in
  [oO]*) ;;
  *) jaune "Interrompu. Relance quand tu veux, les étapes déjà faites seront sautées."; exit 0 ;;
esac

$EAS build --platform ios --profile preview

# ── 5. La suite ─────────────────────────────────────────────────────────────
bleu "Build terminé"
cat <<'TXT'
  Pour l'envoyer sur TestFlight et l'installer sur ton iPhone :

      npx --yes eas-cli@latest submit --platform ios --profile preview

  Il proposera de créer la fiche App Store Connect si elle n'existe pas.
  Compte ensuite 10 à 30 minutes de traitement chez Apple avant que la build
  apparaisse dans TestFlight.
TXT
