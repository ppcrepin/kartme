import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

// Palette d'avatars — teintes chaudes/froides distinctes, hors rouge de marque.
const AVATAR_COLORS = ['#c6503f', '#5b9bd5', '#5fb27d', '#ef7f27', '#b9793f', '#8f6fae'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
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
export function Avatar({ name, size = 44, uri }: { name: string; size?: number; uri?: string | null }) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        accessibilityLabel={name}
        source={{ uri }}
        style={[styles.base, dim]}
        contentFit="cover"
        // Les initiales restent visibles le temps du chargement plutôt qu'un
        // trou gris : sur une grille de huit pilotes, ça évite le clignotement.
        placeholder={undefined}
        transition={150}
      />
    );
  }
  return (
    <View
      accessibilityLabel={name}
      style={[styles.base, dim, { backgroundColor: colorFor(name) }]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  initials: { color: '#ffffff', fontFamily: fonts.sans, fontWeight: '800' },
});
