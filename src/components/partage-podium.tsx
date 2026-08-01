import { useEffect, useState } from 'react';
import { Image, Platform, Share, StyleSheet, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { track } from '@/lib/analytics';
import { HAUTEUR, imagePodium, LARGEUR, type DonneesPodium } from '@/lib/podium-image';

/**
 * Partager le podium en IMAGE (lot C4, décision PO : « le podium, avec les
 * points échangés »).
 *
 * L'aperçu est affiché, et ce n'est pas de la décoration : on partage cette
 * image à des gens, et personne n'envoie à l'aveugle quelque chose qui porte
 * son propre résultat.
 *
 * Trois chemins de sortie, du meilleur au moindre :
 *   1. partage natif AVEC le fichier (Android, iOS) — l'image arrive dans la
 *      conversation ;
 *   2. téléchargement (ordinateur) — on la joint soi-même ;
 *   3. si le navigateur ne sait pas dessiner, la carte ne s'affiche pas du
 *      tout et le partage texte, qui existe toujours, reste seul.
 */
export function PartagePodium({ donnees }: { donnees: DonneesPodium }) {
  const [image, setImage] = useState<string | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'impossible'>('chargement');
  const [fait, setFait] = useState(false);

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

  async function onPartager() {
    if (!image) return;
    track('share_clicked', { kind: 'podium' }).catch(() => {});
    const nomFichier = 'kartsquad-podium.png';

    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      try {
        const blob = await (await fetch(image)).blob();
        const fichier = new File([blob], nomFichier, { type: 'image/png' });
        // `canShare` AVANT `share` : sur un navigateur de bureau, `share`
        // existe parfois sans accepter de fichier, et l'appel échoue APRÈS
        // avoir consommé le geste de l'utilisateur — plus rien ne se passe.
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        if (nav.canShare?.({ files: [fichier] }) && nav.share) {
          await nav.share({ files: [fichier], text: donnees.url });
          return;
        }
        const lien = document.createElement('a');
        lien.href = image;
        lien.download = nomFichier;
        lien.click();
        setFait(true);
        setTimeout(() => setFait(false), 2500);
      } catch {
        // Partage annulé, ou fichier refusé : on ne dit rien, l'utilisateur
        // vient de fermer une fenêtre système qu'il a lui-même ouverte.
      }
      return;
    }
    await Share.share({ message: donnees.url });
  }

  if (etat === 'impossible') return null;

  return (
    <Card>
      <Label>{t.races.podiumImageTitle}</Label>
      <Muted style={styles.hint}>{t.races.podiumImageHint}</Muted>
      <View style={styles.cadre}>
        {image ? (
          <Image
            source={{ uri: image }}
            style={styles.apercu}
            resizeMode="contain"
            // L'image dit déjà tout ce qu'elle montre à l'écran juste derrière :
            // le nom accessible résume ce qu'on s'apprête à ENVOYER.
            accessibilityLabel={t.races.podiumImageAria
              .replace('%c', donnees.circuit)
              .replace('%d', donnees.date)}
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
  // Ratio EXACT de l'image produite : un aperçu qui ne serait pas à l'échelle
  // mentirait sur ce qu'on s'apprête à envoyer.
  apercu: { width: '100%', aspectRatio: LARGEUR / HAUTEUR, maxHeight: 420 },
});
