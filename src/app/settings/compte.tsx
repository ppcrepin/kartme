import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { listBlocked, unblockPilot } from '@/lib/friends';
import { getMyProfile, setPrivacy, setUsername } from '@/lib/profile';
import { validateUsername } from '@/lib/username';

/** S2 — Compte : pseudo, confidentialité, pilotes bloqués, suppression. */
export default function CompteScreen() {
  const router = useRouter();
  const [username, setName] = useState('');
  const [initialName, setInitialName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [blocked, setBlocked] = useState<{ id: string; username: string }[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getMyProfile()
      .then((p) => {
        if (!p) return;
        setName(p.username);
        setInitialName(p.username);
        setIsPrivate(p.isPrivate);
      })
      .catch(() => {});
    listBlocked()
      .then(setBlocked)
      .catch(() => {});
  }, []);

  useEffect(() => load(), [load]);

  async function onSaveName() {
    const check = validateUsername(username);
    if (!check.ok) {
      setNameError(t.account.usernameError);
      return;
    }
    setNameError(null);
    setBusy(true);
    try {
      await setUsername(check.value);
      setInitialName(check.value);
      setName(check.value);
      setSaved(true);
    } catch {
      setNameError(t.account.usernameError);
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePrivacy(next: boolean) {
    setIsPrivate(next);
    try {
      await setPrivacy(next);
    } catch {
      setIsPrivate(!next); // revert
    }
  }

  async function onUnblock(id: string) {
    setBlocked((prev) => prev.filter((b) => b.id !== id));
    try {
      await unblockPilot(id);
    } catch {
      load(); // resynchronise en cas d'échec
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.account.title}</Title>

        {/* Pseudo */}
        <Card>
          <Field
            label={t.account.username}
            value={username}
            onChangeText={(v) => {
              setName(v);
              setSaved(false);
            }}
            autoCapitalize="none"
            maxLength={20}
            error={nameError}
          />
          {saved ? <Muted style={styles.ok}>{t.account.saved}</Muted> : null}
          <Button
            label={t.account.save}
            onPress={onSaveName}
            disabled={busy || username.trim() === initialName}
          />
        </Card>

        {/* Confidentialité */}
        <Card>
          <View style={styles.row}>
            <Body style={styles.flex}>{t.account.private}</Body>
            <Switch
              value={isPrivate}
              onValueChange={onTogglePrivacy}
              trackColor={{ true: colors.accent, false: colors.line2 }}
              thumbColor="#ffffff"
              accessibilityLabel={t.account.private}
            />
          </View>
          <Muted style={styles.hint}>{t.account.privacyHint}</Muted>
        </Card>

        {/* Pilotes bloqués */}
        <Card>
          <Label>{t.account.blocked}</Label>
          {blocked.length === 0 ? (
            <Muted style={styles.hint}>{t.account.blockedEmpty}</Muted>
          ) : (
            blocked.map((b) => (
              <View key={b.id} style={[styles.row, styles.blockedRow]}>
                <Body style={styles.flex}>{b.username}</Body>
                <Pressable onPress={() => onUnblock(b.id)} accessibilityRole="button" style={styles.action}>
                  <Body style={styles.unblock}>{t.account.unblock}</Body>
                </Pressable>
              </View>
            ))
          )}
        </Card>

        {/* Zone sensible */}
        <Banner kind="warn" title={t.account.danger} />
        <Button
          label={t.account.delete}
          variant="ghost"
          onPress={() => router.push('/settings/supprimer')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  blockedRow: { marginTop: spacing.sm },
  flex: { flex: 1 },
  hint: { marginTop: spacing.xs },
  ok: { color: colors.pos },
  action: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  unblock: { color: colors.accent, fontWeight: '800' },
});
