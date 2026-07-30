import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * Le lien d'amitié (A19, demande PO 2026-07-30). Deux promesses à tenir :
 * l'invité voit QUI l'invite avant de confirmer, et un seul tap suffit —
 * aucune demande à valider ensuite par l'invitant.
 */
const INVITANT = 'aaaa1111-2222-3333-4444-555566667777';

test.use({ viewport: { width: 390, height: 844 } });

test('l’invité voit qui l’invite et devient ami en un tap', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_inviter': [{ id: INVITANT, username: 'Marc_R', avatar_path: null, is_me: false }],
    'rpc/accept_friend_invite': 'ok',
  });
  await page.goto(`/invite/${INVITANT}`);

  // On NE décide rien avant le tap : le nom de l'invitant est affiché d'abord.
  await expect(page.getByText('Marc_R', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/t’invite à le rejoindre/)).toBeVisible();

  await page.getByText('Devenir ami de Marc_R', { exact: true }).click();
  await expect(page.getByText('C’est fait, vous êtes amis 🤝', { exact: true })).toBeVisible();
  await expect(page.getByText('Voir son profil', { exact: true })).toBeVisible();
});

test('un lien périmé ou bloqué le dit, sans révéler pourquoi', async ({ page }) => {
  await sessionSimulee(page);
  // Le serveur ne renvoie RIEN : compte parti, suspendu, blocage… il n'a pas à
  // dire « ce compte existe mais te bloque ».
  await reseauSimule(page, { 'rpc/get_inviter': [] });
  await page.goto(`/invite/${INVITANT}`);

  await expect(page.getByText('Cette invitation n’est plus valable.', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Devenir ami/)).toHaveCount(0);
});

/**
 * Son propre lien. C'est le PREMIER geste de qui vient de générer un lien —
 * et la première version l'envoyait sur « invitation plus valable », parce que
 * `get_inviter` filtrait l'appelant. Le serveur renvoie désormais `is_me` et
 * l'écran le dit tout de suite, sans attendre un tap.
 */
test('son propre lien est reconnu d’emblée, sans bouton', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_inviter': [{ id: UID, username: 'Moi', avatar_path: null, is_me: true }],
  });
  await page.goto(`/invite/${UID}`);

  await expect(page.getByText(/C’est ton propre lien/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Devenir ami/)).toHaveCount(0);
  await expect(page.getByText('Cette invitation n’est plus valable.', { exact: true })).toHaveCount(0);
});

/**
 * Le lien meurt ENTRE l'affichage et le tap (compte supprimé, suspendu, ou
 * blocage posé dans l'intervalle). Le serveur renvoie un code, pas une
 * exception : un lien mort est un état de l'écran, et le bouton doit
 * DISPARAÎTRE — le laisser sous un message d'erreur invite à retaper une
 * action qui ne peut plus aboutir.
 */
test('un lien mort au moment du tap retire le bouton', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_inviter': [{ id: INVITANT, username: 'Marc_R', avatar_path: null, is_me: false }],
    'rpc/accept_friend_invite': 'gone',
  });
  await page.goto(`/invite/${INVITANT}`);

  await page.getByText('Devenir ami de Marc_R', { exact: true }).click();
  await expect(page.getByText('Cette invitation n’est plus valable.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Devenir ami/)).toHaveCount(0);
});

/**
 * Lien coupé par une messagerie : le cas le plus banal du canal d'acquisition.
 * Il ne doit pas se présenter comme une panne réseau, sinon l'invité tape
 * « Réessayer » indéfiniment sur un identifiant que le serveur refusera
 * toujours.
 */
test('un lien tronqué le dit tout de suite, sans « Réessayer »', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page);
  await page.goto('/invite/aaaa1111-2222-3333');

  await expect(page.getByText('Cette invitation n’est plus valable.', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Réessayer', { exact: true })).toHaveCount(0);
});

/**
 * LE parcours du lot : quelqu'un qui n'a pas l'app ouvre le lien. Ce test
 * n'existait pas, et c'est exactement par ce trou qu'un bloquant est passé —
 * la destination mémorisée valait « invite/[id] », le PATRON de route, si bien
 * que le nouveau venu retombait après inscription sur une invitation morte.
 * Le défaut touchait aussi les liens de course et de profil depuis toujours.
 */
test('sans session, le lien est MÉMORISÉ RÉSOLU puis rouvert après connexion', async ({ page }) => {
  await reseauSimule(page, {
    'rpc/get_inviter': [{ id: INVITANT, username: 'Marc_R', avatar_path: null, is_me: false }],
  });

  // 1. Arrivée sans session : renvoi vers l'INSCRIPTION, pas la connexion.
  //    Quelqu'un qui ouvre un lien d'ami n'a très probablement pas de compte —
  //    c'est la raison d'être du lien. « Content de te revoir » lui parlait
  //    comme à un habitué (arbitrage PO 2026-07-30).
  await page.goto(`/invite/${INVITANT}`);
  await expect(page.getByText('Rejoins la grille', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // Et l'invitation reste MENTIONNÉE : sans cela il traverse deux écrans qui
  // n'en parlent nulle part, puis retombe dessus sans comprendre pourquoi.
  await expect(page.getByText(/Une invitation t’attend/)).toBeVisible();
  // L'invitant n'est PAS nommé — le nommer supposerait d'interroger le serveur
  // avant toute connexion, donc d'exposer un pseudo à qui fabrique une URL.
  await expect(page.getByText(/Marc_R/)).toHaveCount(0);
  // Un compte existant reste à un tap.
  await expect(page.getByText(/Déjà un compte/)).toBeVisible();

  // 2. La destination mémorisée porte l'IDENTIFIANT, pas « [id] ».
  const memo = await page.evaluate(() => localStorage.getItem('ks_pending_route'));
  expect(memo).toBe(`invite/${INVITANT}`);

  // 3. Session posée puis rechargement (le vrai parcours passe par
  //    supabase.auth, qui déclenche le même effet de garde).
  await sessionSimulee(page);
  await page.reload();

  // 4. On retombe sur l'invitation, avec le bon invitant — pas sur un écran
  //    « invitation plus valable ».
  await expect(page.getByText('Devenir ami de Marc_R', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(new RegExp(`/invite/${INVITANT}$`));
});

test('une panne réseau ne déclare pas l’invitation morte', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page);
  // 500 sur get_inviter : c'est le réseau, pas un lien invalide.
  await page.route('**/rpc/get_inviter**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
  );
  await page.goto(`/invite/${INVITANT}`);

  await expect(page.getByText(/Impossible de charger l’invitation/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Réessayer', { exact: true })).toBeVisible();
  // Et surtout PAS le message qui condamne le lien.
  await expect(page.getByText('Cette invitation n’est plus valable.', { exact: true })).toHaveCount(0);
});

test('un refus technique ne montre jamais d’anglais brut', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_inviter': [{ id: INVITANT, username: 'Marc_R', avatar_path: null, is_me: false }],
  });
  await page.route('**/rpc/accept_friend_invite**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"message":"permission denied for function accept_friend_invite"}',
    }),
  );
  await page.goto(`/invite/${INVITANT}`);
  await page.getByText('Devenir ami de Marc_R', { exact: true }).click();

  await expect(page.getByText('Impossible d’ajouter ce pilote pour le moment.', { exact: true })).toBeVisible();
  await expect(page.getByText(/permission denied/)).toHaveCount(0);
});

/**
 * Le contre-exemple : un lien de COURSE sans session doit continuer d'ouvrir
 * la CONNEXION, et sans rappel d'invitation. Sans ce test, il suffirait
 * d'élargir la condition par erreur pour envoyer tout le monde s'inscrire.
 */
test('un lien de course sans session ouvre la connexion, sans rappel d’invitation', async ({
  page,
}) => {
  await reseauSimule(page);
  await page.goto('/race/cccc3333-4444-5555-6666-777788889999');

  await expect(page.getByText('Content de te revoir', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Une invitation t’attend/)).toHaveCount(0);
});

test('l’onglet Amis propose le lien à partager', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page);
  await page.goto('/amis');

  await expect(page.getByText('Inviter un ami', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.getByText('Inviter un ami', { exact: true }).first().click();
  // La feuille porte le lien ET son QR code — de quoi inviter quelqu'un qui
  // n'a pas encore l'app, au bord de la piste.
  await expect(page.getByText(`/invite/${UID}`, { exact: false })).toBeVisible();
});
