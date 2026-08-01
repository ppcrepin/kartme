import { Tabs } from 'expo-router';

import { TabIcon } from '@/components/tab-icon';
import { colors } from '@/constants/theme';
import { t } from '@/i18n';

/**
 * Les 5 onglets, chacun portant sa propre pile d'écrans (décision PO
 * 2026-07-30 : la barre d'onglets reste visible partout, pour se promener
 * d'une section à l'autre sans enchaîner les « précédent »). Les groupes ne
 * changent aucune URL ; les écrans de détail vivent dans la pile de leur
 * section et gardent leur cycle de vie normal (montage neuf à chaque visite).
 */
/**
 * La couleur d'un pictogramme d'onglet : le rouge de MARQUE quand il est actif,
 * la teinte fournie sinon. `tabBarActiveTintColor` sert le libellé (du texte,
 * seuil 4,5:1) et l'icône (un graphique, seuil 3:1) avec la même valeur — or
 * les deux n'ont pas le même besoin, et l'épingle de l'onglet Kartings doit
 * répondre aux épingles de la carte, pas les contredire.
 */
const teinteIcone = (couleur: unknown) =>
  couleur === colors.accentTexte ? colors.accent : (couleur as string);

export default function TabsLayout() {
  return (
    <Tabs
      // Sans ça, un navigateur d'onglets renvoie au PREMIER onglet sur
      // `router.back()` (backBehavior par défaut : firstRoute) : un « ← »
      // après un saut d'onglet ramènerait à Courses au lieu de l'écran
      // précédent.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        // Le libellé d'onglet actif fait 10 px : c'est le plus petit texte
        // rouge de l'app, donc celui qui a le plus besoin du jeton éclairci.
        // Le PICTOGRAMME, lui, reprend le rouge de MARQUE juste en dessous
        // (`teinteIcone`) : la teinte s'applique aux deux par défaut, et
        // l'audit a relevé le cas gênant — l'épingle de l'onglet Kartings en
        // rouge clair pendant que les épingles de la carte, même forme, sont
        // en rouge de marque. Deux rouges sur une même forme se lisent comme
        // une erreur, là où sur des objets différents ils se lisent comme une
        // hiérarchie. Un pictogramme est un graphique : le seuil est de 3:1,
        // et le rouge de marque y est à 4,04:1.
        tabBarActiveTintColor: colors.accentTexte,
        tabBarInactiveTintColor: colors.inkDim2,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
        },
        // 10 px : à 11 px, « Classement » (72 px) débordait des 68 px que le
        // bouton d'onglet laisse au libellé sur un iPhone de 390 px —
        // tronqué en « Classem… ». Le padding du bouton est codé en dur dans
        // expo-router, la taille de police est le seul levier fiable.
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}>
      {/* Le pictogramme actif garde le rouge de MARQUE (voir ci-dessus). */}
      <Tabs.Screen
        name="(courses)"
        options={{ title: t.tabs.races, tabBarIcon: ({ color }) => <TabIcon name="races" color={teinteIcone(color)} /> }}
      />
      <Tabs.Screen
        name="(classements)"
        options={{ title: t.tabs.rankings, tabBarIcon: ({ color }) => <TabIcon name="rankings" color={teinteIcone(color)} /> }}
      />
      <Tabs.Screen
        name="(amis)"
        options={{ title: t.tabs.friends, tabBarIcon: ({ color }) => <TabIcon name="friends" color={teinteIcone(color)} /> }}
      />
      <Tabs.Screen
        name="(kartings)"
        options={{ title: t.tabs.tracks, tabBarIcon: ({ color }) => <TabIcon name="tracks" color={teinteIcone(color)} /> }}
      />
      <Tabs.Screen
        name="(profil)"
        options={{ title: t.tabs.profile, tabBarIcon: ({ color }) => <TabIcon name="profile" color={teinteIcone(color)} /> }}
      />
    </Tabs>
  );
}
