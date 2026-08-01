import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * L'écran de saisie du classement — le plus critique de l'app, et jusqu'ici le
 * seul sans un test navigateur.
 *
 * Deux corrections d'affilée y ont touché sans garde-fou : le geste de saisie
 * est devenu un choix explicite (retour de test réel : le glisser-déposer
 * n'était pas intuitif, et le mode « toucher » qui existait déjà se cachait
 * sous la liste), puis les pastilles ont dû remonter au-dessus du mode d'emploi
 * parce qu'elles fuyaient sous le doigt. Les deux se mesurent à l'écran ; sans
 * ce fichier, rien ne les empêche de régresser.
 */
const CIRCUIT = { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true };

const COURSE = {
  id: 'r1',
  admin_id: UID,
  circuit_id: 'c1',
  scheduled_at: new Date(Date.now() + 864e5).toISOString(),
  status: 'upcoming',
  invite_token: 'tok-1',
  completed_at: null,
  circuit: CIRCUIT,
};

const PILOTES = [
  { id: 'p1', profile_id: UID, ghost_id: null, profile: { username: 'Moi', elo: 1210, races: 6, avatar_path: null }, ghost: null },
  { id: 'p2', profile_id: 'u2', ghost_id: null, profile: { username: 'Sophie_K', elo: 1330, races: 9, avatar_path: null }, ghost: null },
  { id: 'p3', profile_id: 'u3', ghost_id: null, profile: { username: 'Kévin_R', elo: 1120, races: 3, avatar_path: null }, ghost: null },
];

test.use({ viewport: { width: 390, height: 844 } });

/** Ouvre l'écran et franchit l'étape « présents » pour atteindre l'ordre. */
async function ouvrirEtapeOrdre(page: import('@playwright/test').Page) {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': COURSE,
    'rest/v1/participations': PILOTES,
    'rest/v1/results': [],
  });
  await page.goto('/rank/r1');
  await page.getByText('Continuer', { exact: false }).first().click({ timeout: 20_000 });
  await expect(page.getByText('👆 Toucher', { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('le choix du geste est visible sans défiler, et « Toucher » est le défaut', async ({ page }) => {
  await ouvrirEtapeOrdre(page);

  // Le mode « toucher » existait déjà, mais on y accédait par un lien gris SOUS
  // la liste des pilotes — hors écran à six ou huit noms, au moment précis où
  // l'on galère. Il doit maintenant s'offrir d'emblée.
  // Par RÔLE : le texte n'est qu'un nœud à l'intérieur de la pastille, c'est
  // la pastille qui porte la zone tapable.
  const toucher = page.getByRole('radio', { name: '👆 Toucher' });
  const boite = await toucher.boundingBox();
  expect(boite && boite.y + boite.height <= 844).toBeTruthy();
  // 44 px : sous ce plancher on rate la pastille (`hitSlop` est inerte en web).
  expect(boite && boite.height >= 44).toBeTruthy();

  // Défaut « toucher » : un appui long que rien n'annonce ne s'invente pas.
  await expect(toucher).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: '✥ Glisser' })).toHaveAttribute('aria-checked', 'false');
});

test('changer de mode ne DÉPLACE pas les pastilles', async ({ page }) => {
  await ouvrirEtapeOrdre(page);

  // Le mode d'emploi du glisser tient sur deux lignes, celui du toucher sur
  // une : tant qu'il vivait au-dessus des pastilles, choisir un mode faisait
  // descendre le bouton qu'on venait de toucher.
  const y = async () => (await page.getByText('👆 Toucher', { exact: true }).boundingBox())?.y ?? -1;
  const depart = await y();
  for (const mode of ['✥ Glisser', '👆 Toucher', '✥ Glisser']) {
    await page.getByText(mode, { exact: true }).click();
    await page.waitForTimeout(200);
    expect(await y()).toBe(depart);
  }
});

test('en glisser, valider reste IMPOSSIBLE tant qu’aucun pilote n’a bougé', async ({ page }) => {
  await ouvrirEtapeOrdre(page);
  await page.getByText('✥ Glisser', { exact: true }).click();

  // La liste s'ouvre pré-remplie dans l'ordre des INSCRIPTIONS. Sans garde,
  // deux taps — « Glisser » puis « Valider » — enregistraient un classement
  // arbitraire qui déplace l'Elo de tout le monde. Le mode toucher, lui,
  // exigeait depuis toujours que tous les arrivants soient pointés.
  const valider = page.getByText('Valider le classement', { exact: true }).and(sceneActive(page));
  await expect(valider).toBeVisible();
  const bouton = page.getByRole('button', { name: 'Valider le classement' }).first();
  await expect(bouton).toBeDisabled();
  // Et le blocage s'EXPLIQUE : un bouton grisé sans un mot n'apprend rien.
  await expect(page.getByText(/Place les pilotes dans l’ordre d’arrivée/)).toBeVisible();
});

test('en toucher, valider s’ouvre quand tous les pilotes sont pointés', async ({ page }) => {
  await ouvrirEtapeOrdre(page);

  const bouton = page.getByRole('button', { name: 'Valider le classement' }).first();
  await expect(bouton).toBeDisabled();

  for (const nom of ['Sophie_K', 'Moi', 'Kévin_R']) {
    await page.getByText(nom, { exact: false }).and(sceneActive(page)).first().click();
  }
  await expect(bouton).toBeEnabled();
});
