# KartSquad 🏁

Le karting entre amis, avec un classement Elo à la façon des échecs.

Un admin crée une course réelle, invite ses amis, saisit le classement final —
et l'Elo de chacun évolue. Grades, badges, cartes à partager : le karting
amateur devient un jeu social.

> **Statut :** initialisation (lot 0.1). Squelette de l'app + chaîne
> qualité/CI en place. Le design system complet et le métier arrivent aux
> lots suivants.

## Stack

- **App** — Expo SDK 57 (React Native 0.86, React 19), expo-router, TypeScript.
  Une seule base pour **iOS · Android · Web**.
- **Backend** — Supabase (Postgres, Auth, RLS, Realtime, Storage).
- **Qualité** — TypeScript strict, ESLint (config Expo), Jest (unitaires),
  Playwright (e2e web).

## Démarrer

```bash
npm install
npm run web        # ouvre l'app dans le navigateur
npm run ios        # simulateur iOS (macOS)
npm run android    # émulateur Android
```

### Supabase en local

```bash
npx supabase start   # nécessite Docker + la CLI supabase
npx supabase db reset
```

## Scripts

| Commande             | Rôle                                   |
| -------------------- | -------------------------------------- |
| `npm run typecheck`  | Vérification TypeScript (`tsc --noEmit`) |
| `npm run lint`       | ESLint via `expo lint`                 |
| `npm test`           | Tests unitaires Jest                   |
| `npm run test:e2e`   | Tests end-to-end Playwright (web)      |

## Intégration continue

`.github/workflows/ci.yml` exécute, sur chaque pull request : typecheck →
lint → tests unitaires. Les e2e Playwright se lancent en local pour l'instant
et rejoindront la CI une fois le shell stabilisé.

## Organisation du repo

```
src/
  app/           écrans (expo-router, navigation par onglets)
  components/    composants partagés
  constants/     design tokens (thème « Rosso Corsa »)
  lib/           logique métier (ex. Elo → grade)
supabase/        config locale, migrations, seed
e2e/             tests Playwright
docs/            cahier des charges, roadmap, artefacts de design
```

## Documentation

- [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) — la source de
  vérité produit.
- [`docs/roadmap.md`](docs/roadmap.md) — la feuille de route par phases.
- [`AGENTS.md`](AGENTS.md) — l'architecture d'exécution (équipe d'agents).
