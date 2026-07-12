/**
 * Mapping Elo → grade (cf. cahier des charges §5.4).
 * 6 paliers, bornes régulières sur l'échelle 100–2500, Elo de départ = 1000.
 * La logique de calcul de l'Elo lui-même arrive au lot 1.3.
 */
import { gradeColors } from '@/constants/theme';

export type GradeKey =
  | 'kartambolage'
  | 'roueLibre'
  | 'rookie'
  | 'missile'
  | 'fusee'
  | 'legende';

export interface Grade {
  key: GradeKey;
  name: string;
  min: number;
  max: number | null; // null = pas de plafond
  color: string;
}

/** Ordonné du plus bas au plus haut. Bornes contiguës, sans trou ni chevauchement. */
export const GRADES: Grade[] = [
  { key: 'kartambolage', name: 'Kartambolage', min: 100, max: 699, color: gradeColors.kartambolage },
  { key: 'roueLibre', name: 'Roue Libre', min: 700, max: 999, color: gradeColors.roueLibre },
  { key: 'rookie', name: 'Rookie', min: 1000, max: 1299, color: gradeColors.rookie },
  { key: 'missile', name: 'Missile des Stands', min: 1300, max: 1699, color: gradeColors.missile },
  { key: 'fusee', name: 'Fusée du Paddock', min: 1700, max: 2099, color: gradeColors.fusee },
  { key: 'legende', name: 'Légende du Bitume', min: 2100, max: null, color: gradeColors.legende },
];

/** Plancher d'Elo (cahier §5.1) : l'Elo ne descend jamais sous 100. */
export const ELO_FLOOR = 100;

/** Renvoie le grade correspondant à un Elo donné. */
export function gradeForElo(elo: number): Grade {
  const clamped = Math.max(ELO_FLOOR, Math.round(elo));
  for (const g of GRADES) {
    if (clamped >= g.min && (g.max === null || clamped <= g.max)) {
      return g;
    }
  }
  // Au-dessus de la dernière borne : Légende.
  return GRADES[GRADES.length - 1];
}
