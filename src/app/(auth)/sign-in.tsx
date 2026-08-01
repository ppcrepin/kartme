import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Button, Field } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { hasPendingInvite } from '@/lib/pending-route';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function SignInScreen() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    const { error } = await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (error) setError(error);
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle();
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <AuthShell title={t.auth.signInTitle} subtitle={t.app.tagline}>
      {/* Un invité ne doit pas perdre le fil : entre le lien d'ami et son
          retour sur l'invitation, il traverse deux écrans qui, sans cela,
          ne mentionnent l'invitation nulle part. L'invitant n'est PAS
          nommé ici : il faudrait l'interroger avant toute connexion, donc
          exposer un pseudo à quiconque fabrique une URL. */}
      {hasPendingInvite() ? <Body style={styles.invitation}>{t.auth.inviteWaiting}</Body> : null}
      {!isSupabaseConfigured ? <Muted>{t.auth.notConfigured}</Muted> : null}

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
        autoComplete="current-password"
      />

      <Link href="/forgot" asChild>
        <Pressable accessibilityRole="link" style={styles.linkRight}>
          <Muted>{t.auth.forgotLink}</Muted>
        </Pressable>
      </Link>

      {error ? <Body style={styles.error}>{error}</Body> : null}

      <Button label={t.auth.signIn} onPress={onSignIn} disabled={busy} />
      <Button label={t.auth.google} variant="ghost" onPress={onGoogle} disabled={busy} />

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/sign-up')}
        style={styles.linkCenter}>
        <Body style={styles.linkTxt}>{t.auth.noAccount}</Body>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  invitation: { color: colors.gold, fontWeight: '700' },
  linkRight: { alignSelf: 'flex-end' },
  linkCenter: { alignItems: 'center', paddingVertical: spacing.sm },
  linkTxt: { color: colors.inkDim },
  error: { color: colors.accentTexte },
});
