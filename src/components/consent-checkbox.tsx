import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Body, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';

/** Case d'acceptation des CGU + confidentialité à l'inscription (obligatoire, RGPD). */
export function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={t.auth.consentLabel}
        style={[styles.box, checked && styles.boxOn]}>
        <Body style={styles.check}>{checked ? '✓' : ''}</Body>
      </Pressable>
      <View style={styles.flex}>
        <Muted style={styles.text}>
          {t.auth.consentPre}
          <Muted style={styles.link} onPress={() => router.push('/settings/cgu')}>
            {t.help.cgu}
          </Muted>
          {t.auth.consentMid}
          <Muted style={styles.link} onPress={() => router.push('/settings/confidentialite')}>
            {t.help.privacy}
          </Muted>
          {t.auth.consentPost}
        </Muted>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxOn: { backgroundColor: colors.pos, borderColor: colors.pos },
  check: { color: colors.bg, fontWeight: '800', fontSize: 14 },
  flex: { flex: 1 },
  text: { lineHeight: 20 },
  link: { color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
});
