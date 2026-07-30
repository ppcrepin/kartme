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
    'rpc/get_inviter': [{ id: INVITANT, username: 'Marc_R', avatar_path: null }],
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

test('son propre lien ne crée rien et le dit', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_inviter': [{ id: UID, username: 'Moi', avatar_path: null }],
    'rpc/accept_friend_invite': 'self',
  });
  await page.goto(`/invite/${UID}`);

  await page.getByText('Devenir ami de Moi', { exact: true }).click();
  await expect(page.getByText(/C’est ton propre lien/)).toBeVisible();
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
