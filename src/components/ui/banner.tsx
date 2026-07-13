import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, states } from '@/constants/theme';

export type BannerKind = 'ok' | 'warn' | 'err' | 'info';

// Signe toujours présent en plus de la couleur (accessibilité : jamais la
// couleur seule). Icône sombre sur fonds clairs, blanche sur err/info.
const SIGN: Record<BannerKind, string> = { ok: '✓', warn: '!', err: '✕', info: 'i' };
const ICON_INK: Record<BannerKind, string> = { ok: colors.bg, warn: colors.bg, err: '#fff', info: '#fff' };

/** Bandeau d'état sémantique (succès / avertissement / erreur / info). */
export function Banner({
  kind,
  title,
  message,
}: {
  kind: BannerKind;
  title: string;
  message?: string;
}) {
  const tint = states[kind];
  return (
    <View style={[styles.base, { borderLeftColor: tint }]}>
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <Text style={[styles.sign, { color: ICON_INK[kind] }]}>{SIGN[kind]}</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  icon: { width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sign: { fontFamily: fonts.sans, fontWeight: '900', fontSize: 12 },
  textWrap: { flex: 1 },
  title: { color: colors.ink, fontFamily: fonts.sans, fontSize: 14, fontWeight: '700' },
  message: { color: colors.inkDim, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, marginTop: 1 },
});
