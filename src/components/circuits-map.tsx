import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { colors, electriqueColor, radius } from '@/constants/theme';
import { t } from '@/i18n';
import { dansLeCadre, epinglesVisibles } from '@/lib/carte-epingles';
import type { Position } from '@/lib/geo';
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
 * Le CHOIX des épingles vit dans `lib/carte-epingles`, et il y est testé :
 * c'est la seule partie de cette carte qu'on puisse prouver sans appareil.
 */
const FRANCE: Region = {
  latitude: 46.6,
  longitude: 2.4,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

/** Le cadrage d'un point précis : assez serré pour lire les noms de rues. */
const ZOOM_PROCHE = { latitudeDelta: 1.5, longitudeDelta: 1.5 };

/**
 * La vue survit au démontage : `CircuitsExplorer` démonte la carte à chaque
 * bascule Carte/Liste et à chaque recherche, et revenir ne doit pas ramener
 * sur la France entière. Variable de module et non état — l'écran se démonte,
 * la variable non. (Le pendant web fait exactement pareil.)
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
  const [vue, setVue] = useState<Region>(derniereVue ?? FRANCE);
  /**
   * La carte native est-elle posée ? `animateToRegion` appelé avant le premier
   * layout de la `MKMapView` est SILENCIEUSEMENT perdu — on empile donc les
   * recentrages demandés trop tôt et on les rejoue une fois prête.
   */
  const [prete, setPrete] = useState(false);
  const enAttente = useRef<Region | null>(null);
  /**
   * `tracksViewChanges` démarre à VRAI. Le marqueur prend un instantané bitmap
   * de sa vue enfant, et à `false` dès le montage cet instantané est souvent
   * pris avant que l'enfant soit mesuré : épingles blanches, ou invisibles.
   * On bascule à `false` après le premier rendu, sinon chaque marqueur se
   * redessine en continu et le défilement saccade à 150 épingles.
   */
  const [suivreVues, setSuivreVues] = useState(true);
  /**
   * La dernière position du pilote RÉELLEMENT traitée. Sans ce garde-fou,
   * l'effet se rejouait à chaque montage — donc à chaque retour de la liste —
   * et écrasait à la fois la vue mémorisée et le recentrage sur le circuit
   * qu'on venait de choisir. Concrètement : chercher « Le Mans » depuis Lille,
   * le toucher, et voir la carte revenir à Lille sans l'épingle choisie.
   */
  const derniereMe = useRef<string | null>(null);

  const visibles = useMemo(
    () => epinglesVisibles(circuits, vue, selectedId),
    [circuits, vue, selectedId],
  );

  useEffect(() => {
    const t0 = setTimeout(() => setSuivreVues(false), 500);
    return () => clearTimeout(t0);
  }, [visibles]);

  /** Recentre, ou met en attente si la carte n'est pas encore posée. */
  function viser(region: Region) {
    if (!prete || !carte.current) {
      enAttente.current = region;
      return;
    }
    carte.current.animateToRegion(region, 350);
  }

  useEffect(() => {
    if (prete && enAttente.current && carte.current) {
      carte.current.animateToRegion(enAttente.current, 350);
      enAttente.current = null;
    }
  }, [prete]);

  // La carte suit le circuit choisi, mais SEULEMENT s'il est sorti du cadre —
  // même règle que sur le web. Recentrer à chaque tap donnerait un écran qui
  // saute sous le doigt alors qu'on voit déjà l'épingle.
  useEffect(() => {
    const cible = circuits.find((c) => c.id === selectedId);
    if (!cible || cible.lat === null || cible.lon === null) return;
    // Marge de 35 % : on considère « sorti » avant le bord franc, sinon une
    // épingle collée au bord reste techniquement dedans et illisible.
    if (dansLeCadre({ lat: cible.lat, lon: cible.lon }, vue, 0.35)) return;
    viser({ ...vue, latitude: cible.lat, longitude: cible.lon });
    // `vue` est volontairement HORS des dépendances : la relire relancerait
    // l'effet sur le résultat de l'animation qu'il vient de déclencher. Il n'y
    // aurait pas de boucle (le second passage sortirait sur `dansLeCadre`),
    // mais l'effet se rejouerait pour rien à chaque déplacement de carte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, circuits, prete]);

  // Recentrage sur le pilote, UNE FOIS par position obtenue.
  useEffect(() => {
    if (!me) return;
    const cle = `${me.lat},${me.lon}`;
    if (derniereMe.current === cle) return;
    derniereMe.current = cle;
    viser({ latitude: me.lat, longitude: me.lon, ...ZOOM_PROCHE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, prete]);

  return (
    <View style={styles.cadre}>
      <MapView
        ref={carte}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={vue}
        onMapReady={() => setPrete(true)}
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
              tracksViewChanges={suivreVues}>
              {/* Même code visuel que sur le web : rond rouge par défaut,
                  CARRÉ vert pour l'électrique. La forme porte l'information —
                  entre ce vert et le rouge de marque, un daltonien deutéranope
                  ne voit qu'une nuance.

                  ORDRE : la taille de sélection d'abord, la forme électrique
                  ENSUITE — sinon le rayon rond de la sélection écrasait le
                  carré, et l'épingle choisie perdait le signe qui la
                  distingue. Le liseré reste BLANC dans tous les cas : le
                  teinter de la couleur de fond effaçait le contour, et
                  l'épingle sélectionnée se retrouvait moins contrastée que
                  ses voisines — l'inverse de l'effet cherché. */}
              <View
                style={[styles.pin, choisi && styles.pinChoisi, elec && styles.pinElec]}
              />
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  // `MapView` est en position absolue : son parent doit être mesuré, sinon
  // elle se rend sur zéro pixel sans le moindre avertissement. La hauteur
  // vient du parent (`circuits-explorer`), on ne la redéclare pas ici.
  cadre: { flex: 1, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface },
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
  // l'épingle et on épaissit son liseré blanc, ce qui se voit à tous les zooms
  // et sur tous les fonds de carte.
  pinChoisi: { width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
});
