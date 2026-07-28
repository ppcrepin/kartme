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
/** Durée de validité d'un lien signé. Assez long pour une session, assez court
 *  pour qu'un lien copié ne circule pas éternellement. */
const SIGNED_TTL_S = 60 * 60;

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
    // Annulation : aucun événement fiable multi-navigateur. On ne résout donc
    // pas — la promesse reste en attente et l'écran ne change simplement pas.
    input.click();
  });
}

/**
 * Recadre au centre en carré, redimensionne à SIZE, ré-encode en JPEG.
 * Le recadrage centré évite un aplatissement : une photo 16:9 étirée dans un
 * cercle est immédiatement laide.
 */
export async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('Conversion impossible');
  return blob;
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
  const path = `${uid}/${crypto.randomUUID()}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw new Error(upErr.message);

  // Le profil ne pointe la nouvelle photo qu'une fois l'envoi RÉUSSI : en cas
  // d'échec, l'ancienne reste affichée plutôt qu'un carré vide.
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
  if (error) throw new Error(error.message);
  return path;
}

/** Retire sa propre photo (le fichier orphelin devient illisible côté serveur). */
export async function removeMyAvatar(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Non authentifié');
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', uid);
  if (error) throw new Error(error.message);
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
