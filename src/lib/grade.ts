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
  monogram: string; // monogramme 2 lettres (stand-in avant l'icône définitive)
  min: number;
  max: number | null; // null = pas de plafond
  color: string;
}

/** Ordonné du plus bas au plus haut. Bornes contiguës, sans trou ni chevauchement. */
export const GRADES: Grade[] = [
  { key: 'kartambolage', name: 'Kartambolage', monogram: 'KA', min: 100, max: 699, color: gradeColors.kartambolage },
  { key: 'roueLibre', name: 'Roue Libre', monogram: 'RL', min: 700, max: 999, color: gradeColors.roueLibre },
  { key: 'rookie', name: 'Rookie', monogram: 'RK', min: 1000, max: 1299, color: gradeColors.rookie },
  { key: 'missile', name: 'Missile des Stands', monogram: 'MS', min: 1300, max: 1699, color: gradeColors.missile },
  { key: 'fusee', name: 'Fusée du Paddock', monogram: 'FP', min: 1700, max: 2099, color: gradeColors.fusee },
  { key: 'legende', name: 'Légende du Bitume', monogram: 'LB', min: 2100, max: null, color: gradeColors.legende },
];

/** Plancher d'Elo (cahier §5.1) : l'Elo ne descend jamais sous 100. */
export const ELO_FLOOR = 100;

/** Nombre de courses de calibration : en dessous, le K est doublé et l'app
 * affiche « En calibration » plutôt qu'un grade encore peu significatif. */
export const CALIBRATION_RACES = 5;

/** Vrai tant que le pilote n'a pas fini sa période de calibration. */
export function isCalibrating(races: number): boolean {
  return races < CALIBRATION_RACES;
}

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

export interface GradeProgress {
  current: Grade;
  /** null si déjà au grade le plus haut. */
  next: Grade | null;
  /** Avancement 0–1 dans le grade courant (1 si dernier grade). */
  progress: number;
  /** Points restants avant le grade suivant (0 si dernier grade). */
  remaining: number;
}

/** Position dans l'échelle des grades (pour la jauge du profil). */
export function gradeProgress(elo: number): GradeProgress {
  const current = gradeForElo(elo);
  const index = GRADES.findIndex((g) => g.key === current.key);
  const next = index < GRADES.length - 1 ? GRADES[index + 1] : null;
  if (!next) return { current, next: null, progress: 1, remaining: 0 };
  const clamped = Math.max(ELO_FLOOR, Math.round(elo));
  const span = next.min - current.min;
  return {
    current,
    next,
    progress: Math.min(1, Math.max(0, (clamped - current.min) / span)),
    remaining: Math.max(0, next.min - clamped),
  };
}
