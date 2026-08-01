/**
 * L'image de podium partageable (lot C4, décision PO 2026-08-01 : « le podium,
 * avec les points échangés »).
 *
 * Pourquoi une IMAGE et pas le texte qu'on partageait déjà : un message texte
 * collé dans une conversation ne se distingue de rien, et il n'apprend rien à
 * qui ne connaît pas l'application. Une image se regarde, et elle porte
 * l'adresse où s'inscrire — c'est le seul canal d'acquisition qui parte du
 * plaisir de la course plutôt que d'une demande de service.
 *
 * La MARQUE (damier, nom, signature) vit dans `lib/marque` : le logo doit
 * encore changer, et il ne faudra toucher qu'un fichier.
 *
 * Le dessin est séparé de la préparation des données : `lignesPodium` et
 * `nomCourt` sont des fonctions pures, donc vérifiables sans navigateur — le
 * reste ne peut se juger qu'à l'œil.
 */
import { colors } from '@/constants/theme';
import { dessinerDamier, dessinerSignature, policeMarque, type Contexte2D } from '@/lib/marque';

/** Une ligne du podium, telle qu'elle sera dessinée. */
export interface LignePodium {
  rang: number;
  nom: string;
  /** `null` pour un invité : son Elo est gelé, « 0 » laisserait croire à un
   *  échange qui n'a pas eu lieu (anti-triche « Elo entre inscrits »). */
  delta: number | null;
  dnf: boolean;
}

/** Ce qu'il faut savoir d'un résultat pour en faire une ligne de podium. */
export interface ResultatSource {
  position: number;
  name: string;
  isGuest: boolean;
  hiddenProfile: boolean;
  eloDelta: number;
  dnf: boolean;
}

export interface DonneesPodium {
  circuit: string;
  date: string;
  lignes: LignePodium[];
  /** La ligne de pied : nombre de pilotes, règle de l'Elo. Fournie par
   *  l'appelant — ce module ne connaît aucune chaîne visible. */
  resume: string;
  /** L'adresse à afficher (sans protocole : elle se lit, elle ne se clique pas). */
  url: string;
  /** Le mot pour un abandon, fourni par l'i18n — ce module ne connaît aucune
   *  chaîne visible. */
  abandon: string;
}

/** Largeur/hauteur de l'image. Format 4:5, celui des fils et des stories. */
export const LARGEUR = 1080;
export const HAUTEUR = 1350;
const MARGE = 72;

/**
 * Un nom qui ne tient pas est COUPÉ, jamais rétréci : une image où un seul
 * pilote s'écrit en plus petit se lit comme une erreur de rendu. Le point de
 * suspension est un caractère unique, pour ne pas casser la coupe à un pixel
 * près.
 */
export function nomCourt(nom: string, maxCaracteres: number): string {
  const propre = nom.trim();
  if (propre.length <= maxCaracteres) return propre;
  // Le résultat ne DÉPASSE jamais la limite, points de suspension compris :
  // « coupé à 18 » qui rend 19 caractères déborderait du cadre au pixel près,
  // et c'est exactement ce que la fonction est censée empêcher.
  if (maxCaracteres <= 1) return '…';
  return `${propre.slice(0, maxCaracteres - 1).trimEnd()}…`;
}

/**
 * Les lignes à dessiner, à partir des résultats d'une course.
 *
 * Un profil masqué (compte privé non-ami) garde son anonymat jusque dans
 * l'image : le partage ne doit pas être une porte dérobée sur ce que l'écran
 * refuse de montrer.
 */
export function lignesPodium(
  resultats: readonly ResultatSource[],
  anonyme: string,
  combien = 3,
): LignePodium[] {
  return [...resultats]
    .sort((a, b) => a.position - b.position)
    .slice(0, combien)
    .map((r) => ({
      rang: r.position,
      nom: nomCourt(r.hiddenProfile ? anonyme : r.name, 18),
      delta: r.isGuest ? null : r.eloDelta,
      dnf: r.dnf,
    }));
}

/** Le delta, écrit comme il se lit : signe explicite, jamais « 0 » nu. */
export function ecrireDelta(delta: number | null, abandon: string, dnf: boolean): string {
  if (dnf) return abandon;
  if (delta === null) return '—';
  return delta > 0 ? `+${delta}` : String(delta);
}

function couleurDelta(delta: number | null, dnf: boolean): string {
  if (dnf || delta === null || delta === 0) return colors.inkDim;
  return delta > 0 ? colors.pos : colors.accentTexte;
}

/** Les trois couleurs de médaille. Au-delà, la teinte neutre des cartes. */
const MEDAILLES = ['#e2c14d', '#cfd4d8', '#b9793f'];

/**
 * Dessine l'image et renvoie une data-URL PNG, ou `null` si le navigateur ne
 * sait pas dessiner (rendu natif, environnement de test sans canvas). Un
 * `null` doit faire retomber l'appelant sur le partage texte, jamais échouer.
 */
export async function imagePodium(d: DonneesPodium): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = LARGEUR;
  canvas.height = HAUTEUR;
  const ctx = canvas.getContext('2d') as unknown as Contexte2D | null;
  if (!ctx) return null;

  // `canvas` n'attend AUCUNE police : un `fillText` lancé avant la fin du
  // chargement dessine dans la police par défaut, sans le moindre avertissement
  // — et l'image part signée d'un Times New Roman.
  let policeDispo = false;
  try {
    const polices = (document as unknown as { fonts?: { ready: Promise<unknown>; check: (f: string) => boolean } }).fonts;
    if (polices) {
      await polices.ready;
      policeDispo = polices.check('64px "Fraunces_900Black"');
    }
  } catch {
    policeDispo = false;
  }

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

  // Un damier BORD À BORD en tête : il encadre l'image avec celui du pied, et
  // c'est ce qui la fait reconnaître à la vignette d'un fil, avant même d'avoir
  // lu un mot.
  dessinerDamier(ctx, 0, 0, LARGEUR, 30);

  // ── En-tête : le lieu et la date, ce qui situe la course ──────────────
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = policeMarque(66, policeDispo);
  ctx.fillStyle = colors.ink;
  ctx.fillText(couperAuCadre(ctx, d.circuit, LARGEUR - MARGE * 2), MARGE, 170);

  ctx.font = '500 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colors.inkDim;
  ctx.fillText(d.date, MARGE, 260);

  // ── Le podium ─────────────────────────────────────────────────────────
  // Centré OPTIQUEMENT entre l'en-tête et le pied : à trois lignes sur 1350 px,
  // un bloc posé en haut laissait 300 px de vide au milieu de l'image, et le
  // regard tombait dans le trou plutôt que sur les noms.
  const hauteurLigne = 190;
  const hautPodium = Math.max(
    400,
    Math.round((HAUTEUR - 260 - d.lignes.length * hauteurLigne) / 2) + 60,
  );
  d.lignes.forEach((ligne, i) => {
    const y = hautPodium + i * hauteurLigne;

    // Pastille de rang : un aplat plein, lisible à la vignette d'un fil.
    const taille = 108;
    ctx.fillStyle = MEDAILLES[ligne.rang - 1] ?? colors.surface2;
    ctx.fillRect(MARGE, y, taille, taille);
    ctx.textAlign = 'center';
    ctx.font = policeMarque(58, policeDispo);
    // Texte carbone sur les trois médailles (toutes claires), blanc cassé sur
    // la teinte neutre — le même arbitrage que le médaillon de grade.
    ctx.fillStyle = ligne.rang <= 3 ? colors.bg : colors.ink;
    ctx.fillText(String(ligne.rang), MARGE + taille / 2, y + 22);

    ctx.textAlign = 'left';
    ctx.font = '700 56px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = colors.ink;
    ctx.fillText(ligne.nom, MARGE + taille + 40, y + 24);

    ctx.textAlign = 'right';
    ctx.font = policeMarque(56, policeDispo);
    ctx.fillStyle = couleurDelta(ligne.delta, ligne.dnf);
    ctx.fillText(ecrireDelta(ligne.delta, d.abandon, ligne.dnf), LARGEUR - MARGE, y + 24);
  });

  // La règle de l'Elo, en petit : l'image circule chez des gens qui ne
  // connaissent pas l'application, et « +24 » sans contexte ne dit rien.
  ctx.textAlign = 'left';
  ctx.font = '500 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colors.inkDim2;
  ctx.fillText(d.resume, MARGE, hautPodium + d.lignes.length * hauteurLigne + 10);

  // ── Signature (damier + nom + adresse) ────────────────────────────────
  const hauteurSignature = 170;
  dessinerSignature(ctx, MARGE, HAUTEUR - MARGE - hauteurSignature, LARGEUR - MARGE * 2, d.url, policeDispo);

  return canvas.toDataURL('image/png');
}

/** Coupe un texte à la largeur disponible, en mesurant réellement. */
function couperAuCadre(ctx: Contexte2D, texte: string, largeur: number): string {
  if (ctx.measureText(texte).width <= largeur) return texte;
  let court = texte;
  while (court.length > 1 && ctx.measureText(`${court}…`).width > largeur) {
    court = court.slice(0, -1);
  }
  return `${court.trimEnd()}…`;
}
