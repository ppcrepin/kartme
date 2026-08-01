/*
 * Service worker Web Push de KartSquad (lot 2.4).
 * Rôle minimal : afficher la notification reçue et, au clic, ouvrir l'app sur
 * l'écran concerné (deep-link). Aucune mise en cache offline ici — c'est un
 * worker de notifications, pas une PWA de cache.
 *
 * Le corps du push (envoyé par l'Edge Function) est un JSON :
 *   { title, body, url, tag }
 * url = chemin relatif au sein de l'app (ex. "race/123", "pilot/<id>").
 */

self.addEventListener('install', (event) => {
  // Prendre la main sans attendre un rechargement.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: 'KartSquad', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'KartSquad';
  const options = {
    body: payload.body || '',
    tag: payload.tag || undefined,
    // renotify si un tag identique : on veut réveiller l'utilisateur.
    renotify: !!payload.tag,
    data: { url: payload.url || '' },
    // Icône par DÉFAUT : sans elle, le navigateur affiche sa pastille
    // générique — et la notification push est le seul endroit où la marque se
    // voit hors de l'application. Résolue contre le scope du service worker,
    // donc le sous-chemin de déploiement est pris en compte tout seul.
    icon: payload.icon || new URL('icone-192.png', self.registration.scope).href,
    badge: payload.badge || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rel = (event.notification.data && event.notification.data.url) || '';

  event.waitUntil(
    (async () => {
      const scopeUrl = new URL(self.registration.scope); // ex. https://host/kartme/
      const targetUrl = new URL(rel || '', scopeUrl).href;

      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Réutiliser un onglet KartSquad déjà ouvert s'il existe.
      for (const client of windows) {
        if (client.url.startsWith(scopeUrl.href) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client && rel) {
            try {
              await client.navigate(targetUrl);
            } catch (_e) {
              /* navigation cross-origin impossible : on garde l'onglet focalisé */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })(),
  );
});
