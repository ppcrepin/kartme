import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * Client Supabase de KartSquad.
 *
 * Les clés (publiques) viennent des variables d'environnement Expo :
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 * En local : fichier .env (non commité). En prod web : injectées par la CI.
 * Un repli "placeholder" évite tout crash au build tant que les clés ne sont
 * pas branchées (l'auth est alors inerte, cf. isSupabaseConfigured).
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

/** Vrai quand de vraies clés Supabase sont fournies. */
export const isSupabaseConfigured =
  !!process.env.EXPO_PUBLIC_SUPABASE_URL && !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Sur natif : AsyncStorage. Sur web : on laisse Supabase choisir (localStorage
// dans le navigateur, mémoire au rendu statique côté serveur) — passer
// AsyncStorage sur le web toucherait `window` pendant l'export statique.
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient(url, anonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // Le web récupère la session dans l'URL après une redirection OAuth.
    detectSessionInUrl: Platform.OS === 'web',
    // NATIF : flux PKCE, ce que `signInWithGoogle` attend. Sans lui,
    // supabase-js reste en flux « implicite » : après Google, l'app est
    // rappelée avec les jetons en FRAGMENT (#access_token=…) alors que le
    // code de connexion cherche `?code=` pour l'échanger — il ne trouve
    // rien, ne fait RIEN, et le pilote reste sur l'écran de connexion.
    // Vécu (TestFlight, 13/08) une fois le retour kartsquad:// autorisé
    // côté Supabase. Le WEB reste en implicite : c'est le flux qui tourne
    // en production depuis le début (OAuth ET liens de réinitialisation),
    // on ne le change pas par effet de bord.
    flowType: Platform.OS === 'web' ? 'implicit' : 'pkce',
  },
});

// Sur NATIF, le rafraîchissement du jeton doit suivre le cycle de vie de
// l'application — c'est le branchement que la documentation Supabase impose
// pour React Native, et son absence était un bug : l'app passe en arrière-
// plan, iOS gèle ses minuteurs, le jeton expire… et au retour, les requêtes
// partent avec un jeton mort. Symptôme vécu (TestFlight, build 8) : des
// « déconnexions » à répétition, déclenchées en apparence par une simple
// fermeture de fenêtre — en réalité par le premier rechargement de données
// venant après le réveil. `startAutoRefresh` au retour au premier plan
// rafraîchit immédiatement ce qui doit l'être ; `stopAutoRefresh` évite de
// laisser tourner un minuteur que le système gèlera de toute façon.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (etat) => {
    if (etat === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
