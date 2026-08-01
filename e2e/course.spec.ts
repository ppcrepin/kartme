import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * L'écran de course refondu (A17) : barre d'action fixe, feuille d'ajout,
 * vues segmentées. C'était le plus gros trou de couverture du dépôt — la
 * revue adversariale l'a exigé, et l'audit y a trouvé un écran qui plantait
 * entièrement sur web (useAnimatedValue absent de react-native-web) parce
 * qu'AUCUN test ne l'ouvrait.
 */
const CIRCUIT = { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true };

const raceAVenir = (admin: string) => ({
  id: 'r1',
  admin_id: admin,
  circuit_id: 'c1',
  scheduled_at: new Date(Date.now() + 3 * 864e5).toISOString(),
  status: 'upcoming',
  invite_token: 'tok-1',
  completed_at: null,
  circuit: CIRCUIT,
});

const PARTICIPANTS = [
  { id: 'p1', profile_id: UID, ghost_id: null, profile: { username: 'Moi', elo: 1210, races: 6, avatar_path: null }, ghost: null },
  { id: 'p2', profile_id: 'u2', ghost_id: null, profile: { username: 'Sophie_K', elo: 1330, races: 9, avatar_path: null }, ghost: null },
  { id: 'p3', profile_id: null, ghost_id: 'g1', profile: null, ghost: { display_name: 'Tonton Gégé', elo: 1000 } },
];

const RESULTATS = [
  { participation_id: 'p2', position: 1, elo_before: 1314, elo_after: 1330, elo_delta: 16, best_lap_ms: 46012, dnf: false, participation: { profile_id: 'u2', profile: { username: 'Sophie_K', avatar_path: null }, ghost: null } },
  { participation_id: 'p1', position: 2, elo_before: 1198, elo_after: 1210, elo_delta: 12, best_lap_ms: 47312, dnf: false, participation: { profile_id: UID, profile: { username: 'Moi', avatar_path: null }, ghost: null } },
  { participation_id: 'p3', position: 3, elo_before: 1000, elo_after: 1000, elo_delta: 0, best_lap_ms: null, dnf: false, participation: { profile_id: null, profile: null, ghost: { display_name: 'Tonton Gégé' } } },
];

test.use({ viewport: { width: 390, height: 844 } });

test('course à venir (admin) : barre fixe visible d’entrée, feuille d’ajout, menu ⋯', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': raceAVenir(UID),
    'rest/v1/participations': PARTICIPANTS,
    'rest/v1/results': [],
  });
  await page.goto('/race/r1');
  await expect(page.getByText('Sologne Karting', { exact: true }).and(sceneActive(page))).toBeVisible({
    timeout: 20_000,
  });

  // La promesse centrale de la refonte : « Saisir le classement » est visible
  // SANS défiler, quelle que soit la longueur de la grille.
  const cta = page.getByText('Saisir le classement', { exact: true });
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box && box.y + box.height <= 844).toBeTruthy();

  // L'invité est marqué, jamais assimilé à un inscrit.
  await expect(page.getByText('Invité · hors classement', { exact: true })).toBeVisible();

  // La feuille d'ajout : UN champ, ouverte du « + Ajouter », fermée au voile.
  await page.getByText('+ Ajouter', { exact: true }).click();
  await expect(page.getByText('Qui court ?', { exact: true })).toBeVisible();
  await page.getByLabel('Fermer').first().click();
  await expect(page.getByText('Qui court ?', { exact: true })).toHaveCount(0);

  // Le menu ⋯ : Modifier + suppression EN DEUX TEMPS, et la confirmation ne
  // survit pas à une fermeture au voile (revue adversariale).
  await page.getByLabel('Options').click();
  await expect(page.getByText('Modifier', { exact: true })).toBeVisible();
  await page.getByText('Supprimer la course', { exact: true }).click();
  await expect(page.getByText(/C.est définitif/)).toBeVisible();
  await page.getByLabel('Fermer').first().click();
  await page.getByLabel('Options').click();
  await expect(page.getByText(/C.est définitif/)).toHaveCount(0);
});

/**
 * Le champ unique d'ajout (retour de test réel du 2026-08-01).
 *
 * L'écran d'avant empilait trois champs — amis, pseudo, invité — et la personne
 * testée s'est arrêtée là : il fallait deviner la catégorie d'un nom avant de
 * pouvoir le taper. Ce test tient les trois promesses de la refonte, dans
 * l'ordre où on les rencontre : champ vide = mes amis ; je tape = ça filtre ;
 * rien ne correspond = on propose l'invité, en disant ce qu'il coûte.
 */
test('feuille d’ajout : un seul champ qui suggère (amis, filtre, invité)', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': raceAVenir(UID),
    'rest/v1/participations': PARTICIPANTS,
    'rest/v1/results': [],
    // Deux amis : Sophie est DÉJÀ sur la grille, Kévin non.
    'rest/v1/friendships': [
      { id: 'f1', requester_id: UID, addressee_id: 'u2', status: 'accepted',
        requester: { username: 'Moi', elo: 1210, avatar_path: null },
        addressee: { username: 'Sophie_K', elo: 1330, avatar_path: null } },
      { id: 'f2', requester_id: 'u3', addressee_id: UID, status: 'accepted',
        requester: { username: 'Kévin_R', elo: 1120, avatar_path: null },
        addressee: { username: 'Moi', elo: 1210, avatar_path: null } },
    ],
  });
  await page.goto('/race/r1');
  await expect(page.getByText('Sologne Karting', { exact: true }).and(sceneActive(page))).toBeVisible({
    timeout: 20_000,
  });

  await page.getByText('+ Ajouter', { exact: true }).click();

  // 1. Champ VIDE : les amis absents de la grille sont déjà proposés — le cas
  //    des neuf dixièmes des courses se règle sans taper un caractère. Sophie,
  //    elle, n'est pas reproposée : elle court déjà.
  await expect(page.getByText('+ Kévin_R', { exact: true })).toBeVisible();
  await expect(page.getByText('+ Sophie_K', { exact: true })).toHaveCount(0);

  // 2. La saisie filtre les amis SANS accent ni casse : personne ne tape
  //    « Kévin » avec l'accent dans un champ de recherche.
  await page.getByLabel('Qui court ?').fill('kev');
  await expect(page.getByText('+ Kévin_R', { exact: true })).toBeVisible();

  // 2bis. À UN caractère, aucune ligne « invité » : on ne peut pas encore
  //       chercher, donc la proposer reviendrait à créer un fantôme nommé « a »
  //       en pleine frappe — pile sous le pouce qui vise les pastilles.
  await page.getByLabel('Qui court ?').fill('a');
  await expect(page.getByText(/comme invité/)).toHaveCount(0);

  // 3. Aucun inscrit sous ce nom : la dernière ligne propose l'invité, et
  //    annonce sur la ligne même qu'il ne rapporte aucun point.
  await page.getByLabel('Qui court ?').fill('Tonton Robert');
  const invite = page.getByLabel('➕ Ajouter « Tonton Robert » comme invité');
  await expect(invite).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Hors classement Elo/)).toBeVisible();
  // Et la zone tapable tient le plancher de 44 px : une ligne de 32 px se rate
  // au pouce, et la rater ici veut dire ajouter le mauvais pilote.
  const boite = await invite.boundingBox();
  expect(boite && boite.height >= 44).toBeTruthy();
});

test('course à venir (non-admin, non inscrit) : « Rejoindre » en barre fixe, pas de commandes d’admin', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': raceAVenir('u2'),
    'rest/v1/participations': PARTICIPANTS.filter((p) => p.id !== 'p1'),
    'rest/v1/results': [],
  });
  await page.goto('/race/r1');
  await expect(page.getByText('Rejoindre la course', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('+ Ajouter', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Options')).toHaveCount(0);
});

test('course terminée : trois vues segmentées, « Toi : … » en sous-titre, revanche en barre fixe', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': {
      ...raceAVenir(UID),
      status: 'completed',
      scheduled_at: new Date(Date.now() - 2 * 864e5).toISOString(),
      completed_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    },
    'rest/v1/participations': PARTICIPANTS,
    'rest/v1/results': RESULTATS,
  });
  await page.goto('/race/r1');

  // Ma réponse avant toute lecture de liste : « Toi : 2ᵉ · ▲ +12 ».
  await expect(page.getByText('Toi : 2ᵉ · ▲ +12', { exact: true })).toBeVisible({ timeout: 20_000 });

  // Vue Classement par défaut : la gagnante et son delta.
  await expect(page.getByText('Sophie_K', { exact: true }).and(sceneActive(page)).first()).toBeVisible();

  // Chronos : les temps, triés — et le « — » du pilote sans chrono.
  await page.getByText('Chronos', { exact: true }).click();
  await expect(page.getByText('0:46.012', { exact: true })).toBeVisible();

  // Duels : un panneau à la fois, titré « ses points » pour un AUTRE pilote.
  await page.getByText('Duels', { exact: true }).click();
  await page.getByText('Sophie_K', { exact: true }).and(sceneActive(page)).first().click();
  await expect(page.getByText('D’où viennent ses points ?', { exact: true })).toBeVisible();

  // La revanche est l'action fixe du bas.
  const rematch = page.getByText('Prendre les mêmes et on recommence', { exact: true });
  await expect(rematch).toBeVisible();
  const box = await rematch.boundingBox();
  expect(box && box.y + box.height <= 844).toBeTruthy();
});
