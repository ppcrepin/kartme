/**
 * Position du pilote — uniquement pour trier les kartings par proximité.
 *
 * Elle n'est ni stockée, ni envoyée ailleurs qu'à notre propre serveur, ni
 * conservée d'une session à l'autre. Le seul état retenu est un booléen
 * « il a déjà accepté », pour ne pas redemander à chaque écran.
 */

import { Platform } from 'react-native';

export type GeoErrorCode =
  | 'denied'
  /**
   * iOS a mémorisé un refus antérieur : la fenêtre d'autorisation ne
   * s'affichera PLUS. Distinct de `denied`, où l'on peut encore redemander —
   * ici, toucher « Me localiser » ne produit rien de visible, et le seul
   * recours passe par les réglages du téléphone. Le message doit le dire,
   * sinon le pilote appuie trois fois sur un bouton mort.
   */
  | 'denied-reglages'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

/** Délai maximum d'une demande de position, web comme natif. */
const DELAI_MS = 45_000;

export class GeoError extends Error {
  constructor(public code: GeoErrorCode) {
    super(code);
    this.name = 'GeoError';
  }
}

/** Rayon au-delà duquel un karting n'est plus « près de moi » (décision PO). */
export const NEARBY_MAX_KM = 150;

export interface Position {
  lat: number;
  lon: number;
}

/**
 * Demande la position au navigateur.
 *
 * `maximumAge` de 5 minutes : sur un téléphone, redemander une position neuve
 * à chaque ouverture du sélecteur réveille le GPS pour rien — à l'échelle du
 * kilomètre, une position de cinq minutes est exactement la même.
 */
export function currentPosition(): Promise<Position> {
  // NATIF : `navigator.geolocation` n'existe pas sous React Native, et cette
  // fonction rejetait donc en `unsupported` sur iPhone — « Me localiser » et
  // le tri par distance étaient morts dans l'application installée. On passe
  // par `expo-location`, dont l'import est différé pour que le bundle web ne
  // l'embarque pas (il n'y a rien à y faire).
  if (Platform.OS !== 'web') return positionNative();
  return new Promise((resolve, reject) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo) {
      reject(new GeoError('unsupported'));
      return;
    }
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => {
        // Les codes sont numériques et non exportés par le typage RN : 1 =
        // permission refusée, 2 = position indisponible, 3 = délai dépassé.
        const code: GeoErrorCode =
          err?.code === 1 ? 'denied' : err?.code === 3 ? 'timeout' : 'unavailable';
        reject(new GeoError(code));
      },
      // 45 s, pas 10 : le délai court PENDANT que la fenêtre d'autorisation
      // est affichée. Sur iPhone, le temps de lire « Autoriser une fois /
      // Pendant l'utilisation / Refuser » et de choisir dépassait largement
      // dix secondes — on abandonnait donc en annonçant « position
      // indisponible » alors que le pilote était en train d'accepter.
      { enableHighAccuracy: false, timeout: DELAI_MS, maximumAge: 5 * 60_000 },
    );
  });
}

/**
 * La position sous iOS et Android.
 *
 * `requestForegroundPermissionsAsync` déclenche la fenêtre système : elle
 * n'est appelée QUE depuis « Me localiser », jamais à l'ouverture d'un écran —
 * une application qui demande la position sans qu'on l'ait demandée est
 * refusée par Apple, et de toute façon on ne s'en sert que pour trier.
 *
 * Les codes d'erreur sont les mêmes que côté web pour que l'appelant n'ait
 * qu'un seul jeu de messages à écrire.
 */
async function positionNative(): Promise<Position> {
  let Location: typeof import('expo-location');
  try {
    Location = await import('expo-location');
  } catch {
    throw new GeoError('unsupported');
  }
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    // `canAskAgain === false` : iOS a mémorisé un refus et n'affichera plus
    // rien. Sans cette distinction, le pilote touchait un bouton qui ne
    // produisait AUCUN retour visible, et lisait un message lui demandant de
    // rouvrir l'accès « dans les réglages du site » — un texte de navigateur,
    // sur un téléphone.
    throw new GeoError(canAskAgain ? 'denied' : 'denied-reglages');
  }
  try {
    // Une position déjà connue évite de réveiller le GPS : à l'échelle du
    // kilomètre, celle d'il y a cinq minutes est exactement la même.
    const connue = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    if (connue) return { lat: connue.coords.latitude, lon: connue.coords.longitude };

    // GARDE-FOU DE DURÉE. `getCurrentPositionAsync` n'en a aucun, ni côté JS ni
    // côté Swift : il s'en remet entièrement au délai interne de CoreLocation.
    // Celui-ci rend la main dans l'immense majorité des cas — mais s'il ne le
    // fait pas, le bouton « Recherche de ta position… » reste figé POUR
    // TOUJOURS, sans sortie. Le web s'accorde 45 s explicites ; le natif
    // s'aligne, pour que les deux plateformes échouent de la même façon.
    const point = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise<never>((_, rejeter) =>
        setTimeout(() => rejeter(new GeoError('timeout')), DELAI_MS),
      ),
    ]);
    return { lat: point.coords.latitude, lon: point.coords.longitude };
  } catch (e) {
    // Le dépassement de délai garde son code : l'écraser en « indisponible »
    // ferait afficher « cherche par nom » là où « réessaie » est le bon
    // conseil.
    if (e instanceof GeoError) throw e;
    throw new GeoError('unavailable');
  }
}

/** Distance orthodromique en kilomètres (même formule que le serveur). */
export function kmBetween(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  // `Math.min(1, h)` : sans lui, une erreur d'arrondi sur deux points
  // confondus rend l'argument de asin() légèrement supérieur à 1 → NaN.
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Arrondi de la position AVANT tout usage — envoi au serveur comme calcul
 * local. Au centième de degré, soit environ un kilomètre.
 *
 * Il doit être appliqué des deux côtés : le serveur trie sur la position
 * arrondie, et si le client calculait la distance sur la position brute, le
 * même circuit s'annonçait « 1,1 km » dans « Autour de toi » et « 300 m »
 * après une recherche par nom.
 */
export function coarse(p: Position): Position {
  return { lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100 };
}

/** « 850 m », « 12 km », « 140 km » — jamais « 12,4718 km ». */
export function formatKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const metres = Math.round((km * 1000) / 50) * 50;
  // Sous 50 m, l'arrondi donnait « 0 m » — et à 980 m, « 1000 m » au lieu de
  // « 1,0 km ». Les deux bornes se voyaient à l'écran.
  if (metres < 50) return '< 50 m';
  if (metres < 1000) return `${metres} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}
