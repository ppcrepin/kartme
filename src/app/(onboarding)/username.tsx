import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { ConsentCheckbox } from '@/components/consent-checkbox';
import { Button, Field } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { validateUsername } from '@/lib/username';

/** S0d — choix du pseudo après une connexion sociale (compte sans profil). */
export default function UsernameScreen() {
  const { createProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    const check = validateUsername(username);
    if (!check.ok) {
      setFieldError(t.auth.errors[check.error ?? 'generic']);
      return;
    }
    setFieldError(null);
    setBusy(true);
    setError(null);
    const { error } = await createProfile(check.value);
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <AuthShell title={t.auth.usernameTitle}>
      <Field
        label={t.auth.username}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        error={fieldError}
      />
      <Muted>{t.auth.usernameHint}</Muted>

      <ConsentCheckbox checked={consent} onChange={setConsent} />

      {error ? <Body style={styles.error}>{error}</Body> : null}

      <Button label={t.auth.confirm} onPress={onConfirm} disabled={busy || !consent} />
      <Button label={t.auth.signOut} variant="ghost" onPress={signOut} disabled={busy} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.accent },
});
