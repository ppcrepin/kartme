import { Alert, Platform } from 'react-native';

/**
 * La boîte noire du vol d'essai.
 *
 * Sur le web, une erreur JavaScript fatale s'affiche dans la console du
 * navigateur. Sur un iPhone TestFlight, RIEN : React Native convertit
 * l'erreur en abandon du processus, et le rapport de plantage d'Apple (.ips)
 * consigne la pile NATIVE de cet abandon — jamais le message JavaScript.
 * Vécu, build 3 : « RCTExceptionsManager reportFatal », et pas un mot de
 * plus. Sans Mac branché au téléphone, le message est simplement perdu.
 *
 * Ce module intercepte donc le gestionnaire global d'erreurs et remplace le
 * plantage par une alerte NATIVE (UIKit) qui montre le message et la pile.
 * `Alert` ne dépend pas de l'arbre React : il s'affiche même quand le rendu
 * n'a jamais abouti — précisément le cas qu'on cherche à voir.
 *
 * L'écran reste alors figé sur le splash, ce qui est voulu : une application
 * dont le démarrage a échoué N'EST PAS dans un état où la laisser continuer
 * a un sens. On échange un plantage muet contre un écran figé qui parle.
 *
 * Les erreurs NON fatales gardent le comportement d'origine.
 *
 * ⚠ REVERS DE LA MÉDAILLE (relecture) : tant que ce module est actif, une
 * erreur fatale ne produit plus AUCUN rapport .ips chez Apple — l'alerte
 * remplace le plantage, donc la télémétrie de plantage aussi. Acceptable
 * pendant TestFlight où le seul « télémètre » est le PO et son téléphone ;
 * à RECONSIDÉRER avant la publication App Store (conditionner, ou brancher
 * sur logError une fois Supabase joignable).
 */

type Gestionnaire = (erreur: unknown, fatale?: boolean) => void;

interface AvecErrorUtils {
  ErrorUtils?: {
    getGlobalHandler(): Gestionnaire;
    setGlobalHandler(gestionnaire: Gestionnaire): void;
  };
}

const holder = globalThis as AvecErrorUtils;

// En développement, le gestionnaire d'origine affiche la RedBox de Metro,
// bien plus riche que notre alerte : on ne s'installe qu'en production.
if (!__DEV__ && Platform.OS !== 'web' && holder.ErrorUtils) {
  const origine = holder.ErrorUtils.getGlobalHandler();
  let dejaAffichee = false;
  holder.ErrorUtils.setGlobalHandler((erreur, fatale) => {
    if (!fatale) {
      origine(erreur, fatale);
      return;
    }
    // Une erreur de rendu peut se redéclencher en boucle : seule la PREMIÈRE
    // compte, les suivantes empileraient des alertes par-dessus la sienne.
    if (dejaAffichee) return;
    dejaAffichee = true;
    const message =
      erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur);
    // Les premières lignes de pile suffisent à situer le coupable ; au-delà,
    // l'alerte devient illisible sur un écran de téléphone.
    const pile =
      erreur instanceof Error && erreur.stack
        ? erreur.stack.split('\n').slice(0, 10).join('\n')
        : '';
    // Surtout NE PAS rappeler `origine` ici : en production il abandonne le
    // processus, et l'alerte n'aurait jamais le temps de s'afficher.
    // La console est muette sur un iPhone sans Mac, mais si un Mac est un
    // jour branché, autant que la trace y soit.
    console.error('[boite-noire] erreur fatale interceptée :', erreur);
    Alert.alert('Erreur au démarrage', pile ? `${message}\n\n${pile}` : message);
  });
}
