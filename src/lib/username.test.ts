import { validateUsername } from './username';

describe('validateUsername', () => {
  it('accepte un pseudo valide', () => {
    expect(validateUsername('Max Verstappen'.slice(0, 20))).toMatchObject({ ok: true });
    expect(validateUsername('Kmax')).toEqual({ ok: true, value: 'Kmax' });
  });

  it('retire les espaces de bord', () => {
    expect(validateUsername('  Léo  ')).toEqual({ ok: true, value: 'Léo' });
  });

  it('rejette trop court / vide', () => {
    expect(validateUsername('')).toMatchObject({ ok: false, error: 'empty' });
    expect(validateUsername('ab')).toMatchObject({ ok: false, error: 'too_short' });
  });

  it('rejette trop long (> 20)', () => {
    expect(validateUsername('a'.repeat(21))).toMatchObject({ ok: false, error: 'too_long' });
  });

  it('rejette les mots interdits, y compris avec accents/séparateurs', () => {
    expect(validateUsername('connard')).toMatchObject({ ok: false, error: 'banned' });
    expect(validateUsername('Cönnard')).toMatchObject({ ok: false, error: 'banned' });
    expect(validateUsername('c o n n a r d')).toMatchObject({ ok: false, error: 'banned' });
  });

  it('n’exige pas l’unicité (deux fois le même pseudo passent)', () => {
    expect(validateUsername('Pilote').ok).toBe(true);
    expect(validateUsername('Pilote').ok).toBe(true);
  });
});
