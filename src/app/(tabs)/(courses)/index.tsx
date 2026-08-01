import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NotificationBell } from '@/components/notification-bell';
import { PremiereCourse, type EtatPremiereCourse } from '@/components/premiere-course';
import { Screen } from '@/components/screen';
import { Button, Card, ListRow, Tag } from '@/components/ui';
import { Body, Heading, Muted } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { dayAndMonth, formatRaceDate } from '@/lib/datetime';
import { feedDest, feedLabel, getFeed, type FeedItem } from '@/lib/feed';

import { listMyRaces, maxGridSize, type Race } from '@/lib/races';

/** Le bandeau montre 3 items au plus : c'est un teaser, pas le fil. */
const BANDEAU_CAP = 3;

export default function CoursesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [races, setRaces] = useState<{ upcoming: Race[]; past: Race[] }>({ upcoming: [], past: [] });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  // Non-null EXACTEMENT tant que la checklist de prise en main a du travail :
  // aucune course terminée. `null` couvre donc deux cas qu'il n'y a pas lieu de
  // distinguer à l'écran — « pilote aguerri » et « on ne sait pas encore ».
  // C'est ce qui évite de faire clignoter la carte à chaque ouverture, le temps
  // que les courses arrivent.
  const [premiere, setPremiere] = useState<EtatPremiereCourse | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listMyRaces()
        .then(async (r) => {
          if (!active) return;
          setRaces(r);
          if (r.past.length > 0) {
            setPremiere(null);
            return;
          }
          // Une requête de plus, mais seulement pour qui n'a pas encore fini
          // une course — et jamais plus après. Son échec n'a rien de bloquant :
          // l'étape reste simplement à cocher.
          const grille = await maxGridSize(r.upcoming.map((x) => x.id)).catch(() => 0);
          if (!active) return;
          setPremiere({
            courseCreee: r.upcoming.length > 0,
            pilotesAjoutes: grille >= 2,
          });
        })
        .catch(() => {});
      // Le fil est un BONUS : son échec ne doit jamais gêner la liste des
      // courses (le bandeau disparaît simplement).
      getFeed(null, BANDEAU_CAP)
        .then((f) => active && setFeed(f))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const list = races[tab];



  return (
    <Screen title={t.tabs.races} headerAction={<NotificationBell />}>
      {/* ── « Ta première course » : la checklist de prise en main, en TÊTE
          d'accueil tant qu'aucune course n'est terminée. Elle passe devant
          « Ça bouge » sans lui nuire — un pilote qui n'a pas encore couru n'a
          de toute façon quasiment rien dans son fil. ── */}
      {premiere ? (
        <PremiereCourse
          etat={premiere}
          onEtape={(n) => {
            if (n === 1) return router.push('/race/create');
            // Étapes 2 et 3 : la course la plus proche — c'est là que se
            // trouvent « + Ajouter » et « Saisir le classement ».
            const cible = races.upcoming[0];
            if (cible) router.push(`/race/${cible.id}`);
          }}
        />
      ) : null}

      {/* ── « Ça bouge » (A15, décision PO : bandeau en tête de l'accueil).
          3 items au plus, « Tout voir » ouvre le fil complet. S'il n'y a
          rien : pas de section vide — le bandeau disparaît, la liste des
          courses EST le contenu. ── */}
      {feed.length > 0 ? (
        <Card>
          <View style={styles.feedHead}>
            <Muted style={styles.feedTitle}>{t.feed.title}</Muted>
            <Pressable
              onPress={() => router.push('/notifications?vue=amis')}
              accessibilityRole="button"
              hitSlop={8}>
              <Muted style={styles.feedLink}>{t.feed.seeAll} ›</Muted>
            </Pressable>
          </View>
          {feed.map((item, i) => {
            const { title, sub } = feedLabel(item);
            const dest = feedDest(item);
            return (
              <ListRow
                key={`${item.kind}-${item.at}-${item.actorId}-${item.raceId ?? ''}-${item.badgeKey ?? ''}`}
                first={i === 0}
                onPress={
                  dest
                    ? // Formes /race/:id et /pilot/:id seulement (feedDest).
                      () => router.push(dest as Parameters<typeof router.push>[0])
                    : undefined
                }
                title={title}
                sub={sub ?? undefined}
              />
            );
          })}
        </Card>
      ) : null}

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
  feedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  feedLink: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.sm, paddingBottom: spacing.xl, paddingTop: spacing.xs },
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cal: { width: 46, alignItems: 'center' },
  calDay: { fontFamily: fonts.serifBlack, fontSize: 22, color: colors.ink },
  calMonth: { fontSize: 11, color: colors.accent, textTransform: 'uppercase', fontWeight: '800' },
  flex: { flex: 1 },
  cta: { paddingVertical: spacing.md },
});
