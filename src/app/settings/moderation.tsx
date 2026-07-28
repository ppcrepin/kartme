import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Banner, Button, Card, Field } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import {
  deleteReportedRace,
  listReports,
  renamePilot,
  resolveReport,
  suspendPilot,
  type Report,
  removePilotAvatar,
} from '@/lib/moderation';
import { signedAvatarUrls } from '@/lib/avatar';
import { validateUsername } from '@/lib/username';

/** S5 — Boîte de modération (super-admin). Liste des signalements + actions. */
export default function ModerationScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<string | null>(null);
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Map<string, string>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const rows = await listReports(onlyOpen);
      setReports(rows);
      setError(null);
      // UN seul appel de signature pour toute la liste — c'est le cas d'usage
      // pour lequel `signedAvatarUrls` prend un tableau.
      setAvatarUrls(await signedAvatarUrls(rows.map((r) => r.reportedAvatarPath)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }, [onlyOpen]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh]),
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function onRename() {
    if (!renaming) return;
    const check = validateUsername(renaming.name);
    if (!check.ok) {
      setError(t.moderation.renameInvalid);
      return;
    }
    const id = renaming.id;
    setRenaming(null);
    await run(() => renamePilot(id, check.value));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.moderation.title}</Title>

        <View style={styles.filter}>
          <Pressable onPress={() => setOnlyOpen(true)} accessibilityRole="button">
            <Body style={onlyOpen ? styles.tabOn : styles.tab}>{t.moderation.tabOpen}</Body>
          </Pressable>
          <Pressable onPress={() => setOnlyOpen(false)} accessibilityRole="button">
            <Body style={!onlyOpen ? styles.tabOn : styles.tab}>{t.moderation.tabAll}</Body>
          </Pressable>
        </View>

        {error ? <Banner kind="err" title={error} /> : null}

        {reports.length === 0 ? (
          <Muted style={styles.empty}>{t.moderation.empty}</Muted>
        ) : (
          reports.map((r) => (
            <Card key={r.id} style={r.status !== 'open' ? styles.cardDone : undefined}>
              <View style={styles.rowTop}>
                <Label>{t.moderation.categories[r.category]}</Label>
                <Muted>{t.moderation.status[r.status]}</Muted>
              </View>

              {r.reportedId ? (
                <View style={styles.pilotRow}>
                  {/* Photo agrandie sur un signalement de photo : sans elle,
                      le modérateur retirait à l'aveugle, et le signalement
                      devenait un droit de retrait unilatéral entre pilotes. */}
                  <Avatar
                    name={r.reportedName ?? '—'}
                    size={r.category === 'photo' ? 64 : 30}
                    uri={r.reportedAvatarPath ? (avatarUrls.get(r.reportedAvatarPath) ?? null) : null}
                    cacheKey={r.reportedAvatarPath}
                  />
                  <Body style={styles.flex}>
                    {r.reportedName ?? t.moderation.unknownPilot}
                    {r.reportedSuspended ? <Muted> · {t.moderation.suspendedTag}</Muted> : null}
                  </Body>
                </View>
              ) : null}

              <Muted style={styles.meta}>
                {t.moderation.by} {r.reporterName ?? '—'}
                {r.raceCircuit ? ` · ${r.raceCircuit}` : ''}
              </Muted>
              {r.message ? <Body style={styles.msg}>“{r.message}”</Body> : null}

              {/* Renommage en ligne */}
              {renaming?.id === r.id ? (
                <View style={styles.renameBox}>
                  <Field
                    label={t.moderation.renameLabel}
                    value={renaming.name}
                    onChangeText={(name) => setRenaming({ id: r.id, name })}
                    autoCapitalize="words"
                  />
                  <View style={styles.actions}>
                    <Button label={t.common.cancel} variant="ghost" onPress={() => setRenaming(null)} />
                    <Button label={t.moderation.renameConfirm} onPress={onRename} disabled={busy} />
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  {r.reportedId ? (
                    <>
                      <Button
                        label={t.moderation.rename}
                        variant="ghost"
                        onPress={() => setRenaming({ id: r.id, name: r.reportedName ?? '' })}
                        disabled={busy}
                      />
                      {/* Photo : retrait direct. Le pilote repasse en initiales
                          et l'ancien fichier devient illisible. */}
                      {/* Seulement s'il y a une photo, et en deux temps comme
                          « Suspendre » : le retrait est irréversible pour le
                          pilote, qui devra tout refaire. */}
                      {r.reportedAvatarPath ? (
                        confirmPhoto === r.id ? (
                          <>
                            <Button
                              label={t.common.cancel}
                              variant="ghost"
                              onPress={() => setConfirmPhoto(null)}
                            />
                            <Button
                              label={t.moderation.removePhotoConfirm}
                              onPress={() => {
                                setConfirmPhoto(null);
                                void run(() => removePilotAvatar(r.reportedId!));
                              }}
                              disabled={busy}
                            />
                          </>
                        ) : (
                          <Button
                            label={t.moderation.removePhoto}
                            variant="ghost"
                            onPress={() => setConfirmPhoto(r.id)}
                            disabled={busy}
                          />
                        )
                      ) : null}
                      {r.reportedSuspended ? (
                        <Button
                          label={t.moderation.reactivate}
                          variant="ghost"
                          onPress={() => run(() => suspendPilot(r.reportedId!, false))}
                          disabled={busy}
                        />
                      ) : confirmSuspend === r.id ? (
                        <>
                          <Muted>{t.moderation.suspendConfirmQ}</Muted>
                          <Button
                            label={t.moderation.suspendConfirm}
                            onPress={() => {
                              setConfirmSuspend(null);
                              run(() => suspendPilot(r.reportedId!, true));
                            }}
                            disabled={busy}
                          />
                          <Button label={t.common.cancel} variant="ghost" onPress={() => setConfirmSuspend(null)} />
                        </>
                      ) : (
                        <Button
                          label={t.moderation.suspend}
                          variant="ghost"
                          onPress={() => setConfirmSuspend(r.id)}
                          disabled={busy}
                        />
                      )}
                    </>
                  ) : null}
                  {r.raceId ? (
                    <Button
                      label={t.moderation.openRace}
                      variant="ghost"
                      onPress={() => router.push(`/race/${r.raceId}`)}
                    />
                  ) : null}
                </View>
              )}

              {/* Suppression de la course signalée (deux temps) */}
              {r.raceId ? (
                confirmDelete === r.id ? (
                  <View style={styles.actions}>
                    <Muted style={styles.flex}>{t.moderation.deleteConfirmQ}</Muted>
                    <Button label={t.common.cancel} variant="ghost" onPress={() => setConfirmDelete(null)} />
                    <Button
                      label={t.moderation.deleteConfirm}
                      onPress={() => {
                        setConfirmDelete(null);
                        run(() => deleteReportedRace(r.raceId!));
                      }}
                      disabled={busy}
                    />
                  </View>
                ) : (
                  <Pressable onPress={() => setConfirmDelete(r.id)} accessibilityRole="button">
                    <Muted style={styles.deleteLink}>{t.moderation.deleteRace}</Muted>
                  </Pressable>
                )
              ) : null}

              {/* Traitement du signalement */}
              <View style={styles.resolveRow}>
                {r.status !== 'handled' ? (
                  <Button
                    label={t.moderation.markHandled}
                    variant="ghost"
                    onPress={() => run(() => resolveReport(r.id, 'handled'))}
                    disabled={busy}
                  />
                ) : null}
                {r.status !== 'dismissed' ? (
                  <Button
                    label={t.moderation.dismiss}
                    variant="ghost"
                    onPress={() => run(() => resolveReport(r.id, 'dismissed'))}
                    disabled={busy}
                  />
                ) : null}
                {r.status !== 'open' ? (
                  <Button
                    label={t.moderation.reopen}
                    variant="ghost"
                    onPress={() => run(() => resolveReport(r.id, 'open'))}
                    disabled={busy}
                  />
                ) : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  filter: { flexDirection: 'row', gap: spacing.lg },
  tab: { color: colors.inkDim },
  tabOn: { fontWeight: '800', textDecorationLine: 'underline' },
  empty: { textAlign: 'center', paddingVertical: spacing.xl },
  cardDone: { opacity: 0.6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pilotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  meta: { marginTop: spacing.xs },
  msg: { marginTop: spacing.xs, fontStyle: 'italic' },
  renameBox: { marginTop: spacing.sm, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  deleteLink: { color: colors.accent, marginTop: spacing.sm, textDecorationLine: 'underline' },
  resolveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
});
