#!/usr/bin/env bash
# Applique le schéma + la RLS + le seed sur une base Postgres jetable, puis
# exécute les tests RLS. Utilisable en local et en CI.
#
# Config via variables PG* (PGHOST, PGPORT, PGUSER, PGPASSWORD). La base de
# test est recréée à chaque exécution.
#
# NB : 00_bootstrap.sql émule l'environnement Supabase (schéma auth, rôles)
# uniquement pour ce test local — il n'est PAS appliqué sur Supabase.
set -euo pipefail

DB="${TEST_DB:-kartsquad_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "→ (re)création de la base $DB"
"${PSQL[@]}" -d postgres -c "drop database if exists ${DB} with (force);" -c "create database ${DB};"

export PGDATABASE="$DB"

echo "→ bootstrap (émulation Supabase, local uniquement)"
"${PSQL[@]}" -f supabase/tests/00_bootstrap.sql

for m in supabase/migrations/*.sql; do
  echo "→ migration $(basename "$m")"
  "${PSQL[@]}" -f "$m"
done

echo "→ seed"
"${PSQL[@]}" -f supabase/seed.sql

echo "→ tests RLS"
"${PSQL[@]}" -f supabase/tests/10_rls_test.sql

echo "✔ schéma + RLS + seed : OK"
