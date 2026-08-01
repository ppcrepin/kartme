import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Muted } from '@/components/ui/text';
import { colors } from '@/constants/theme';
import { t } from '@/i18n';
import { jourCourt } from '@/lib/datetime';
import type { EloPoint } from '@/lib/profile';

const PAD = 10;

/** Le palier visé, tel qu'on le passe à la courbe. */
export interface SeuilCourbe {
  valeur: number;
  couleur: string;
}

/**
 * Les DEUX échelles de la courbe, et c'est délibéré.
 *
 * `min`/`max` sont ceux RÉELLEMENT atteints : ils légendent la courbe. Y
 * glisser le seuil ferait afficher « max 1300 » à un pilote qui n'a jamais
 * dépassé 1250 — la courbe mentirait pour dessiner un repère.
 *
 * `bas`/`haut` cadrent le DESSIN et englobent TOUJOURS le seuil (décision PO
 * 2026-08-01 : « les courbes en pointillés n'apparaissent pas toujours, il faut
 * bien zoomer au bon niveau »). Une règle antérieure l'abandonnait dès qu'il
 * s'éloignait de plus d'une fois et demie l'amplitude, pour éviter d'écraser le
 * tracé — mais un repère qui disparaît sans prévenir est pire qu'un tracé
 * plat : on ne sait pas s'il n'y a pas de palier, ou s'il est simplement trop
 * loin. Le prix est assumé : juste après une promotion, la courbe se tasse.
 *
 * Fonction pure et exportée : c'est la seule partie de la courbe qui décide
 * quelque chose, et elle est intestable à travers un SVG dont la géométrie
 * dépend d'une largeur mesurée au navigateur.
 */
export function echelleCourbe(
  values: number[],
  seuil?: SeuilCourbe | null,
): { min: number; max: number; bas: number; haut: number; repere: SeuilCourbe | null } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const repere = seuil ?? null;
  return {
    min,
    max,
    bas: repere ? Math.min(min, repere.valeur) : min,
    haut: repere ? Math.max(max, repere.valeur) : max,
    repere,
  };
}

/**
 * Courbe d'évolution de l'Elo. Part de l'Elo de départ (1000) puis une valeur
 * par course. Ligne accent, point final marqué, repères min/max discrets.
 * `height` : 120 par défaut ; 72 dans la carte d'identité fusionnée (A17).
 *
 * Les ABANDONS sont marqués d'un point creux : la courbe montrait jusqu'ici une
 * chute sans dire si le pilote avait mal couru ou s'il n'avait pas fini — deux
 * choses très différentes, et impossibles à démêler six mois plus tard.
 */
export function EloCurve({
  points,
  height = 120,
  seuil,
}: {
  points: EloPoint[];
  height?: number;
  /**
   * Le prochain palier à franchir. La courbe disait où l'on est passé, jamais
   * où l'on va — « il manque des repères » (retour de test 2026-08-01). Voir
   * `echelleCourbe` pour ce qu'il fait à l'échelle.
   */
  seuil?: SeuilCourbe | null;
}) {
  const HEIGHT = height;
  const [width, setWidth] = useState(0);
  const values = [1000, ...points.map((p) => p.elo)];

  if (values.length < 2) return null;

  const { min, max, bas: basDessin, haut: hautDessin, repere } = echelleCourbe(values, seuil);
  const span = Math.max(hautDessin - basDessin, 20); // évite une ligne écrasée à ±0

  const x = (i: number) => PAD + (i * (width - 2 * PAD)) / (values.length - 1);
  const y = (v: number) => HEIGHT - PAD - ((v - basDessin) / span) * (HEIGHT - 2 * PAD);

  const svgPoints = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values[values.length - 1];

  // ── Les DATES sous la courbe (décision PO 2026-08-01) ──────────────────
  // L'axe horizontal ne disait rien du temps : deux courbes identiques
  // pouvaient couvrir un mois ou deux ans. Les repères sont posés SOUS LEURS
  // POINTS, en absolu, et non répartis par `space-between` : l'indice 0 est
  // l'Elo de départ, qui n'a pas de date, si bien qu'un libellé collé au bord
  // gauche aurait désigné le mauvais point — d'un quart de la largeur sur un
  // historique de trois courses.
  const LARGEUR_DATE = 68;
  const indicesDates = [1];
  // Un repère du milieu seulement s'il a la place de ne pas toucher les deux
  // autres : trois libellés de 68 px demandent 204 px, plus de l'air.
  if (points.length >= 4 && width >= 260) indicesDates.push(Math.round(values.length / 2));
  if (values.length - 1 > 1) indicesDates.push(values.length - 1);
  const dates = [...new Set(indicesDates)];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Svg width={width} height={HEIGHT}>
            {/* repère de l'Elo de départ */}
            <Line
              x1={PAD}
              y1={y(1000)}
              x2={width - PAD}
              y2={y(1000)}
              stroke={colors.line2}
              strokeWidth={1}
              strokeDasharray="4 5"
            />
            {/* Le palier visé, dans la couleur du grade d'après : c'est la
                seule ligne de la courbe qui parle du FUTUR. */}
            {repere ? (
              <Line
                x1={PAD}
                y1={y(repere.valeur)}
                x2={width - PAD}
                y2={y(repere.valeur)}
                stroke={repere.couleur}
                strokeWidth={1.5}
                strokeDasharray="2 4"
                opacity={0.75}
              />
            ) : null}
            <Polyline
              points={svgPoints}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Abandons : cercle CREUX, distinct du point final plein. Le
                décalage d'indice vient de l'Elo de départ, ajouté en tête des
                valeurs et qui ne correspond à aucune course. */}
            {points.map((p, i) =>
              p.dnf ? (
                <Circle
                  key={p.at}
                  cx={x(i + 1)}
                  cy={y(p.elo)}
                  r={3.5}
                  fill={colors.bg}
                  stroke={colors.inkDim}
                  strokeWidth={1.5}
                />
              ) : null,
            )}
            <Circle cx={x(values.length - 1)} cy={y(last)} r={4.5} fill={colors.accent} />
          </Svg>
          <View style={styles.legend}>
            <Muted style={styles.legendTxt}>min {min}</Muted>
            {/* La légende n'apparaît que s'il y a quelque chose à légender :
                une mention permanente « ○ abandon » sur une courbe sans abandon
                coûterait une ligne pour rien (lot de densité A17). */}
            {points.some((p) => p.dnf) ? (
              <Muted style={styles.legendTxt}>{t.profile.curveDnf}</Muted>
            ) : null}
            {repere ? (
              <Muted style={[styles.legendTxt, { color: repere.couleur }]}>
                {t.profile.curveSeuil.replace('%s', String(repere.valeur))}
              </Muted>
            ) : null}
            <Muted style={styles.legendTxt}>max {max}</Muted>
          </View>
          {points.length > 0 ? (
            <View style={styles.axe}>
              {dates.map((i) => (
                <Muted
                  key={i}
                  numberOfLines={1}
                  style={[
                    styles.axeTxt,
                    // Bridé aux bords : un repère à moitié hors du cadre ne se
                    // lit pas, et perdre un pixel de centrage vaut mieux que
                    // perdre la moitié du mois.
                    {
                      left: Math.min(
                        Math.max(x(i) - LARGEUR_DATE / 2, 0),
                        Math.max(width - LARGEUR_DATE, 0),
                      ),
                    },
                  ]}
                >
                  {jourCourt(points[i - 1].at)}
                </Muted>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  legendTxt: { fontSize: 11 },
  axe: { height: 14 },
  axeTxt: { position: 'absolute', width: 68, fontSize: 10, textAlign: 'center' },
});
