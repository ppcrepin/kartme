import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * L'écran de saisie du classement — le plus critique de l'app.
 *
 * Trois corrections d'affilée y ont touché. Le geste est d'abord devenu un
 * choix explicite (le glisser-déposer n'était pas intuitif, et le mode
 * « toucher » qui existait déjà se cachait sous la liste) ; puis les deux
 * pastilles ont dû remonter au-dessus du mode d'emploi parce qu'elles fuyaient
 * sous le doigt ; puis le PO a tranché l'inverse du défaut d'origine —
 * « glisser-déposer en premier, toucher en secours », et plus de grandes
 * pastilles à l'ouverture (2026-08-01).
 *
 * Ce qui a survécu aux trois : le secours reste ATTEIGNABLE sans défiler, et
 * rien ne bouge sous le doigt quand on change de geste. C'est ce que ce fichier
 * garde.
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

const VERS_TAP = '👆 Plutôt toucher les pilotes dans l’ordre';
const VERS_DRAG = '✥ Revenir au glisser-déposer';

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
  await expect(page.getByText(VERS_TAP, { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('on ouvre sur le GLISSER, et le toucher est un secours discret', async ({ page }) => {
  await ouvrirEtapeOrdre(page);

  // Le défaut a changé de sens : « glisser-déposer en premier, toucher en
  // secours ». Le mode d'emploi affiché est celui du glisser — ici sa variante
  // « rien n'a encore été bougé », qui occupe le même emplacement.
  await expect(page.getByText(/Place les pilotes dans l’ordre d’arrivée/).first()).toBeVisible();

  // Et les deux grandes pastilles ont disparu : elles demandaient de choisir
  // entre deux gestes avant même d'avoir vu la liste.
  await expect(page.getByRole('radio')).toHaveCount(0);

  // Le secours reste ATTEIGNABLE sans défiler — c'est le point qui avait
  // bloqué un testeur quand le lien vivait sous les pilotes.
  const lien = page.getByRole('button', { name: /Passer au mode toucher/ });
  const boite = await lien.boundingBox();
  expect(boite && boite.y + boite.height <= 844).toBeTruthy();
  // 44 px : sous ce plancher on rate le lien (`hitSlop` est inerte en web).
  expect(boite && boite.height >= 44).toBeTruthy();
});

test('le lien de secours bascule dans les deux sens, et se souvient', async ({ page }) => {
  await ouvrirEtapeOrdre(page);

  await page.getByText(VERS_TAP, { exact: true }).click();
  await expect(page.getByText(/Touche les pilotes dans l’ordre/).first()).toBeVisible();
  await expect(page.getByText(VERS_DRAG, { exact: true })).toBeVisible();

  await page.getByText(VERS_DRAG, { exact: true }).click();
  await expect(page.getByText(/Place les pilotes dans l’ordre d’arrivée/).first()).toBeVisible();

  // Le choix est mémorisé : on ne repose pas la question à quelqu'un qui a
  // tranché. On repasse au toucher, puis on recharge.
  await page.getByText(VERS_TAP, { exact: true }).click();
  await page.reload();
  // Le brouillon local peut reprendre l'écran DIRECTEMENT à l'étape de l'ordre
  // (il mémorise aussi le pas franchi) : on ne franchit l'étape « présents »
  // que si elle est encore là, sinon le clic expire pour une raison qui n'a
  // rien à voir avec ce qu'on teste.
  const continuer = page.getByText('Continuer', { exact: false }).first();
  if (await continuer.isVisible({ timeout: 20_000 }).catch(() => false)) await continuer.click();
  await expect(page.getByText(VERS_DRAG, { exact: true })).toBeVisible({ timeout: 20_000 });
});

// Écran COURT et liste LONGUE : c'est la seule combinaison qui révélait le
// défaut, et les tests précédents n'exerçaient que trois pilotes sur 844 px.
test.describe(() => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('à huit pilotes sur un petit écran, on arrive EN HAUT de l’étape ordre', async ({ page }) => {
    await sessionSimulee(page);
    await reseauSimule(page, {
      'rest/v1/races': COURSE,
      'rest/v1/participations': Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        profile_id: i === 0 ? UID : `u${i}`,
        ghost_id: null,
        profile: { username: i === 0 ? 'Moi' : `Pilote_${i}`, elo: 1000 + i * 10, races: 9, avatar_path: null },
        ghost: null,
      })),
      'rest/v1/results': [],
    });
    await page.goto('/rank/r1');

    // On DÉFILE pour atteindre « Continuer », comme n'importe qui le ferait à
    // huit pilotes sur 568 px de haut.
    const continuer = page.getByText('Continuer', { exact: false }).first();
    await continuer.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await continuer.click();

    // Cette position de défilement était REPORTÉE sur l'étape suivante : on
    // atterrissait au milieu de la liste, sans titre, sans mode d'emploi, et
    // avec le lien de secours jusqu'à 180 px AU-DESSUS du bord de l'écran.
    // C'est le défaut qui avait bloqué un testeur en juillet, revenu par la
    // porte du défilement.
    const lien = page.getByRole('button', { name: /Passer au mode toucher/ });
    await expect(lien).toBeVisible({ timeout: 20_000 });
    const boite = await lien.boundingBox();
    expect(boite && boite.y >= 0).toBeTruthy();
    expect(boite && boite.y + boite.height <= 568).toBeTruthy();
    // Et le titre de l'étape est là, lui aussi : c'est lui qui dit où l'on est.
    await expect(page.getByText('Ordre d’arrivée', { exact: true }).first()).toBeVisible();
  });
});

test('changer de geste ne DÉPLACE pas le lien qu’on vient de toucher', async ({ page }) => {
  await ouvrirEtapeOrdre(page);

  // Le mode d'emploi du glisser tient sur deux lignes, celui du toucher sur
  // une. Le PO l'avait relevé sur les anciennes pastilles — « ça décale vers le
  // bas » — et remettre le sélecteur SOUS le mode d'emploi ramenait le défaut
  // tel quel. Un plancher de hauteur sur le mode d'emploi le neutralise.
  const y = async () =>
    (await page.getByRole('button', { name: /mode toucher|mode glisser/ }).boundingBox())?.y ?? -1;
  const depart = await y();
  for (const lien of [VERS_TAP, VERS_DRAG, VERS_TAP]) {
    await page.getByText(lien, { exact: true }).click();
    await page.waitForTimeout(200);
    expect(await y()).toBe(depart);
  }
});

test('en glisser, valider reste IMPOSSIBLE tant qu’aucun pilote n’a bougé', async ({ page }) => {
  await ouvrirEtapeOrdre(page);

  // La liste s'ouvre pré-remplie dans l'ordre des INSCRIPTIONS. Sans garde, un
  // seul tap sur « Valider » enregistrait un classement arbitraire qui déplace
  // l'Elo de tout le monde — et c'est désormais le mode par DÉFAUT, donc le
  // chemin que tout le monde emprunte.
  const valider = page.getByText('Valider le classement', { exact: true }).and(sceneActive(page));
  await expect(valider).toBeVisible();
  const bouton = page.getByRole('button', { name: 'Valider le classement' }).first();
  await expect(bouton).toBeDisabled();
  // Et le blocage s'EXPLIQUE : un bouton grisé sans un mot n'apprend rien.
  await expect(page.getByText(/Place les pilotes dans l’ordre d’arrivée/)).toBeVisible();
});

test('en toucher, valider s’ouvre quand tous les pilotes sont pointés', async ({ page }) => {
  await ouvrirEtapeOrdre(page);
  await page.getByText(VERS_TAP, { exact: true }).click();

  const bouton = page.getByRole('button', { name: 'Valider le classement' }).first();
  await expect(bouton).toBeDisabled();

  for (const nom of ['Sophie_K', 'Moi', 'Kévin_R']) {
    await page.getByText(nom, { exact: false }).and(sceneActive(page)).first().click();
  }
  await expect(bouton).toBeEnabled();
});
