import { useRouter } from 'expo-router';

import { CircuitsExplorer } from '@/components/circuits-explorer';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { setPickedCircuit } from '@/lib/circuit-pick';

/**
 * Choisir un karting sur la carte, depuis la création de course.
 *
 * Le formulaire reste monté dessous : le circuit choisi repart par le dépôt
 * `circuit-pick` (pas par paramètre d'URL, qui remonterait le formulaire et
 * perdrait la date déjà saisie — la friction que cet écran corrige).
 *
 * Un tap = un choix : pas de fiche intermédiaire ici, on est venu POUR
 * désigner une piste et retourner à sa course.
 */
export default function CircuitMapPickerScreen() {
  const router = useRouter();

  return (
    <Screen
      title={t.races.mapPickTitle}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/race/create'))}>
      <CircuitsExplorer
        selectedId={null}
        onSelect={(c) => {
          setPickedCircuit(c);
          if (router.canGoBack()) router.back();
          else router.replace('/race/create');
        }}
      />
    </Screen>
  );
}
