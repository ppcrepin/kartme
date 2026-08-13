import { useEffect, useState, type ComponentType } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { GardeErreur } from '@/components/garde-erreur';
import { colors, radius, spacing } from '@/constants/theme';
import { logError } from '@/lib/analytics';

/**
 * Le sas de lancement (natif uniquement — le web garde l'entrée classique).
 *
 * Six builds TestFlight, six plantages muets au démarrage : chaque filet posé
 * dans les mécanismes d'erreur de React Native (ErrorUtils, listeners
 * d'exceptions) a été contourné par un chemin interne différent. Ce sas
 * abandonne la subtilité pour la seule construction du langage qui ne peut
 * pas être contournée : un try/catch AUTOUR du chargement de l'application.
 *
 * Séquence :
 *   1. Ce composant se monte SEUL. Il ne dépend ni d'expo-router, ni des
 *      animations, ni des polices, ni de Supabase — uniquement de React et
 *      de deux vues de base. S'il s'affiche, tout le socle natif fonctionne.
 *   2. Une fois posé (150 ms, le temps que l'écran existe vraiment), il
 *      charge la VRAIE application — `require('expo-router/build/
 *      qualified-entry')`, le composant racine officiel d'expo-router, qui
 *      tire à son tour navigation, animations, écrans, tout. Ce require est
 *      SYNCHRONE : la moindre erreur d'initialisation de n'importe quelle
 *      bibliothèque atterrit dans le catch, et s'affiche en toutes lettres.
 *   3. L'application montée est enveloppée dans GardeErreur : une erreur de
 *      RENDU, y compris dans les couches d'expo-router au-dessus de notre
 *      _layout (zone que la frontière posée DANS _layout ne couvrait pas),
 *      s'affiche au lieu de tuer le processus.
 *
 * Trois issues possibles, toutes parlantes :
 *   · l'app démarre — le sas est invisible (150 ms sur l'écran de départ) ;
 *   · un écran d'erreur s'affiche — photographiable, le nom du coupable
 *     enfin visible ;
 *   · le plantage persiste sans écran — alors l'erreur est NATIVE, sous le
 *     JavaScript, et c'est une information tout aussi décisive : on change
 *     de chantier (et le .ips suivant se lit autrement).
 */

/** Charge l'application réelle. Synchrone ; toute erreur part dans le catch. */
function chargerApplication(): ComponentType {
  // Le runtime Metro d'abord, comme le fait l'entrée officielle
  // (expo-router/entry-classic). En production native c'est quasi neutre,
  // mais rester fidèle à la séquence officielle évite d'inventer un chemin
  // de démarrage que personne n'a jamais testé.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@expo/metro-runtime');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { App } = require('expo-router/build/qualified-entry') as { App: ComponentType };
  return App;
}

export function Sas() {
  const [Appli, setAppli] = useState<ComponentType | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // Journal N9bis : chaque passage ici = une NAISSANCE de processus. Les
    // « déconnexions » sur croix se sont révélées être des redémarrages
    // complets sans rapport de plantage — ce marqueur permet de compter les
    // processus et de dater leurs naissances dans le même journal SQL que
    // les événements de session.
    logError('sas:naissance du processus', 'journal-auth');
    // 150 ms : le sas est peint AVANT la tentative. Si le chargement tue le
    // processus au niveau natif (hors de portée de tout catch), le dernier
    // écran visible dit au moins où on en était.
    const t = setTimeout(() => {
      try {
        const App = chargerApplication();
        setAppli(() => App);
      } catch (e) {
        const message = e instanceof Error ? `${e.name} : ${e.message}` : String(e);
        const pile =
          e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 14).join('\n') : '';
        setErreur(pile ? `${message}\n\n${pile}` : message);
      }
    }, 150);
    return () => clearTimeout(t);
  }, []);

  if (erreur) {
    return (
      <ScrollView style={styles.fond} contentContainerStyle={styles.contenu}>
        <Text style={styles.titre}>L’application n’a pas pu se charger</Text>
        <Text style={styles.pile}>{erreur}</Text>
        <Text style={styles.consigne}>
          Photographie cet écran et envoie-le : il contient tout ce qu’il faut pour corriger.
        </Text>
      </ScrollView>
    );
  }

  if (!Appli) {
    return (
      <ScrollView style={styles.fond} contentContainerStyle={styles.contenu}>
        <Text style={styles.titre}>KartSquad</Text>
        <Text style={styles.consigne}>Démarrage…</Text>
      </ScrollView>
    );
  }

  return (
    <GardeErreur>
      <Appli />
    </GardeErreur>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: colors.bg },
  contenu: { padding: spacing.lg, paddingTop: 80, gap: spacing.md },
  titre: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  pile: {
    color: colors.accentTexte,
    fontSize: 12,
    fontFamily: 'Courier',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  consigne: { color: colors.inkDim, fontSize: 13 },
});
