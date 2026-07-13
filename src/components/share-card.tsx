import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Card } from '@/components/ui';
import { Label, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';

/**
 * Carte de partage d'une course : QR code + lien + bouton copier/partager.
 * Si `message` est fourni (ex. résumé des résultats), il accompagne le lien.
 */
export function ShareCard({
  url,
  title,
  message,
}: {
  url: string;
  title?: string;
  message?: string;
}) {
  const [copied, setCopied] = useState(false);
  const payload = message ? `${message}\n${url}` : url;

  async function onShare() {
    // Web : partage natif si dispo (mobile), sinon copie dans le presse-papier.
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      if (navigator.share) {
        try {
          await navigator.share({ text: payload });
          return;
        } catch {
          // annulé ou non permis → on retombe sur la copie
        }
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } else {
      await Share.share({ message: payload });
    }
  }

  return (
    <Card>
      <Label>{title ?? t.races.share}</Label>
      <View style={styles.qrWrap}>
        <View style={styles.qrBox}>
          <QRCode value={url} size={148} color={colors.bg} backgroundColor={colors.ink} />
        </View>
      </View>
      <Muted style={styles.hint}>{message ? t.races.shareResultsHint : t.races.shareHint}</Muted>
      <Muted style={styles.url} numberOfLines={1}>
        {url}
      </Muted>
      <Button label={copied ? t.races.copied : t.races.copyLink} variant="ghost" onPress={onShare} />
    </Card>
  );
}

const styles = StyleSheet.create({
  qrWrap: { alignItems: 'center', marginVertical: spacing.md },
  qrBox: { padding: spacing.sm, backgroundColor: colors.ink, borderRadius: 8 },
  hint: { textAlign: 'center' },
  url: { textAlign: 'center', marginVertical: spacing.sm, color: colors.inkDim2 },
});
