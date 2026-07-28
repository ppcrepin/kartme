/**
 * Centre de notifications in-app (A5) — la boîte de réception.
 *
 * Complément, et non doublon, du Web Push : le push n'arrive pas sur iOS hors
 * PWA installée, et beaucoup de pilotes refusent l'autorisation. La boîte, elle,
 * marche partout et reste consultable après coup.
 *
 * Alimentée côté serveur par enqueue_push() : tout événement notifiable y
 * atterrit, sans qu'un déclencheur ait à le savoir.
 */
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';

/** Destination acceptée par expo-router (routes typées). */
type Route = Parameters<typeof router.push>[0];

/** Types émis par le serveur. Ouvert : un futur déclencheur ne doit pas casser la boîte. */
export type NotificationType = string;

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Destination in-app relative (ex. « race/<uuid> », « amis »). */
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

type Raw = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Une page de 50 notifications, récentes d'abord. `before` = `createdAt` de la
 * dernière ligne déjà reçue (curseur) : sans pagination, l'historique au-delà
 * de la première page serait définitivement inatteignable.
 */
export async function listNotifications(before?: string): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('list_notifications', { p_before: before ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Raw[]).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

/**
 * Nombre de non lues, plafonné à 100 côté serveur (la pastille affiche « 99+ »).
 * Volontairement tolérant : la cloche ne doit JAMAIS faire échouer un écran —
 * en cas d'erreur réseau on renvoie 0 plutôt que de propager.
 */
export async function unreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_notifications_count');
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

/**
 * Marque comme lues les notifications DONNÉES — celles que l'écran vient
 * réellement d'afficher. Un marquage global effacerait aussi les lignes
 * au-delà du plafond d'affichage : jamais vues, et introuvables ensuite.
 */
export async function markRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
  if (error) throw new Error(error.message);
}

/**
 * Route expo-router pour une notification. Les URL viennent du serveur et sont
 * relatives par construction ; on refuse tout ce qui ressemble à une URL absolue
 * ou à un schéma (défense en profondeur : une notification ne doit jamais
 * pouvoir expédier un pilote hors de l'app).
 */
export function routeFor(n: AppNotification): Route | null {
  const u = n.url?.trim();
  if (!u) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return null;
  // Route construite à l'exécution : les routes typées d'expo-router ne
  // peuvent pas la vérifier — d'où le filtre ci-dessus, qui garantit au moins
  // qu'on ne quitte jamais l'app.
  return (u.startsWith('/') ? u : `/${u}`) as Route;
}
