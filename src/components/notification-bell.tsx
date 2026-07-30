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
  wrap: { padding: spacing.xs },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Blanc, comme le libellé des boutons primaires : #0a0706 sur #e10600
  // tombe à ~3,7:1, sous le minimum AA pour du 11 px.
  badgeTxt: { fontSize: 11, fontWeight: '800', color: '#ffffff', lineHeight: 14 },
  // « Ça bouge » : or, EN BAS de la cloche. `top` explicite : sur web,
  // `top: undefined` n'efface pas le `top: -2` du style de base et les deux
  // pastilles se superposaient — l'or recouvrait le rouge (audit navigateur).
  badgeFeed: { top: 16, backgroundColor: colors.gold },
  badgeFeedTxt: { fontSize: 11, fontWeight: '800', color: '#0a0706', lineHeight: 14 },
});
