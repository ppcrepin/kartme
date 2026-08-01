# BADGES.md — Catalogue des badges KartSquad

Fichier vivant qui recense **tous** les badges. Trois statuts :
- `MVP` — retenu pour le lancement
- `à choisir` — proposé, en attente de validation
- `réserve` — idée en banque, à activer plus tard

Les jeux de mots viennent de l'univers karting/course (voir aussi `PUNS.md`). Chaque badge = un **nom** (jeu de mots), une **condition de déblocage**, et plus tard une **icône** (traits fins, style Rosso Corsa).

> Pour en ajouter : recopier une ligne dans la bonne section, mettre le statut à `réserve` (ou `MVP`), et compléter au fil de l'eau.

---

> ✅ **Revu avec le PO le 2026-07-13** : liste portée à **12 badges** (renommages,
> seuils actés, 2 ajouts positifs). Les badges de performance exigent une
> **« course qui compte »** (≥ 2 comptes inscrits) — cohérent avec l'anti-triche
> « Elo entre inscrits seulement » (voir `docs/integrite-elo.md`).
>
> ✂️ **Revu à nouveau le 2026-08-01, après un test utilisateur** : les **trois
> badges négatifs sont RETIRÉS** — n° 5 Kart-astrophe, n° 6 Voiture balai,
> n° 7 Tête-à-queue. Ils décrivaient tous une mauvaise soirée, et l'application
> les rangeait dans la même vitrine que les trophées à décrocher : une vitrine
> où l'on collectionne ses défaites n'invite personne à revenir. Le moteur et
> l'historique ont été purgés (migration `20260801120000`). La numérotation
> d'origine est conservée ci-dessous pour que les archives restent lisibles.

## ✅ Retenus pour le MVP (11)

| # | Badge | Jeu de mots | Condition |
|---|---|---|---|
| 1 | Kart d'identité | "carte d'identité" | 1ère course jouée |
| 2 | Habitué des stands | bidon des stands | 10 courses jouées |
| 3 | Champagne ! | podium F1 | 1ère victoire |
| 4 | Sur les chapeaux de roues | expression | 3 victoires d'affilée |
| 8 | Midi moins le kart | "midi moins le quart" | Participer à une course **le matin** (avant midi) |
| 9 | Chef d'écurie | rôle F1 | Organiser 10 courses qui comptent |
| 10 | DRS | aileron F1 (dépassement) | Battre un pilote **inscrit** 300+ Elo au-dessus de soi |
| 11 | Safety car | voiture de sécurité | Finir devant tous les pilotes inscrits mieux classés que soi |
| 12 | Push | « push ! » à la radio | Gagner **au moins 45** points d'Elo en une course |
| 13 | Sous tension | électricité / pression | Courir sur un circuit **électrique** (`motor_kind = 'electrique'`, jamais « mixte ») |
| 14 | Haute tension | le palier d'après | **5** courses sur circuit électrique |

Les deux derniers sont arrivés le 2026-08-01 (C13) pour promouvoir le karting
électrique. Ils ne comptent que des courses **classées** : sans cela, un pilote
seul fabriquait cinq courses dans la soirée et repartait avec les deux.

---

## Réserve (idées en banque, à activer au fil de l'eau)

### Débuts
| Badge | Jeu de mots | Condition |
|---|---|---|
| Bizuth du bitume | bizut / allitération | Compte créé + profil complété |
| Roue, c'est parti ! | "roule, c'est parti" | 1ère course (variante) |

### Assiduité / volume
| Badge | Jeu de mots | Condition |
|---|---|---|
| Kart-omane | "accro / -mane" | 50 courses jouées |
| Centurion du bitume | 100 = centurion | 100 courses jouées |
| Pilier du paddock | — | 50 courses (variante) |

### Victoires / podiums
| Badge | Jeu de mots | Condition |
|---|---|---|
| Kart blanche | "carte blanche" | Gagner toutes ses courses d'une journée (≥3) |
| Photo finish | victoire à l'arrachée | Gagner une course très serrée |
| Triple champagne | — | 3 podiums d'affilée |
| Abonné au podium | — | 10 podiums au total |

### Progression Elo
| Badge | Jeu de mots | Condition |
|---|---|---|
| Remontada | remontée épique | Plus grosse remontée d'Elo en une course |
| Effet turbo | — | +100 Elo sur 5 courses |
| Changement de vitesse | double sens | Franchir un palier de grade |

### Contre-performances
| Badge | Jeu de mots | Condition |
|---|---|---|
| Fond de grille | expression course | Finir dernier 3 fois |
| Sortie de piste | expression course | Finir dernier (variante) |

### Exploits / rivalité
| Badge | Jeu de mots | Condition |
|---|---|---|
| Némésis | rival juré | Battre le même rival 5 fois |
| L'outsider | — | Gagner en étant le moins bien classé au départ |
| Tombeur de géant | — | Variante de David contre Goliath |

### Social / viralité / organisation
| Badge | Jeu de mots | Condition |
|---|---|---|
| Premier coéquipier | — | 1er ami ajouté |
| Effet boule de neige | viralité | Une invitation fait s'inscrire un nouveau joueur |
| Recruteur en chef | — | Inviter 20 pilotes au total |

### Fun / horaires / spécial
| Badge | Jeu de mots | Condition |
|---|---|---|
| Pilote du dimanche | expression | Jouer une course un dimanche |
| Le retour du fantôme | profil fantôme réclamé | Réclamer son profil fantôme |
