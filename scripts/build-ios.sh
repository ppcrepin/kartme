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

if [ ! -f package.json ] || [ ! -f eas.json ]; then
  rouge "Lance ce script depuis la RACINE du dépôt kartme (là où se trouve package.json)."
  exit 1
fi

if [ ! -d node_modules ]; then
  bleu "Installation des dépendances (quelques minutes la première fois)"
  npm install
fi
vert "Dépendances en place"

# `npx eas-cli@latest` plutôt qu'une installation globale : pas de droits
# administrateur à demander, et on est certain d'avoir une version qui connaît
# le champ `environment` d'eas.json (postérieur à eas-cli 12).
EAS="npx --yes eas-cli@latest"

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
  read -r -p "  URL du projet (https://xxxx.supabase.co) : " url
  read -r -p "  Clé anon (eyJ...) : " anon
  if [ -z "$url" ] || [ -z "$anon" ]; then
    rouge "Valeurs vides — j'arrête plutôt que de produire une application inerte."
    exit 1
  fi
  for env in preview production; do
    $EAS env:create --environment "$env" --name EXPO_PUBLIC_SUPABASE_URL \
      --value "$url" --visibility plain --non-interactive --force
    $EAS env:create --environment "$env" --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
      --value "$anon" --visibility plain --non-interactive --force
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
read -r -p "  On y va ? [o/N] " reponse
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
