import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { track } from '@/lib/analytics';
import { fichierMarque } from '@/lib/marque';
import { ecrireDelta, hauteurPodium, imagePodium, LARGEUR, type DonneesPodium } from '@/lib/podium-image';

/**
 * Partager le podium en IMAGE (lot C4, décision PO : « le podium, avec les
 * points échangés »).
 *
 * L'aperçu est affiché, et ce n'est pas de la décoration : on partage cette
 * image à des gens, et personne n'envoie à l'aveugle quelque chose qui porte
 * son propre résultat.
 *
 * WEB SEULEMENT, et c'est assumé (arbitrage PO 2026-08-01). L'image est
 * dessinée sur un `canvas`, qui n'existe pas dans le rendu natif : sur une
 * application iOS/Android, `imagePodium` renvoie `null`, la carte ne s'affiche
 * pas, et le partage par LIEN — qui vit dans `ShareCard`, juste en dessous —
 * reste seul. La bêta tourne dans le navigateur ; le jour où une application
 * native sortira, il faudra `react-native-view-shot` + `expo-sharing`, et donc
 * un SECOND chemin de rendu à maintenir. Mieux vaut ne rien promettre ici que
 * de garder un repli qui n'en est pas un.
 *
 * Deux chemins de sortie sur le web, du meilleur au moindre :
 *   1. partage natif du navigateur AVEC le fichier (mobile) — l'image arrive
 *      dans la conversation ;
 *   2. téléchargement (ordinateur) — on la joint soi-même.
 */
export function PartagePodium({ donnees }: { donnees: DonneesPodium }) {
  const [image, setImage] = useState<string | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'impossible'>('chargement');
  const [fait, setFait] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivant = true;
    imagePodium(donnees)
      .then((url) => {
        if (!vivant) return;
        setImage(url);
        setEtat(url ? 'pret' : 'impossible');
      })
      .catch(() => vivant && setEtat('impossible'));
    return () => {
      vivant = false;
    };
  }, [donnees]);

  // Le minuteur du libellé de confirmation est ANNULÉ au démontage : fermer la
  // feuille dans les deux secondes qui suivent un téléchargement déclenchait
  // sinon un changement d'état sur un composant disparu.
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  function confirmer() {
    setFait(true);
    // Le seul retour de l'action est un LIBELLÉ de bouton. Or le changement de
    // libellé d'un élément déjà focalisé n'est pas re-annoncé par un lecteur
    // d'écran : sans cette annonce, l'action n'a aucun retour audible.
    AccessibilityInfo.announceForAccessibility?.(t.races.podiumImageSaved);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setFait(false), 2500);
  }

  /** Le téléchargement, dernier recours — hors du `try` du partage natif. */
  function telecharger(source: string) {
    const lien = document.createElement('a');
    lien.href = source;
    lien.download = fichierMarque('podium');
    // ATTACHÉ au document avant le clic : un `<a>` détaché est ignoré par
    // plusieurs moteurs, et l'on affirmait « Image enregistrée » sans que rien
    // ne soit enregistré.
    lien.style.display = 'none';
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    confirmer();
  }

  async function onPartager() {
    if (!image) return;
    track('share_clicked', { kind: 'podium' }).catch(() => {});

    // Pas de branche native : sans `document`, `imagePodium` a déjà renvoyé
    // `null` et le composant n'est pas monté. Un repli écrit ici serait du code
    // mort — et il envoyait `kartsquad://`, c'est-à-dire rien d'exploitable.
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;

    // Le partage de FICHIER est tenté à part, et son échec ne doit pas emporter
    // le téléchargement : `new File(...)` n'existe pas partout (WebView
    // embarquée, Safari ancien), et quand la construction levait à l'intérieur
    // du même `try`, on sautait par-dessus le repli pour atterrir dans un
    // `catch` muet — le bouton ne faisait alors STRICTEMENT RIEN, sans un mot.
    let fichier: File | null = null;
    try {
      const blob = await (await fetch(image)).blob();
      fichier = new File([blob], fichierMarque('podium'), { type: 'image/png' });
    } catch {
      fichier = null;
    }

    if (fichier) {
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      // `canShare` AVANT `share` : sur un navigateur de bureau, `share` existe
      // parfois sans accepter de fichier, et l'appel échoue APRÈS avoir
      // consommé le geste de l'utilisateur — plus rien ne se passe.
      if (nav.canShare?.({ files: [fichier] }) && nav.share) {
        try {
          // `url` et non `text` : plusieurs messageries refusent un fichier
          // accompagné de texte, et une adresse en `url` est auto-liée.
          await nav.share({ files: [fichier], url: donnees.partage });
          return;
        } catch (e) {
          // Un partage ANNULÉ est un choix, pas une panne : on se tait. Tout
          // le reste retombe sur le téléchargement plutôt que de laisser le
          // bouton sans effet.
          if ((e as Error)?.name === 'AbortError') return;
        }
      }
    }

    try {
      telecharger(image);
    } catch {
      // Même le téléchargement a échoué : on n'a plus rien à proposer, mais
      // l'aperçu reste à l'écran et se sauvegarde par un appui long.
    }
  }

  if (etat === 'impossible') return null;

  // Ce que l'image MONTRE, énoncé pour qui ne peut pas la voir. Le classement
  // de l'écran ne le supplée pas : la feuille rend le fond inerte pour les
  // lecteurs d'écran (`Modal` sur web, `accessibilityViewIsModal` sur natif
  // depuis N10). Sans cette énumération, on invite quelqu'un à envoyer à des
  // tiers un contenu qu'il ne peut pas lire.
  const contenuLu = [
    t.races.podiumImageAria.replace('%c', donnees.circuit).replace('%d', donnees.date),
    ...donnees.lignes.map(
      (l) => `${l.rang}. ${l.nom}, ${ecrireDelta(l.delta, donnees.abandon, l.dnf)}`,
    ),
    donnees.resume,
  ].join(' · ');

  return (
    <Card>
      <Label>{t.races.podiumImageTitle}</Label>
      <Muted style={styles.hint}>{t.races.podiumImageHint}</Muted>
      <View style={styles.cadre}>
        {image ? (
          <Image
            source={{ uri: image }}
            // Ratio EXACT de l'image produite, et il DÉPEND du nombre de lignes
            // (voir `hauteurPodium`) : un aperçu qui ne serait pas à l'échelle
            // mentirait sur ce qu'on s'apprête à envoyer.
            style={[styles.apercu, { aspectRatio: LARGEUR / hauteurPodium(donnees.lignes.length) }]}
            resizeMode="contain"
            accessibilityLabel={contenuLu}
          />
        ) : (
          <Muted>{t.races.podiumImageLoading}</Muted>
        )}
      </View>
      <Button
        label={fait ? t.races.podiumImageSaved : t.races.podiumImageShare}
        onPress={onPartager}
        disabled={!image}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: spacing.sm },
  cadre: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 120,
  },
  // Plafonné en hauteur pour que le bouton reste à portée sur un petit écran —
  // à 568 px de haut, il n'apparaissait que sur sept pixels.
  apercu: { width: '100%', maxHeight: 300 },
});
