import type { ReactElement } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Polyline, Rect } from 'react-native-svg';

// Icônes des 10 badges, tracées à la main dans docs/badges-icones.html
// (source de vérité). Les primitives sont reprises telles quelles ; le style
// vient du CSS d'origine : stroke-width 1.7, extrémités et jointures rondes,
// aucun remplissage — appliqué ici sur le <Svg> parent et hérité.

export type BadgeKey =
  | 'kart_didentite'
  | 'habitue_stands'
  | 'champagne'
  | 'chapeaux_de_roues'
  | 'kart_astrophe'
  | 'lanterne_rouge'
  | 'tete_a_queue'
  | 'deux_h_moins_le_kart'
  | 'chef_ecurie'
  | 'david_goliath';

// Tracés dans l'ordre des badges 1 à 10 de la maquette.
const ICONS: Record<BadgeKey, ReactElement> = {
  // 1. Kart d'identité — carte avec photo et lignes de texte.
  kart_didentite: (
    <>
      <Rect x={6} y={13} width={36} height={22} rx={2} />
      <Circle cx={16} cy={24} r={5} />
      <Path d="M11.5 24a4.5 4.5 0 0 1 9 0" />
      <Line x1={11.5} y1={24} x2={20.5} y2={24} />
      <Line x1={26} y1={20} x2={38} y2={20} />
      <Line x1={26} y1={24} x2={38} y2={24} />
      <Line x1={26} y1={28} x2={34} y2={28} />
    </>
  ),
  // 2. Habitué des stands — bidon d'essence.
  habitue_stands: (
    <>
      <Rect x={13} y={14} width={20} height={26} rx={2} />
      <Path d="M17 14v-3h8v3" />
      <Path d="M33 17h5v4" />
      <Path d="M17 20l12 14M29 20L17 34" />
    </>
  ),
  // 3. Champagne ! — bouteille et bulles.
  champagne: (
    <>
      <Path d="M21 8h4v6l3 5v17a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V19l2-5z" />
      <Line x1={19} y1={24} x2={29} y2={24} />
      <Path d="M23 8V5" />
      <Path d="M22 4h4" />
      <Circle cx={33} cy={12} r={1} />
      <Circle cx={37} cy={18} r={1.3} />
      <Circle cx={34} cy={24} r={1} />
    </>
  ),
  // 4. Sur les chapeaux de roues — roue lancée avec traînées de vitesse.
  chapeaux_de_roues: (
    <>
      <Circle cx={27} cy={24} r={12} />
      <Circle cx={27} cy={24} r={3.5} />
      <Path d="M27 12v4M27 32v4M15 24h4M35 24h4M20 17l2.5 2.5M31.5 28.5L34 31M20 31l2.5-2.5M31.5 19.5L34 17" />
      <Line x1={4} y1={18} x2={11} y2={18} />
      <Line x1={2} y1={24} x2={9} y2={24} />
      <Line x1={4} y1={30} x2={11} y2={30} />
    </>
  ),
  // 5. Kart-astrophe — courbe qui dévisse, flèche vers le bas.
  kart_astrophe: (
    <>
      <Polyline points="7,12 17,21 13,27 25,36" />
      <Path d="M25 36l-6.5-1M25 36l-1-6.5" />
      <Path d="M33 14v8M29 18h8M31 15l4 6M35 15l-4 6" />
    </>
  ),
  // 6. Lanterne rouge — lanterne suspendue.
  lanterne_rouge: (
    <>
      <Path d="M22 6a2 2 0 0 1 4 0" />
      <Line x1={24} y1={8} x2={24} y2={9.8} />
      <Path d="M20.5 12h7l-.6-2.2h-5.8z" />
      <Ellipse cx={24} cy={24} rx={9} ry={11.5} />
      <Line x1={16.4} y1={20} x2={31.6} y2={20} />
      <Line x1={15.3} y1={24} x2={32.7} y2={24} />
      <Line x1={16.4} y1={28} x2={31.6} y2={28} />
      <Path d="M20.5 36h7l-.6 2.2h-5.8z" />
      <Line x1={24} y1={38.4} x2={24} y2={41.6} />
    </>
  ),
  // 7. Tête-à-queue — flèche en rotation, traces de gomme.
  tete_a_queue: (
    <>
      <Path d="M35 24a11 11 0 1 1-4.5-8.9" />
      <Path d="M35 14v6h-6" />
      <Circle cx={24} cy={24} r={2} />
      <Path d="M18 34c-1 2-1 3 0 4M28 34c1 1.5 1 3 0 4" />
    </>
  ),
  // 8. Il est 2h moins le kart — horloge et croissant de lune.
  deux_h_moins_le_kart: (
    <>
      <Circle cx={21} cy={25} r={12} />
      <Line x1={21} y1={25} x2={12.5} y2={25} />
      <Line x1={21} y1={25} x2={26} y2={18} />
      <Circle cx={21} cy={25} r={1.3} />
      <Path d="M38 9a5 5 0 1 0 4 8 6 6 0 0 1-4-8z" />
    </>
  ),
  // 9. Chef d'écurie — casque radio du muret des stands.
  chef_ecurie: (
    <>
      <Path d="M12 27v-3a12 12 0 0 1 24 0v3" />
      <Rect x={8} y={26} width={6} height={10} rx={2} />
      <Rect x={34} y={26} width={6} height={10} rx={2} />
      <Path d="M37 34q-3 4-10 5" />
      <Circle cx={25} cy={40} r={1.6} />
    </>
  ),
  // 10. David contre Goliath — lance-pierre armé.
  david_goliath: (
    <>
      <Line x1={24} y1={43} x2={24} y2={30} />
      <Line x1={21} y1={35} x2={27} y2={35} />
      <Line x1={21} y1={38} x2={27} y2={38} />
      <Path d="M24 30l-6.5-12M24 30l6.5-12" />
      <Path d="M17.5 18L24 25l6.5-7" />
      <Circle cx={24} cy={25} r={2.4} />
    </>
  ),
};

/**
 * Icône de badge au trait, fidèle à la maquette docs/badges-icones.html.
 * La couleur est imposée par l'appelant (badge débloqué ou grisé).
 */
export function BadgeIcon({
  badge,
  size = 48,
  color,
}: {
  badge: BadgeKey;
  size?: number;
  color: string;
}) {
  return (
    <Svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      stroke={color}
      fill="none"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round">
      {ICONS[badge]}
    </Svg>
  );
}
