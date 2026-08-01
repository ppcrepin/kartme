import { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// « friends » a disparu avec l'onglet du même nom (fusion du 2026-08-01).
export type TabName = 'races' | 'rankings' | 'profile' | 'tracks';

/** Icônes d'onglet line-art distinctes (drapeau · podium · amis · casque · repère). */
export function TabIcon({ name, color }: { name: TabName; color: ColorValue }) {
  const stroke = color as string;
  const common = { stroke, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'races' ? (
        // Drapeau à damier sur sa hampe.
        <>
          <Path d="M5 3v18" {...common} />
          <Path d="M5 4h13v9H5z" {...common} />
          <Path d="M5 4h4.3v3H5zM13.7 4H18v3h-4.3zM9.3 7H14v3H9.3zM5 10h4.3v3H5zM13.7 10H18v3h-4.3z" fill={stroke} stroke="none" />
        </>
      ) : name === 'rankings' ? (
        // Podium 3 marches.
        <>
          <Rect x="9" y="6" width="6" height="14" {...common} />
          <Rect x="3" y="11" width="6" height="9" {...common} />
          <Rect x="15" y="9" width="6" height="11" {...common} />
        </>
      ) : name === 'tracks' ? (
        // Repère de carte : la goutte classique, lisible à 24 px.
        <>
          <Path d="M12 21c-4-4.6-6-7.6-6-10a6 6 0 1 1 12 0c0 2.4-2 5.4-6 10z" {...common} />
          <Circle cx="12" cy="11" r="2.2" {...common} />
        </>
      ) : (
        // Casque de pilote.
        <>
          <Path d="M4 13a8 8 0 0 1 16 0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...common} />
          <Path d="M4.4 15h8.6a3 3 0 0 0 3-3v-1" {...common} />
        </>
      )}
    </Svg>
  );
}
