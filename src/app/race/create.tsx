import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircuitPicker } from '@/components/circuit-picker';
import { DateTimeField } from '@/components/date-time-field';
import { Button } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { takePickedCircuit } from '@/lib/circuit-pick';
import { defaultRaceDate } from '@/lib/datetime';
import {
  countMyRacesToday,
  createRace,
  getCircuit,
  MAX_RACES_PER_DAY,
  type Circuit,
} from '@/lib/races';

export default function CreateRaceScreen() {
  const router = useRouter();
  // Arrivée depuis la carte (onglet Kartings) : le circuit tapé est
  // pré-sélectionné. Sans cela, le bouton « Créer une course ici » ouvrait un
  // formulaire vide et il fallait rechercher à la main la piste qu'on venait
  // de désigner — une promesse d'interface non tenue.
  const { circuitId } = useLocalSearchParams<{ circuitId?: string }>();
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [when, setWhen] = useState<Date>(defaultRaceDate);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limited, setLimited] = useState(false);

  // Retour de « Choisir sur la carte » : le circuit déposé est ramassé au
  // focus, et le reste du formulaire (la date saisie) n'a pas bougé.
  useFocusEffect(
    useCallback(() => {
      const depose = takePickedCircuit();
      if (depose) setCircuit(depose);
    }, []),
  );

  useEffect(() => {
    if (!circuitId) return;
    let vivant = true;
    // Lecture directe par identifiant : la recherche est plafonnée à 20
    // résultats, donc y pêcher un circuit précis échouait dans la quasi-
    // totalité des cas. Un circuit introuvable laisse simplement le
    // sélecteur vide plutôt que de bloquer la création.
    getCircuit(circuitId)
      .then((c) => {
        if (vivant && c) setCircuit(c);
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [circuitId]);

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
          <Muted>← {t.tabs.races}</Muted>
        </Pressable>
        <Title>{t.races.newRace}</Title>

        <CircuitPicker value={circuit} onChange={setCircuit} />

        <DateTimeField label={t.races.date} value={when} onChange={setWhen} />

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
  warn: { color: colors.gold },
  error: { color: colors.accent },
});
