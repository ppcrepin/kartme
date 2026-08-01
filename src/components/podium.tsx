import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, fonts, podiumColors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import type { RaceResult } from '@/lib/races';

/** Podium des 3 premiers (2e · 1er · 3e), marches colorées or/argent/bronze. */
export function Podium({
  results,
  avatars,
}: {
  results: RaceResult[];
  /** Liens signés, obtenus en un seul appel par l'écran de course. */
  avatars?: Map<string, string>;
}) {
  // Un abandon ne monte pas sur le podium. Sans ce filtre, une course à trois
  // dont un pilote abandonne le hissait sur la marche bronze avec un « 3 »,
  // à deux centimètres de la liste qui affiche « Abandon ».
  const finishers = results.filter((r) => !r.dnf);
  const first = finishers.find((r) => r.position === 1);
  const second = finishers.find((r) => r.position === 2);
  const third = finishers.find((r) => r.position === 3);
  if (!first) return null;

  return (
    <View style={styles.row}>
      {/* Or, argent, bronze — les VRAIES couleurs de podium. Les marches
          portaient jusqu'ici trois couleurs de GRADE (Rookie, Missile, Roue
          libre) : le commentaire au-dessus annonçait un podium, l'écran
          affichait une échelle de niveaux. Deux codes couleur pour deux choses
          différentes se contredisaient à l'écran. */}
      <Step result={second} height={64} color={podiumColors[1]} avatars={avatars} />
      <Step result={first} height={92} color={podiumColors[0]} avatars={avatars} />
      <Step result={third} height={44} color={podiumColors[2]} avatars={avatars} />
    </View>
  );
}

function Step({
  result,
  height,
  color,
  avatars,
}: {
  result: RaceResult | undefined;
  height: number;
  color: string;
  avatars?: Map<string, string>;
}) {
  if (!result) return <View style={styles.col} />;
  const up = result.eloDelta > 0;
  const flat = result.eloDelta === 0;
  return (
    <View style={styles.col}>
      <Avatar
        name={result.name}
        size={44}
        uri={result.avatarPath ? (avatars?.get(result.avatarPath) ?? null) : null}
        cacheKey={result.avatarPath}
      />
      <Body style={styles.name} numberOfLines={1}>
        {result.name}
      </Body>
      {result.isGuest ? (
        /* Invité : Elo gelé — « — » laisserait croire à un score de 0. */
        <Muted style={{ fontWeight: '800' }}>{t.races.guestShort}</Muted>
      ) : (
        <Muted style={{ color: flat ? colors.inkDim : up ? colors.pos : colors.accentTexte, fontWeight: '800' }}>
          {flat ? '—' : `${up ? '▲ +' : '▼ '}${result.eloDelta}`}
        </Muted>
      )}
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
