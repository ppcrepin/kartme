import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, CheckeredRule, Tag } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { nombreFr } from '@/lib/nombre';
import {
  getCircuitPage,
  getCircuitTopTimes,
  PERIOD_TAB_MIN,
  type CircuitPage,
  type LapPeriod,
  type TopTime,
} from '@/lib/circuit-page';
import { formatLap } from '@/lib/laptime';

/**
 * Fiche circuit (A11) — le record, les meilleurs tours, la vie du circuit.
 *
 * Règle d'or : AUCUNE section vide. Une fiche sans chrono ne montre pas un
 * tableau désert, elle lance un défi (« Sois le premier »). Les onglets de
 * période n'apparaissent qu'à partir de PERIOD_TAB_MIN pilotes — pas
 * d'étagère vide en vitrine.
 *
 * Décisions PO : le temps d'un profil privé est affiché, son nom non
 * (« Pilote privé ») ; seules les courses à ≥ 2 inscrits alimentent le
 * tableau ; les invités n'y figurent pas. Tout est appliqué CÔTÉ SERVEUR.
 */
export default function CircuitPageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<CircuitPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<LapPeriod>('all');
  const [times, setTimes] = useState<Partial<Record<LapPeriod, TopTime[]>>>({});
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([getCircuitPage(id), getCircuitTopTimes(id, 'all')])
      .then(([p, top]) => {
        if (!monte.current) return;
        setPage(p);
        setTimes({ all: top });
        setFailed(false);
        setLoading(false);
      })
      .catch(() => {
        if (!monte.current) return;
        setFailed(true);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Les périodes secondaires se chargent au premier tap, puis restent en
  // cache. Pas de garde de montage ici : depuis React 18, un setState après
  // démontage est un no-op silencieux, et y lire le ref déclenchait le
  // faux positif « ref pendant le rendu » de react-hooks.
  function onPeriod(pr: LapPeriod) {
    setPeriod(pr);
    if (times[pr] || !id) return;
    getCircuitTopTimes(id, pr)
      .then((rows) => setTimes((cur) => ({ ...cur, [pr]: rows })))
      .catch(() => {});
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/kartings'));

  if (loading || failed || !page) {
    return (
      <Screen title={t.races.mapTitle} onBack={back}>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Muted>{failed ? t.races.circuitPage.loadError : t.races.circuitPage.notFound}</Muted>
              {failed ? (
                <Button
                  label={t.inbox.retry}
                  onPress={() => {
                    setFailed(false);
                    setLoading(true);
                    load();
                  }}
                />
              ) : null}
            </>
          )}
        </View>
      </Screen>
    );
  }

  const record = times.all?.[0] ?? null;
  const tabs: LapPeriod[] = [
    'all',
    ...(page.lapsYear >= PERIOD_TAB_MIN ? (['year'] as const) : []),
    ...(page.lapsMonth >= PERIOD_TAB_MIN ? (['month'] as const) : []),
  ];
  const libelle: Record<LapPeriod, string> = {
    all: t.races.circuitPage.periodAll,
    year: t.races.circuitPage.periodYear,
    month: t.races.circuitPage.periodMonth,
  };
  const lignes = times[period];

  return (
    <Screen title={page.name} onBack={back}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Ce qu'on sait de la piste (A16) : des étiquettes, pas un
            tableau — chaque champ est souvent absent, et une ligne
            « Longueur : — » ne dit rien à personne. ── */}
        <View style={styles.headRow}>
          <Muted>{page.city ?? ''}</Muted>
          {page.envKind ? (
            <Tag label={t.races.circuitPage.envKinds[page.envKind]} />
          ) : page.isIndoor ? (
            <Tag label={t.races.circuitPage.indoor} />
          ) : null}
          {page.homologation ? (
            <Tag
              label={t.races.circuitPage.homologated.replace('%h', page.homologation)}
              selected
            />
          ) : null}
        </View>

        {page.lengthM ||
        page.widthM ||
        (page.motorKind && t.races.circuitPage.motorKinds[page.motorKind]) ||
        (page.usageKind && t.races.circuitPage.usageKinds[page.usageKind]) ? (
          <View style={styles.specsRow}>
            {/* La largeur était IMBRIQUÉE dans la condition de la longueur : un
                circuit dont on connaît la largeur mais pas la longueur perdait
                silencieusement la donnée. Elle a désormais son propre rendu, et
                reste en `Body` — en `Muted` elle se confondait avec
                « Karts thermiques » et « Loisir et compétition » sur la même
                ligne, et « × 8 m » se lisait comme une quatrième étiquette
                plutôt que comme la seconde dimension. */}
            {page.lengthM ? (
              <Body style={styles.spec}>
                {t.races.circuitPage.meters.replace('%n', nombreFr(Math.round(page.lengthM)))}
                {page.widthM
                  ? ` × ${t.races.circuitPage.meters.replace('%n', nombreFr(Math.round(page.widthM)))}`
                  : ''}
              </Body>
            ) : page.widthM ? (
              <Body style={styles.spec}>
                {t.races.circuitPage.width.replace(
                  '%n',
                  nombreFr(Math.round(page.widthM)),
                )}
              </Body>
            ) : null}
            {page.motorKind ? (
              <Muted style={styles.specTxt}>{t.races.circuitPage.motorKinds[page.motorKind]}</Muted>
            ) : null}
            {page.usageKind ? (
              <Muted style={styles.specTxt}>{t.races.circuitPage.usageKinds[page.usageKind]}</Muted>
            ) : null}
          </View>
        ) : null}

        {/* Un lieu à plusieurs tracés : l'information ne se perd pas, même si
            un seul circuit est sélectionnable (décision PO). */}
        {page.tracksNote ? (
          <Muted style={styles.aliases}>
            {t.races.circuitPage.tracks.replace('%t', page.tracksNote)}
          </Muted>
        ) : null}
        {page.aliases ? (
          <Muted style={styles.aliases}>
            {t.races.circuitPage.alsoKnown.replace('%a', page.aliases)}
          </Muted>
        ) : null}

        {/* ── Le pratique — seulement quand la donnée existe ── */}
        {page.website || page.phone || page.lat != null ? (
          <View style={styles.linksRow}>
            {page.website ? (
              <Button
                label={t.races.circuitPage.website}
                variant="ghost"
                onPress={() => {
                  // Défense en profondeur : seule la migration écrit `website`
                  // et elle borne à http(s), mais un openURL aveugle sur une
                  // valeur de base est le genre de confiance qu'on regrette.
                  if (/^https?:\/\//.test(page.website!)) void Linking.openURL(page.website!);
                }}
              />
            ) : null}
            {page.phone ? (
              <Button
                label={t.races.circuitPage.call}
                variant="ghost"
                onPress={() => void Linking.openURL(`tel:${page.phone!.replace(/[ .]/g, '')}`)}
              />
            ) : null}
            {/* Ouvert sur lat/lon, pas sur la chaîne d'adresse : les
                coordonnées sont toujours connues et vérifiées, une adresse
                recopiée peut ne mener nulle part. Absent si on n'en a pas —
                un bouton qui ne fait rien est pire que pas de bouton. */}
            {page.lat != null && page.lon != null ? (
              <Button
                label={t.races.circuitPage.route}
                variant="ghost"
                onPress={() =>
                  void Linking.openURL(
                    `https://www.openstreetmap.org/?mlat=${page.lat}&mlon=${page.lon}#map=16/${page.lat}/${page.lon}`,
                  )
                }
              />
            ) : null}
          </View>
        ) : null}

        {/* Adresse postale, en TEXTE seul : l'itinéraire est un bouton, à
            côté de « Site web » et « Appeler » — même affordance, même zone
            tapable de 44 px. La ville n'est pas répétée (elle est déjà dans
            l'en-tête), et un code postal seul n'aide personne : on n'affiche
            la ligne que si l'on a une vraie adresse. */}
        {page.address ? (
          <Muted style={styles.address}>
            {[page.address, page.postalCode].filter(Boolean).join(', ')}
          </Muted>
        ) : null}

        <View style={styles.rule}>
          <CheckeredRule cells={10} />
        </View>

        {/* ── Chronos ── */}
        {record ? (
          <>
            <Card>
              <Label>🏆 {t.races.circuitPage.record}</Label>
              <View style={styles.recordRow}>
                <Body style={styles.recordTime}>{formatLap(record.bestLapMs)}</Body>
                {record.pilotId ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/pilot/${record.pilotId}`)}>
                    <Body style={styles.holder}>{record.username}</Body>
                  </Pressable>
                ) : (
                  <Muted>{t.races.circuitPage.privatePilot}</Muted>
                )}
              </View>
              {page.myBestLapMs ? (
                <Muted>
                  {t.races.circuitPage.myBest.replace('%t', formatLap(page.myBestLapMs))}
                </Muted>
              ) : null}
            </Card>

            <View style={styles.tabsRow}>
              <Label style={styles.flex}>{t.races.circuitPage.topTimes}</Label>
              {tabs.length > 1
                ? tabs.map((p) => (
                    <Pressable
                      key={p}
                      accessibilityRole="button"
                      accessibilityState={{ selected: period === p }}
                      onPress={() => onPeriod(p)}
                      style={[styles.tab, period === p && styles.tabOn]}>
                      <Body style={period === p ? styles.tabTxtOn : styles.tabTxt}>
                        {libelle[p]}
                      </Body>
                    </Pressable>
                  ))
                : null}
            </View>
            {!lignes ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              lignes.map((l) => (
                <Pressable
                  key={`${l.rank}-${l.bestLapMs}`}
                  style={[styles.row, l.isMe && styles.rowMe]}
                  accessibilityRole={l.pilotId ? 'button' : 'none'}
                  disabled={!l.pilotId}
                  onPress={() => l.pilotId && router.push(`/pilot/${l.pilotId}`)}>
                  <Muted style={styles.rank}>{l.rank}</Muted>
                  <Body style={styles.time}>{formatLap(l.bestLapMs)}</Body>
                  <Body style={styles.flex}>
                    {l.username ?? t.races.circuitPage.privatePilot}
                  </Body>
                  <Muted>{new Date(l.achievedAt).toLocaleDateString('fr-FR')}</Muted>
                </Pressable>
              ))
            )}
          </>
        ) : (
          // La règle d'or : pas de tableau vide. Le vide est un défi.
          <Card>
            <Body>{t.races.circuitPage.empty}</Body>
          </Card>
        )}

        {/* ── Vie du circuit — seulement s'il y en a une ── */}
        {page.racesCount > 0 ? (
          <>
            <Label style={styles.lifeTitle}>{t.races.circuitPage.life}</Label>
            <Muted>
              {t.races.circuitPage.lifeLine
                .replace('%r', String(page.racesCount))
                .replace('%p', String(page.pilotsCount))
                .replace(
                  '%d',
                  page.lastRaceAt ? new Date(page.lastRaceAt).toLocaleDateString('fr-FR') : '—',
                )}
            </Muted>
            {page.myRacesCount > 0 ? (
              <Muted>{t.races.circuitPage.myRaces.replace('%n', String(page.myRacesCount))}</Muted>
            ) : null}
          </>
        ) : null}

        <Button
          label={t.races.mapCreateHere}
          onPress={() => router.push({ pathname: '/race/create', params: { circuitId: page.id } })}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/circuit-report',
              params: { circuitId: page.id, circuitName: page.name },
            })
          }>
          <Muted style={styles.reportLink}>{t.races.reportCircuitFor}</Muted>
        </Pressable>
        <Muted style={styles.attrib}>{t.races.mapAttribution}</Muted>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  specsRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.md },
  spec: { fontFamily: fonts.serifBlack, fontSize: 18, color: colors.ink },
  specDim: { fontFamily: fonts.sans, fontSize: 12 },
  specTxt: { fontSize: 12 },
  address: { fontSize: 12, lineHeight: 17 },
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aliases: { marginTop: -spacing.sm },
  linksRow: { flexDirection: 'row', gap: spacing.sm },
  rule: { width: 64 },
  recordRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, marginVertical: spacing.xs },
  recordTime: { fontFamily: fonts.sans, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  holder: { color: colors.accent, fontWeight: '700' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  tab: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.accent },
  tabTxt: { color: colors.inkDim, fontSize: 13 },
  tabTxtOn: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  rowMe: { borderWidth: 1, borderColor: colors.accent },
  rank: { width: 18, textAlign: 'right', fontVariant: ['tabular-nums'] },
  time: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  lifeTitle: { marginTop: spacing.sm },
  reportLink: { color: colors.accent, fontWeight: '700' },
  attrib: { fontSize: 11 },
  flex: { flex: 1 },
});
