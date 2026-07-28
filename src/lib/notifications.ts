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
import { supabase } from '@/lib/supabase';

export type NotificationType = 'invite' | 'result' | 'friend_request' | 'report' | string;

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

/** Les 50 dernières notifications (et purge des plus de 90 jours, côté serveur). */
export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('list_notifications');
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

/** Marque toute la boîte comme lue (à l'ouverture de l'écran). */
export async function markAllRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read');
  if (error) throw new Error(error.message);
}

/**
 * Route expo-router pour une notification. Les URL viennent du serveur et sont
 * relatives par construction ; on refuse tout ce qui ressemble à une URL absolue
 * ou à un schéma (défense en profondeur : une notification ne doit jamais
 * pouvoir expédier un pilote hors de l'app).
 */
export function routeFor(n: AppNotification): string | null {
  const u = n.url?.trim();
  if (!u) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return null;
  return u.startsWith('/') ? u : `/${u}`;
}
