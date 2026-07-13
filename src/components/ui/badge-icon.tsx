import type { ReactElement } from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

// Icônes des 12 badges (refonte 2026-07-13). Style hérité du <Svg> parent :
// trait 1.7, extrémités/jointures rondes, aucun remplissage. Les 7 badges
// d'origine reprennent la maquette docs/badges-icones.html ; « Voiture balai »,
// « Midi moins le kart », « DRS », « Safety car » et « Push » sont neufs.

export type BadgeKey =
  | 'kart_didentite'
  | 'habitue_stands'
  | 'champagne'
  | 'chapeaux_de_roues'
  | 'kart_astrophe'
  | 'voiture_balai'
  | 'tete_a_queue'
  | 'midi_moins_le_kart'
  | 'chef_ecurie'
  | 'drs'
  | 'safety_car'
  | 'push';

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
  // 6. Voiture balai — balai (manche + tête en éventail).
  voiture_balai: (
    <>
      <Line x1={34} y1={12} x2={23} y2={23} />
      <Path d="M23 23L14 37h18z" />
      <Line x1={18.5} y1={30} x2={16} y2={37} />
      <Line x1={23} y1={30} x2={23} y2={37} />
      <Line x1={27.5} y1={30} x2={30} y2={37} />
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
  // 8. Midi moins le kart — horloge à ~11h45 et soleil (course du matin).
  midi_moins_le_kart: (
    <>
      <Circle cx={20} cy={25} r={12} />
      <Line x1={20} y1={25} x2={12} y2={25} />
      <Line x1={20} y1={25} x2={19} y2={16} />
      <Circle cx={20} cy={25} r={1.3} />
      <Circle cx={38} cy={12} r={3.5} />
      <Path d="M38 5v-2M38 19v2M31 12h-2M45 12h2M33.4 7.4l-1.4-1.4M42.6 16.6l1.4 1.4M42.6 7.4l1.4-1.4M33.4 16.6l-1.4 1.4" />
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
  // 10. DRS — aileron arrière, volet ouvert (incliné).
  drs: (
    <>
      <Line x1={11} y1={15} x2={11} y2={33} />
      <Line x1={37} y1={15} x2={37} y2={33} />
      <Line x1={11} y1={31} x2={37} y2={31} />
      <Line x1={11} y1={23} x2={37} y2={19} />
      <Line x1={19} y1={31} x2={19} y2={21.7} />
      <Line x1={29} y1={31} x2={29} y2={19.9} />
    </>
  ),
  // 11. Safety car — voiture de profil avec gyrophare sur le toit.
  safety_car: (
    <>
      <Line x1={7} y1={31} x2={41} y2={31} />
      <Path d="M9 31v-5l4-4h6l3-4h6l3 8h4v5" />
      <Path d="M19 22l3-4M28 22h-9" />
      <Circle cx={16} cy={31} r={3} />
      <Circle cx={32} cy={31} r={3} />
      <Rect x={20} y={11} width={7} height={3.5} rx={1} />
      <Line x1={23.5} y1={11} x2={23.5} y2={9} />
    </>
  ),
  // 12. Push — courbe qui grimpe, flèche vers le haut (pendant de Kart-astrophe).
  push: (
    <>
      <Polyline points="7,34 16,25 21,29 33,14" />
      <Path d="M33 14l-7 1M33 14l-1 7" />
    </>
  ),
};

/**
 * Icône de badge au trait. La couleur est imposée par l'appelant (badge
 * débloqué ou grisé).
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
