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

## Caractéristiques des pistes (longueurs, homologations, types)

Les **caractéristiques techniques et pratiques** des circuits — longueur et
largeur de piste, intérieur/extérieur, motorisation, usage loisir/compétition,
homologation FFSA ou CIK-FIA, adresse postale — proviennent d'un **relevé
consolidé** fourni par le PO le 2026-07-30 (généré le 2026-07-21).

**Provenance, précisée par le PO le 2026-07-30 :** c'est une **compilation
personnelle**, faite à partir de recherches sur le web public — sites
officiels des circuits, rubrique « Où pratiquer » de la FFSA, annuaires de
karting. Ce n'est donc pas la reprise d'une base tierce, mais un assemblage de
faits publics (nom commercial, longueur de piste, homologation, téléphone,
adresse) rassemblés source par source.

Ce point compte juridiquement, et il vaut d'être écrit : un **fait** — « cette
piste mesure 1 200 m » — n'est protégé par aucun droit d'auteur, et c'est la
*structure* ou l'*investissement* d'une base qui peut l'être. Une compilation
faite à la main depuis plusieurs sources n'extrait donc pas la substance d'un
annuaire donné. Le relevé compte 310 pistes sur 270 lieux (13 régions
métropolitaines) et suit la convention « cellule vide = non confirmé, jamais
inventé ».

Il n'a **aucune coordonnée** : la géographie de KartSquad reste celle
d'OpenStreetMap (voir ci-dessus), et les lieux nouveaux ont été géocodés via
**Nominatim** depuis leur adresse ou leur code postal.

Les deux jeux sont donc complémentaires : OpenStreetMap donne le *où*, ce
relevé donne le *quoi*. L'attribution ODbL reste due pour l'ensemble des
coordonnées et de l'import d'origine.

**Portée de la clause ODbL de partage à l'identique.** Les colonnes du relevé
vivent dans la même table que les coordonnées ODbL. Tant que l'application se
contente d'**afficher** ces données, la clause ne se déclenche pas : elle porte
sur la *distribution* d'une base dérivée, pas sur son usage interne. Elle
deviendrait exigible le jour où KartSquad publierait le référentiel autrement
qu'à l'écran — une API publique, un export, un jeu de données téléchargeable.
Ce jour-là, la base dérivée devrait être offerte sous ODbL. À rouvrir avant
toute ouverture de ce genre, et non avant.
