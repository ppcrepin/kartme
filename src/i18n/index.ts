/**
 * Socle i18n — catalogue de chaînes par langue, avec repli sur le français.
 * Usage : `import { t } from '@/i18n'; t.tabs.races`.
 *
 * Français uniquement au lancement. Pour ajouter une langue :
 *   1. dupliquer fr.ts (ex. en.ts) ;
 *   2. l'ajouter au catalogue ci-dessous ;
 *   3. brancher la détection de langue de l'appareil (expo-localization) sur
 *      `resolveLocale()` — laissé volontairement de côté tant qu'une seule
 *      langue existe.
 */
import { fr } from './fr';

export type Messages = typeof fr;

const catalogs = { fr } satisfies Record<string, Messages>;
type LocaleKey = keyof typeof catalogs;

const DEFAULT_LOCALE: LocaleKey = 'fr';

function resolveLocale(): LocaleKey {
  // Une seule langue disponible pour l'instant.
  return DEFAULT_LOCALE;
}

export const locale = resolveLocale();
export const t: Messages = catalogs[locale];
