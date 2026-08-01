import { expect, test } from '@playwright/test';

import { reseauSimule, sessionSimulee, UID } from './harness';

/**
 * C4 — l'image de podium partageable (décision PO 2026-08-01 : « le podium,
 * avec les points échangés »).
 *
 * L'image est dessinée sur un `canvas` : rien de ce qui la compose n'existe
 * dans le DOM, donc aucun test statique ne peut la voir. Ce fichier vérifie
 * qu'elle est RÉELLEMENT produite, à la bonne taille, et qu'elle n'est pas une
 * toile vide — le défaut silencieux d'un rendu canvas.
 */
const CIRCUIT = { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true };

const COURSE_FINIE = {
  id: 'r1',
  admin_id: UID,
  circuit_id: 'c1',
  scheduled_at: new Date(Date.now() - 864e5).toISOString(),
  status: 'completed',
  invite_token: 'tok-1',
  completed_at: new Date(Date.now() - 3600e3).toISOString(),
  circuit: CIRCUIT,
};

const PARTICIPATIONS = [
  { id: 'p1', profile_id: UID, ghost_id: null, profile: { username: 'Moi', elo: 1210, races: 6, avatar_path: null }, ghost: null },
  { id: 'p2', profile_id: 'u2', ghost_id: null, profile: { username: 'Sophie_K', elo: 1330, races: 9, avatar_path: null }, ghost: null },
  { id: 'p3', profile_id: 'u3', ghost_id: null, profile: { username: 'Kévin_R', elo: 1120, races: 3, avatar_path: null }, ghost: null },
];

// La JOINTURE compte : `listResults` lit le pseudo et le statut d'invité dans
// `participation`. Sans elle, chaque pilote passait pour un invité — nom « — »,
// aucun point échangé — et l'image se dessinait vide de sens sans que rien
// n'échoue. C'est le test de pixels qui l'a montré.
const part = (profileId: string, username: string) => ({
  profile_id: profileId,
  profile: { username, avatar_path: null },
  ghost: null,
});

const RESULTATS = [
  { participation_id: 'p2', race_id: 'r1', position: 1, elo_before: 1310, elo_after: 1330, elo_delta: 20, best_lap_ms: null, dnf: false, participation: part('u2', 'Sophie_K') },
  { participation_id: 'p1', race_id: 'r1', position: 2, elo_before: 1215, elo_after: 1210, elo_delta: -5, best_lap_ms: null, dnf: false, participation: part(UID, 'Moi') },
  { participation_id: 'p3', race_id: 'r1', position: 3, elo_before: 1135, elo_after: 1120, elo_delta: -15, best_lap_ms: null, dnf: false, participation: part('u3', 'Kévin_R') },
];

test.use({ viewport: { width: 390, height: 844 } });

async function ouvrirPartage(page: import('@playwright/test').Page) {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': COURSE_FINIE,
    'rest/v1/participations': PARTICIPATIONS,
    'rest/v1/results': RESULTATS,
  });
  await page.goto('/race/r1');
  // La porte n'existait PAS avant ce lot : la feuille de partage n'était
  // atteignable que depuis une course à venir, et son titre « Partager les
  // résultats » n'avait donc jamais servi.
  const porte = page.getByRole('button', { name: 'Partager cette course' }).first();
  await expect(porte).toBeVisible({ timeout: 20_000 });
  await porte.click();
}

test('une course terminée produit une VRAIE image de podium', async ({ page }) => {
  await ouvrirPartage(page);

  const apercu = page.getByRole('img', { name: /Aperçu de l’image à partager/ }).first();
  await expect(apercu).toBeVisible({ timeout: 20_000 });

  // Taille NATIVE : c'est la seule preuve que le canvas a bien produit du
  // 1080 × 1350 et non une vignette d'espace réservé.
  const mesure = await apercu.evaluate((el) => {
    const img = el as HTMLImageElement;
    const src = img.src || getComputedStyle(img).backgroundImage;
    return { w: img.naturalWidth, h: img.naturalHeight, png: src.includes('data:image/png') };
  });
  expect(mesure.png).toBe(true);
  expect(mesure.w).toBe(1080);
  expect(mesure.h).toBe(1350);
});

test('l’image n’est pas une toile vide, et porte les points échangés', async ({ page }) => {
  await ouvrirPartage(page);
  await expect(page.getByRole('img', { name: /Aperçu de l’image/ }).first()).toBeVisible({
    timeout: 20_000,
  });

  // Le défaut silencieux d'un rendu canvas : tout s'exécute, rien ne s'affiche.
  // On relit les pixels et on compte les couleurs distinctes — un fond uni en
  // donnerait une seule.
  // Par le LOCALISATEUR, pas par un `querySelector` : react-native-web pose le
  // nom accessible dans `alt`, pas dans `aria-label` — une recherche manuelle
  // sur l'attribut ne trouvait rien et le test échouait sur son propre
  // sélecteur, sans rien dire de l'image.
  const analyse = await page
    .getByRole('img', { name: /Aperçu de l’image/ })
    .first()
    .evaluate(async (el) => {
    const img = el as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1350;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    await img.decode();
    ctx.drawImage(img, 0, 0, 1080, 1350);
    const d = ctx.getImageData(0, 0, 1080, 1350).data;
    const teintes = new Set<string>();
    let rougesHaut = 0;
    let rougesBas = 0;
    let verts = 0;
    let clairsBas = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.floor(i / 4 / 1080);
      teintes.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      // Le rouge de marque du damier (#e10600) et le vert d'un gain (#6fae82).
      const rouge = d[i] > 200 && d[i + 1] < 40 && d[i + 2] < 40;
      if (rouge && y < 200) rougesHaut++;
      // La SIGNATURE : le damier du pied, et le texte clair (nom + adresse) qui
      // le suit. Compter le rouge sur toute l'image laissait le damier de TÊTE
      // satisfaire l'assertion à lui seul, avec seize fois la marge — la
      // signature aurait pu disparaître entièrement sans que le test bronche.
      if (y > 1050) {
        if (rouge) rougesBas++;
        if (d[i] > 120 && d[i + 1] > 110 && d[i + 2] > 100) clairsBas++;
      }
      if (d[i] < 140 && d[i + 1] > 150 && d[i + 2] > 110 && d[i + 2] < 160) verts++;
    }
    return { teintes: teintes.size, rougesHaut, rougesBas, verts, clairsBas };
    });

  expect(analyse).not.toBeNull();
  // Beaucoup de teintes : du texte antialiasé, pas un aplat.
  expect(analyse!.teintes).toBeGreaterThan(50);
  // Les DEUX damiers, comptés séparément : celui de tête et celui du pied.
  expect(analyse!.rougesHaut).toBeGreaterThan(2000);
  expect(analyse!.rougesBas).toBeGreaterThan(2000);
  // Et du texte clair sous le damier du pied : le nom et l'adresse, c'est-à-dire
  // la RAISON D'ÊTRE du lot — sans eux, l'image ne mène nulle part.
  expect(analyse!.clairsBas).toBeGreaterThan(1000);
  // Et au moins un gain d'Elo s'affiche en vert : c'est le « points échangés »
  // de la demande, la seule information que le texte partagé ne donnait pas
  // d'un coup d'œil.
  expect(analyse!.verts).toBeGreaterThan(100);
});

test('un profil PRIVÉ ne fuit ni son pseudo ni ses points dans l’image', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': COURSE_FINIE,
    'rest/v1/participations': PARTICIPATIONS,
    'rest/v1/results': [
      // `profile_id` renseigné mais `profile` nul : c'est exactement ce que la
      // RLS renvoie pour un compte privé dont on n'est pas ami.
      { participation_id: 'p2', race_id: 'r1', position: 1, elo_before: 1310, elo_after: 1330, elo_delta: 20, best_lap_ms: null, dnf: false, participation: { profile_id: 'u9', profile: null, ghost: null } },
      { participation_id: 'p1', race_id: 'r1', position: 2, elo_before: 1215, elo_after: 1210, elo_delta: -5, best_lap_ms: null, dnf: false, participation: part(UID, 'Moi') },
    ],
  });
  await page.goto('/race/r1');
  await page.getByRole('button', { name: 'Partager cette course' }).first().click({ timeout: 20_000 });

  // LE risque du lot : l'image part dans des conversations, chez des gens qui
  // ne sont pas inscrits, et rien ne la rattrape. Le test unitaire vérifie que
  // `lignesPodium` sait anonymiser ; celui-ci vérifie que l'ÉCRAN lui passe
  // bien la bonne clé — remplacer `t.races.privatePilot` par `r.name` laissait
  // toute la campagne au vert.
  const apercu = page.getByRole('img', { name: /Aperçu de l’image/ }).first();
  await expect(apercu).toBeVisible({ timeout: 20_000 });
  const lu = (await apercu.getAttribute('alt')) ?? '';
  expect(lu).toContain('Pilote privé');
  expect(lu).not.toContain('u9');

  // Et son mouvement d'Elo ne sort pas non plus : « 1 · Pilote privé · +20 »,
  // avec le circuit et la date au-dessus, ré-identifie la personne pour
  // quiconque a couru ce jour-là.
  expect(lu).not.toContain('+20');
  expect(lu).toContain('—');
});

test('sur une course À VENIR, on n’offre pas d’image de podium', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': { ...COURSE_FINIE, status: 'upcoming', completed_at: null },
    'rest/v1/participations': PARTICIPATIONS,
    'rest/v1/results': [],
  });
  await page.goto('/race/r1');

  const inviter = page.getByRole('button', { name: /Inviter la bande/ }).first();
  await expect(inviter).toBeVisible({ timeout: 20_000 });
  await inviter.click();

  // Il n'y a pas encore de podium : proposer d'en partager l'image serait une
  // promesse vide, et l'image sortirait avec trois lignes de néant.
  await expect(page.getByText('Partager le podium')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Aperçu de l’image/ })).toHaveCount(0);
});

test('« Partager l’image » produit vraiment un fichier, et le dit', async ({ page }) => {
  await ouvrirPartage(page);
  await expect(page.getByRole('img', { name: /Aperçu de l’image/ }).first()).toBeVisible({
    timeout: 20_000,
  });

  // Chromium de bureau n'accepte pas le partage de FICHIER : on doit retomber
  // sur le téléchargement. Rien ne le testait, et c'est précisément le chemin
  // où le bouton pouvait rester sans effet — la construction du `File` levait à
  // l'intérieur du même `try`, on sautait par-dessus le repli, et l'on
  // atterrissait dans un `catch` muet.
  const [telechargement] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.getByRole('button', { name: 'Partager l’image' }).first().click(),
  ]);
  expect(telechargement.suggestedFilename()).toBe('kartsquad-podium.png');

  // Et la confirmation s'affiche, PUIS s'efface : un bouton resté sur
  // « enregistré » n'inviterait plus à repartager.
  await expect(page.getByRole('button', { name: /Image enregistrée/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Partager l’image' }).first()).toBeVisible({
    timeout: 8_000,
  });
});

test('la feuille de partage reste ouvrable et fermable', async ({ page }) => {
  await ouvrirPartage(page);
  await expect(page.getByText('Partager le podium').first()).toBeVisible({ timeout: 20_000 });
  // Le lien texte survit à côté de l'image : c'est le repli quand le partage
  // de fichier n'existe pas (ordinateur de bureau). Le titre de cette carte est
  // désormais DISTINCT de celui de la porte — deux commandes au même nom dans
  // la même vue obligeaient ce test à ruser avec `sceneActive` pour lever
  // l'ambiguïté, ce qui contournait un défaut d'interface au lieu de le dire.
  await expect(page.getByText('Partager les résultats').first()).toBeVisible();
  await page.getByLabel('Fermer').first().click();
  await expect(page.getByText('Partager le podium')).toHaveCount(0);
});
