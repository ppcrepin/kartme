import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CircuitsMap } from '@/components/circuits-map';
import { Screen } from '@/components/screen';
import { Button, Card, Field } from '@/components/ui';
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
  const [query, setQuery] = useState('');
  // Carte ou liste. Une carte occupe l'écran ET capte le balayage — sur
  // téléphone, on se retrouvait prisonnier d'elle, sans moyen d'atteindre la
  // suite de la page. Pouvoir la replier n'est pas un confort, c'est la
  // sortie de secours.
  const [vue, setVue] = useState<'carte' | 'liste'>('carte');
  // Garde de MONTAGE : ne pas écrire dans l'état d'un écran démonté. À ne pas
  // confondre avec le focus — une réponse partie avant un changement d'onglet
  // et revenue après doit encore pouvoir s'afficher.
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  // Le référentiel ne bouge pas : un seul chargement pour toute la session.
  const charge = useRef(false);

  const load = useCallback((center: Position) => {
    setFailed(false);
    allCircuitsOnMap(center)
      .then((rows) => {
        if (!monte.current) return;
        setCircuits(rows);
        setLoading(false);
      })
      .catch(() => {
        if (!monte.current) return;
        charge.current = false; // un échec doit pouvoir être retenté
        setFailed(true);
        setLoading(false);
      });
  }, []);

  // Un ref de garde, PAS un effet de bord dans un updater de setState : React
  // se réserve le droit de rejouer un updater, ce qui partait en double
  // chargement de 250 lignes — et en mise à jour d'état pendant le rendu.
  useFocusEffect(
    useCallback(() => {
      if (charge.current) return;
      charge.current = true;
      load(FRANCE);
    }, [load]),
  );

  async function onLocate() {
    setLocating(true);
    setGeoError(null);
    try {
      const pos = await currentPosition();
      if (!monte.current) return;
      setMe(pos);
      // On retrie depuis MA position : la liste sous la carte doit s'ouvrir sur
      // les kartings les plus proches, pas sur ceux du centre de la France.
      charge.current = true;
      load(pos);
    } catch (e) {
      if (!monte.current) return;
      setGeoError(e instanceof GeoError ? e.code : 'unavailable');
    } finally {
      if (monte.current) setLocating(false);
    }
  }

  const geoMessage =
    geoError === 'denied'
      ? t.races.circuitGeoDenied
      : geoError === 'unsupported'
        ? t.races.circuitGeoUnsupported
        : geoError === 'timeout'
          ? t.races.circuitGeoTimeout
          : geoError
            ? t.races.circuitGeoUnavailable
            : null;

  // Recherche : sans elle, seuls les 12 premiers kartings sont atteignables
  // autrement qu'en pointant sur la carte — donc rien pour qui navigue au
  // clavier ou au lecteur d'écran, et 239 pistes invisibles.
  const filtre = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return circuits.slice(0, LISTE);
    const sansAccent = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cible = sansAccent(q);
    return circuits
      .filter((c) => sansAccent(c.name).includes(cible) || sansAccent(c.city ?? '').includes(cible))
      .slice(0, 40);
  }, [circuits, query]);

  return (
    <Screen title={t.races.mapTitle}>
      <View style={styles.head}>
        <Muted>
          {loading ? t.races.mapLoading : t.races.mapSubtitle.replace('%n', String(circuits.length))}
        </Muted>
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

      {/* La recherche est AU-DESSUS de la carte : sous elle, elle se trouvait
          hors de l'écran sur un téléphone, et le seul moyen d'y accéder aurait
          été de faire défiler… en balayant la carte, qui se déplace. */}
      <Field
        label={t.races.mapSearch}
        placeholder={t.races.mapSearch}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
      />

      <View style={styles.segment}>
        {(['carte', 'liste'] as const).map((v) => (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: vue === v }}
            onPress={() => setVue(v)}
            style={[styles.segItem, vue === v && styles.segItemOn]}>
            <Body style={vue === v ? styles.segTxtOn : styles.segTxt}>
              {v === 'carte' ? t.races.mapViewMap : t.races.mapViewList}
            </Body>
          </Pressable>
        ))}
      </View>

      {/* Chercher un nom, c'est vouloir la liste : on efface la carte sans
          toucher au choix du pilote, qui la retrouve en effaçant sa saisie. */}
      {vue === 'carte' && !query ? (
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
      ) : null}

      {selected ? (
        <Card>
          <View style={styles.sel}>
            <View style={styles.flex}>
              <Body style={styles.selName}>{selected.name}</Body>
              <Muted>
                {selected.city ?? ''}
                {/* La distance n'a de sens que si on connaît MA position :
                    sans elle, le tri part du centre de la France, et afficher
                    ce chiffre reviendrait à annoncer la distance à Bourges. */}
                {typeof selected.km === 'number' && me ? ` · ${formatKm(selected.km)}` : ''}
              </Muted>
            </View>
            <Button
              label={t.races.mapCreateHere}
              onPress={() =>
                router.push({
                  pathname: '/race/create',
                  params: { circuitId: selected.id },
                })
              }
            />
          </View>
        </Card>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* « Autour de toi » serait un mensonge sans position : le tri part
            alors du centre de la France. */}
        <Label>{query ? t.races.mapTitle : me ? t.races.circuitNearTitle : t.races.mapNoPos}</Label>
        {filtre.length === 0 && !loading ? <Muted>{t.races.mapNone}</Muted> : null}
        {filtre.map((c) => (
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
  segment: { flexDirection: 'row', gap: 1, borderRadius: radius.sharp, overflow: 'hidden', alignSelf: 'flex-start' },
  segItem: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  segItemOn: { backgroundColor: colors.accent },
  segTxt: { color: colors.inkDim },
  segTxtOn: { color: '#fff', fontWeight: '700' },
  // 260 px : assez pour situer, assez peu pour laisser voir la liste dessous
  // et comprendre qu'il y a autre chose à atteindre.
  mapBox: { height: 260, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  sel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selName: { fontWeight: '700' },
  list: { gap: 1, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  km: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1, gap: 2 },
  attrib: { marginTop: spacing.lg, fontSize: 11 },
});
