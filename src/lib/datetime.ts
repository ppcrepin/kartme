/** Utilitaires de date/heure (formatage FR, sans dépendance Intl). */

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateInput(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Libellé court : « ven. 18 juil. · 20:00 ». */
export function formatRaceDate(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Jour SEUL : « 14 juil. 2026 ». Pour ce qui s'est produit un jour donné sans
 * qu'on ait rendez-vous — un badge décroché. `formatRaceDate` y ajoutait une
 * heure (« mar. 14 juil. · 10:00 ») qui n'apprend rien et se lit mal suivie
 * d'un point final.
 */
export function formatJour(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Pour le médaillon calendrier (jour + mois court). */
export function dayAndMonth(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  return { day: String(d.getDate()), month: MONTHS[d.getMonth()].replace('.', '') };
}

/** Parse « JJ/MM/AAAA » + « HH:MM » → Date, ou null si invalide. */
export function parseDateTime(dateStr: string, timeStr: string): Date | null {
  const dm = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const tm = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const [, dd, mm, yyyy] = dm;
  const [, hh, min] = tm;
  const day = +dd, month = +mm - 1, year = +yyyy, hour = +hh, minute = +min;
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const d = new Date(year, month, day, hour, minute, 0, 0);
  // Vérifie la cohérence (ex. 31/02 rejeté).
  if (d.getDate() !== day || d.getMonth() !== month) return null;
  return d;
}

/** Défaut proposé à la création : aujourd'hui, prochaine heure ronde. */
export function defaultRaceDate(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}
