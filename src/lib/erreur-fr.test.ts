import { messageFr } from './erreur-fr';

const REPLI = 'Impossible de charger le tableau de bord.';

/**
 * L'app est exclusivement française. L'audit navigateur a trouvé
 * « permission denied for function get_metrics » affiché mot pour mot dans un
 * bandeau rouge du tableau de bord, qui n'avait aucun filtre — pendant que
 * deux autres écrans en avaient chacun un, avec des listes de motifs
 * différentes.
 */
describe('messageFr', () => {
  it('laisse passer nos exceptions MÉTIER, déjà rédigées en français', () => {
    // Elles disent précisément ce qui bloque : les remplacer par un message
    // générique serait une perte d'information pour le pilote.
    expect(messageFr(new Error('Ce pilote n’est plus joignable.'), REPLI)).toBe(
      'Ce pilote n’est plus joignable.',
    );
    expect(messageFr(new Error('Trop d’ajouts d’un coup. Réessaie dans un moment.'), REPLI)).toBe(
      'Trop d’ajouts d’un coup. Réessaie dans un moment.',
    );
    expect(messageFr(new Error('Cette invitation n’est plus valable.'), REPLI)).toBe(
      'Cette invitation n’est plus valable.',
    );
  });

  it('remplace les refus techniques de Postgres et PostgREST', () => {
    for (const brut of [
      'permission denied for function get_metrics',
      'permission denied for table results',
      'new row violates row-level security policy for table "friendships"',
      'duplicate key value violates unique constraint "circuits_ident_uniq"',
      'invalid input syntax for type uuid: "aaaa1111-2222"',
      'Failed to fetch races',
      'JWT expired',
    ]) {
      expect(messageFr(new Error(brut), REPLI)).toBe(REPLI);
    }
  });

  it('remplace aussi un message anglais NON prévu par la liste', () => {
    // Seconde barrière : sans elle, chaque nouveau message de la bibliothèque
    // cliente s'afficherait en anglais jusqu'à ce qu'on l'ajoute à la main.
    expect(messageFr(new Error('Something went terribly wrong upstream'), REPLI)).toBe(REPLI);
    expect(messageFr(new Error('Network request timed out'), REPLI)).toBe(REPLI);
  });

  it('reconnaît le français par ses accents OU par ses mots-outils', () => {
    // Sans accent mais indiscutablement français.
    expect(messageFr(new Error('Tu ne peux pas ajouter ce pilote.'), REPLI)).toBe(
      'Tu ne peux pas ajouter ce pilote.',
    );
  });

  it('sert le repli quand il n’y a rien à afficher', () => {
    expect(messageFr(new Error(''), REPLI)).toBe(REPLI);
    expect(messageFr(new Error('   '), REPLI)).toBe(REPLI);
    expect(messageFr(null, REPLI)).toBe(REPLI);
    expect(messageFr(undefined, REPLI)).toBe(REPLI);
    expect(messageFr('une chaîne, pas une Error', REPLI)).toBe(REPLI);
  });
});
