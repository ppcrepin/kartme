import { kmBetween } from '@/lib/geo';
import type { Circuit } from '@/lib/races';

/**
 * QUELLES épingles poser sur la carte native, et le test « ce point est-il
 * encore dans le cadre ? ».
 *
 * Extrait du composant pour une seule raison : c'est la seule partie de la
 * carte native qu'on peut PROUVER sans appareil. Le reste (le rendu, les
 * animations) ne se juge qu'au premier build ; ceci se juge tout de suite.
 */

/** Le cadre visible, dans les termes de `react-native-maps`. */
export interface Cadre {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Combien d'épingles au maximum. Le web en pose 277 sans broncher (des `div`),
 * le natif crée une vue par marqueur : au-delà de quelques centaines, le
 * défilement saccade sur un iPhone d'entrée de gamme.
 */
export const MAX_EPINGLES = 150;

/** Un point est-il dans le cadre ? `marge` le rétrécit (0,35 = 35 % de moins). */
export function dansLeCadre(
  point: { lat: number; lon: number },
  cadre: Cadre,
  marge = 0,
): boolean {
  return (
    Math.abs(point.lat - cadre.latitude) < (cadre.latitudeDelta / 2) * (1 - marge) &&
    Math.abs(point.lon - cadre.longitude) < (cadre.longitudeDelta / 2) * (1 - marge)
  );
}

/**
 * Les épingles à poser : celles qui sont DANS LE CADRE d'abord, puis les plus
 * proches du centre si elles sont encore trop nombreuses.
 *
 * L'ordre compte, et c'est tout l'objet de cette fonction. Une première
 * version prenait directement « les 150 plus proches du centre » — ce qui
 * découpe un DISQUE dans un cadre RECTANGULAIRE. À l'ouverture, la carte
 * montre la France entière et il y a 277 circuits : le plafond mordait
 * immédiatement, et la Bretagne comme la Côte d'Azur perdaient leurs épingles
 * alors qu'elles étaient à l'écran. Le pilote lisait « 277 circuits », n'en
 * voyait aucun chez lui, et le trouvait pourtant par la recherche.
 *
 * Le circuit SÉLECTIONNÉ est toujours conservé, et placé en DERNIER : les
 * marqueurs se dessinent dans l'ordre, donc il passe au-dessus de ses voisins
 * — sans quoi on pourrait le désigner et ne pas le voir.
 */
export function epinglesVisibles(
  circuits: Circuit[],
  cadre: Cadre,
  selectedId: string | null,
  max = MAX_EPINGLES,
): Circuit[] {
  const situes = circuits.filter((c) => c.lat !== null && c.lon !== null);
  const centre = { lat: cadre.latitude, lon: cadre.longitude };

  // 1. Le cadre. Un circuit hors écran n'a aucune raison d'occuper une place.
  let retenus = situes.filter((c) => dansLeCadre({ lat: c.lat!, lon: c.lon! }, cadre));
  // Cadre vide (on a dézoomé sur l'océan, ou la vue n'est pas encore posée) :
  // on retombe sur l'ensemble plutôt que de rendre une carte vierge.
  if (retenus.length === 0) retenus = situes;

  // 2. Le plafond, seulement s'il mord — et alors par proximité du centre,
  // c'est-à-dire de ce qu'on regarde.
  if (retenus.length > max) {
    retenus = [...retenus]
      .sort(
        (a, b) =>
          kmBetween(centre, { lat: a.lat!, lon: a.lon! }) -
          kmBetween(centre, { lat: b.lat!, lon: b.lon! }),
      )
      .slice(0, max);
  }

  // 3. La sélection, toujours, et par-dessus.
  if (selectedId) {
    const sansElle = retenus.filter((c) => c.id !== selectedId);
    const choisi = situes.find((c) => c.id === selectedId);
    if (choisi) return [...sansElle, choisi];
  }
  return retenus;
}
