import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CircuitsMap } from '@/components/circuits-map';
import { Screen } from '@/components/screen';
import { Button, Card } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import {
  currentPosition,
  formatKm,
  GeoError,
  type GeoErrorCode,
  type Position,
} from '@/lib/geo';
import { allCircuitsOnMap, type Circuit } from '@/lib/races';

/** Vue par défaut tant qu'on ignore où est le pilote : la France entière. */
const FRANCE: Position = { lat: 46.6, lon: 2.4 };

/** Les plus proches listés sous la carte — au-delà, on cherche sur la carte. */
const LISTE = 12;

/**
 * Onglet Kartings — la carte des pistes de France.
 *
 * Le référentiel compte des centaines de kartings : une liste alphabétique n'y
 * répond à aucune question. La carte, elle, répond à la seule qui compte —
 * « où court-on ce week-end ? » — et c'est le premier écran de l'app qui a du
 * sens sans avoir de course en cours.
 *
 * La position n'est demandée que sur le bouton « Me localiser », jamais à
 * l'ouverture : une fenêtre de permission qui surgit sans raison se solde par
 * un refus, et sur iOS un refus ne se redemande pas.
 */
export default function KartingsScreen() {
  const router = useRouter();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [me, setMe] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeoErrorCode | null>(null);
  const [selected, setSelected] = useState<Circuit | null>(null);
  const alive = useRef(true);

  const load = useCallback((center: Position) => {
    setFailed(false);
    allCircuitsOnMap(center)
      .then((rows) => {
        if (!alive.current) return;
        setCircuits(rows);
        setLoading(false);
      })
      .catch(() => {
        if (!alive.current) return;
        setFailed(true);
        setLoading(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      // Le référentiel ne bouge pas d'une visite à l'autre : on ne recharge que
      // si on n'a rien, pour ne pas repayer 250 lignes à chaque retour d'onglet.
      setCircuits((cur) => {
        if (cur.length === 0) load(me ?? FRANCE);
        return cur;
      });
      return () => {
        alive.current = false;
      };
    }, [load, me]),
  );

  async function onLocate() {
    setLocating(true);
    setGeoError(null);
    try {
      const pos = await currentPosition();
      if (!alive.current) return;
      setMe(pos);
      // On retrie depuis MA position : la liste sous la carte doit s'ouvrir sur
      // les kartings les plus proches, pas sur ceux du centre de la France.
      load(pos);
    } catch (e) {
      if (!alive.current) return;
      setGeoError(e instanceof GeoError ? e.code : 'unavailable');
    } finally {
      if (alive.current) setLocating(false);
    }
  }

  const geoMessage =
    geoError === 'denied'
      ? t.races.circuitGeoDenied
      : geoError === 'unsupported'
        ? t.races.circuitGeoUnsupported
        : geoError
          ? t.races.circuitGeoUnavailable
          : null;

  const proches = circuits.slice(0, LISTE);

  return (
    <Screen title={t.races.mapTitle}>
      <View style={styles.head}>
        <Muted>{t.races.mapSubtitle.replace('%n', String(circuits.length))}</Muted>
        <Pressable
          accessibilityRole="button"
          onPress={onLocate}
          disabled={locating}
          style={styles.locate}>
          <Body style={styles.locateTxt}>
            {locating ? t.races.circuitLocating : `📍 ${t.races.mapLocate}`}
          </Body>
        </Pressable>
      </View>
      {geoMessage ? <Muted style={styles.geoErr}>{geoMessage}</Muted> : null}

      <View style={styles.mapBox}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Muted>{t.races.mapLoading}</Muted>
          </View>
        ) : failed ? (
          <View style={styles.center}>
            <Muted>{t.races.mapFailed}</Muted>
            <Button label={t.inbox.retry} onPress={() => load(me ?? FRANCE)} />
          </View>
        ) : (
          <CircuitsMap
            circuits={circuits}
            me={me}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        )}
      </View>

      {selected ? (
        <Card>
          <View style={styles.sel}>
            <View style={styles.flex}>
              <Body style={styles.selName}>{selected.name}</Body>
              <Muted>
                {selected.city ?? ''}
                {typeof selected.km === 'number' ? ` · ${formatKm(selected.km)}` : ''}
              </Muted>
            </View>
            <Button label={t.races.mapCreateHere} onPress={() => router.push('/race/create')} />
          </View>
        </Card>
      ) : null}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <Label>{t.races.circuitNearTitle}</Label>
        {proches.map((c) => (
          <Pressable
            key={c.id}
            style={styles.row}
            accessibilityRole="button"
            onPress={() => setSelected(c)}>
            <View style={styles.flex}>
              <Body>{c.name}</Body>
              {c.city ? <Muted>{c.city}</Muted> : null}
            </View>
            {typeof c.km === 'number' && me ? (
              <Muted style={styles.km}>{formatKm(c.km)}</Muted>
            ) : null}
          </Pressable>
        ))}
        {/* Attribution ODbL : elle figure aussi dans le coin de la carte, mais
            la carte peut être remplacée par la liste sur un petit écran. */}
        <Muted style={styles.attrib}>{t.races.mapAttribution}</Muted>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  locate: { marginLeft: 'auto', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  locateTxt: { color: colors.accent, fontWeight: '700' },
  geoErr: { marginTop: spacing.xs },
  mapBox: { height: 320, marginTop: spacing.sm, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  sel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selName: { fontWeight: '700' },
  list: { gap: 1, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  km: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1, gap: 2 },
  attrib: { marginTop: spacing.lg, fontSize: 11 },
});
