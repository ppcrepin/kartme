import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CircuitsExplorer } from '@/components/circuits-explorer';
import { Screen } from '@/components/screen';
import { Button, Card } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { formatKm } from '@/lib/geo';
import { setPickedCircuit } from '@/lib/circuit-pick';
import { type Circuit } from '@/lib/races';

/**
 * Choisir un karting sur la carte, depuis la création de course.
 *
 * SÉLECTION EN DEUX TEMPS (retour PO : « je veux voir le nom avant de
 * valider ») : un tap montre la fiche du karting, un second geste explicite
 * — « Choisir ce karting » — valide et ramène au formulaire. Un tap sur une
 * épingle de 14 px ne doit jamais engager quoi que ce soit tout seul.
 *
 * Le circuit repart par le dépôt `circuit-pick` (pas par paramètre d'URL,
 * qui remonterait le formulaire et perdrait la date déjà saisie).
 */
export default function CircuitMapPickerScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Circuit | null>(null);

  // Depuis que l'écran vit dans le groupe (tabs), il reste MONTÉ après le
  // retour au formulaire : sans cette purge à la perte de focus, la fiche du
  // dernier choix accueillerait la prochaine ouverture de la carte.
  useFocusEffect(useCallback(() => () => setSelected(null), []));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/race/create'));

  return (
    <Screen title={t.races.mapPickTitle} onBack={back}>
      <CircuitsExplorer
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        extra={
          selected ? (
            <Card>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Body style={styles.name}>{selected.name}</Body>
                  <Muted>
                    {selected.city ?? ''}
                    {typeof selected.km === 'number' ? ` · ${formatKm(selected.km)}` : ''}
                  </Muted>
                </View>
                <Button
                  label={t.races.mapPickConfirm}
                  onPress={() => {
                    setPickedCircuit(selected);
                    back();
                  }}
                />
              </View>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontWeight: '700' },
  flex: { flex: 1, gap: 2 },
});
