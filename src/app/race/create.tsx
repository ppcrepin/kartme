import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircuitPicker } from '@/components/circuit-picker';
import { Button, Field } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { defaultRaceDate, formatDateInput, formatTimeInput, parseDateTime } from '@/lib/datetime';
import { countMyRacesToday, createRace, MAX_RACES_PER_DAY, type Circuit } from '@/lib/races';

export default function CreateRaceScreen() {
  const router = useRouter();
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [dateStr, setDateStr] = useState(formatDateInput(defaultRaceDate()));
  const [timeStr, setTimeStr] = useState(formatTimeInput(defaultRaceDate()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limited, setLimited] = useState(false);

  useEffect(() => {
    countMyRacesToday()
      .then((n) => setLimited(n >= MAX_RACES_PER_DAY))
      .catch(() => {});
  }, []);

  async function onCreate() {
    setError(null);
    if (!circuit) {
      setError(t.races.errorCircuit);
      return;
    }
    const when = parseDateTime(dateStr, timeStr);
    if (!when) {
      setError(t.races.errorDate);
      return;
    }
    if (limited) {
      setError(t.races.limitReached.replace('%n', String(MAX_RACES_PER_DAY)));
      return;
    }
    setBusy(true);
    try {
      const race = await createRace(circuit.id, when);
      router.replace(`/race/${race.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.races.errorDate);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
          <Muted>← {t.races.upcoming}</Muted>
        </Pressable>
        <Title>{t.races.newRace}</Title>

        <CircuitPicker value={circuit} onChange={setCircuit} />

        <View style={styles.dateRow}>
          <View style={styles.flex}>
            <Field label={t.races.date} value={dateStr} onChangeText={setDateStr} placeholder={t.races.dateHint} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.time}>
            <Field label={t.races.time} value={timeStr} onChangeText={setTimeStr} placeholder={t.races.timeHint} keyboardType="numbers-and-punctuation" />
          </View>
        </View>

        {limited ? <Muted style={styles.warn}>{t.races.limitReached.replace('%n', String(MAX_RACES_PER_DAY))}</Muted> : null}
        {error ? <Body style={styles.error}>{error}</Body> : null}

        <Button label={t.races.confirmCreate} onPress={onCreate} disabled={busy || limited} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  time: { width: 110 },
  warn: { color: colors.gold },
  error: { color: colors.accent },
});
