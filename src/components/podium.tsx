import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, fonts, gradeColors, spacing } from '@/constants/theme';
import type { RaceResult } from '@/lib/races';

/** Podium des 3 premiers (2e · 1er · 3e), marches colorées or/argent/bronze. */
export function Podium({ results }: { results: RaceResult[] }) {
  const first = results.find((r) => r.position === 1);
  const second = results.find((r) => r.position === 2);
  const third = results.find((r) => r.position === 3);
  if (!first) return null;

  return (
    <View style={styles.row}>
      <Step result={second} height={64} color={gradeColors.rookie} />
      <Step result={first} height={92} color={gradeColors.missile} />
      <Step result={third} height={44} color={gradeColors.roueLibre} />
    </View>
  );
}

function Step({
  result,
  height,
  color,
}: {
  result: RaceResult | undefined;
  height: number;
  color: string;
}) {
  if (!result) return <View style={styles.col} />;
  const up = result.eloDelta > 0;
  const flat = result.eloDelta === 0;
  return (
    <View style={styles.col}>
      <Avatar name={result.name} size={44} />
      <Body style={styles.name} numberOfLines={1}>
        {result.name}
      </Body>
      <Muted style={{ color: flat ? colors.inkDim : up ? colors.pos : colors.accent, fontWeight: '800' }}>
        {flat ? '—' : `${up ? '▲ +' : '▼ '}${result.eloDelta}`}
      </Muted>
      <View style={[styles.step, { height, backgroundColor: color }]}>
        <Body style={styles.pos}>{result.position}</Body>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  col: { flex: 1, maxWidth: 120, alignItems: 'center', gap: 4 },
  name: { fontSize: 13, fontWeight: '700' },
  step: {
    alignSelf: 'stretch',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    marginTop: 4,
  },
  pos: { fontFamily: fonts.serifBlack, fontSize: 22, color: colors.bg },
});
