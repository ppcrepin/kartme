import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Field } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import {
  coarse,
  currentPosition,
  formatKm,
  GeoError,
  kmBetween,
  type GeoErrorCode,
  type Position,
} from '@/lib/geo';
import {
  listRecentCircuits,
  nearbyCircuits,
  searchCircuits,
  type Circuit,
} from '@/lib/races';

/**
 * Une ligne de la liste. Définie HORS du composant : à l'intérieur, son type
 * changeait à chaque rendu, et React démontait puis remontait toutes les
 * lignes à chaque frappe dans le champ de recherche.
 */
function CircuitRow({
  circuit,
  km,
  onPick,
}: {
  circuit: Circuit;
  km: string;
  onPick: (c: Circuit) => void;
}) {
  return (
    <Pressable style={styles.row} onPress={() => onPick(circuit)} accessibilityRole="button">
      <View style={styles.flex}>
        <Body>{circuit.name}</Body>
        {circuit.city ? <Muted>{circuit.city}</Muted> : null}
      </View>
      {km ? <Muted style={styles.km}>{km}</Muted> : null}
    </Pressable>
  );
}

/**
 * Sélecteur de circuit — référentiel MAÎTRISÉ (pas d'ajout libre, décision PO :
 * évite les doublons). « Tes circuits » (pistes déjà courues) proposés d'emblée ;
 * recherche tolérante (accents/casse) sur le nom ET la ville, côté serveur.
 *
 * « Près de moi » (A12a) : le référentiel importé compte des centaines de
 * kartings, où une liste alphabétique ne veut plus rien dire. La position
 * n'est demandée QUE sur un geste explicite du pilote — une fenêtre de
 * permission qui surgit sans raison se solde par un refus, et sur iOS un
 * refus ne se redemande pas.
 */
export function CircuitPicker({
  value,
  onChange,
}: {
  value: Circuit | null;
  onChange: (c: Circuit) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Circuit[]>([]);
  const [recents, setRecents] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(false);
  // Saisie à laquelle correspondent les résultats : pas de « Aucun circuit »
  // périmé pendant l'anti-rebond.
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [near, setNear] = useState<Circuit[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeoErrorCode | null>(null);
  // Position gardée en mémoire vive uniquement : elle sert à afficher une
  // distance à côté des résultats de recherche, jamais à autre chose.
  const [me, setMe] = useState<Position | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // « Tes circuits » : chargés une fois (l'historique ne bouge pas pendant la saisie).
  useEffect(() => {
    let active = true;
    listRecentCircuits()
      .then((rows) => active && setRecents(rows))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (value) return;
    let active = true;
    const id = setTimeout(async () => {
      if (active) setLoading(true);
      try {
        const rows = await searchCircuits(query);
        if (active) {
          setResults(rows);
          setResultsFor(query);
        }
      } catch {
        // Réseau en carafe : liste vide plutôt qu'une rejection silencieuse.
        if (active) {
          setResults([]);
          setResultsFor(query);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query, value]);

  async function onNear() {
    setLocating(true);
    setGeoError(null);
    try {
      const pos = await currentPosition();
      const rows = await nearbyCircuits(pos.lat, pos.lon);
      if (!alive.current) return;
      // On garde la position ARRONDIE, celle-là même que le serveur a utilisée
      // pour trier : sinon le même circuit s'annonce « 1,1 km » ici et
      // « 300 m » après une recherche par nom.
      setMe(coarse(pos));
      setNear(rows);
    } catch (e) {
      if (!alive.current) return;
      // Une panne réseau n'est pas un refus de position : ne pas accuser le
      // pilote d'avoir refusé quand c'est le serveur qui n'a pas répondu.
      setGeoError(e instanceof GeoError ? e.code : 'unavailable');
      setNear(null);
    } finally {
      if (alive.current) setLocating(false);
    }
  }

  if (value) {
    return (
      <View style={styles.selected}>
        <View style={styles.flex}>
          <Label>{t.races.circuit}</Label>
          <Body style={styles.selectedName}>{value.name}</Body>
          {value.city ? <Muted>{value.city}</Muted> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => onChange(null as unknown as Circuit)}>
          <Muted style={styles.change}>{t.races.edit}</Muted>
        </Pressable>
      </View>
    );
  }

  const searching = query.trim().length > 0;
  // `total` vient du serveur (compté AVANT la troncature à 20).
  const tronque = (results[0]?.total ?? 0) - results.length;
  const nearIds = new Set((near ?? []).map((c) => c.id));
  // Hors recherche, on retire des suggestions générales les circuits déjà
  // proposés au-dessus (pas de doublon visuel).
  const generalResults = searching
    ? results
    : results.filter((c) => !recents.some((r) => r.id === c.id) && !nearIds.has(c.id));

  /** Distance affichable : celle du serveur, sinon calculée depuis ma position. */
  const distanceOf = (c: Circuit): string => {
    if (typeof c.km === 'number') return formatKm(c.km);
    if (me && c.lat !== null && c.lon !== null) {
      return formatKm(kmBetween(me, { lat: c.lat, lon: c.lon }));
    }
    return '';
  };


  // Chercher par nom, c'est passer à autre chose : le message de position
  // n'a plus lieu d'être. On le DÉRIVE au lieu de remettre l'état à zéro dans
  // un effet — un setState synchrone dans un effet déclenche un rendu en
  // cascade, et l'information « la position a été refusée » reste vraie.
  const geoMessage = searching
    ? null
    : geoError === 'denied'
      ? t.races.circuitGeoDenied
      : geoError === 'unsupported'
        ? t.races.circuitGeoUnsupported
        : geoError === 'timeout'
          ? t.races.circuitGeoTimeout
          : geoError
            ? t.races.circuitGeoUnavailable
            : null;

  return (
    <View style={styles.wrap}>
      <Field
        label={t.races.circuit}
        placeholder={t.races.circuitSearch}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
      />

      <View style={styles.quickRow}>
        {/* « Près de moi » disparaît une fois la position obtenue : la section
            « Autour de toi » le remplace. « Choisir sur la carte » reste — on
            peut toujours vouloir explorer. Le formulaire (la date déjà saisie)
            survit à l'aller-retour : le circuit revient par un dépôt, pas par
            un paramètre d'URL qui remonterait l'écran. */}
        {!near ? (
          <Pressable
            accessibilityRole="button"
            onPress={onNear}
            disabled={locating}
            style={styles.nearBtn}>
            <Body style={styles.nearBtnTxt}>
              {locating ? t.races.circuitLocating : `📍 ${t.races.circuitNear}`}
            </Body>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/circuit-map-picker')}
          style={styles.nearBtn}>
          <Body style={styles.nearBtnTxt}>{`🗺 ${t.races.mapChooseOnMap}`}</Body>
        </Pressable>
      </View>
      {geoMessage ? <Muted style={styles.geoErr}>{geoMessage}</Muted> : null}

      <View style={styles.list}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}

        {!searching && near ? (
          <>
            <Label style={styles.sectionLabel}>{t.races.circuitNearTitle}</Label>
            {near.length === 0 ? (
              <Muted style={styles.empty}>{t.races.circuitNearEmpty}</Muted>
            ) : (
              near.map((c) => <CircuitRow key={c.id} circuit={c} km={distanceOf(c)} onPick={onChange} />)
            )}
          </>
        ) : null}

        {!searching && recents.length > 0 ? (
          <>
            <Label style={styles.sectionLabel}>{t.races.circuitRecents}</Label>
            {recents.map((c) => (
              <CircuitRow key={c.id} circuit={c} km={distanceOf(c)} onPick={onChange} />
            ))}
          </>
        ) : null}

        {!searching && generalResults.length > 0 && (recents.length > 0 || near) ? (
          <Label style={styles.sectionLabel}>{t.races.circuitAll}</Label>
        ) : null}

        {generalResults.map((c) => (
          <CircuitRow key={c.id} circuit={c} km={distanceOf(c)} onPick={onChange} />
        ))}

        {/* Le référentiel compte des centaines de kartings et la recherche en
            rend 20 : sans cette ligne, l'écran laisse croire qu'il n'y a que
            ça. Avec 24 circuits, la question ne se posait pas. */}
        {tronque > 0 && !loading ? (
          <Muted style={styles.empty}>
            {t.races.circuitTruncated
              .replace('%n', String(results.length))
              .replace('%t', String(results[0]?.total ?? 0))}
          </Muted>
        ) : null}

        {searching && resultsFor === query && !loading && results.length === 0 ? (
          <Muted style={styles.empty}>{t.races.circuitEmpty}</Muted>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  list: { gap: 1 },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  km: { fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  nearBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  nearBtnTxt: { color: colors.accentTexte, fontWeight: '700' },
  geoErr: { marginTop: -spacing.xs },
  empty: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.card, padding: spacing.md },
  selectedName: { fontWeight: '700' },
  flex: { flex: 1, gap: 2 },
  change: { color: colors.accentTexte, fontWeight: '700' },
});
