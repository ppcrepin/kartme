import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CircuitsMap } from '@/components/circuits-map';
import { Button, Field } from '@/components/ui';
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
import { allCircuitsOnMap, listRecentCircuits, type Circuit } from '@/lib/races';
import { sansAccent } from '@/lib/texte';

/** Vue par défaut tant qu'on ignore où est le pilote : la France entière. */
const FRANCE: Position = { lat: 46.6, lon: 2.4 };

/** Les plus proches listés sous la carte — au-delà, on cherche. */
const LISTE = 12;

/**
 * Une ligne de liste, HORS du composant : définie à l'intérieur, son type
 * changerait à chaque rendu et React démonterait toutes les lignes à chaque
 * frappe dans la recherche.
 */
function CircuitRow({ c, onSelect }: { c: Circuit; onSelect: (c: Circuit) => void }) {
  return (
    <Pressable style={styles.row} accessibilityRole="button" onPress={() => onSelect(c)}>
      <View style={styles.flex}>
        <Body>{c.name}</Body>
        {c.city ? <Muted>{c.city}</Muted> : null}
      </View>
      {typeof c.km === 'number' ? <Muted style={styles.km}>{formatKm(c.km)}</Muted> : null}
    </Pressable>
  );
}

/**
 * L'explorateur de kartings : carte + recherche + « près de moi » + liste.
 *
 * UN composant pour DEUX surfaces — l'onglet Kartings (exploration) et le
 * choix sur carte depuis la création de course. Ils divergeaient déjà par
 * petites touches et chaque correction devait être faite deux fois ; ce lot
 * unifie, et le parent ne décide plus que de ce qu'un tap DÉCLENCHE.
 *
 * La position n'est demandée que sur le bouton « Me localiser », jamais à
 * l'ouverture : une fenêtre de permission qui surgit sans raison se solde par
 * un refus, et sur iOS un refus ne se redemande pas.
 */
export function CircuitsExplorer({
  selectedId,
  onSelect,
  extra,
  footer,
}: {
  selectedId: string | null;
  onSelect: (c: Circuit) => void;
  /** Rendu entre la carte et la liste (la fiche du circuit sélectionné). */
  extra?: ReactNode;
  /** Rendu en fin de liste (le lien de signalement). */
  footer?: ReactNode;
}) {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [recents, setRecents] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [me, setMe] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeoErrorCode | null>(null);
  const [query, setQuery] = useState('');
  // Carte ou liste. Une carte occupe l'écran ET capte le balayage : pouvoir la
  // replier n'est pas un confort, c'est la sortie de secours.
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

  const load = useCallback((center: Position, avecDistance: boolean) => {
    setFailed(false);
    allCircuitsOnMap(center)
      .then((rows) => {
        if (!monte.current) return;
        // Sans position réelle, le tri part du centre de la France : la
        // distance serait « la distance à Bourges ». On la RETIRE ici, à la
        // source — ainsi aucune surface (liste, fiche, carte) ne peut
        // l'afficher par erreur.
        setCircuits(avecDistance ? rows : rows.map(({ km: _km, ...reste }) => reste));
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
  // se réserve le droit de rejouer un updater.
  useFocusEffect(
    useCallback(() => {
      if (charge.current) return;
      charge.current = true;
      load(FRANCE, false);
      // « Tes circuits » : l'habitué pense d'abord à ses pistes. Échec
      // silencieux — la section est un plus, pas un prérequis.
      listRecentCircuits()
        .then((rows) => {
          if (monte.current) setRecents(rows);
        })
        .catch(() => {});
    }, [load]),
  );

  async function onLocate() {
    setLocating(true);
    setGeoError(null);
    try {
      const pos = await currentPosition();
      if (!monte.current) return;
      setMe(pos);
      // On retrie depuis MA position : la liste doit s'ouvrir sur les kartings
      // les plus proches, pas sur ceux du centre de la France.
      charge.current = true;
      load(pos, true);
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

  // Recherche : sans elle, seuls les premiers kartings sont atteignables
  // autrement qu'en pointant sur la carte — rien pour qui navigue au clavier
  // ou au lecteur d'écran. Les ALIAS comptent : « BRK » doit trouver Trappes.
  const filtre = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Hors recherche : les récents sont déjà affichés au-dessus, ne pas les
      // répéter dans la liste générale.
      const deja = new Set(recents.map((r) => r.id));
      return circuits.filter((c) => !deja.has(c.id)).slice(0, LISTE);
    }
    const cible = sansAccent(q);
    return circuits
      .filter(
        (c) =>
          sansAccent(c.name).includes(cible) ||
          sansAccent(c.city ?? '').includes(cible) ||
          sansAccent(c.aliases ?? '').includes(cible),
      )
      .slice(0, 40);
  }, [circuits, recents, query]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
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

      <Field
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
            aria-selected={vue === v}
            onPress={() => setVue(v)}
            style={[styles.segItem, vue === v && styles.segItemOn]}>
            <Body style={vue === v ? styles.segTxtOn : styles.segTxt}>
              {v === 'carte' ? t.races.mapViewMap : t.races.mapViewList}
            </Body>
          </Pressable>
        ))}
      </View>

      {/* Chercher un nom, c'est vouloir la liste : la carte s'efface sans
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
              <Button label={t.inbox.retry} onPress={() => load(me ?? FRANCE, me !== null)} />
            </View>
          ) : (
            <CircuitsMap circuits={circuits} me={me} selectedId={selectedId} onSelect={onSelect} />
          )}
        </View>
      ) : null}

      {/* Chercher, c'est passer à autre chose : la fiche du circuit
          sélectionné s'efface pendant la saisie — les résultats d'abord.
          Elle revient telle quelle si on efface la recherche. */}
      {query ? null : extra}

      <View style={styles.list}>
        {!query && recents.length > 0 ? (
          <>
            <Label>{t.races.circuitRecents}</Label>
            {recents.map((c) => (
              <CircuitRow key={c.id} c={c} onSelect={onSelect} />
            ))}
          </>
        ) : null}

        {/* « Autour de toi » serait un mensonge sans position : le tri part
            alors du centre de la France. */}
        <Label style={!query && recents.length > 0 ? styles.sectionLabel : undefined}>
          {query ? t.races.mapTitle : me ? t.races.circuitNearTitle : t.races.mapNoPos}
        </Label>
        {filtre.length === 0 && !loading ? <Muted>{t.races.mapNone}</Muted> : null}
        {filtre.map((c) => (
          <CircuitRow key={c.id} c={c} onSelect={onSelect} />
        ))}

        {footer}
        <Muted style={styles.attrib}>{t.races.mapAttribution}</Muted>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { gap: spacing.md, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  locate: { marginLeft: 'auto', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  locateTxt: { color: colors.accent, fontWeight: '700' },
  geoErr: { marginTop: spacing.xs },
  segment: { flexDirection: 'row', gap: 1, borderRadius: radius.sharp, overflow: 'hidden', alignSelf: 'flex-start' },
  segItem: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  segItemOn: { backgroundColor: colors.accent },
  segTxt: { color: colors.inkDim },
  segTxtOn: { color: '#fff', fontWeight: '700' },
  // 260 px : assez pour situer, assez peu pour laisser voir la liste dessous.
  mapBox: { height: 260, marginTop: spacing.sm, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  list: { gap: 1, paddingTop: spacing.md },
  sectionLabel: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  km: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1, gap: 2 },
  attrib: { marginTop: spacing.md, fontSize: 11 },
});
