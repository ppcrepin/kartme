import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field } from '@/components/ui';
import { Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { deleteMyAccount } from '@/lib/profile';

/** S2e — suppression de compte (RGPD). Confirmation par saisie de « SUPPRIMER ». */
export default function SupprimerScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const confirmed = word.trim() === t.deleteAccount.word;

  async function onDelete() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(false);
    try {
      await deleteMyAccount();
      await signOut(); // ferme la session → retour à l'écran de connexion
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings/compte'))}
          accessibilityRole="button"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.deleteAccount.title}</Title>

        <Banner kind="err" title={t.deleteAccount.warning} />
        <Card>
          <Muted>{t.deleteAccount.keptNote}</Muted>
        </Card>

        <Field
          label={t.deleteAccount.confirmLabel}
          value={word}
          onChangeText={setWord}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={t.deleteAccount.word}
        />

        {error ? <Banner kind="err" title={t.deleteAccount.error} /> : null}

        <View style={styles.spacer} />
        <Button
          label={busy ? t.deleteAccount.deleting : t.deleteAccount.confirm}
          onPress={onDelete}
          disabled={!confirmed || busy}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  spacer: { height: spacing.xs },
});
