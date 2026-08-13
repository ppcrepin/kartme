import { Alert, Platform } from 'react-native';

/**
 * La boîte noire du vol d'essai.
 *
 * Sur le web, une erreur JavaScript fatale s'affiche dans la console du
 * navigateur. Sur un iPhone TestFlight, RIEN : React Native convertit
 * l'erreur en abandon du processus, et le rapport de plantage d'Apple (.ips)
 * consigne la pile NATIVE de cet abandon — jamais le message JavaScript.
 * Vécu, builds 3 et 4 : « RCTExceptionsManager reportFatal », et pas un mot
 * de plus. Sans Mac branché au téléphone, le message est simplement perdu.
 *
 * LE BON CROCHET, appris à la dure. Le build 4 accrochait
 * `ErrorUtils.setGlobalHandler` : jamais appelé. En architecture bridgeless
 * (RN 0.86), les erreurs fatales — évaluation du bundle et rendu React
 * compris — descendent le pipeline C++ (JsErrorHandler) sans passer par
 * ErrorUtils. Une première correction visait `RN$handleException` :
 * inutilisable, ce global est défini par le natif en LECTURE SEULE
 * (defineReadOnlyGlobal, ReactInstance.cpp) — l'assignation était un no-op
 * silencieux. Le crochet réellement prévu pour ça est
 * `RN$registerExceptionListener` : le listener est appelé par JsErrorHandler
 * pour CHAQUE erreur, y compris avant que le runtime soit prêt, et son
 * `preventDefault()` supprime le `reportFatal` natif — donc l'abandon du
 * processus. C'est exactement ainsi que LogBox garde l'application en vie en
 * développement (Libraries/LogBox/LogBox.js). Contrats vérifiés dans les
 * sources : ReactInstance.cpp (~543) et JsErrorHandler.cpp (~151-171, champs
 * `message`, `stack` [tableau de trames], `isFatal`).
 *
 * L'écran reste ensuite figé sur le splash, ce qui est voulu : une
 * application dont le démarrage a échoué N'EST PAS dans un état où la
 * laisser continuer a un sens. On échange un plantage muet contre un écran
 * figé qui parle.
 *
 * ⚠ REVERS DE LA MÉDAILLE (relecture) : tant que ce module est actif, une
 * erreur fatale ne produit plus AUCUN rapport .ips chez Apple — l'alerte
 * remplace le plantage, donc la télémétrie de plantage aussi. Acceptable
 * pendant TestFlight où le seul « télémètre » est le PO et son téléphone ;
 * à RECONSIDÉRER avant la publication App Store (conditionner, ou brancher
 * sur logError une fois Supabase joignable).
 */

/** Une trame telle que JsErrorHandler la sérialise (bridging::toJs). */
interface Trame {
  file?: string | null;
  methodName?: string;
  lineNumber?: number | null;
  column?: number | null;
}

/** La charge utile passée au listener d'exceptions. */
interface ExceptionNative {
  message?: string;
  stack?: Trame[];
  isFatal?: boolean;
  preventDefault?: () => void;
}

type Gestionnaire = (erreur: unknown, fatale?: boolean) => void;

interface AvecCrochets {
  ErrorUtils?: {
    getGlobalHandler(): Gestionnaire;
    setGlobalHandler(gestionnaire: Gestionnaire): void;
  };
  RN$registerExceptionListener?: (listener: (e: ExceptionNative) => void) => void;
}

const holder = globalThis as AvecCrochets;

// Une erreur de rendu peut se redéclencher en boucle : seule la PREMIÈRE
// compte, les suivantes empileraient des alertes par-dessus la sienne.
let dejaAffichee = false;

function afficher(message: string, pile: string): void {
  if (dejaAffichee) return;
  dejaAffichee = true;
  // La console est muette sur un iPhone sans Mac, mais si un Mac est un
  // jour branché, autant que la trace y soit.
  console.error('[boite-noire] erreur fatale interceptée :', message, pile);
  Alert.alert('Erreur au démarrage', pile ? `${message}\n\n${pile}` : message);
}

function pileDepuisTrames(trames: Trame[] | undefined): string {
  if (!trames || trames.length === 0) return '';
  // Les premières trames suffisent à situer le coupable ; au-delà, l'alerte
  // devient illisible sur un écran de téléphone.
  return trames
    .slice(0, 8)
    .map((t) => `${t.methodName ?? '?'} (${t.file ?? '?'}:${t.lineNumber ?? '?'})`)
    .join('\n');
}

// En développement, LogBox et la RedBox de Metro font mieux que notre alerte :
// on ne s'installe qu'en production.
if (!__DEV__ && Platform.OS !== 'web') {
  // Le chemin réel des erreurs fatales en bridgeless — celui des builds 3 et 4.
  holder.RN$registerExceptionListener?.((e) => {
    if (!e.isFatal) return; // non fatal : la chaîne normale (console) suffit
    // Supprime le reportFatal natif : le processus survit, l'alerte vit.
    e.preventDefault?.();
    afficher(e.message ?? 'Erreur inconnue', pileDepuisTrames(e.stack));
  });

  // Le chemin historique (callbacks « gardés » : timers, événements), gardé
  // en ceinture et bretelles.
  if (holder.ErrorUtils) {
    const origine = holder.ErrorUtils.getGlobalHandler();
    holder.ErrorUtils.setGlobalHandler((erreur, fatale) => {
      if (!fatale) {
        origine(erreur, fatale);
        return;
      }
      // Surtout NE PAS rappeler `origine` pour une fatale : en production il
      // abandonne le processus, et l'alerte n'aurait jamais le temps de
      // s'afficher.
      const message =
        erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur);
      const pile =
        erreur instanceof Error && erreur.stack
          ? erreur.stack.split('\n').slice(0, 10).join('\n')
          : '';
      afficher(message, pile);
    });
  }
}
