import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Button, Field } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';

export default function ForgotScreen() {
  const { resetPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSend() {
    setBusy(true);
    await resetPassword(email.trim());
    setBusy(false);
    setSent(true); // message neutre (ne révèle pas si le compte existe)
  }

  return (
    <AuthShell title={t.auth.forgotTitle}>
      {sent ? (
        <Muted>{t.auth.resetSent}</Muted>
      ) : (
        <>
          <Field
            label={t.auth.email}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            inputMode="email"
          />
          <Button label={t.auth.sendReset} onPress={onSend} disabled={busy} />
        </>
      )}

      <Pressable
        accessibilityRole="link"
        onPress={() => router.replace('/sign-in')}
        style={styles.linkCenter}>
        <Body style={styles.linkTxt}>{t.auth.backToSignIn}</Body>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  linkCenter: { alignItems: 'center', paddingVertical: spacing.sm },
  linkTxt: { color: colors.inkDim },
});
