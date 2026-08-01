import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Body } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { unreadFeedCount } from '@/lib/feed';
import { unreadCount } from '@/lib/notifications';

/**
 * Cloche du centre de notifications (A5), posée en action d'en-tête.
 *
 * Recomptée à chaque prise de focus plutôt que par abonnement temps réel : une
 * pastille peut attendre le prochain retour sur l'écran, et une souscription
 * websocket permanente coûterait à chaque session pour un gain invisible.
 */
export function NotificationBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  // Second compteur, SÉPARÉ (décision PO 2026-07-30) : la pastille rouge veut
  // dire « quelqu'un t'attend » ; l'or dit « ça bouge chez tes amis ». Les
  // fusionner noierait le seul signal qui exige une action.
  const [feedCount, setFeedCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      unreadCount()
        .then((n) => active && setCount(n))
        .catch(() => {});
      unreadFeedCount()
        .then((n) => active && setFeedCount(n))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Pressable
      // Rien « pour toi » mais du neuf chez tes amis : la cloche ouvre
      // directement l'onglet du fil — la pastille mène à ce qu'elle annonce.
      onPress={() => router.push(count === 0 && feedCount > 0 ? '/notifications?vue=amis' : '/notifications')}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `${t.inbox.title} (${count})` : t.inbox.title
      }
      hitSlop={spacing.sm}
      style={styles.wrap}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 3a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.2h14l-1.5-3.5V8.5A5.5 5.5 0 0 0 12 3Z"
          stroke={colors.ink}
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
        <Path d="M10 18a2 2 0 0 0 4 0" stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
      {count > 0 ? (
        <View style={styles.badge}>
          {/* Plafond serveur à 100 → « 99+ » est la seule forme possible au-delà. */}
          <Body style={styles.badgeTxt}>{count > 99 ? '99+' : count}</Body>
        </View>
      ) : null}
      {feedCount > 0 ? (
        <View style={[styles.badge, styles.badgeFeed]}>
          {/* Plafond serveur à 20 (unread_feed_count) : jamais au-delà. */}
          <Body style={styles.badgeFeedTxt}>{feedCount}</Body>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44 px : la cloche mesurait 32 × 32. C'est la porte de « on t'attend » et
  // de « ça bouge » — et `hitSlop` est inerte sur web.
  wrap: { padding: spacing.xs, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Les deux pastilles vivaient SUR la cloche : à 24 px, elles en recouvraient
  // la moitié droite et il ne restait qu'un amas de ronds — un testeur l'a
  // prise pour un menu d'options (retour 2026-08-01). Elles sortent donc du
  // pictogramme, qui redevient une cloche reconnaissable.
  badge: {
    position: 'absolute',
    // Débordent LÉGÈREMENT de la zone de 44 px : posées à ras, elles mangeaient
    // encore un quart du pictogramme. À -3, la cloche garde sa silhouette et
    // les compteurs restent parfaitement lisibles.
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Blanc, comme le libellé des boutons primaires : #0a0706 sur #e10600
  // tombe à ~3,7:1, sous le minimum AA pour du 11 px.
  badgeTxt: { fontSize: 10, fontWeight: '800', color: '#ffffff', lineHeight: 13 },
  // « Ça bouge » : or, EN BAS de la cloche. `top` explicite : sur web,
  // `top: undefined` n'efface pas le `top: -2` du style de base et les deux
  // pastilles se superposaient — l'or recouvrait le rouge (audit navigateur).
  badgeFeed: { top: 'auto', bottom: -3, backgroundColor: colors.gold },
  badgeFeedTxt: { fontSize: 10, fontWeight: '800', color: '#0a0706', lineHeight: 13 },
});
