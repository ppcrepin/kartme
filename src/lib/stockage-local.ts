import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Mémoire locale synchrone, web ET natif.
 *
 * Tout ce qui mémorise un petit choix d'appareil (mode de saisie, checklist
 * masquée, parrain d'inscription) était écrit sur `window.localStorage` — qui
 * N'EXISTE PAS sous React Native. Les gardes `typeof window` laissaient
 * passer (RN définit un `window` sans localStorage), l'écriture partait dans
 * le vide en silence, et la checklist fermée d'une croix RÉAPPARAISSAIT à
 * chaque lancement de l'app iPhone. Retour TestFlight, build 8.
 *
 * Le natif n'offre qu'un stockage ASYNCHRONE (AsyncStorage) alors que tous
 * les appelants lisent de façon SYNCHRONE. Le pont : un cache mémoire,
 * hydraté depuis AsyncStorage dès le chargement du module, écrit en
 * write-through. Fenêtre assumée : une lecture dans les toutes premières
 * centaines de millisecondes après un démarrage À FROID peut précéder
 * l'hydratation et rendre null. Pour des préférences d'affichage, l'effet se
 * borne à revoir une carte une fois — rien qui justifie de rendre asynchrones
 * quatre appelants synchrones.
 */

const CLES = ['ks_mode_saisie', 'ks_checklist_masquee', 'ks_ref', 'ks_pending_route'] as const;

const cache = new Map<string, string>();
let hydrate = false;

if (Platform.OS !== 'web') {
  AsyncStorage.multiGet([...CLES])
    .then((paires) => {
      for (const [cle, valeur] of paires) {
        // Ne pas écraser une écriture arrivée PENDANT l'hydratation : elle
        // est plus récente que ce que le disque vient de livrer.
        if (valeur !== null && !cache.has(cle)) cache.set(cle, valeur);
      }
      hydrate = true;
    })
    .catch(() => {
      hydrate = true; // stockage indisponible : on vit en mémoire seule
    });
}

function webStorage(): Storage | null {
  try {
    // Détection par CAPACITÉ, pas par plateforme : React Native définit un
    // `window` SANS localStorage (le piège qui a produit ce module), et les
    // tests unitaires injectent un localStorage factice sur une plateforme
    // simulée « ios ». Seule question qui compte : y a-t-il un localStorage ?
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // navigation privée : localStorage peut jeter à l'accès
  }
}

export function lireLocal(cle: string): string | null {
  const web = webStorage();
  if (web) {
    try {
      return web.getItem(cle);
    } catch {
      return null;
    }
  }
  return cache.get(cle) ?? null;
}

export function ecrireLocal(cle: string, valeur: string): void {
  const web = webStorage();
  if (web) {
    try {
      web.setItem(cle, valeur);
    } catch {
      /* quota ou navigation privée : tant pis, préférence de confort */
    }
    return;
  }
  cache.set(cle, valeur);
  AsyncStorage.setItem(cle, valeur).catch(() => {});
}

export function effacerLocal(cle: string): void {
  const web = webStorage();
  if (web) {
    try {
      web.removeItem(cle);
    } catch {
      /* idem */
    }
    return;
  }
  cache.delete(cle);
  AsyncStorage.removeItem(cle).catch(() => {});
}

/** Exposé pour les tests : l'hydratation a-t-elle eu lieu ? */
export function stockageHydrate(): boolean {
  return Platform.OS === 'web' || hydrate;
}
