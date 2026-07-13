import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

/** Filet damier — motif signature (drapeau à damier), en séparateur fin. */
export function CheckeredRule({ cells = 24 }: { cells?: number }) {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no">
      {Array.from({ length: cells }).map((_, i) => (
        <View
          key={i}
          style={[styles.cell, { backgroundColor: i % 2 === 0 ? colors.accent : '#3a0f0c' }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', height: 6, borderRadius: 2, overflow: 'hidden' },
  cell: { flex: 1, height: '100%' },
});
