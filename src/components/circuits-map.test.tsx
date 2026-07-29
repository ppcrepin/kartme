/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import TestRenderer from 'react-test-renderer';

import type { Circuit } from '@/lib/races';

// Faux Leaflet : on ne teste pas la bibliothèque, on teste QUAND on l'appelle.
// Préfixe `mock` : seul moyen pour Jest d'autoriser une référence externe
// depuis la fabrique de `jest.mock`, qui est hissée en haut du fichier.
const mockMarqueurs: any[] = [];
const mockCouche: any = { addTo: jest.fn(() => mockCouche), clearLayers: jest.fn() };
const mockCarte: any = {
  setView: jest.fn(() => mockCarte),
  invalidateSize: jest.fn(),
  remove: jest.fn(),
};

jest.mock(
  'leaflet',
  () => ({
    map: jest.fn(() => mockCarte),
    tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
    layerGroup: jest.fn(() => mockCouche),
    divIcon: jest.fn((o: any) => o),
    marker: jest.fn(() => {
      const m: any = {
        on: jest.fn(),
        getElement: () => ({ firstChild: { classList: { toggle: jest.fn() } } }),
      };
      m.addTo = jest.fn(() => m);
      mockMarqueurs.push(m);
      return m;
    }),
  }),
  { virtual: true },
);
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });

const CIRCUITS: Circuit[] = [
  { id: 'a', name: 'Kart Paris', city: 'Paris', is_official: true, lat: 48.85, lon: 2.35 },
  { id: 'b', name: 'Kart Lyon', city: 'Lyon', is_official: true, lat: 45.76, lon: 4.83 },
  // Un circuit sans coordonnées ne doit pas produire de marqueur fantôme.
  { id: 'c', name: 'Sans adresse', city: null, is_official: true, lat: null, lon: null },
];

describe('CircuitsMap', () => {
  beforeEach(() => {
    mockMarqueurs.length = 0;
    jest.clearAllMocks();
  });

  it('pose les marqueurs DÈS le premier affichage', async () => {
    // Le défaut que ce test existe pour empêcher : Leaflet est chargé après un
    // `await`, donc l'effet des marqueurs s'exécutait avant que la
    // bibliothèque soit là, sortait, et n'était jamais relancé — la carte
    // restait vide jusqu'à ce que l'utilisateur touche la liste.
    const { CircuitsMap } = await import('./circuits-map.web');
    let arbre: TestRenderer.ReactTestRenderer;
    await act(async () => {
      arbre = TestRenderer.create(
        <CircuitsMap circuits={CIRCUITS} me={null} selectedId={null} onSelect={() => {}} />,
      );
    });
    expect(mockMarqueurs).toHaveLength(2); // les deux géolocalisés, pas le troisième
    await act(async () => arbre!.unmount());
  });

  it('ne recrée PAS les marqueurs quand la sélection change', async () => {
    const { CircuitsMap } = await import('./circuits-map.web');
    let arbre: TestRenderer.ReactTestRenderer;
    await act(async () => {
      arbre = TestRenderer.create(
        <CircuitsMap circuits={CIRCUITS} me={null} selectedId={null} onSelect={() => {}} />,
      );
    });
    const apresMontage = mockMarqueurs.length;
    await act(async () => {
      arbre!.update(
        <CircuitsMap circuits={CIRCUITS} me={null} selectedId="a" onSelect={() => {}} />,
      );
    });
    // 251 icônes détruites et reconstruites pour mettre UN point en évidence
    // faisaient clignoter toute la carte.
    expect(mockMarqueurs).toHaveLength(apresMontage);
    await act(async () => arbre!.unmount());
  });

  it('repose les marqueurs après un démontage/remontage', async () => {
    // Le nettoyage ne remettait à zéro que la carte : au remontage, le groupe
    // de calques pointait sur une carte détruite et avalait les marqueurs.
    const { CircuitsMap } = await import('./circuits-map.web');
    let arbre: TestRenderer.ReactTestRenderer;
    await act(async () => {
      arbre = TestRenderer.create(
        <CircuitsMap circuits={CIRCUITS} me={null} selectedId={null} onSelect={() => {}} />,
      );
    });
    await act(async () => arbre!.unmount());
    mockMarqueurs.length = 0;
    await act(async () => {
      arbre = TestRenderer.create(
        <CircuitsMap circuits={CIRCUITS} me={null} selectedId={null} onSelect={() => {}} />,
      );
    });
    expect(mockMarqueurs).toHaveLength(2);
    await act(async () => arbre!.unmount());
  });

  it('recentre sur le pilote même si sa position arrive avant Leaflet', async () => {
    const { CircuitsMap } = await import('./circuits-map.web');
    let arbre: TestRenderer.ReactTestRenderer;
    await act(async () => {
      arbre = TestRenderer.create(
        <CircuitsMap
          circuits={CIRCUITS}
          me={{ lat: 43.6, lon: 1.44 }}
          selectedId={null}
          onSelect={() => {}}
        />,
      );
    });
    expect(mockCarte.setView).toHaveBeenCalledWith([43.6, 1.44], 10);
    await act(async () => arbre!.unmount());
  });
});
