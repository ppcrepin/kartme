import { checklistMasqueeA, masquerChecklist, memoriserMode, modePrefere } from '@/lib/preferences';

/**
 * Le parseur des préférences locales.
 *
 * Ce qu'il lit vient du disque d'un navigateur : une valeur peut être vide,
 * tronquée, écrite par une version d'avant, ou bricolée à la main dans la
 * console. Et il est appelé depuis l'initialiseur d'un `useState` — une
 * exception ici ne dégrade pas, elle blanchit l'écran d'accueil.
 */
function faireStockage(depart: Record<string, string> = {}) {
  const donnees = new Map(Object.entries(depart));
  return {
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => void donnees.set(k, v),
    removeItem: (k: string) => void donnees.delete(k),
    clear: () => donnees.clear(),
    key: (i: number) => [...donnees.keys()][i] ?? null,
    get length() {
      return donnees.size;
    },
  } as unknown as Storage;
}

function poser(stockage: Storage | null) {
  Object.defineProperty(window, 'localStorage', { value: stockage, configurable: true });
}

describe('mode de saisie', () => {
  it('ouvre sur « toucher » par défaut', () => {
    poser(faireStockage());
    expect(modePrefere()).toBe('tap');
  });

  it('se souvient du glisser une fois choisi', () => {
    poser(faireStockage());
    memoriserMode('drag');
    expect(modePrefere()).toBe('drag');
  });

  it('retombe sur « toucher » si la lecture lève', () => {
    poser({
      getItem: () => {
        throw new Error('cookies tiers bloqués');
      },
    } as unknown as Storage);
    expect(modePrefere()).toBe('tap');
  });
});

describe('palier de masquage de la checklist', () => {
  it('vaut null quand rien n’a été masqué', () => {
    poser(faireStockage());
    expect(checklistMasqueeA()).toBeNull();
  });

  it('relit le palier écrit', () => {
    poser(faireStockage());
    masquerChecklist(1);
    expect(checklistMasqueeA()).toBe(1);
  });

  it.each([
    ['', 'une valeur vide — `Number("")` vaut 0, ce qui masquerait à tort'],
    ['abc', 'un texte'],
    ['-1', 'un négatif'],
    ['1.5', 'un décimal'],
  ])('rejette %p (%s)', (valeur) => {
    poser(faireStockage({ ks_checklist_masquee: valeur }));
    expect(checklistMasqueeA()).toBeNull();
  });

  it('borne une valeur trop grande au palier maximum', () => {
    // Sans plafond, « 999 » rendait la carte définitivement invisible sans
    // qu'aucun geste ne puisse la ramener.
    poser(faireStockage({ ks_checklist_masquee: '999' }));
    expect(checklistMasqueeA()).toBe(2);
  });

  it('ne lève JAMAIS, même si le stockage lève', () => {
    poser({
      getItem: () => {
        throw new Error('quota / iframe');
      },
    } as unknown as Storage);
    // Appelé depuis un initialiseur de `useState` : lever ici blanchirait
    // l'accueil au lieu de simplement afficher la carte.
    expect(() => checklistMasqueeA()).not.toThrow();
    expect(checklistMasqueeA()).toBeNull();
  });

  it('survit à l’absence totale de stockage (navigation privée stricte)', () => {
    poser(null);
    expect(checklistMasqueeA()).toBeNull();
    expect(() => masquerChecklist(0)).not.toThrow();
  });
});
