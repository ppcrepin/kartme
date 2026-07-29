import 'leaflet/dist/leaflet.css';

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';
import { t } from '@/i18n';
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
  const host = useRef<HTMLElement | null>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const leaflet = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  // ÉTAT, pas ref : Leaflet est chargé après un `await`, donc l'effet des
  // marqueurs s'exécute AVANT que l'import ne rende la main. Avec un ref, il
  // lisait « pas encore prêt », sortait, et rien ne le relançait — la carte
  // restait vide jusqu'à ce qu'on touche la liste. Un état, lui, redéclenche.
  const [ready, setReady] = useState(false);
  // Le dernier gestionnaire connu, pour que les marqueurs déjà posés appellent
  // toujours la version à jour. Mis à jour dans un effet, pas pendant le rendu.
  const pick = useRef(onSelect);
  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let alive = true;
    let resize: ReturnType<typeof setTimeout> | null = null;
    // Copie locale : le nettoyage ne doit pas relire `markers.current`, qui
    // aura pu être remplacé entre-temps (avertissement react-hooks).
    const poses = markers.current;
    (async () => {
      const L = await import('leaflet');
      if (!alive || !host.current || map.current) return;
      const m = L.map(host.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([FRANCE.lat, FRANCE.lon], 5);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        // Attribution obligatoire (politique d'usage des tuiles ET licence
        // ODbL des données) : Leaflet l'affiche en bas à droite de la carte.
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      leaflet.current = L;
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      // La carte est créée après le premier rendu : sans ce recalcul, Leaflet
      // garde la taille lue à un instant où le conteneur était encore vide.
      resize = setTimeout(() => m.invalidateSize(), 0);
      // Taille des épingles selon le zoom. À l'échelle de la France, 277
      // pastilles de 18 px se recouvrent en une tache rouge illisible — c'est
      // ce que montrait la capture du PO. On les réduit quand on dézoome.
      const taille = () => {
        const z = m.getZoom();
        m.getContainer().dataset.zoom = z < 7 ? 'loin' : z < 10 ? 'moyen' : 'pres';
      };
      taille();
      m.on('zoomend', taille);
      setReady(true);
    })();
    return () => {
      alive = false;
      if (resize) clearTimeout(resize);
      map.current?.remove();
      // TOUS les refs, pas seulement la carte : au remontage, un layerGroup
      // rattaché à une carte détruite avalait les marqueurs en silence.
      map.current = null;
      layer.current = null;
      leaflet.current = null;
      poses.clear();
      setReady(false);
    };
  }, []);

  // Marqueurs : posés une fois par jeu de circuits. La SÉLECTION ne les
  // recrée pas — 251 icônes détruites et reconstruites à chaque tap faisaient
  // clignoter toute la carte pour mettre un seul point en évidence.
  useEffect(() => {
    const L = leaflet.current;
    if (!ready || !L || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    for (const c of circuits) {
      if (c.lat === null || c.lon === null) continue;
      const marker = L.marker([c.lat, c.lon], {
        title: c.city ? `${c.name}, ${c.city}` : c.name,
        // Sans cela, Leaflet met chaque épingle dans l'ordre de tabulation :
        // 251 arrêts au clavier avant d'atteindre la suite de la page.
        keyboard: false,
        icon: L.divIcon({
          className: '',
          html: '<span class="ks-pin"></span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      });
      marker.on('click', () => pick.current(c));
      marker.addTo(layer.current);
      markers.current.set(c.id, marker);
    }
  }, [ready, circuits]);

  // Mise en évidence : on ne touche QUE les deux épingles concernées.
  useEffect(() => {
    if (!ready) return;
    for (const [id, marker] of markers.current) {
      const pin = marker.getElement()?.firstChild as HTMLElement | undefined;
      pin?.classList.toggle('ks-pin-on', id === selectedId);
    }
  }, [ready, selectedId]);

  // Recentrage sur le pilote dès qu'on connaît sa position. `ready` en
  // dépendance : une position obtenue avant la fin du chargement de Leaflet
  // était sinon perdue pour de bon.
  useEffect(() => {
    if (ready && me && map.current) map.current.setView([me.lat, me.lon], 10);
  }, [ready, me]);

  return (
    <>
      {/* Style des marqueurs : injecté une fois, sans dépendance CSS externe. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .ks-pin{display:block;width:14px;height:14px;border-radius:50%;
              background:${colors.accent};border:2px solid #fff;
              box-shadow:0 1px 3px rgba(0,0,0,.5);cursor:pointer;
              transform:translate(1px,1px)}
            [data-zoom="loin"] .ks-pin{width:8px;height:8px;border-width:1px;
              transform:translate(4px,4px)}
            [data-zoom="moyen"] .ks-pin{width:11px;height:11px;
              transform:translate(2px,2px)}
            .ks-pin-on{outline:3px solid ${colors.accent};outline-offset:2px}
            .leaflet-container{background:${colors.surface};font-family:inherit}
          `,
        }}
      />
      <View
        ref={host as never}
        style={styles.map}
        accessibilityRole="none"
        aria-label={t.races.mapAria}
      />
    </>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 240 },
});
