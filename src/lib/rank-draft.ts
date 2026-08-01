/**
 * Brouillon local de la saisie de classement (A10).
 *
 * Au circuit, le réseau est mauvais : on ordonne huit pilotes au glisser-déposer,
 * on valide, ça échoue — et un rechargement de page efface tout. Le brouillon
 * survit dans le stockage local et se restaure au retour sur l'écran.
 *
 * Purement local et jetable : aucune donnée personnelle (des identifiants de
 * participation), effacé dès que le classement part en base.
 */
const PREFIX = 'ks_rank_draft:';
/** Au-delà, le brouillon est probablement un vestige d'une autre soirée. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface RankDraft {
  step: 'presents' | 'order';
  mode: 'drag' | 'tap';
  absentIds: string[];
  orderedIds: string[];
  tapOrder: string[];
  /** Abandons (A6) — absent des brouillons écrits avant cette version. */
  dnfIds?: string[];
  /**
   * Vrai si `orderedIds` est un ordre VOULU (glissé à la main, ou reporté d'une
   * saisie au toucher) et non le simple ordre d'inscription des pilotes.
   * Sans lui, un brouillon repris rouvrirait la validation sur un classement
   * que personne n'a établi. Absent des brouillons antérieurs : traité comme
   * faux, ce qui redemande un geste — le sens sûr.
   */
  ordreEtabli?: boolean;
  savedAt: number;
}

function key(raceId: string): string {
  return `${PREFIX}${raceId}`;
}

export function saveDraft(raceId: string, draft: Omit<RankDraft, 'savedAt'>): void {
  try {
    window?.localStorage?.setItem(key(raceId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Pas de stockage (mode privé, quota) : la saisie marche quand même, sans filet.
  }
}

/**
 * Relit le brouillon, et le REJETTE s'il ne correspond plus à la grille
 * (pilote ajouté ou retiré entre-temps) : restaurer un ordre bâti sur un autre
 * plateau produirait un classement faux sans que personne le remarque.
 */
export function loadDraft(raceId: string, currentIds: string[]): RankDraft | null {
  try {
    const raw = window?.localStorage?.getItem(key(raceId));
    if (!raw) return null;
    const d = JSON.parse(raw) as RankDraft;
    if (typeof d?.savedAt !== 'number' || Date.now() - d.savedAt > MAX_AGE_MS) {
      clearDraft(raceId);
      return null;
    }
    const known = new Set(currentIds);
    const cited = [
      ...(d.absentIds ?? []), ...(d.orderedIds ?? []),
      ...(d.tapOrder ?? []), ...(d.dnfIds ?? []),
    ];
    if (cited.some((pid) => !known.has(pid))) {
      clearDraft(raceId);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function clearDraft(raceId: string): void {
  try {
    window?.localStorage?.removeItem(key(raceId));
  } catch {
    /* rien à nettoyer */
  }
}

/** Un brouillon vaut la peine d'être restauré s'il contient un début d'ordre. */
export function isMeaningful(d: RankDraft): boolean {
  return (
    d.orderedIds.length > 0 ||
    d.tapOrder.length > 0 ||
    d.absentIds.length > 0 ||
    (d.dnfIds?.length ?? 0) > 0
  );
}
