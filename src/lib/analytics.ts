/**
 * Analytics & observabilité (lot 3.2) — 100 % maison (Supabase), aucun tiers.
 * Best-effort : jamais bloquant, jamais d'erreur remontée à l'UI.
 * On ne track QUE ce que les tables ne savent pas déjà (app_open, signup +
 * parrain, share_clicked, rematch). Le reste est dérivé en SQL (get_metrics).
 */
import { supabase } from '@/lib/supabase';

const REF_KEY = 'ks_ref';
let referrer: string | null = null;

// Un parrain n'est accepté que s'il ressemble à un UUID (sinon K-factor
// falsifiable par un ?ref= arbitraire). La correspondance à un vrai profil et
// l'exclusion de l'auto-parrainage sont revérifiées côté serveur (get_metrics).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Capture le parrain depuis l'URL (web) au démarrage, puis le mémorise. Deux
 * formes :
 *   · `?ref=<profileId>` — les liens de course et de profil, qui doivent
 *     porter le parrain explicitement (leur chemin désigne une course, pas un
 *     pilote) ;
 *   · `/invite/<profileId>` — le lien d'ami (A19), dont le CHEMIN nomme déjà
 *     l'invitant. Lui coller un `?ref=` identique rallongeait pour rien un lien
 *     fait pour être collé dans une conversation ; sans cette lecture, en
 *     revanche, les inscriptions venues du canal d'acquisition n°1 arrivaient
 *     SANS parrain et le K-factor du tableau de bord les ignorait — la seule
 *     mesure qui dit si le lien fonctionne.
 */
export function captureReferralFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const u = new URL(window.location.href);
    // Le déploiement vit sous /kartme : on cherche le SEGMENT, pas un préfixe.
    const duChemin = /(?:^|\/)invite\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;
    const deLaQuery = u.searchParams.get('ref');
    // ⚠️ On ne prend la query que si elle VALIDE. Avec un simple `??`, elle
    // court-circuitait le chemin même vide ou fantaisiste : coller `?ref=` à un
    // lien d'ami effaçait l'attribution de l'invitant d'un seul caractère, et
    // `?ref=<autre>` la lui VOLAIT — sur un lien public, trivial à altérer
    // avant de le repartager.
    const ref = deLaQuery && UUID_RE.test(deLaQuery) ? deLaQuery : duChemin;
    const store = safeLocalStorage();
    if (ref && UUID_RE.test(ref)) {
      referrer = ref;
      store?.setItem(REF_KEY, ref);
    } else if (!referrer) {
      referrer = store?.getItem(REF_KEY) ?? null;
    }
  } catch {
    /* URL invalide : on ignore */
  }
}

export function getReferrer(): string | null {
  if (!referrer) referrer = safeLocalStorage()?.getItem(REF_KEY) ?? null;
  return referrer;
}

export function clearReferrer(): void {
  referrer = null;
  safeLocalStorage()?.removeItem(REF_KEY);
}

/** Ajoute ?ref=<id> à un lien de partage (pour attribuer les inscriptions). */
export function withRef(url: string, myId: string | undefined): string {
  if (!myId) return url;
  return url.includes('?') ? `${url}&ref=${myId}` : `${url}?ref=${myId}`;
}

/** Événement best-effort (silencieux). On ne track que connecté (RLS). */
export async function track(name: string, props?: Record<string, unknown>): Promise<void> {
  try {
    // getSession = cache local (pas de round-trip réseau) → best-effort robuste hors-ligne.
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await supabase.from('analytics_events').insert({ profile_id: uid, name, props: props ?? {} });
  } catch {
    /* silencieux */
  }
}

/** Événement d'inscription (avec parrain éventuel), émis après création du profil. */
export async function trackSignup(): Promise<void> {
  const ref = getReferrer();
  await track('signup', ref ? { ref } : {});
  clearReferrer();
}

// Anti-flood : ignore une erreur identique répétée dans une courte fenêtre
// (un crash de rendu peut se déclencher à chaque frame → inutile d'inonder).
let lastErr = '';
let lastErrAt = 0;

/** Capture d'erreur (garde-fou global). Silencieux, tolère la déconnexion. */
export async function logError(message: string, context?: string): Promise<void> {
  try {
    const now = Date.now();
    if (message === lastErr && now - lastErrAt < 10_000) return;
    lastErr = message;
    lastErrAt = now;
    const { data } = await supabase.auth.getSession();
    await supabase.from('error_logs').insert({
      profile_id: data.session?.user.id ?? null,
      message: message.slice(0, 500),
      context: context ? context.slice(0, 200) : null,
    });
  } catch {
    /* silencieux */
  }
}

export interface Metrics {
  users_total: number;
  active_7d: number;
  races_completed: number;
  ghosts_total: number;
  activation_rate: number | null;
  raced_rate: number | null;
  retention_7d: number | null;
  cohort_7d: number;
  shares: number;
  signups_tracked: number;
  referred_signups: number;
  k_factor: number | null;
  invite_accepts: number;
  invite_signups: number;
  rematches: number;
  friends_accepted: number;
  badges_unlocked: number;
  errors_7d: number;
  recent_errors: { message: string; context: string | null; created_at: string }[];
}

export async function getMetrics(): Promise<Metrics> {
  const { data, error } = await supabase.rpc('get_metrics');
  if (error) throw new Error(error.message);
  return data as Metrics;
}
