import type { Circuit } from '@/lib/races';

import { setPickedCircuit, takePickedCircuit } from './circuit-pick';

const C: Circuit = { id: 'x', name: 'Kart', city: null, is_official: true, lat: 1, lon: 1 };

describe('circuit-pick', () => {
  afterEach(() => {
    jest.useRealTimers();
    takePickedCircuit(); // vide le dépôt entre les tests
  });

  it('rend le circuit déposé, une seule fois', () => {
    setPickedCircuit(C);
    expect(takePickedCircuit()?.id).toBe('x');
    expect(takePickedCircuit()).toBeNull();
  });

  it('expire un choix abandonné', () => {
    // Le fantôme redouté : un choix fait puis abandonné (départ sur un lien
    // profond) ressurgissait présélectionné dans une création sans rapport.
    jest.useFakeTimers({ now: 0 });
    setPickedCircuit(C);
    jest.setSystemTime(3 * 60_000);
    expect(takePickedCircuit()).toBeNull();
  });

  it('survit à l’aller-retour normal', () => {
    jest.useFakeTimers({ now: 0 });
    setPickedCircuit(C);
    jest.setSystemTime(30_000);
    expect(takePickedCircuit()?.id).toBe('x');
  });
});
