# Crédits et licences des données

## Référentiel des circuits de karting

Le référentiel des kartings français de KartSquad est dérivé
d'**OpenStreetMap**, sous licence **ODbL 1.0**
(<https://opendatacommons.org/licenses/odbl/1-0/>).

- **Source** : OpenStreetMap, objets `sport=karting` situés en France,
  interrogés via l'API Overpass en **juillet 2026**.
- **Ville** : obtenue par géocodage inverse via **Nominatim** (également
  OpenStreetMap), là où l'objet ne portait pas de `addr:city`.
- **Traitement appliqué** : regroupement géographique des tracés d'un même
  complexe (un karting est cartographié en plusieurs objets — piste, voie des
  stands, stand), filtrage des activités qui ne sont pas du karting
  chronométrable (quad, kart-cross, buggy, karts à pédales), correction de
  quelques noms manifestement erronés.

### Ce que la licence impose

L'ODbL est une licence **share-alike**. Concrètement, pour KartSquad :

1. **Citer la source.** La mention « Circuits © contributeurs OpenStreetMap »
   doit rester visible pour l'utilisateur — aujourd'hui dans l'écran Aide &
   légal. Une mention enterrée dans un fichier du dépôt ne suffit pas.
2. **Partager les corrections.** Si nous corrigeons ou enrichissons ce
   référentiel (un karting fermé, un nom faux, une piste manquante), la base
   dérivée doit rester disponible sous ODbL. Le plus simple, et le plus utile :
   **remonter la correction directement dans OpenStreetMap** plutôt que de la
   garder pour nous.
3. **L'ODbL porte sur la base, pas sur son contenu produit.** Les classements,
   les Elo et les temps au tour de KartSquad ne deviennent pas ODbL du fait que
   les circuits en proviennent.

### Ce qui reste à faire

- [x] Afficher la mention OpenStreetMap dans l'écran **Aide & légal** — fait
      le 2026-07-29, en même temps que l'import (la relecture a rappelé qu'une
      donnée livrée sans sa mention est une non-conformité, pas une dette).
- [ ] Décider d'un canal pour remonter les corrections en amont quand un
      pilote signale un karting fermé ou mal nommé.

## Police de caractères

**Fraunces**, sous licence **SIL Open Font License 1.1** — libre d'usage, y
compris commercial, sans obligation d'attribution visible.
