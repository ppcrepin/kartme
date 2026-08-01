#!/usr/bin/env python3
"""
Génère les icônes de KartSquad — damier rouge sur carbone (lot C6).

Décision PO du 2026-08-01 : « un vrai damier, sur deux rangs », « damier rouge
sur fond carbone ». Le filet d'origine n'avait qu'un rang, ce qui lui donnait
l'air d'une ligne de pointillés — « un petit peu trop un logo fin sur ligne
droite qui fait penser à des petits pointillés sur lesquels on doit cliquer ».

Pourquoi un script plutôt que des fichiers binaires posés là : les six images
doivent rester COHÉRENTES entre elles (même angle, même damier, mêmes teintes)
et se régénérer si le motif bouge. Un PNG committé sans sa source est un cul-de-
sac — c'est déjà ce qui rendait l'icône Expo par défaut impossible à retoucher.

Aucune dépendance : ni Pillow ni sharp ne sont installés dans cet environnement.
Le PNG est encodé à la main (zlib fait partie de la bibliothèque standard).

    python3 scripts/logo.py
"""
from __future__ import annotations

import math
import struct
import zlib

# Les teintes du thème (src/constants/theme.ts). Recopiées et non importées :
# ce script tourne hors du bundle, et une icône ne se régénère pas assez souvent
# pour justifier un partage de source entre Python et TypeScript.
CARBONE = (0x0A, 0x07, 0x06)
ROUGE = (0xE1, 0x06, 0x00)
BLANC = (0xFF, 0xFF, 0xFF)

# L'inclinaison du damier. Un drapeau tenu à bout de bras n'est jamais droit, et
# une bande parfaitement horizontale se confond avec une barre de séparation.
ANGLE = math.radians(-12)

# Deux rangs, c'est la décision. La hauteur de la bande en découle.
RANGS = 2


def png(chemin: str, largeur: int, hauteur: int, pixels: bytes) -> None:
    """Écrit un PNG RGBA 8 bits. `pixels` fait largeur × hauteur × 4 octets."""
    lignes = bytearray()
    pas = largeur * 4
    for y in range(hauteur):
        lignes.append(0)  # filtre « None » : la compression suffit à cette taille
        lignes += pixels[y * pas : (y + 1) * pas]

    def bloc(nom: bytes, corps: bytes) -> bytes:
        return (
            struct.pack(">I", len(corps))
            + nom
            + corps
            + struct.pack(">I", zlib.crc32(nom + corps) & 0xFFFFFFFF)
        )

    entete = struct.pack(">IIBBBBB", largeur, hauteur, 8, 6, 0, 0, 0)
    with open(chemin, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(bloc(b"IHDR", entete))
        f.write(bloc(b"IDAT", zlib.compress(bytes(lignes), 9)))
        f.write(bloc(b"IEND", b""))


def dessiner(
    taille: int,
    *,
    colonnes: float,
    fond: tuple[int, int, int] | None,
    plein: tuple[int, int, int],
    creux: tuple[int, int, int] | None,
    part_bande: float = 0.34,
    suréchantillon: int = 4,
) -> bytes:
    """
    Le damier, incliné, centré.

    `colonnes` fixe la taille d'une case : c'est le seul réglage qui change la
    densité du motif. `creux` à None laisse la case creuse TRANSPARENTE — c'est
    ce qu'il faut pour un premier plan Android, qui se pose sur son propre fond.

    Le suréchantillonnage n'est pas un luxe : sans lui, une diagonale à 12° sur
    48 px de favicon donne un escalier, et le damier se lit comme du bruit.
    """
    n = taille * suréchantillon
    carreau = n / colonnes
    demi_bande = (RANGS * carreau) / 2
    cx = cy = n / 2
    cos_a, sin_a = math.cos(-ANGLE), math.sin(-ANGLE)

    # Accumulateur en sous-pixels, moyenné à la fin.
    acc = [[0, 0, 0, 0] for _ in range(taille * taille)]

    for y in range(n):
        dy = y - cy
        for x in range(n):
            dx = x - cx
            # Repère de la bande : rotation inverse autour du centre.
            u = dx * cos_a - dy * sin_a
            v = dx * sin_a + dy * cos_a
            if abs(v) <= demi_bande:
                col = math.floor(u / carreau)
                rang = 0 if v < 0 else 1
                # Le décalage d'un rang à l'autre : c'est LUI qui fait un damier
                # plutôt que deux lignes de tirets superposées.
                case = plein if (col + rang) % 2 == 0 else creux
            else:
                case = fond
            i = (y // suréchantillon) * taille + (x // suréchantillon)
            if case is None:
                acc[i][3] += 0  # transparent : on n'ajoute rien
            else:
                acc[i][0] += case[0]
                acc[i][1] += case[1]
                acc[i][2] += case[2]
                acc[i][3] += 255

    m = suréchantillon * suréchantillon
    sortie = bytearray(taille * taille * 4)
    for i, (r, g, b, a) in enumerate(acc):
        alpha = a // m
        if alpha == 0:
            continue
        # Les composantes sont accumulées sur les sous-pixels OPAQUES seulement :
        # on divise par leur nombre, pas par le total, sinon les bords tirent
        # vers le noir au lieu de devenir translucides.
        opaques = max(1, a // 255)
        sortie[i * 4 + 0] = min(255, r // opaques)
        sortie[i * 4 + 1] = min(255, g // opaques)
        sortie[i * 4 + 2] = min(255, b // opaques)
        sortie[i * 4 + 3] = alpha
    return bytes(sortie)


def uni(taille: int, couleur: tuple[int, int, int]) -> bytes:
    r, g, b = couleur
    return bytes([r, g, b, 255]) * (taille * taille)


def main() -> None:
    base = "assets/images"

    # ── Icône d'application (1024) ────────────────────────────────────────
    # 5 colonnes, et pas sept : comparés côte à côte, sept carreaux donnent une
    # texture, cinq donnent un DRAPEAU. À 40 px dans une liste d'applications,
    # c'est la seule version qui se reconnaît encore.
    png(f"{base}/icon.png", 1024, 1024,
        dessiner(1024, colonnes=5, fond=CARBONE, plein=ROUGE, creux=CARBONE))

    # ── Favicon (48) ──────────────────────────────────────────────────────
    # MOINS de colonnes encore : à 48 px, cinq cases font 9 px chacune et
    # l'inclinaison les mange. Quatre tiennent dans un onglet de navigateur.
    png(f"{base}/favicon.png", 48, 48,
        dessiner(48, colonnes=4, fond=CARBONE, plein=ROUGE, creux=CARBONE,
                 suréchantillon=8))

    # ── Écran de démarrage ────────────────────────────────────────────────
    # Fond TRANSPARENT : `expo-splash-screen` peint déjà le carbone derrière
    # (backgroundColor dans app.json). Un fond opaque y ferait un carré visible.
    png(f"{base}/splash-icon.png", 512, 512,
        dessiner(512, colonnes=5, fond=None, plein=ROUGE, creux=None))

    # ── Android : premier plan, fond, monochrome ──────────────────────────
    # Le premier plan est ROGNÉ par le masque du système (cercle, écusson…) :
    # seuls les deux tiers centraux sont garantis visibles. Une bande plus fine
    # et plus dense y tient sans se faire couper.
    png(f"{base}/android-icon-foreground.png", 512, 512,
        dessiner(512, colonnes=6, fond=None, plein=ROUGE, creux=None))
    png(f"{base}/android-icon-background.png", 512, 512, uni(512, CARBONE))
    # Monochrome (thème dynamique) : le système recolorie, seule la FORME
    # compte. Elle doit donc être pleine, pas rouge.
    png(f"{base}/android-icon-monochrome.png", 432, 432,
        dessiner(432, colonnes=6, fond=None, plein=BLANC, creux=None))

    print("Icônes régénérées.")


if __name__ == "__main__":
    main()
