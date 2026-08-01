import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * C5 — l'onglet Amis a fusionné dans le classement (décision PO 2026-08-01).
 *
 * Supprimer un onglet, c'est supprimer une PORTE : ce qui vivait derrière doit
 * rester atteignable, sans quoi la simplification devient une perte de
 * fonction. Ce fichier vérifie chacune des trois choses qui s'y trouvaient —
 * chercher un pilote, répondre à une demande d'ami, retrouver son lien
 * d'invitation — et le sort des liens déjà partis dans la nature.
 */
const CLASSEMENT = [
  { rank: 1, profile_id: 'u2', ghost_id: null, username: 'Sophie_K', elo: 1330, races: 9, is_me: false, avatar_path: null },
  { rank: 2, profile_id: UID, ghost_id: null, username: 'Moi', elo: 1210, races: 6, is_me: true, avatar_path: null },
];

/** Ce que renvoie `listFriendships` : une demande reçue et une envoyée. */
const AMITIES = [
  { id: 'f1', requester_id: 'u3', addressee_id: UID, status: 'pending', created_at: '2026-08-01T10:00:00Z',
    requester: { username: 'Kévin_R', elo: 1120, avatar_path: null }, addressee: { username: 'Moi', elo: 1210, avatar_path: null } },
  { id: 'f2', requester_id: UID, addressee_id: 'u4', status: 'pending', created_at: '2026-08-01T09:00:00Z',
    requester: { username: 'Moi', elo: 1210, avatar_path: null }, addressee: { username: 'Lea_M', elo: 1050, avatar_path: null } },
];

test.use({ viewport: { width: 390, height: 844 } });

// Le compte d'onglets est déjà gardé par e2e/smoke.spec.ts, sur l'accueil ET
// sur un écran de détail — le répéter ici ne prouvait rien de plus.

test('chercher un pilote se fait depuis le CLASSEMENT, et sa fiche s’y ouvre', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': CLASSEMENT,
    'rpc/get_my_rank': [{ rank: 2, elo: 1210, races: 6, total: 2 }],
    'rpc/search_pilots': [
      { id: 'u9', username: 'Zoe_P', elo: 1400, elo_exact: true, is_private: false, races: 12, avatar_path: null },
    ],
    'rpc/get_pilot': [
      { id: 'u9', username: 'Zoe_P', elo: 1400, elo_exact: true, is_private: false, races: 12, avatar_path: null },
    ],
  });
  await page.goto('/classements');

  // La recherche par pseudo est le SEUL chemin vers un pilote qu'on n'a pas
  // encore en amis : la supprimer avec l'onglet aurait fermé la porte d'entrée
  // du réseau.
  const champ = page.getByLabel('Trouver un ami').and(sceneActive(page)).first();
  await expect(champ).toBeVisible({ timeout: 20_000 });
  await champ.fill('zoe');

  const trouve = page.getByRole('button', { name: /Zoe_P/ }).first();
  await expect(trouve).toBeVisible({ timeout: 15_000 });
  await trouve.click();
  await expect(page).toHaveURL(/pilot\/u9/, { timeout: 15_000 });

  // Et l'onglet ne CHANGE pas : la fiche pilote vivait dans la pile d'Amis,
  // donc l'ouvrir depuis le classement faisait sauter l'indicateur d'onglet le
  // temps de la visite. Elle a suivi le classement.
  await expect(page.getByRole('tab', { name: 'Classement' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByLabel('Retour').first().click();
  await expect(page).toHaveURL(/classements/, { timeout: 15_000 });
});

test('une demande d’ami reste traitable, et l’acceptation part', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': CLASSEMENT,
    'rpc/get_my_rank': [{ rank: 2, elo: 1210, races: 6, total: 2 }],
    'rest/v1/friendships': AMITIES,
  });
  const partis: string[] = [];
  await page.route('**/*.supabase.co/rest/v1/friendships**', async (route) => {
    if (route.request().method() === 'PATCH') {
      partis.push('accept');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fallback();
  });
  await page.goto('/classements');

  // Une notification en prévient, et la fiche du pilote porte le bouton — mais
  // une notification se rate. Sans point de chute, un lien qu'on ne retrouve
  // nulle part est un lien perdu.
  await expect(page.getByText('Demandes reçues · 1').first()).toBeVisible({ timeout: 20_000 });
  // Nom EXACT : la LIGNE est elle aussi un bouton (elle ouvre la fiche), et
  // sans nom explicite le sien se composait du contenu — donc du libellé de
  // celui-ci. Deux commandes distinctes portaient alors le même nom.
  await expect(page.getByRole('button', { name: 'Accepter · Kévin_R', exact: true })).toBeVisible();
  // Et les demandes ENVOYÉES aussi : sans elles, on ne peut plus annuler une
  // demande partie par erreur.
  await expect(page.getByText('Demandes envoyées · 1').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annuler · Lea_M', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Accepter · Kévin_R', exact: true }).click();
  await expect.poll(() => partis.length, { timeout: 10_000 }).toBeGreaterThan(0);

  // Et le clic ne NAVIGUE pas : le bouton est imbriqué dans une ligne qui,
  // elle, ouvre la fiche. Si l'événement remontait, on accepterait ET on
  // quitterait l'écran — et le test précédent aurait passé quand même.
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/classements/);
});

test('sans demande en attente, le classement reste un classement', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': CLASSEMENT,
    'rpc/get_my_rank': [{ rank: 2, elo: 1210, races: 6, total: 2 }],
    'rest/v1/friendships': [],
  });
  await page.goto('/classements');
  await expect(page.getByText('Sophie_K', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  // Un en-tête « Demandes reçues · 0 » occuperait une place permanente pour
  // dire qu'il n'y a rien.
  await expect(page.getByText(/Demandes reçues/)).toHaveCount(0);
  await expect(page.getByText(/Demandes envoyées/)).toHaveCount(0);
});

test('chercher puis effacer ne fait pas perdre sa place dans le classement', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    // Assez de lignes pour qu'il y ait quelque chose à perdre.
    'rpc/get_leaderboard': Array.from({ length: 40 }, (_, i) => ({
      rank: i + 1,
      profile_id: `p${i}`,
      ghost_id: null,
      username: `Pilote_${i}`,
      elo: 1500 - i * 10,
      races: 9,
      is_me: false,
      avatar_path: null,
    })),
    'rpc/get_my_rank': [{ rank: 40, elo: 1110, races: 6, total: 40 }],
    'rpc/search_pilots': [],
  });
  await page.goto('/classements');
  await expect(page.getByText('Pilote_0', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  // Le panneau de recherche REMPLAÇAIT le classement dans un ternaire, ce qui
  // démontait sa liste : après un défilement, taper puis effacer deux
  // caractères ramenait tout en haut (900 px perdus, mesuré à l'audit).
  // Le conteneur qui défile RÉELLEMENT : `ScrollView` rend un div à
  // `overflow-y`, et une molette envoyée à la fenêtre ne l'atteint pas.
  const poser = async (y: number) =>
    page.evaluate((v) => {
      const e = [...document.querySelectorAll('div')].find(
        (x) => x.scrollHeight > x.clientHeight + 200 && getComputedStyle(x).overflowY !== 'visible',
      );
      if (e) e.scrollTop = v;
      return e ? e.scrollTop : -1;
    }, y);
  const lire = async () =>
    page.evaluate(() => {
      const e = [...document.querySelectorAll('div')].find(
        (x) => x.scrollHeight > x.clientHeight + 200 && getComputedStyle(x).overflowY !== 'visible',
      );
      return e ? e.scrollTop : -1;
    });

  await poser(600);
  await page.waitForTimeout(200);
  const avant = await lire();
  expect(avant).toBeGreaterThan(100);

  const champ = page.getByLabel('Trouver un ami').and(sceneActive(page)).first();
  await champ.fill('zo');
  await expect(page.getByText('Aucun pilote trouvé.').first()).toBeVisible({ timeout: 15_000 });
  // La CROIX, et non `fill('')` : c'est le geste que le PO a demandé, et le
  // seul qui existe sur un téléphone sans repasser par le clavier.
  await page.getByRole('button', { name: 'Effacer la recherche' }).first().click();
  await expect(champ).toHaveValue('');
  await expect(page.getByText('Pilote_0', { exact: true }).first()).toBeVisible();

  const apres = await lire();
  expect(apres).toBe(avant);
});

test('un ami qui n’a jamais couru reste VISIBLE', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': CLASSEMENT,
    'rpc/get_my_rank': [{ rank: 2, elo: 1210, races: 6, total: 2 }],
    'rest/v1/friendships': [
      // Amitié ACCEPTÉE avec quelqu'un qui n'a pas encore couru : il n'est donc
      // dans AUCUN classement (`get_leaderboard` filtre sur `races > 0`).
      { id: 'f3', requester_id: UID, addressee_id: 'u7', status: 'accepted', created_at: '2026-08-01T08:00:00Z',
        requester: { username: 'Moi', elo: 1210, avatar_path: null }, addressee: { username: 'Nouvelle_V', elo: 1000, avatar_path: null } },
    ],
  });
  await page.goto('/classements');

  // C'est exactement la personne qu'on vient d'inviter : la faire disparaître
  // aurait supprimé la seule preuve visible que le lien d'invitation a marché,
  // à la sortie du canal d'acquisition n°1.
  await expect(page.getByText('Pas encore classés · 1').first()).toBeVisible({ timeout: 20_000 });
  const ligne = page.getByRole('button', { name: /Nouvelle_V/ }).first();
  await expect(ligne).toBeVisible();
  await ligne.click();
  await expect(page).toHaveURL(/pilot\/u7/, { timeout: 15_000 });
});

test('les anciens liens « /amis » mènent toujours quelque part', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': CLASSEMENT,
    'rpc/get_my_rank': [{ rank: 2, elo: 1210, races: 6, total: 2 }],
  });
  // Des notifications DÉJÀ ENVOYÉES portent `url = 'amis'` : elles dorment dans
  // les boîtes de réception et dans les push en attente. Supprimer la route
  // aurait transformé chaque « Untel veut t'ajouter » reçu avant aujourd'hui en
  // page blanche — un lien mort qu'on ne rattrape plus une fois parti.
  await page.goto('/amis');
  await expect(page).toHaveURL(/classements/, { timeout: 20_000 });
  await expect(page.getByText('Sophie_K', { exact: false }).first()).toBeVisible();
});
