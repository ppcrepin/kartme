import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircuitPicker } from '@/components/circuit-picker';
import { DateTimeField } from '@/components/date-time-field';
import { ShareCard } from '@/components/share-card';
import { Avatar, Button, Card, Field } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatRaceDate } from '@/lib/datetime';
import { gradeForElo } from '@/lib/grade';
import {
  addGhostParticipant,
  addSelfParticipant,
  deleteRace,
  getRace,
  listParticipants,
  listResults,
  removeParticipant,
  updateRace,
  type Circuit,
  type Participant,
  type Race,
  type RaceResult,
} from '@/lib/races';
import { appBaseUrl } from '@/lib/url';
import { validateGhostName } from '@/lib/username';

export default function RaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;

  const [race, setRace] = useState<Race | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editCircuit, setEditCircuit] = useState<Circuit | null>(null);
  const [editWhen, setEditWhen] = useState<Date>(() => new Date());

  const refresh = useCallback(async () => {
    if (!id) return;
    const [r, p, res] = await Promise.all([
      getRace(id),
      listParticipants(id, selfId),
      listResults(id, selfId),
    ]);
    setRace(r);
    setParticipants(p);
    setResults(res);
  }, [id, selfId]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh]),
  );

  const completed = race?.status === 'completed';
  const selfParticipating = participants.some((p) => p.isSelf);

  async function onAddPilot() {
    const check = validateGhostName(name);
    if (!check.ok) {
      setNameError(t.auth.errors[check.error ?? 'generic']);
      return;
    }
    setNameError(null);
    setBusy(true);
    try {
      await addGhostParticipant(id!, check.value);
      setName('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(participationId: string) {
    await removeParticipant(participationId);
    await refresh();
  }

  async function onToggleSelf() {
    const mine = participants.find((p) => p.isSelf);
    if (mine) await removeParticipant(mine.id);
    else await addSelfParticipant(id!);
    await refresh();
  }

  function startEdit() {
    if (!race) return;
    setEditCircuit(race.circuit);
    setEditWhen(new Date(race.scheduled_at));
    setEditing(true);
  }

  async function onSaveEdit() {
    if (!editCircuit) return;
    await updateRace(id!, editCircuit.id, editWhen);
    setEditing(false);
    await refresh();
  }

  async function onDelete() {
    await deleteRace(id!);
    router.replace('/(tabs)');
  }

  const shareUrl = `${appBaseUrl()}race/${id}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.replace('/(tabs)')} accessibilityRole="button" style={styles.back}>
          <Muted>← {t.tabs.races}</Muted>
        </Pressable>

        {!race ? (
          <Muted>…</Muted>
        ) : editing ? (
          <View style={styles.section}>
            <Title>{t.races.edit}</Title>
            <CircuitPicker value={editCircuit} onChange={setEditCircuit} />
            <DateTimeField label={t.races.date} value={editWhen} onChange={setEditWhen} />
            <Button label={t.races.save} onPress={onSaveEdit} />
            <Button label={t.common.cancel} variant="ghost" onPress={() => setEditing(false)} />
          </View>
        ) : (
          <>
            <View style={styles.head}>
              <View style={styles.flex}>
                <Title>{race.circuit?.name ?? t.races.noCircuit}</Title>
                <Muted>{formatRaceDate(race.scheduled_at)}</Muted>
              </View>
              {!completed ? (
                <Pressable onPress={startEdit} accessibilityRole="button">
                  <Muted style={styles.editLink}>{t.races.edit}</Muted>
                </Pressable>
              ) : null}
            </View>

            {completed ? (
              /* ── Résultats ── */
              <View style={styles.section}>
                <Label>{t.races.results}</Label>
                {results.map((r) => {
                  const grade = gradeForElo(r.eloAfter);
                  const up = r.eloDelta > 0;
                  const flat = r.eloDelta === 0;
                  return (
                    <Card key={r.position}>
                      <View style={styles.resultRow}>
                        <Body style={styles.posNum}>{r.position}</Body>
                        <Avatar name={r.name} size={34} />
                        <View style={styles.flex}>
                          <Body>
                            {r.name}
                            {r.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                          </Body>
                          <Muted style={{ color: grade.color }}>{grade.name} · {r.eloAfter}</Muted>
                        </View>
                        <Body style={[styles.delta, { color: flat ? colors.inkDim : up ? colors.pos : colors.accent }]}>
                          {flat ? '—' : `${up ? '▲ +' : '▼ '}${r.eloDelta}`}
                        </Body>
                      </View>
                    </Card>
                  );
                })}
                <ShareCard url={shareUrl} />
              </View>
            ) : (
              /* ── Course à venir : participants + saisie ── */
              <>
                <View style={styles.section}>
                  <Label>{t.races.participants} · {participants.length}</Label>
                  {participants.map((p) => (
                    <Card key={p.id}>
                      <View style={styles.pilotRow}>
                        <Avatar name={p.name} size={36} />
                        <Body style={styles.flex}>
                          {p.name}
                          {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                        </Body>
                        <Pressable onPress={() => onRemove(p.id)} accessibilityRole="button">
                          <Muted style={styles.remove}>{t.races.remove}</Muted>
                        </Pressable>
                      </View>
                    </Card>
                  ))}

                  <View style={styles.addRow}>
                    <View style={styles.flex}>
                      <Field label={t.races.pilotName} value={name} onChangeText={setName} error={nameError} autoCapitalize="words" />
                    </View>
                  </View>
                  <Button label={t.races.add} onPress={onAddPilot} disabled={busy} />
                  {!selfParticipating ? (
                    <Button label={t.races.rejoin} variant="ghost" onPress={onToggleSelf} />
                  ) : null}
                </View>

                {participants.length >= 2 ? (
                  <Button label={t.races.enterRanking} onPress={() => router.push(`/rank/${id}`)} />
                ) : (
                  <Muted>{t.races.needTwoPilots}</Muted>
                )}

                <ShareCard url={shareUrl} />

                <Pressable onPress={onDelete} accessibilityRole="button" style={styles.deleteBtn}>
                  <Body style={styles.deleteTxt}>{t.races.delete}</Body>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  editLink: { color: colors.accent, fontWeight: '700' },
  section: { gap: spacing.sm },
  pilotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  remove: { color: colors.inkDim2 },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  posNum: { fontFamily: fonts.serifBlack, fontSize: 18, width: 22, textAlign: 'center', color: colors.ink },
  delta: { fontWeight: '800' },
  deleteBtn: { alignItems: 'center', paddingVertical: spacing.md },
  deleteTxt: { color: colors.inkDim2 },
});
