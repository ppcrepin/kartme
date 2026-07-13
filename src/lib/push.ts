/**
 * Couche client Web Push (lot 2.4). Uniquement le web : sur natif, ce module
 * répond « non supporté » (les push natifs Expo viendront avec les builds
 * iOS/Android). Tout est gardé pour l'export statique (pas de `window` au build).
 *
 * Flux : enregistrer le service worker → demander l'autorisation → s'abonner
 * via la clé VAPID publique → enregistrer l'abonnement en base (push_subscriptions).
 * L'envoi réel des notifications se fait côté serveur (Edge Function, Temps 2).
 */
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Clé VAPID PUBLIQUE (identité du serveur de push). Publique par nature — elle
// est envoyée au navigateur. La clé privée, elle, reste un secret Supabase.
export const VAPID_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ??
  'BKAyhUvDxCfNN2uohuMmT72bxaQu3TusC-uaG1njTnBEoGLOgpbrgdUvisd2zJenDLjELnFY9K4x87HjghcKFoI';

export interface NotificationPrefs {
  invites: boolean;
  results: boolean;
  friendRequests: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = { invites: true, results: true, friendRequests: true };

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushState {
  supported: boolean;
  /** iOS Safari n'autorise le push que si l'app est installée (écran d'accueil). */
  needsInstall: boolean;
  permission: PushPermission;
  subscribed: boolean;
}

function isWeb(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

export function pushSupported(): boolean {
  return (
    isWeb() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// iOS/iPadOS Safari : push seulement en mode « standalone » (PWA installée).
function iosNeedsInstall(): boolean {
  if (!isWeb()) return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const standalone =
    (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  return isIOS && !standalone;
}

function basePath(): string {
  const base = process.env.EXPO_BASE_URL ?? '';
  return `${base}/`.replace(/\/+/g, '/');
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const scope = basePath();
  const existing = await navigator.serviceWorker.getRegistration(scope);
  if (existing) return existing;
  return navigator.serviceWorker.register(`${scope}sw.js`, { scope });
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) {
    return {
      supported: false,
      needsInstall: iosNeedsInstall(),
      permission: 'unsupported',
      subscribed: false,
    };
  }
  const permission = Notification.permission as PushPermission;
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(basePath());
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      // L'abonnement navigateur existe : il n'est « activé » que si la base me
      // l'attribue à MOI. La RLS ne montre que mes lignes, donc une ligne
      // visible = l'endpoint m'appartient (sinon c'est le reliquat d'un autre
      // compte sur cet appareil → je devrai réactiver, ce qui le réattribue).
      const { data } = await supabase
        .from('push_subscriptions')
        .select('endpoint')
        .eq('endpoint', sub.endpoint)
        .maybeSingle();
      subscribed = !!data;
    }
  } catch {
    /* ignore */
  }
  return { supported: true, needsInstall: iosNeedsInstall(), permission, subscribed };
}

/** Active les notifications : SW + permission + abonnement + enregistrement DB. */
export async function enablePush(): Promise<{ ok: boolean; reason?: PushPermission }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission as PushPermission };

  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user?.id || !json.endpoint || !json.keys) return { ok: false };

    // RPC (security definer) : réattribue l'endpoint à MOI, en purgeant tout
    // propriétaire antérieur — un upsert client ne le pourrait pas (RLS).
    const { error } = await supabase.rpc('register_push_subscription', {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent?.slice(0, 200) ?? null,
    });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    // Échec d'enregistrement du SW ou de l'abonnement (clé invalide, service
    // push injoignable) : l'écran affichera l'erreur.
    return { ok: false };
  }
}

/** Désactive : désabonnement navigateur + suppression en base. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(basePath());
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
}

/** Notification LOCALE de démonstration (prouve SW + autorisation, sans serveur). */
export async function showLocalTestNotification(title: string, body: string): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await registration();
  await reg.showNotification(title, { body, tag: 'kartsquad-test' });
  return true;
}

// ── Préférences (notification_preferences) ─────────────────────────────────
export async function getPreferences(): Promise<NotificationPrefs> {
  const { data: auth } = await supabase.auth.getUser();
  const profileId = auth.user?.id;
  if (!profileId) return DEFAULT_PREFS;
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('invites, results, friend_requests')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error || !data) return DEFAULT_PREFS;
  return { invites: data.invites, results: data.results, friendRequests: data.friend_requests };
}

export async function savePreferences(prefs: NotificationPrefs): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const profileId = auth.user?.id;
  if (!profileId) return;
  const { error } = await supabase.from('notification_preferences').upsert(
    {
      profile_id: profileId,
      invites: prefs.invites,
      results: prefs.results,
      friend_requests: prefs.friendRequests,
    },
    { onConflict: 'profile_id' },
  );
  if (error) throw new Error(error.message);
}
