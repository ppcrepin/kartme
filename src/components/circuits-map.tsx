import { StyleSheet, View } from 'react-native';

import { Muted } from '@/components/ui/text';
import { spacing } from '@/constants/theme';
import { t } from '@/i18n';
import type { Position } from '@/lib/geo';
import type { Circuit } from '@/lib/races';

/**
 * Repli natif de la carte.
 *
 * Leaflet est une bibliothèque DOM : elle ne tourne pas sous React Native.
 * L'app est aujourd'hui une PWA web, donc ce fichier n'existe que pour que le
 * code compile côté natif ; la liste triée par distance, elle, y fonctionne.
 * Le jour d'un vrai build natif, ce sera `react-native-maps` ici — et rien
 * d'autre à changer dans l'écran.
 */
export function CircuitsMap(_props: {
  circuits: Circuit[];
  me: Position | null;
  selectedId: string | null;
  onSelect: (c: Circuit) => void;
}) {
  return (
    <View style={styles.fallback}>
      <Muted>{t.races.mapWebOnly}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { padding: spacing.lg, alignItems: 'center' },
});
