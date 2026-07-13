// KartSquad — Edge Function « push » (lot 2.4, Temps 2 : envoi réel).
//
// Appelée par les déclencheurs de la base (pg_net) à chaque événement notifiable
// (invitation / résultat / demande d'ami), UNE fois par destinataire. Elle :
//   1. vérifie un secret partagé (seuls les triggers appellent) ;
//   2. respecte la préférence du destinataire (interrupteur du bon type) ;
//   3. respecte ses heures de silence (défaut 22h→8h, Europe/Paris) ;
//   4. envoie le Web Push à chacun de ses appareils abonnés ;
//   5. purge les abonnements expirés (404/410).
//
// Secrets attendus (Supabase → Edge Functions → push → Secrets) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), PUSH_HOOK_SECRET
//   (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

type NotifType = 'invite' | 'result' | 'friend_request';
const PREF_COLUMN: Record<NotifType, string> = {
  invite: 'invites',
  result: 'results',
  friend_request: 'friend_requests',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

// Heure pleine [0..23] à Paris, sans dépendance externe.
function parisHour(): number {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return parseInt(s, 10) % 24;
}

// Silence si l'heure ∈ [start, end) ; la plage peut enjamber minuit (22→8).
function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-hook-secret') !== Deno.env.get('PUSH_HOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  let payload: { type?: NotifType; recipient?: string; title?: string; body?: string; url?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  const { type, recipient, title, body, url } = payload;
  if (!type || !recipient || !title || !Object.hasOwn(PREF_COLUMN, type)) {
    return new Response('bad request', { status: 400 });
  }

  // Préférence + heures de silence (défauts si aucune ligne).
  const { data: pref } = await supabase
    .from('notification_preferences')
    .select('invites, results, friend_requests, quiet_start, quiet_end')
    .eq('profile_id', recipient)
    .maybeSingle();

  const enabled = pref ? (pref as Record<string, boolean>)[PREF_COLUMN[type]] : true;
  if (!enabled) return Response.json({ skipped: 'muted' });

  const qStart = pref?.quiet_start ?? 22;
  const qEnd = pref?.quiet_end ?? 8;
  if (inQuietHours(parisHour(), qStart, qEnd)) return Response.json({ skipped: 'quiet_hours' });

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('profile_id', recipient);

  if (!subs || subs.length === 0) return Response.json({ sent: 0 });

  // Tag distinct par cible (ex. « invite:race/123 ») pour que deux courses
  // différentes ne se remplacent pas dans le centre de notifications ; les
  // événements sans cible précise (demandes d'amis, url « amis ») se regroupent.
  const tag = url ? `${type}:${url}` : type;
  const message = JSON.stringify({ title, body: body ?? '', url: url ?? '', tag });
  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, message);
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          removed += 1;
        }
      }
    }),
  );

  return Response.json({ sent, removed });
});
