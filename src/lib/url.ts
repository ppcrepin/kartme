import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * URL de base de l'app (avec le sous-chemin de déploiement, ex. « /kartme/ »).
 * Sur le web on la reconstruit depuis l'origine + EXPO_BASE_URL, car le calcul
 * automatique oublie le sous-chemin sous GitHub Pages.
 */
export function appBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const base = process.env.EXPO_BASE_URL ?? '';
    return `${window.location.origin}${base}/`.replace(/([^:]\/)\/+/g, '$1');
  }
  return Linking.createURL('/');
}
