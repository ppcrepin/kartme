import { coarse, formatKm, kmBetween } from './geo';

describe('kmBetween', () => {
  it('retrouve une distance connue (Paris–Lyon ≈ 392 km)', () => {
    const d = kmBetween({ lat: 48.8566, lon: 2.3522 }, { lat: 45.764, lon: 4.8357 });
    expect(d).toBeGreaterThan(384);
    expect(d).toBeLessThan(400);
  });

  it("rend 0 sur deux points confondus, et pas NaN", () => {
    // Le cas du pilote debout sur le parking du karting : sans le garde
    // Math.min(1, h), l'arrondi pousse l'argument de asin() au-dessus de 1.
    const d = kmBetween({ lat: 48.8566, lon: 2.3522 }, { lat: 48.8566, lon: 2.3522 });
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeCloseTo(0, 6);
  });

  it('est symétrique', () => {
    const a = { lat: 43.6047, lon: 1.4442 };
    const b = { lat: 47.2184, lon: -1.5536 };
    expect(kmBetween(a, b)).toBeCloseTo(kmBetween(b, a), 9);
  });

  it("donne la même distance que la formule du serveur", () => {
    // Même repère que le test SQL (97_circuits_geo_test) : si les deux
    // formules divergeaient, la distance affichée contredirait le tri reçu.
    const d = kmBetween({ lat: 48.8566, lon: 2.3522 }, { lat: 48.8014, lon: 2.1301 });
    expect(d).toBeGreaterThan(16);
    expect(d).toBeLessThan(19);
  });
});

describe('coarse', () => {
  it('arrondit au centième de degré', () => {
    expect(coarse({ lat: 48.85661234, lon: 2.35224567 })).toEqual({ lat: 48.86, lon: 2.35 });
  });

  it('est idempotent — client et serveur partent du MÊME point', () => {
    // Le serveur trie sur la position arrondie ; si le client gardait la
    // position brute pour calculer ses distances, le même circuit s'annonçait
    // « 1,1 km » dans « Autour de toi » et « 300 m » après une recherche.
    const p = coarse({ lat: 43.60471, lon: 1.44421 });
    expect(coarse(p)).toEqual(p);
  });
});

describe('formatKm', () => {
  it('passe en mètres sous le kilomètre', () => {
    expect(formatKm(0.42)).toBe('400 m');
    expect(formatKm(0.06)).toBe('50 m');
  });

  it('garde une décimale jusqu’à 10 km, puis arrondit', () => {
    expect(formatKm(2.34)).toBe('2,3 km');
    expect(formatKm(12.4718)).toBe('12 km');
    expect(formatKm(149.6)).toBe('150 km');
  });

  it('gère les deux bornes qui se voyaient à l’écran', () => {
    // 980 m s'affichait « 1000 m » au lieu de « 1,0 km », et 10 m « 0 m ».
    expect(formatKm(0.98)).toBe('1,0 km');
    expect(formatKm(0.01)).toBe('< 50 m');
    expect(formatKm(0.999)).toBe('1,0 km');
  });

  it('ne rend rien pour une valeur absurde', () => {
    expect(formatKm(NaN)).toBe('');
    expect(formatKm(-3)).toBe('');
  });
});
