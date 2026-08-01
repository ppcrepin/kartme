import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

// Palette d'avatars — teintes chaudes/froides distinctes, hors rouge de marque.
const AVATAR_COLORS = ['#c6503f', '#5b9bd5', '#5fb27d', '#ef7f27', '#b9793f', '#8f6fae'];

// `name` est TYPÉ `string`, mais il arrive d'une ligne de base : un profil créé
// dont le pseudo n'est pas encore choisi porte `null`, et TypeScript ne voit
// rien. `colorFor` bouclait alors sur `undefined.length` et l'écran Profil
// tombait en page blanche d'erreur — pour un état parfaitement normal, juste
// après l'inscription.
function texteSur(name: string): string {
  return typeof name === 'string' ? name : '';
}

function initialsOf(name: string): string {
  const parts = texteSur(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(nom: string): string {
  const name = texteSur(nom);
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Avatar : photo si le pilote en a une ET qu'on a le droit de la voir, sinon
 * initiales sur couleur déterministe.
 *
 * `uri` est un lien SIGNÉ obtenu par lots (voir lib/avatar). Absent = on
 * retombe sur les initiales, sans distinguer « pas de photo » de « pas le
 * droit » : les deux se ressemblent, et c'est voulu.
 */
export function Avatar({
  name,
  size = 44,
  uri,
  cacheKey,
}: {
  name: string;
  size?: number;
  uri?: string | null;
  /**
   * Clé de cache STABLE (le chemin de la photo). Sans elle, chaque écran
   * re-signe un lien différent pour la même image : expo-image indexe son
   * cache sur l'URI, donc l'avatar était retéléchargé à chaque navigation —
   * précisément sur la 3G de bord de piste qu'on cherche à ménager.
   */
  cacheKey?: string | null;
}) {
  // On mémorise QUEL lien a échoué, pas seulement qu'un échec a eu lieu : un
  // booléen restait armé après une re-signature, donc un lien expiré condamnait
  // l'avatar aux initiales pour toute la durée de la session.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = !!uri && failedUri === uri;
  const dim = { width: size, height: size, borderRadius: size / 2 };

  // Les initiales sont TOUJOURS rendues, la photo se superpose. Un lien
  // expiré, une image supprimée ou un réseau coupé laissaient sinon un rond
  // vide — le repli était dans une branche jamais atteinte.
  return (
    <View
      accessibilityLabel={uri && !failed ? `Photo de profil de ${name}` : name}
      style={[styles.base, dim, { backgroundColor: colorFor(name) }]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          cachePolicy="memory-disk"
          recyclingKey={cacheKey ?? uri}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          contentFit="cover"
          transition={150}
          onError={() => setFailedUri(uri)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  initials: { color: '#ffffff', fontFamily: fonts.sans, fontWeight: '800' },
});
