import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import {
  disablePush,
  enablePush,
  getPreferences,
  getPushState,
  savePreferences,
  showLocalTestNotification,
  type NotificationPrefs,
  type PushState,
} from '@/lib/push';

/** S3 — réglages des notifications push (web). */
export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [tested, setTested] = useState(false);

  const load = useCallback(() => {
    getPushState()
      .then(setState)
      .catch(() => setState({ supported: false, needsInstall: false, permission: 'unsupported', subscribed: false }));
    getPreferences()
      .then(setPrefs)
      .catch(() => setPrefs({ invites: true, results: true, friendRequests: true }));
  }, []);

  useEffect(() => load(), [load]);

  async function onEnable() {
    setBusy(true);
    setError(false);
    try {
      const res = await enablePush();
      if (!res.ok) setError(true);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function onDisable() {
    setBusy(true);
    try {
      await disablePush();
    } finally {
      setBusy(false);
      setTested(false);
      load();
    }
  }

  async function onTest() {
    const ok = await showLocalTestNotification('KartSquad', t.notifications.testSent);
    setTested(ok);
  }

  async function toggle(key: keyof NotificationPrefs, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await savePreferences(next);
    } catch {
      setPrefs(prefs); // revert en cas d'échec réseau
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.notifications.title}</Title>
        <Muted>{t.notifications.intro}</Muted>

        {state === null ? (
          <Muted>…</Muted>
        ) : !state.supported ? (
          /* Navigateur incompatible (ou natif) — message clair, + astuce iOS. */
          <Card>
            <Body>{t.notifications.unsupported}</Body>
            {state.needsInstall ? <Muted style={styles.gap}>{t.notifications.iosInstall}</Muted> : null}
          </Card>
        ) : (
          <>
            {!state.subscribed ? (
              <View style={styles.section}>
                {state.permission === 'denied' ? (
                  <Banner kind="warn" title={t.notifications.permissionDenied} />
                ) : null}
                {error ? <Banner kind="err" title={t.notifications.error} /> : null}
                <Button
                  label={busy ? t.notifications.enabling : t.notifications.enable}
                  onPress={onEnable}
                  disabled={busy || state.permission === 'denied'}
                />
              </View>
            ) : (
              <>
                <Banner kind="ok" title={t.notifications.enabledOnDevice} />

                {prefs ? (
                  <Card>
                    <Label>{t.notifications.types}</Label>
                    <PrefRow
                      label={t.notifications.invites}
                      sub={t.notifications.invitesSub}
                      value={prefs.invites}
                      onValueChange={(v) => toggle('invites', v)}
                    />
                    <PrefRow
                      label={t.notifications.results}
                      sub={t.notifications.resultsSub}
                      value={prefs.results}
                      onValueChange={(v) => toggle('results', v)}
                    />
                    <PrefRow
                      label={t.notifications.friendRequests}
                      sub={t.notifications.friendRequestsSub}
                      value={prefs.friendRequests}
                      onValueChange={(v) => toggle('friendRequests', v)}
                    />
                  </Card>
                ) : null}

                <Card>
                  <Label>{t.notifications.quiet}</Label>
                  <Muted style={styles.gap}>{t.notifications.quietValue}</Muted>
                </Card>

                {tested ? <Banner kind="info" title={t.notifications.testSent} /> : null}
                <Button label={t.notifications.test} variant="ghost" onPress={onTest} />
                <Button label={t.notifications.disable} variant="ghost" onPress={onDisable} disabled={busy} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrefRow({
  label,
  sub,
  value,
  onValueChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.prefRow}>
      <View style={styles.flex}>
        <Body>{label}</Body>
        <Muted>{sub}</Muted>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.accent, false: colors.line2 }}
        thumbColor="#ffffff"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  section: { gap: spacing.sm },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
  gap: { marginTop: spacing.xs },
});
