import { test, type Page } from '@playwright/test';

import { reseauSimule, sessionSimulee, UID } from './harness';

/** Spec TEMPORAIRE d'audit visuel — à supprimer après la campagne. */
const DIR = '/tmp/claude-0/-home-user-kartme/572ba466-811d-553a-b058-3fb7c47cee49/scratchpad/audit';

const CIRCUIT = { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true };

const course = (statut: string, admin = UID) => ({
  id: 'r1',
  admin_id: admin,
  circuit_id: 'c1',
  scheduled_at: new Date(Date.now() + 3 * 864e5).toISOString(),
  status: statut,
  invite_token: 'tok-1',
  completed_at: statut === 'completed' ? new Date().toISOString() : null,
  circuit: CIRCUIT,
});

const PARTICIPANTS = [
  { id: 'p1', race_id: 'r1', profile_id: UID, ghost_id: null, profile: { username: 'Moi', elo: 1210, races: 6, avatar_path: null }, ghost: null },
  { id: 'p2', race_id: 'r1', profile_id: 'u2', ghost_id: null, profile: { username: 'Sophie_K', elo: 1330, races: 9, avatar_path: null }, ghost: null },
  { id: 'p3', race_id: 'r1', profile_id: null, ghost_id: 'g1', profile: null, ghost: { display_name: 'Tonton Gégé', elo: 1000 } },
];

const AMIS = [
  { id: 'f1', requester_id: UID, addressee_id: 'u2', status: 'accepted',
    requester: { username: 'Moi', elo: 1210, avatar_path: null },
    addressee: { username: 'Sophie_K', elo: 1330, avatar_path: null } },
  { id: 'f2', requester_id: 'u3', addressee_id: UID, status: 'accepted',
    requester: { username: 'Kévin_R', elo: 1120, avatar_path: null },
    addressee: { username: 'Moi', elo: 1210, avatar_path: null } },
  { id: 'f3', requester_id: 'u4', addressee_id: UID, status: 'accepted',
    requester: { username: 'Jean-Baptiste_De_La_Tour', elo: 1005, avatar_path: null },
    addressee: { username: 'Moi', elo: 1210, avatar_path: null } },
  { id: 'f4', requester_id: 'u5', addressee_id: UID, status: 'accepted',
    requester: { username: 'Max', elo: 1400, avatar_path: null },
    addressee: { username: 'Moi', elo: 1210, avatar_path: null } },
  { id: 'f5', requester_id: 'u6', addressee_id: UID, status: 'accepted',
    requester: { username: 'Lolo_du_78', elo: 1080, avatar_path: null },
    addressee: { username: 'Moi', elo: 1210, avatar_path: null } },
  { id: 'f6', requester_id: 'u7', addressee_id: UID, status: 'accepted',
    requester: { username: 'Kevina', elo: 1150, avatar_path: null },
    addressee: { username: 'Moi', elo: 1210, avatar_path: null } },
];

test.use({ viewport: { width: 390, height: 844 } });

/** Mesure toutes les zones tapables visibles et repère celles < 44 px. */
async function mesures(page: Page, ecran: string) {
  const data = await page.evaluate(() => {
    const out: { tag: string; role: string; txt: string; w: number; h: number; x: number; y: number }[] = [];
    const sel = '[role="button"], button, input, textarea, a[href], [role="link"], [role="checkbox"], [role="switch"]';
    document.querySelectorAll(sel).forEach((el) => {
      if (el.closest('[aria-hidden="true"]')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const st = getComputedStyle(el as Element);
      if (st.visibility === 'hidden' || st.display === 'none') return;
      out.push({
        tag: el.tagName.toLowerCase(),
        role: (el.getAttribute('role') ?? '') + (el.getAttribute('aria-label') ? ` [${el.getAttribute('aria-label')}]` : ''),
        txt: ((el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || '').replace(/\s+/g, ' ').slice(0, 60),
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        x: Math.round(r.x), y: Math.round(r.y),
      });
    });
    return out;
  });
  const petites = data.filter((d) => d.h < 44 || d.w < 44);
  console.log(`\n### MESURES ${ecran} — ${data.length} zones, ${petites.length} sous 44px`);
  for (const p of petites) console.log(`  [${p.w}x${p.h}] @${p.x},${p.y} <${p.tag}> ${p.role} « ${p.txt} »`);
  return data;
}

/** Rapporte les textes tronqués (ellipsis) et les débordements horizontaux. */
async function debordements(page: Page, ecran: string) {
  const res = await page.evaluate(() => {
    const trop: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.closest('[aria-hidden="true"]')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right > 390.5 || r.left < -0.5) {
        const txt = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').slice(0, 50);
        if (txt) trop.push(`hors-écran X [${Math.round(r.left)}..${Math.round(r.right)}] « ${txt} »`);
      }
      const he = el as HTMLElement;
      if (he.scrollWidth > he.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll') {
        const txt = (he.innerText ?? '').replace(/\s+/g, ' ').slice(0, 50);
        if (txt) trop.push(`tronqué (scrollW ${he.scrollWidth} > clientW ${he.clientWidth}) « ${txt} »`);
      }
    });
    return { trop: [...new Set(trop)].slice(0, 25), bodyScrollW: document.body.scrollWidth, docH: document.documentElement.scrollHeight };
  });
  console.log(`\n### DEBORDEMENTS ${ecran} — bodyScrollW=${res.bodyScrollW} docH=${res.docH}`);
  for (const l of res.trop) console.log('  ' + l);
}

// ─────────────────────────── 1. ACCUEIL / CHECKLIST ───────────────────────────

test('accueil 0/3', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/races': [], 'rest/v1/participations': [] });
  await page.goto('/');
  await page.getByText('Ta première course', { exact: true }).waitFor({ timeout: 25_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/1a-accueil-0sur3.png` });
  await page.screenshot({ path: `${DIR}/1a-accueil-0sur3-full.png`, fullPage: true });
  await mesures(page, 'accueil 0/3');
  await debordements(page, 'accueil 0/3');
});

test('accueil 1/3', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': [course('upcoming')],
    'rest/v1/participations': [{ race_id: 'r1' }],
  });
  await page.goto('/');
  await page.getByText('1/3', { exact: true }).waitFor({ timeout: 25_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/1b-accueil-1sur3.png` });
  await page.screenshot({ path: `${DIR}/1b-accueil-1sur3-full.png`, fullPage: true });
  await mesures(page, 'accueil 1/3');
  await debordements(page, 'accueil 1/3');
});

test('accueil 2/3', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': [course('upcoming')],
    'rest/v1/participations': [{ race_id: 'r1' }, { race_id: 'r1' }, { race_id: 'r1' }],
  });
  await page.goto('/');
  await page.getByText('2/3', { exact: true }).waitFor({ timeout: 25_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/1c-accueil-2sur3.png` });
  await page.screenshot({ path: `${DIR}/1c-accueil-2sur3-full.png`, fullPage: true });
  await mesures(page, 'accueil 2/3');
  await debordements(page, 'accueil 2/3');

  // Le bouton du bas est-il atteignable / visible sans défiler ?
  const info = await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')] as HTMLElement[];
    const btn = els.filter((e) => e.innerText?.trim() === 'Créer une course' && !e.closest('[aria-hidden="true"]'));
    return btn.map((b) => {
      const r = b.getBoundingClientRect();
      return { txt: b.innerText.trim(), role: b.getAttribute('role'), y: Math.round(r.y), bottom: Math.round(r.bottom), h: Math.round(r.height) };
    });
  });
  console.log('\n### « Créer une course » occurrences accueil 2/3 :', JSON.stringify(info, null, 1));
});

test('accueil 2/3 avec plusieurs courses (pression verticale)', async ({ page }) => {
  await sessionSimulee(page);
  const autres = [1, 2, 3, 4].map((i) => ({
    ...course('upcoming'),
    id: `r${i + 1}`,
    scheduled_at: new Date(Date.now() + (i + 4) * 864e5).toISOString(),
  }));
  await reseauSimule(page, {
    'rest/v1/races': [course('upcoming'), ...autres],
    'rest/v1/participations': [{ race_id: 'r1' }, { race_id: 'r1' }, { race_id: 'r1' }],
  });
  await page.goto('/');
  await page.getByText('2/3', { exact: true }).waitFor({ timeout: 25_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/1d-accueil-2sur3-5courses.png` });
  await debordements(page, 'accueil 2/3 · 5 courses');
});

// ─────────────────────── 2. FEUILLE D'AJOUT DE PILOTES ────────────────────────

test('feuille ajout pilotes', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': course('upcoming'),
    'rest/v1/participations': PARTICIPANTS,
    'rest/v1/results': [],
    'rest/v1/friendships': AMIS,
  });
  await page.goto('/race/r1');
  await page.getByText('Sologne Karting', { exact: true }).first().waitFor({ timeout: 25_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/2z-course-avant-ajout.png` });

  await page.getByText('+ Ajouter', { exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/2a-feuille-vide.png` });
  await mesures(page, 'feuille ajout · champ vide');
  await debordements(page, 'feuille ajout · champ vide');

  await page.getByLabel('Qui court ?').fill('kev');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/2b-feuille-kev.png` });
  await debordements(page, 'feuille ajout · « kev »');

  await page.getByLabel('Qui court ?').fill('Tonton Robert');
  await page.getByLabel('➕ Ajouter « Tonton Robert » comme invité').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/2c-feuille-invite.png` });
  await mesures(page, 'feuille ajout · invité');
  await debordements(page, 'feuille ajout · invité');

  // Où se trouve la ligne invité dans le viewport ? (visible sans défiler ?)
  const box = await page.getByLabel('➕ Ajouter « Tonton Robert » comme invité').boundingBox();
  console.log('\n### ligne invité boundingBox :', JSON.stringify(box));
  const sheet = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => (e as HTMLElement).innerText?.startsWith('Ajouter des pilotes'));
    return el ? (() => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; })() : null;
  });
  console.log('### feuille boundingBox :', JSON.stringify(sheet));

  // Nom très long dans le champ → la ligne invité déborde-t-elle ?
  await page.getByLabel('Qui court ?').fill('Jean-Philippe De La Motte Beuvron');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${DIR}/2d-feuille-invite-nom-long.png` });
  await debordements(page, 'feuille ajout · nom long');
});

// ───────────────────────── 3. SAISIE DU CLASSEMENT ────────────────────────────

test('rank écran par défaut', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': course('upcoming'),
    'rest/v1/participations': PARTICIPANTS,
    'rest/v1/results': [],
  });
  await page.goto('/rank/r1');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/3a-rank-entree.png` });
  await page.screenshot({ path: `${DIR}/3a-rank-entree-full.png`, fullPage: true });
  await mesures(page, 'rank · entrée');
  await debordements(page, 'rank · entrée');

  // Étape « présents » → on continue pour atteindre l'ordre d'arrivée.
  const cont = page.getByText('Continuer', { exact: true });
  if (await cont.count()) {
    await cont.first().click();
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${DIR}/3b-rank-ordre.png` });
  await page.screenshot({ path: `${DIR}/3b-rank-ordre-full.png`, fullPage: true });
  await mesures(page, 'rank · ordre');
  await debordements(page, 'rank · ordre');

  // Position et contraste des deux pastilles de mode.
  const chips = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[role="button"]')] as HTMLElement[];
    return els
      .filter((e) => /Toucher|Glisser/.test(e.innerText ?? ''))
      .map((e) => {
        const r = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        const txtEl = (e.querySelector('*') as HTMLElement) ?? e;
        return {
          txt: e.innerText.replace(/\s+/g, ' '),
          selected: e.getAttribute('aria-selected') ?? e.getAttribute('aria-checked'),
          y: Math.round(r.y), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height),
          bg: st.backgroundColor, border: st.borderColor,
          color: getComputedStyle(txtEl).color,
        };
      });
  });
  console.log('\n### PASTILLES DE MODE :', JSON.stringify(chips, null, 1));

  // Ordre vertical des blocs clés.
  const ordre = await page.evaluate(() => {
    const cible = ['Ordre d’arrivée', 'Touche les pilotes', 'Toucher', 'Glisser', 'Moi', 'Sophie_K', 'Tonton Gégé', 'Abandons', 'Valider'];
    const out: { t: string; y: number }[] = [];
    for (const c of cible) {
      const el = [...document.querySelectorAll('*')].find(
        (e) => !e.closest('[aria-hidden="true"]') && (e as HTMLElement).innerText?.trim().startsWith(c) && e.children.length === 0,
      ) as HTMLElement | undefined;
      if (el) out.push({ t: c, y: Math.round(el.getBoundingClientRect().y) });
    }
    return out.sort((a, b) => a.y - b.y);
  });
  console.log('\n### ORDRE VERTICAL rank :', JSON.stringify(ordre));

  // Après un tap sur « Glisser » : état sélectionné inversé.
  await page.getByText('✥ Glisser', { exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/3c-rank-mode-glisser.png` });

  await page.getByText('👆 Toucher', { exact: true }).click();
  await page.waitForTimeout(400);
  // Un tap sur un pilote → numéro.
  await page.getByText('Sophie_K', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/3d-rank-tap-1.png` });
});

test('rank avec 8 pilotes (pression verticale)', async ({ page }) => {
  const huit = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i + 1}`, race_id: 'r1',
    profile_id: i === 0 ? UID : `u${i}`,
    ghost_id: null,
    profile: { username: ['Moi', 'Sophie_K', 'Kévin_R', 'Max', 'Lolo_du_78', 'Jean-Baptiste_De_La_Tour', 'Kevina', 'Nico'][i], elo: 1200, races: 4, avatar_path: null },
    ghost: null,
  }));
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': course('upcoming'),
    'rest/v1/participations': huit,
    'rest/v1/results': [],
  });
  await page.goto('/rank/r1?locked=1');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/3e-rank-8-pilotes.png` });
  await page.screenshot({ path: `${DIR}/3e-rank-8-pilotes-full.png`, fullPage: true });
  await debordements(page, 'rank · 8 pilotes');
  await mesures(page, 'rank · 8 pilotes');
});
