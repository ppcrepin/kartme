import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradeMedal } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { GRADES, gradeForElo } from '@/lib/grade';
import { getMyProfile } from '@/lib/profile';

/**
 * R2 — l'échelle des 6 grades, avec la position du joueur.
 *
 * Vit dans l'onglet PROFIL, et non plus Classement. On n'y accède que d'un
 * endroit — le bouton « L'échelle des grades » du profil — et chaque onglet
 * porte sa propre pile : depuis Classement, l'ouvrir CHANGEAIT d'onglet, si
 * bien que le « ← » remontait la pile du classement et déposait le pilote sur
 * le tableau des scores au lieu de son profil (retour de test 2026-08-01).
 *
 * Le repli de sortie suit : `/profil`, jamais `/classements`.
 */
export default function GradesScreen() {
  const router = useRouter();
  const [myElo, setMyElo] = useState<number | null>(null);

  useEffect(() => {
    getMyProfile()
      .then((p) => setMyElo(p?.elo ?? null))
      .catch(() => {});
  }, []);

  const myGrade = myElo !== null ? gradeForElo(myElo) : null;
  // Du plus haut au plus bas : la Légende trône en haut de l'échelle.
  const ladder = [...GRADES].reverse();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          // Lien profond (PWA relancée) : sans historique, on remonte au
          // profil — l'écran d'où l'on vient toujours.
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profil'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.profile.gradesLadder}</Title>
        <Muted>{t.profile.gradesLadderSub}</Muted>

        <View style={styles.list}>
          {ladder.map((g) => {
            const mine = myGrade?.key === g.key;
            return (
              <Card key={g.key} style={mine ? { borderColor: g.color } : undefined}>
                <View style={styles.row}>
                  <GradeMedal grade={g} size={44} />
                  <View style={styles.flex}>
                    <Body style={[styles.name, { color: g.colorTexte }]}>{g.name}</Body>
                    <Muted>
                      {g.max === null ? `${g.min}+` : `${g.min} – ${g.max}`}
                      {mine && myElo !== null ? `   ·   ${t.profile.you} : ${myElo}` : ''}
                    </Muted>
                  </View>
                  {mine ? <Label style={{ color: g.colorTexte }}>◈</Label> : null}
                </View>
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  // 44 px, marge négative pour rester optiquement au bord. `hitSlop` est
  // inerte sur `Pressable` en react-native-web.
  back: {
    alignSelf: 'flex-start',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  list: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  name: { fontWeight: '800' },
});
