import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Button, Field } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { validateUsername } from '@/lib/username';

export default function SignUpScreen() {
  const { signUpWithEmail } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignUp() {
    const check = validateUsername(username);
    if (!check.ok) {
      setUsernameError(t.auth.errors[check.error ?? 'generic']);
      return;
    }
    setUsernameError(null);
    setBusy(true);
    setError(null);
    const { error } = await signUpWithEmail(email.trim(), password, check.value);
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <AuthShell title={t.auth.signUpTitle}>
      <Field
        label={t.auth.username}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        error={usernameError}
      />
      <Muted>{t.auth.usernameHint}</Muted>
      <Field
        label={t.auth.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        inputMode="email"
      />
      <Field
        label={t.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      {error ? <Body style={styles.error}>{error}</Body> : null}

      <Button label={t.auth.signUp} onPress={onSignUp} disabled={busy} />

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/sign-in')}
        style={styles.linkCenter}>
        <Body style={styles.linkTxt}>{t.auth.hasAccount}</Body>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  linkCenter: { alignItems: 'center', paddingVertical: spacing.sm },
  linkTxt: { color: colors.inkDim },
  error: { color: colors.accent },
});
