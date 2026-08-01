import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar, Button, Card, SkeletonCard } from '@/components/ui';
import { Body, Heading, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { clearReferrer, track } from '@/lib/analytics';
import { signedAvatarUrls } from '@/lib/avatar';
import { messageFr } from '@/lib/erreur-fr';
import { acceptFriendInvite, getInviter } from '@/lib/friends';

type Inviter = { id: string; username: string; avatarPath: string | null; isMe: boolean };

/** Un lien tronqué par une messagerie n'est pas une panne réseau : le serveur
 *  refuse l'identifiant, et « Réessayer » ne pourra jamais aboutir. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // `panne` ≠ `inconnu` : un tunnel de métro ne doit pas déclarer morte une
  // invitation parfaitement valable — sur le canal d'acquisition n°1, c'est
  // un compte créé et aucun ami (même distinction que la fiche circuit).
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'inconnu' | 'moi' | 'panne'>(
    'chargement',
  );
  const [resultat, setResultat] = useState<'ok' | 'already' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // `essai` : incrémenté par « Réessayer ». L'effet ci-dessous en dépend, ce
  // qui relance le chargement sans appeler de setState hors d'un gestionnaire
  // (le lint l'interdit dans le corps d'un effet).
  const [essai, setEssai] = useState(0);

  // Lien coupé en deux par une appli de messagerie : le cas le plus banal, et
  // il ne doit pas déclencher une boucle « Réessayer » sans issue. Déduit au
  // rendu plutôt que posé en état : rien à attendre du réseau pour le savoir.
  const idValide = !!id && UUID_RE.test(id);

  useEffect(() => {
    if (!idValide) return;
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
        // Son propre lien : le serveur le renvoie marqué, l'écran le dit —
        // c'est le premier geste de quelqu'un qui vient de le générer.
        setEtat(inv.isMe ? 'moi' : 'pret');
        // …et ce geste EMPOISONNAIT le parrainage de l'appareil : la capture
        // avait déjà écrit son propre identifiant dans `localStorage`, où il
        // restait à vie (rien ne l'effaçait, faute d'une future inscription sur
        // ce compte). Scénario karting très banal — « tiens, prends mon
        // téléphone, inscris-toi » — et l'inscription de l'ami partait créditée
        // à celui qui avait ouvert son propre lien, sans qu'aucun lien n'ait
        // été envoyé.
        if (inv.isMe) clearReferrer();
        const urls = await signedAvatarUrls([inv.avatarPath]);
        if (vivant) setAvatarUrl(inv.avatarPath ? (urls.get(inv.avatarPath) ?? null) : null);
      })
      .catch(() => vivant && setEtat('panne'));
    return () => {
      vivant = false;
    };
  }, [id, idValide, essai]);

  async function onAccept() {
    if (!id) return;
    setErreur(null);
    setBusy(true);
    try {
      const code = await acceptFriendInvite(id);
      if (code === 'self') setEtat('moi');
      // Lien devenu mort entre l'affichage et le tap (compte supprimé,
      // suspendu, blocage) : on RETIRE le bouton au lieu de laisser un refus
      // sous un bouton qui ne pourra jamais aboutir.
      else if (code === 'gone') setEtat('inconnu');
      else {
        setResultat(code);
        // Mesure du canal d'acquisition. Deux précisions qui décident de la
        // justesse du chiffre :
        //   · l'INVITANT est joint à l'événement — sans lui, le tableau de bord
        //     ne pouvait pas vérifier que le parrain mémorisé était bien celui
        //     dont on venait d'accepter le lien, et créditait au lien d'ami une
        //     inscription venue d'un lien de course ;
        //   · seul un `ok` compte. Sur `already` (lien rouvert, deuxième
        //     appareil, double tap tardif) l'amitié existait DÉJÀ : compter là
        //     laissait un pilote gonfler le compteur en rouvrant un lien.
        if (code === 'ok') track('friend_invite_accepted', { inviter: id }).catch(() => {});
      }
    } catch (e) {
      // Filtre partagé : les exceptions MÉTIER de nos fonctions SQL sont en
      // français et passent telles quelles ; un refus TECHNIQUE (RLS, droits)
      // sortirait en anglais brut dans une app entièrement française.
      setErreur(messageFr(e, t.invite.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t.invite.title}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/classements'))}>
      {!idValide || etat === 'inconnu' ? (
        <View style={styles.bloc}>
          <Muted>{t.invite.unknown}</Muted>
          <Button label={t.invite.toFriends} variant="ghost" onPress={() => router.replace('/classements')} />
        </View>
      ) : etat === 'chargement' ? (
        <SkeletonCard />
      ) : etat === 'panne' ? (
        <View style={styles.bloc}>
          <Muted>{t.invite.loadError}</Muted>
          <Button
            label={t.inbox.retry}
            onPress={() => {
              setEtat('chargement');
              setEssai((n) => n + 1);
            }}
          />
          <Button label={t.invite.toFriends} variant="ghost" onPress={() => router.replace('/classements')} />
        </View>
      ) : etat === 'moi' ? (
        <View style={styles.bloc}>
          <Muted>{t.invite.self}</Muted>
          <Button label={t.invite.toFriends} variant="ghost" onPress={() => router.replace('/classements')} />
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
                {/* L'invitation est CONSOMMÉE après le tap : la laisser écrite
                    au-dessus de « vous êtes amis » se contredit. */}
                {!resultat ? (
                  <Muted>{t.invite.from.replace('%s', inviter.username)}</Muted>
                ) : null}
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
                onPress={() => router.replace('/classements')}
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
  err: { color: colors.accentTexte, textAlign: 'center' },
});
