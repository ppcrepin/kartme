/**
 * Photo de profil (A7) — sélection, redimensionnement, envoi, liens signés.
 *
 * Web uniquement, comme le push : la prod tourne en PWA et aucune dépendance
 * de sélection d'image n'est nécessaire (`<input type="file">` + `<canvas>`
 * suffisent). Sur natif, `avatarPickSupported()` répond non — les builds
 * iOS/Android viendront avec leur propre sélecteur.
 *
 * Le redimensionnement AVANT envoi n'est pas cosmétique : une photo de
 * téléphone pèse 3 à 5 Mo, une vignette 512 px en pèse 40 à 80 Ko. C'est le
 * facteur 50 sur la facture de stockage et sur le temps d'envoi au bord d'une
 * piste, en 3G.
 */
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
/** Côté de la vignette carrée produite. Au-delà, personne ne voit la différence. */
const SIZE = 512;
/** Qualité JPEG : 0,82 est le point où l'œil ne distingue plus, et le poids chute. */
const QUALITY = 0.82;
/**
 * Durée de validité d'un lien signé. Court volontairement : un lien est un
 * jeton autonome, la règle de lecture n'est évaluée qu'à la SIGNATURE. Un TTL
 * d'une heure laissait une photo retirée — ou un pilote qui vient de bloquer
 * quelqu'un — exposés pendant tout ce temps. L'app re-signe à chaque retour
 * sur l'écran de toute façon : le TTL long n'apportait rien.
 */
const SIGNED_TTL_S = 5 * 60;
/** Au-delà, on refuse AVANT de décoder : décoder 100 Mpx tue l'onglet. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** Erreur d'envoi de photo, avec une cause que l'écran sait traduire. */
export type AvatarErrorCode = 'tooBig' | 'notAnImage' | 'unreadable' | 'generic';
export class AvatarError extends Error {
  constructor(public code: AvatarErrorCode) {
    super(code);
  }
}

function isWeb(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

export function avatarPickSupported(): boolean {
  return isWeb() && typeof document !== 'undefined';
}

/** Ouvre le sélecteur de fichiers et renvoie l'image choisie (null si annulé). */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    if (!avatarPickSupported()) return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Sur iOS, sans ça, le sélecteur propose la caméra ET la photothèque —
    // c'est bien ce qu'on veut, on ne restreint pas.
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // `oncancel` est disponible partout depuis 2023. Sans lui, chaque
    // annulation abandonnait définitivement une promesse et son closure.
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Recadre au centre en carré, redimensionne à SIZE, ré-encode en JPEG.
 * Le recadrage centré évite un aplatissement : une photo 16:9 étirée dans un
 * cercle est immédiatement laide.
 */
export async function toSquareJpeg(file: File): Promise<Blob> {
  // Contrôles AVANT décodage : `createImageBitmap` développe l'image entière en
  // mémoire (une photo de 100 Mpx = ~400 Mo de RGBA) avant tout
  // redimensionnement. Le plafond du bucket ne protège que le serveur.
  if (!file.type.startsWith('image/')) throw new AvatarError('notAnImage');
  if (file.size > MAX_INPUT_BYTES) throw new AvatarError('tooBig');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Cas le plus fréquent : un HEIC d'iPhone, que seul Safari décode.
    throw new AvatarError('unreadable');
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AvatarError('generic');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', QUALITY),
    );
    if (!blob) throw new AvatarError('generic');
    return blob;
  } finally {
    // `finally` : sur un drawImage en échec, le bitmap fuyait.
    bitmap.close?.();
  }
}

/**
 * Envoie la photo et met à jour le profil. Renvoie le nouveau chemin.
 *
 * Le nom de fichier est ALÉATOIRE : sans ça, remplacer sa photo laisserait les
 * liens signés de l'ancienne valables jusqu'à leur expiration, et les caches
 * navigateur afficheraient encore l'image précédente.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Non authentifié');

  const blob = await toSquareJpeg(file);
  // `crypto.randomUUID` exige un contexte sécurisé : absent en dev sur une IP
  // LAN en http. Le repli n'a pas besoin d'être cryptographique, juste unique.
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${uid}/${rand}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw new Error(upErr.message);

  // Le profil ne pointe la nouvelle photo qu'une fois l'envoi RÉUSSI : en cas
  // d'échec, l'ancienne reste affichée plutôt qu'un carré vide. En contrepartie,
  // il faut ramasser le fichier qu'on vient d'écrire si la mise à jour rate —
  // sinon il reste dans le bucket, référencé par personne.
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  // L'ancienne photo est mise en file par un trigger serveur ; on tente aussi
  // la suppression tout de suite, tant qu'on a les droits du propriétaire.
  await collectGarbage();
  return path;
}

/** Retire sa propre photo. Le fichier devient illisible, puis est supprimé. */
export async function removeMyAvatar(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Non authentifié');
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', uid);
  if (error) throw new Error(error.message);
  await collectGarbage();
}

/**
 * Supprime réellement MES fichiers mis en file par le serveur. Le SQL ne sait
 * pas écrire dans un bucket ; le propriétaire, si. Silencieux par nature : un
 * fichier non ramassé n'est qu'un déchet, jamais une fuite (il est déjà
 * illisible côté serveur).
 */
async function collectGarbage(): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { data } = await supabase.from('avatar_gc').select('path').like('path', `${uid}/%`).limit(20);
    const paths = (data ?? []).map((r: { path: string }) => r.path);
    if (paths.length === 0) return;
    await supabase.storage.from(BUCKET).remove(paths);
    await supabase.from('avatar_gc').delete().in('path', paths);
  } catch {
    /* le serveur garde la trace : ce sera ramassé plus tard */
  }
}

/**
 * Liens signés pour PLUSIEURS chemins d'un coup. Un écran de classement
 * affiche vingt pilotes : vingt requêtes de signature seraient vingt allers-
 * retours pour une seule liste.
 *
 * Tolérant par construction : un chemin qu'on n'a pas le droit de lire (profil
 * privé non-ami, pilote bloqué, photo retirée par la modération) est
 * simplement absent du résultat — l'écran retombe sur les initiales.
 */
export async function signedAvatarUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(wanted, SIGNED_TTL_S);
    if (error || !data) return out;
    for (const row of data) {
      if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
    }
  } catch {
    // Photos indisponibles : ce n'est jamais une raison de casser un écran.
  }
  return out;
}
