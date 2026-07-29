import 'leaflet/dist/leaflet.css';

import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';
import type { Position } from '@/lib/geo';
import type { Circuit } from '@/lib/races';

/** Centre de la France : la vue par défaut quand on ignore où est le pilote. */
const FRANCE: Position = { lat: 46.6, lon: 2.4 };

/**
 * Carte des kartings — Leaflet + tuiles OpenStreetMap.
 *
 * Web uniquement (voir `circuits-map.tsx` pour le repli natif) : Leaflet
 * manipule le DOM directement. L'export du site est STATIQUE, donc les pages
 * sont pré-rendues dans Node où `window` n'existe pas — d'où l'import
 * DYNAMIQUE dans l'effet, qui ne s'exécute que dans le navigateur.
 *
 * Aucune image d'épingle : les icônes par défaut de Leaflet sont chargées par
 * chemin relatif et se perdent au passage du bundler. On dessine les marqueurs
 * en HTML (`divIcon`), ce qui les met en prime aux couleurs de la marque.
 */
export function CircuitsMap({
  circuits,
  me,
  selectedId,
  onSelect,
}: {
  circuits: Circuit[];
  me: Position | null;
  selectedId: string | null;
  onSelect: (c: Circuit) => void;
}) {
  const host = useRef<View | null>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const leaflet = useRef<any>(null);
  // Le dernier gestionnaire connu, pour que les marqueurs déjà posés appellent
  // toujours la version à jour. Mis à jour dans un effet, pas pendant le rendu.
  const pick = useRef(onSelect);
  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = await import('leaflet');
      if (!alive || !host.current || map.current) return;
      const m = L.map(host.current as unknown as HTMLElement, {
        zoomControl: true,
        attributionControl: true,
      }).setView([FRANCE.lat, FRANCE.lon], 5);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        // Attribution obligatoire (politique d'usage des tuiles ET licence
        // ODbL des données) : Leaflet l'affiche en bas à droite de la carte.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      leaflet.current = L;
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      // La carte est créée après le premier rendu : sans ce recalcul, Leaflet
      // garde la taille lue à un instant où le conteneur était encore vide.
      setTimeout(() => m.invalidateSize(), 0);
    })();
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Marqueurs : redessinés quand la liste change, pas à chaque rendu.
  useEffect(() => {
    const L = leaflet.current;
    if (!L || !layer.current) return;
    layer.current.clearLayers();
    for (const c of circuits) {
      if (c.lat === null || c.lon === null) continue;
      const actif = c.id === selectedId;
      const marker = L.marker([c.lat, c.lon], {
        title: c.name,
        keyboard: true,
        alt: c.city ? `${c.name}, ${c.city}` : c.name,
        icon: L.divIcon({
          className: '',
          html: `<span class="ks-pin${actif ? ' ks-pin-on' : ''}"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      });
      marker.on('click', () => pick.current(c));
      marker.addTo(layer.current);
    }
  }, [circuits, selectedId]);

  // Recentrage sur le pilote dès qu'on connaît sa position.
  useEffect(() => {
    if (me && map.current) map.current.setView([me.lat, me.lon], 10);
  }, [me]);

  return (
    <>
      {/* Style des marqueurs : injecté une fois, sans dépendance CSS externe. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .ks-pin{display:block;width:14px;height:14px;border-radius:7px;
              background:${colors.accent};border:2px solid #fff;
              box-shadow:0 1px 3px rgba(0,0,0,.5);cursor:pointer}
            .ks-pin-on{width:22px;height:22px;border-radius:11px;margin:-4px 0 0 -4px;
              border-width:3px}
            .leaflet-container{background:${colors.surface};font-family:inherit}
          `,
        }}
      />
      <View ref={host} style={styles.map} />
    </>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 240 },
});
