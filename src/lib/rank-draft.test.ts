import { clearDraft, isMeaningful, loadDraft, saveDraft, type RankDraft } from '@/lib/rank-draft';

// Stockage local minimal : jest-expo ne fournit pas window.localStorage.
function installStorage() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

const RACE = 'race-1';
const IDS = ['p1', 'p2', 'p3'];

describe('brouillon de saisie (A10)', () => {
  beforeEach(() => {
    installStorage();
  });

  it('restitue un brouillon enregistré', () => {
    saveDraft(RACE, { step: 'order', mode: 'tap', absentIds: ['p3'], orderedIds: [], tapOrder: ['p1', 'p2'] });
    const d = loadDraft(RACE, IDS);
    expect(d?.step).toBe('order');
    expect(d?.mode).toBe('tap');
    expect(d?.tapOrder).toEqual(['p1', 'p2']);
    expect(d?.absentIds).toEqual(['p3']);
  });

  it('cloisonne par course', () => {
    saveDraft(RACE, { step: 'order', mode: 'drag', absentIds: [], orderedIds: IDS, tapOrder: [] });
    expect(loadDraft('race-2', IDS)).toBeNull();
  });

  // Le cas dangereux : la grille a changé (pilote retiré) → un ordre bâti sur
  // l'ancien plateau produirait un classement faux sans alerter personne.
  it('rejette un brouillon qui cite un pilote absent de la grille', () => {
    saveDraft(RACE, { step: 'order', mode: 'drag', absentIds: [], orderedIds: ['p1', 'p9'], tapOrder: [] });
    expect(loadDraft(RACE, IDS)).toBeNull();
    // …et se nettoie au passage.
    expect(loadDraft(RACE, [...IDS, 'p9'])).toBeNull();
  });

  it('expire au-delà de 24 h', () => {
    saveDraft(RACE, { step: 'order', mode: 'drag', absentIds: [], orderedIds: IDS, tapOrder: [] });
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
    expect(loadDraft(RACE, IDS)).toBeNull();
    spy.mockRestore();
  });

  it('efface sur demande', () => {
    saveDraft(RACE, { step: 'order', mode: 'drag', absentIds: [], orderedIds: IDS, tapOrder: [] });
    clearDraft(RACE);
    expect(loadDraft(RACE, IDS)).toBeNull();
  });

  it('ne propose pas de restaurer un brouillon vide', () => {
    const empty: RankDraft = {
      step: 'presents',
      mode: 'drag',
      absentIds: [],
      orderedIds: [],
      tapOrder: [],
      savedAt: Date.now(),
    };
    expect(isMeaningful(empty)).toBe(false);
    expect(isMeaningful({ ...empty, orderedIds: IDS })).toBe(true);
  });

  it('survit à l’absence de stockage (mode privé)', () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(() =>
      saveDraft(RACE, { step: 'order', mode: 'drag', absentIds: [], orderedIds: IDS, tapOrder: [] }),
    ).not.toThrow();
    expect(loadDraft(RACE, IDS)).toBeNull();
  });
});
