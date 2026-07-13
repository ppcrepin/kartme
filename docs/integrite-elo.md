# Intégrité de l'Elo — failles connues & parades

> Sujet ouvert soulevé par le PO le 2026-07-13. Décisions à acter avant la beta
> (l'intégrité de l'Elo est le cœur du produit). Ce fichier sert de mémoire.

## Faille 1 — « Elo farming » via profils fantômes *(la plus grave)*

Le calcul Elo est à **somme nulle** : dans une course, les points gagnés par
les uns sont exactement les points perdus par les autres. Rien n'est créé.

Mais un tricheur peut créer autant de **profils fantômes** (joueurs non
inscrits) qu'il veut, les faire partir à 1000, se déclarer 1ᵉʳ, et **encaisser
les points que ces fantômes « perdent »**. Comme il fabrique lui-même ses
adversaires, il se fabrique de l'Elo.

Chiffrage avec le barème actuel (K=64, diviseur 800) :
- À 1000 contre des fantômes à 1000 : **+32 par course** (normalisé, quel que
  soit le nombre de fantômes).
- Le gain décroît à mesure qu'il monte (battre plus faible rapporte moins) :
  ~+15 à 1400, ~+6 à 1800, mais **reste positif jusqu'au sommet**.
- À 10 courses/jour, c'est ~+300/jour au début → sortie express de Rookie, et
  montée (lente) possible jusqu'à Légende.

**Conclusion : exploitable, y compris jusqu'aux hauts grades.**

## Faille 2 — Admin qui ment sur le classement

Même avec de vrais joueurs, l'admin saisit seul le classement (pas de
validation). Il peut inverser l'ordre à son avantage. *(Distinct de la faille
1 ; déjà partiellement prévu : signalement non-bloquant, fenêtre 24h.)*

## Faille 3 — « Smurf boosting » (2 comptes réels)

Deux vrais comptes en collusion : l'un gagne toujours contre l'autre. Mais
c'est à **somme nulle entre eux** → aucun Elo créé, l'un monte, l'autre coule.
Sacrifier un compte pour gonfler l'autre reste possible, mais coûteux
(2ᵉ e-mail vérifié) et **détectable** (un compte qui perd toujours contre le
même).

## Parades envisagées

| # | Parade | Bloque | Coût / impact |
|---|--------|--------|---------------|
| A | **L'Elo ne s'échange qu'entre comptes inscrits** (les fantômes participent, s'affichent, mais ne donnent/reçoivent **aucun** point) | Faille 1 **entièrement** | Les fantômes n'ont plus d'Elo évolutif → revoir leur place au classement Global (lot 2.2). Une course à 1 seul inscrit ne fait bouger aucun Elo → **incite à inscrire ses amis (viral)**. |
| B | **Une course ne compte que si ≥ 2 comptes inscrits** | Faille 1 en solo | Plus simple, mais un 2ᵉ compte-complice + fantômes contourne (revient à la faille 3). |
| C | **Confirmation du classement par les participants** | Faille 2 | Nécessite que ≥1 autre inscrit valide. Prévu v2+ au cahier. |
| D | **Détection / modération** (ratio fantômes élevé, mêmes fantômes récurrents, compte perdant systématique) | Failles 1 & 3 (a posteriori) | Boîte de modération déjà prévue (lot 3.1). |

## Recommandation

- **Socle : parade A** (Elo entre inscrits seulement). Elle neutralise la
  faille 1 à la racine et transforme tout abus restant en simple transfert
  entre vrais comptes (somme nulle, non créateur d'Elo, détectable).
- **Puis** parade C (confirmation) avant/juste après la beta, contre la faille 2.
- **En continu** parade D côté modération.

## Statut

⏳ **À trancher avec le PO.** Impact technique de A : modifier
`submit_race_results` (ne sommer que les duels inscrit↔inscrit) + décider de
l'affichage de l'Elo des fantômes (figé / masqué / « invité ») + ajuster le
classement Global.
