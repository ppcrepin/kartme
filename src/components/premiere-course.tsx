import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui';
import { Body, Heading, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';

/**
 * La checklist « ta première course » (retour de test réel du 2026-08-01).
 *
 * Le constat du testeur : « pour un nouvel utilisateur, ce n'est pas si simple
 * à utiliser ». Pris un par un, les écrans sont pourtant lisibles — ce qui
 * manque, c'est l'ENCHAÎNEMENT. Rien ne dit qu'une course se crée d'abord, se
 * remplit ensuite, et ne rapporte de points qu'une fois l'arrivée saisie.
 *
 * D'où trois lignes plutôt qu'une visite guidée : une bulle qu'on chasse d'un
 * tap n'apprend rien (on la ferme avant de l'avoir lue), alors qu'une checklist
 * reste là entre deux sessions, se coche toute seule au fil des gestes réels,
 * et disparaît définitivement une fois la boucle bouclée. Elle ne raconte pas
 * l'application : elle ne montre que le prochain pas.
 *
 * La 3e étape n'a pas de drapeau : la carte n'est affichée QUE tant qu'aucune
 * course n'est terminée. Le jour où le classement est saisi, il n'y a pas une
 * ligne de plus à cocher — il n'y a plus de carte.
 */
export interface EtatPremiereCourse {
  courseCreee: boolean;
  pilotesAjoutes: boolean;
}

export function PremiereCourse({
  etat,
  onEtape,
}: {
  etat: EtatPremiereCourse;
  /** Ouvre l'écran de l'étape (1, 2 ou 3) — seule l'étape COURANTE est tapable. */
  onEtape: (numero: 1 | 2 | 3) => void;
}) {
  const etapes = [
    { n: 1 as const, faite: etat.courseCreee, titre: t.onboarding.step1, aide: t.onboarding.step1Hint },
    { n: 2 as const, faite: etat.pilotesAjoutes, titre: t.onboarding.step2, aide: t.onboarding.step2Hint },
    { n: 3 as const, faite: false, titre: t.onboarding.step3, aide: t.onboarding.step3Hint },
  ];
  const faites = etapes.filter((e) => e.faite).length;
  // L'étape courante : la première non faite. Les suivantes restent affichées
  // (on veut voir où l'on va) mais ne sont pas tapables — les ouvrir avant leur
  // tour mène à un écran vide, ce qui égare exactement qui l'on veut guider.
  const courante = etapes.find((e) => !e.faite)!.n;

  return (
    <Card>
      <View style={styles.tete}>
        <Heading>{t.onboarding.firstRaceTitle}</Heading>
        <Muted style={styles.compteur}>
          {t.onboarding.firstRaceProgress.replace('%n', String(faites))}
        </Muted>
      </View>
      <Muted>{t.onboarding.firstRaceLead}</Muted>

      <View style={styles.etapes}>
        {etapes.map((e) => {
          const active = e.n === courante;
          return (
            <Pressable
              key={e.n}
              onPress={active ? () => onEtape(e.n) : undefined}
              disabled={!active}
              // Le rôle est TOUJOURS `button`, y compris sur les lignes
              // inactives : un `aria-label` posé sur un élément sans rôle est
              // ignoré par la plupart des lecteurs d'écran. Et l'état passe par
              // le NOM, pas par `aria-checked` : react-native-web ne lit pas
              // `accessibilityState` (seules les props `aria-*` atteignent le
              // DOM), et `aria-checked` n'a de toute façon pas de sens sur un
              // bouton. `disabled` reste ce qui empêche l'activation.
              accessibilityRole="button"
              accessibilityLabel={t.onboarding.stepAria
                .replace('%n', String(e.n))
                .replace('%t', e.titre)
                .replace('%e', e.faite ? t.onboarding.stepDone : t.onboarding.stepTodo)}
              style={[styles.etape, active && styles.etapeActive]}>
              <Body style={[styles.puce, e.faite && styles.puceFaite, active && styles.puceActive]}>
                {e.faite ? '✓' : '○'}
              </Body>
              <View style={styles.texte}>
                <Body style={[styles.titre, e.faite && styles.titreFait, active && styles.titreActif]}>
                  {e.titre}
                </Body>
                {/* L'aide n'a d'intérêt que sur l'étape à faire : la répéter
                    partout rend la carte illisible d'un coup d'œil. */}
                {active ? <Muted style={styles.aide}>{e.aide}</Muted> : null}
              </View>
              {active ? (
                <Body style={styles.action}>
                  {faites === 0 ? t.onboarding.go : t.onboarding.resume} ›
                </Body>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compteur: { fontVariant: ['tabular-nums'], fontWeight: '800' },
  etapes: { marginTop: spacing.sm, gap: spacing.xs },
  etape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // 44 px : le minimum tapable. `hitSlop` n'est pas implémenté sur
    // `Pressable` en react-native-web, la hauteur réelle est la seule cible.
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sharp,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  etapeActive: { backgroundColor: colors.surface2, borderColor: colors.line2 },
  puce: { width: 18, textAlign: 'center', color: colors.inkDim2, fontWeight: '800' },
  puceFaite: { color: colors.accent },
  puceActive: { color: colors.ink },
  texte: { flex: 1 },
  titre: { color: colors.inkDim, fontWeight: '700' },
  titreFait: { color: colors.inkDim2, textDecorationLine: 'line-through' },
  titreActif: { color: colors.ink },
  aide: { fontSize: 12 },
  action: { color: colors.accent, fontWeight: '800', fontSize: 13 },
});
