import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar, Button, Card, SkeletonCard } from '@/components/ui';
import { Body, Heading, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { track } from '@/lib/analytics';
import { signedAvatarUrls } from '@/lib/avatar';
import { acceptFriendInvite, getInviter } from '@/lib/friends';

type Inviter = { id: string; username: string; avatarPath: string | null };

/**
 * Arrivée par un lien d'amitié (A19, demande PO 2026-07-30).
 *
 * Le parcours complet d'un nouveau venu : il ouvre le lien, la garde de routes
 * le renvoie vers l'inscription EN MÉMORISANT cette destination
 * (`pending-route`, étendu à `invite/`), puis il retombe ici une fois inscrit.
 * D'où l'importance de ne rien décider avant son tap : entre-temps, il a créé
 * un compte, et il doit voir QUI l'invite avant de devenir son ami.
 *
 * Un pilote déjà inscrit suit exactement le même chemin, sans l'inscription.
 */
export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'inconnu' | 'moi'>('chargement');
  const [resultat, setResultat] = useState<'ok' | 'already' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let vivant = true;
    getInviter(id)
      .then(async (inv) => {
        if (!vivant) return;
        if (!inv) {
          // Identifiant inconnu, compte parti, blocage… ou MON propre lien :
          // le serveur ne distingue pas, et c'est bien — il n'a pas à dire
          // « ce compte existe mais te bloque ».
          setEtat('inconnu');
          return;
        }
        setInviter(inv);
        setEtat('pret');
        const urls = await signedAvatarUrls([inv.avatarPath]);
        if (vivant) setAvatarUrl(inv.avatarPath ? (urls.get(inv.avatarPath) ?? null) : null);
      })
      .catch(() => vivant && setEtat('inconnu'));
    return () => {
      vivant = false;
    };
  }, [id]);

  async function onAccept() {
    if (!id) return;
    setErreur(null);
    setBusy(true);
    try {
      const code = await acceptFriendInvite(id);
      if (code === 'self') setEtat('moi');
      else {
        setResultat(code);
        // Mesure du canal d'acquisition : c'est le lien d'amitié qui a converti.
        track('friend_invite_accepted').catch(() => {});
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t.invite.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t.invite.title}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/amis'))}>
      {etat === 'chargement' ? (
        <SkeletonCard />
      ) : etat === 'inconnu' ? (
        <View style={styles.bloc}>
          <Muted>{t.invite.unknown}</Muted>
          <Button label={t.invite.toFriends} variant="ghost" onPress={() => router.replace('/amis')} />
        </View>
      ) : etat === 'moi' ? (
        <View style={styles.bloc}>
          <Muted>{t.invite.self}</Muted>
          <Button label={t.invite.toFriends} variant="ghost" onPress={() => router.replace('/amis')} />
        </View>
      ) : inviter ? (
        <View style={styles.bloc}>
          <Card>
            <View style={styles.row}>
              <Avatar
                name={inviter.username}
                size={48}
                uri={avatarUrl}
                cacheKey={inviter.avatarPath}
              />
              <View style={styles.flex}>
                <Heading>{inviter.username}</Heading>
                <Muted>{t.invite.from.replace('%s', inviter.username)}</Muted>
              </View>
            </View>
          </Card>

          {resultat ? (
            <>
              <Body style={styles.ok}>
                {resultat === 'already' ? t.invite.already : t.invite.accepted}
              </Body>
              <Button
                label={t.invite.seeProfile}
                onPress={() => router.replace(`/pilot/${inviter.id}`)}
              />
              <Button
                label={t.invite.toFriends}
                variant="ghost"
                onPress={() => router.replace('/amis')}
              />
            </>
          ) : (
            <>
              <Button
                label={t.invite.accept.replace('%s', inviter.username)}
                onPress={onAccept}
                disabled={busy}
              />
              {erreur ? <Muted style={styles.err}>{erreur}</Muted> : null}
            </>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  ok: { color: colors.pos, fontWeight: '700', textAlign: 'center' },
  err: { color: colors.accent, textAlign: 'center' },
});
