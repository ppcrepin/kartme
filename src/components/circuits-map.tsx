import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { colors, electriqueColor } from '@/constants/theme';
import { t } from '@/i18n';
import { kmBetween, type Position } from '@/lib/geo';
import type { Circuit } from '@/lib/races';

/**
 * La carte des circuits, en NATIF (lot N1 — première étape vers l'App Store).
 *
 * Cet écran était un carré gris qui disait « disponible dans le navigateur » :
 * Leaflet est une bibliothèque DOM et ne tourne pas sous React Native. Un
 * onglet entier hors service, c'est le motif de refus n° 1 d'Apple (règle 4.2,
 * « minimum functionality ») — et de toute façon une promesse non tenue.
 *
 * `PROVIDER_DEFAULT` : Apple Maps sur iOS, sans clé ni compte, sans quota.
 * (Sur Android il faudra une clé Google Maps — hors périmètre de cette étape,
 * décision PO : iOS d'abord.)
 *
 * Le fond de carte n'est plus OpenStreetMap ici, donc l'attribution ODbL du
 * web ne s'applique pas : nos DONNÉES de circuits en viennent, et c'est
 * l'écran « Aide & légal » qui le dit — ça reste vrai sur les deux plateformes.
 */
const FRANCE: Region = {
  latitude: 46.6,
  longitude: 2.4,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

/**
 * Combien d'épingles au maximum. Le web en pose 277 sans broncher (des `div`),
 * le natif crée une vue par marqueur : au-delà de quelques centaines, le
 * défilement de la carte saccade sur un iPhone d'entrée de gamme. On garde les
 * PLUS PROCHES du centre visible — celles qu'on regarde.
 */
const MAX_EPINGLES = 150;

/**
 * La vue survit au démontage, comme sur le web : revenir de la fiche d'un
 * circuit ne doit pas ramener sur la France entière. Module-level et non état :
 * l'écran se démonte, la variable non.
 */
let derniereVue: Region | null = null;

export function CircuitsMap({
  circuits,
  me,
  selectedId,
  onSelect,
}: {
  circuits: Circuit[];
  me: Position | null;
  selectedId: string | null;
  onSelect: (c: Circuit) => void;
}) {
  const carte = useRef<MapView | null>(null);
  const [vue, setVue] = useState<Region>(
    derniereVue ?? (me ? { ...FRANCE, latitude: me.lat, longitude: me.lon, latitudeDelta: 1.5, longitudeDelta: 1.5 } : FRANCE),
  );

  // Les épingles réellement posées : les plus proches du centre de la vue.
  // Le circuit SÉLECTIONNÉ est toujours dedans, sinon on le ferait disparaître
  // au moment même où on le désigne.
  const visibles = useMemo(() => {
    const centre = { lat: vue.latitude, lon: vue.longitude };
    const situes = circuits.filter((c) => c.lat !== null && c.lon !== null);
    if (situes.length <= MAX_EPINGLES) return situes;
    const tries = [...situes].sort(
      (a, b) =>
        kmBetween(centre, { lat: a.lat!, lon: a.lon! }) -
        kmBetween(centre, { lat: b.lat!, lon: b.lon! }),
    );
    const gardes = tries.slice(0, MAX_EPINGLES);
    if (selectedId && !gardes.some((c) => c.id === selectedId)) {
      const choisi = situes.find((c) => c.id === selectedId);
      if (choisi) gardes.push(choisi);
    }
    return gardes;
  }, [circuits, vue.latitude, vue.longitude, selectedId]);

  // La carte suit le circuit choisi, mais SEULEMENT s'il est sorti du cadre —
  // même règle que sur le web. Recentrer à chaque tap donnerait un écran qui
  // saute sous le doigt alors qu'on voit déjà l'épingle.
  useEffect(() => {
    const cible = circuits.find((c) => c.id === selectedId);
    if (!cible || cible.lat === null || cible.lon === null || !carte.current) return;
    const marge = 0.35; // on considère « sorti » avant le bord franc
    const dedans =
      Math.abs(cible.lat - vue.latitude) < (vue.latitudeDelta / 2) * (1 - marge) &&
      Math.abs(cible.lon - vue.longitude) < (vue.longitudeDelta / 2) * (1 - marge);
    if (dedans) return;
    carte.current.animateToRegion(
      { ...vue, latitude: cible.lat, longitude: cible.lon },
      350,
    );
    // `vue` est volontairement HORS des dépendances : l'inclure relancerait
    // l'effet à chaque image de l'animation qu'il vient de déclencher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, circuits]);

  // Recentrage sur le pilote dès qu'on connaît sa position.
  useEffect(() => {
    if (!me || !carte.current) return;
    carte.current.animateToRegion(
      { latitude: me.lat, longitude: me.lon, latitudeDelta: 1.5, longitudeDelta: 1.5 },
      350,
    );
  }, [me]);

  return (
    <View style={styles.cadre}>
      <MapView
        ref={carte}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={vue}
        onRegionChangeComplete={(r) => {
          derniereVue = r;
          setVue(r);
        }}
        // La position du pilote est affichée par le système (point bleu) et
        // n'est demandée que si on la connaît déjà : l'autorisation se demande
        // sur « Me localiser », jamais à l'ouverture de l'écran.
        showsUserLocation={me !== null}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        accessibilityLabel={t.races.mapAria}>
        {visibles.map((c) => {
          const elec = c.motor_kind === 'electrique';
          const choisi = c.id === selectedId;
          return (
            <Marker
              key={c.id}
              coordinate={{ latitude: c.lat!, longitude: c.lon! }}
              onPress={() => onSelect(c)}
              // Le titre sert de nom accessible ET de bulle système : sur le
              // web les épingles n'en ont aucun, c'est une amélioration que le
              // natif offre gratuitement.
              title={c.city ? `${c.name}, ${c.city}` : c.name}
              tracksViewChanges={false}>
              {/* Même code visuel que sur le web : rond rouge par défaut,
                  CARRÉ vert pour l'électrique. La forme porte l'information —
                  entre ce vert et le rouge de marque, un daltonien deutéranope
                  ne voit qu'une nuance. */}
              <View
                // ORDRE : la taille de sélection d'abord, la forme
                // électrique ENSUITE — sinon le rayon rond de la sélection
                // écrasait le carré, et l'épingle choisie perdait justement le
                // signe qui la distingue.
                style={[
                  styles.pin,
                  choisi && styles.pinChoisi,
                  elec && styles.pinElec,
                  choisi && { borderColor: elec ? electriqueColor : colors.accent, borderWidth: 3 },
                ]}
              />
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hauteur fixe : `MapView` en position absolue a besoin d'un parent mesuré,
  // sinon il se rend sur zéro pixel sans le moindre avertissement.
  cadre: { height: 260, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  pin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinElec: { borderRadius: 2, backgroundColor: electriqueColor },
  // Le halo de sélection : `outline` n'existe pas en natif. On grossit
  // l'épingle et on épaissit sa bordure, ce qui se voit à tous les zooms.
  pinChoisi: { width: 20, height: 20, borderRadius: 10 },
});
