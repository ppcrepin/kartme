import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { Screen } from '@/components/screen';
import { Button, Card, Tag } from '@/components/ui';
import { Body, Heading, Muted } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { dayAndMonth, formatRaceDate } from '@/lib/datetime';
import { listMyRaces, type Race } from '@/lib/races';

export default function CoursesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [races, setRaces] = useState<{ upcoming: Race[]; past: Race[] }>({ upcoming: [], past: [] });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listMyRaces()
        .then((r) => active && setRaces(r))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const list = races[tab];

  return (
    <Screen title={t.tabs.races} headerAction={<NotificationBell />}>
      <View style={styles.filters}>
        <Tag label={t.races.upcoming} selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Tag label={t.races.past} selected={tab === 'past'} onPress={() => setTab('past')} />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {list.length === 0 ? (
          <Muted>{t.races.homeEmpty}</Muted>
        ) : (
          list.map((race) => {
            const { day, month } = dayAndMonth(race.scheduled_at);
            return (
              <Pressable key={race.id} onPress={() => router.push(`/race/${race.id}`)} accessibilityRole="button">
                <Card>
                  <View style={styles.raceRow}>
                    <View style={styles.cal}>
                      <Body style={styles.calDay}>{day}</Body>
                      <Body style={styles.calMonth}>{month}</Body>
                    </View>
                    <View style={styles.flex}>
                      <Heading>{race.circuit?.name ?? t.races.noCircuit}</Heading>
                      <Muted>{formatRaceDate(race.scheduled_at)}</Muted>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <View style={styles.cta}>
        <Button label={t.races.create} onPress={() => router.push('/race/create')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.sm, paddingBottom: spacing.xl, paddingTop: spacing.xs },
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cal: { width: 46, alignItems: 'center' },
  calDay: { fontFamily: fonts.serifBlack, fontSize: 22, color: colors.ink },
  calMonth: { fontSize: 11, color: colors.accent, textTransform: 'uppercase', fontWeight: '800' },
  flex: { flex: 1 },
  cta: { paddingVertical: spacing.md },
});
