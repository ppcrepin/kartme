# Base de données — Supabase

Le schéma, la sécurité (RLS) et les données de départ de KartSquad.

## Contenu

```
supabase/
  config.toml                 configuration locale Supabase
  migrations/                 le schéma, versionné (appliqué dans l'ordre)
    …_core_schema.sql         tables cœur (profiles, ghosts, circuits, races, …)
    …_rls_policies.sql        règles de sécurité (anti-triche)
  seed.sql                    circuits de karting français (données de départ)
  tests/
    00_bootstrap.sql          émulation Supabase pour les tests LOCAUX seulement
    10_rls_test.sql           tests de sécurité (autorisé / refusé)
    run.sh                    applique tout sur une base jetable + lance les tests
```

## Tester en local

Nécessite un client `psql` et un serveur Postgres accessible (variables `PG*`).

```bash
npm run db:test
```

Le script recrée une base jetable, applique le bootstrap (émulation Supabase),
les migrations, le seed, puis exécute les tests RLS. La même commande tourne en
CI (`.github/workflows/ci.yml`, job « Schéma · RLS »).

> `00_bootstrap.sql` recrée localement ce que Supabase fournit déjà en vrai
> (schéma `auth`, rôles `anon`/`authenticated`, `auth.uid()`). Il ne fait pas
> partie des migrations et n'est **jamais** appliqué sur Supabase.

## Déployer sur Supabase (quand le projet cloud existe)

1. Créer un projet sur [supabase.com](https://supabase.com) (offre gratuite).
2. Installer la CLI : `npm i -g supabase` puis `supabase login`.
3. Lier le repo au projet : `supabase link --project-ref <ref-du-projet>`.
4. Pousser le schéma : `supabase db push` (applique `migrations/`).
5. Charger le seed : `supabase db reset` en local, ou exécuter `seed.sql` sur le
   projet distant.

Les clés du projet (URL + clé anon) iront dans les variables d'environnement de
l'app à ce moment-là — jamais commitées dans le repo.
