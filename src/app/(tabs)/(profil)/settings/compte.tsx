import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Banner, Button, Card, Field } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, spacing, states } from '@/constants/theme';
import { t } from '@/i18n';
import {
  AvatarError,
  avatarPickSupported,
  pickImage,
  removeMyAvatar,
  signedAvatarUrls,
  uploadAvatar,
} from '@/lib/avatar';
import { useAuth } from '@/lib/auth';
import { listBlocked, unblockPilot } from '@/lib/friends';
import { getMyProfile, setPrivacy, setUsername } from '@/lib/profile';
import { validateUsername } from '@/lib/username';

/** S2 — Compte : pseudo, confidentialité, pilotes bloqués, suppression. */
export default function CompteScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [username, setName] = useState('');
  const [initialName, setInitialName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [blocked, setBlocked] = useState<{ id: string; username: string }[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // Photo de profil — déménagée depuis l'écran Profil (A17) : une action
  // « une fois dans la vie » n'a pas à occuper le premier écran.
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    await getMyProfile()
      .then(async (p) => {
        if (!p) return;
        setName(p.username);
        setInitialName(p.username);
        setIsPrivate(p.isPrivate);
        setAvatarPath(p.avatarPath ?? null);
        const urls = await signedAvatarUrls([p.avatarPath]);
        setAvatarUrl(p.avatarPath ? (urls.get(p.avatarPath) ?? null) : null);
      })
      .catch(() => {});
    listBlocked()
      .then(setBlocked)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveName() {
    const check = validateUsername(username);
    if (!check.ok) {
      setNameError(t.account.usernameError);
      return;
    }
    setNameError(null);
    setBusy(true);
    try {
      await setUsername(check.value);
      setInitialName(check.value);
      setName(check.value);
      setSaved(true);
    } catch {
      setNameError(t.account.usernameError);
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePrivacy(next: boolean) {
    setIsPrivate(next);
    try {
      await setPrivacy(next);
    } catch {
      setIsPrivate(!next); // revert
    }
  }

  function photoErrorLabel(e: unknown): string {
    if (e instanceof AvatarError) {
      if (e.code === 'tooBig') return t.profile.photoTooBig;
      if (e.code === 'notAnImage') return t.profile.photoNotAnImage;
      if (e.code === 'unreadable') return t.profile.photoUnreadable;
    }
    return t.profile.photoError;
  }

  async function onPickPhoto() {
    setPhotoError(null);
    const file = await pickImage();
    if (!file) return;
    setPhotoBusy(true);
    try {
      await uploadAvatar(file);
      await load(); // le lien ne rend la main qu'une fois la photo à jour
    } catch (e) {
      setPhotoError(photoErrorLabel(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemovePhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await removeMyAvatar();
      await load();
    } catch (e) {
      setPhotoError(photoErrorLabel(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onUnblock(id: string) {
    setBlocked((prev) => prev.filter((b) => b.id !== id));
    try {
      await unblockPilot(id);
    } catch {
      load(); // resynchronise en cas d'échec
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.account.title}</Title>

        {/* Identité : photo + e-mail (déménagés depuis le Profil, A17) */}
        <Card>
          <View style={styles.row}>
            <Avatar name={initialName || '?'} size={44} uri={avatarUrl} cacheKey={avatarPath} />
            <View style={styles.flex}>
              {session?.user.email ? <Muted>{session.user.email}</Muted> : null}
              {avatarPickSupported() ? (
                <View style={styles.photoRow}>
                  <Pressable
                    onPress={onPickPhoto}
                    disabled={photoBusy}
                    accessibilityRole="button"
                    accessibilityLabel={t.profile.photoChangeA11y}
                    accessibilityState={{ disabled: photoBusy, busy: photoBusy }}>
                    <Muted style={styles.photoLink}>
                      {photoBusy
                        ? t.profile.photoBusy
                        : avatarPath
                          ? t.profile.photoChange
                          : t.profile.photoAdd}
                    </Muted>
                  </Pressable>
                  {avatarPath ? (
                    <Pressable
                      onPress={onRemovePhoto}
                      disabled={photoBusy}
                      accessibilityRole="button"
                      accessibilityLabel={t.profile.photoRemoveA11y}
                      accessibilityState={{ disabled: photoBusy }}>
                      <Muted style={styles.photoLink}>{t.profile.photoRemove}</Muted>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {photoError ? (
                <Muted style={styles.photoError} accessibilityLiveRegion="polite">
                  {photoError}
                </Muted>
              ) : null}
            </View>
          </View>
        </Card>

        {/* Pseudo */}
        <Card>
          <Field
            label={t.account.username}
            value={username}
            onChangeText={(v) => {
              setName(v);
              setSaved(false);
            }}
            autoCapitalize="none"
            maxLength={20}
            error={nameError}
          />
          {saved ? <Muted style={styles.ok}>{t.account.saved}</Muted> : null}
          <Button
            label={t.account.save}
            onPress={onSaveName}
            disabled={busy || username.trim() === initialName}
          />
        </Card>

        {/* Confidentialité */}
        <Card>
          <View style={styles.row}>
            <Body style={styles.flex}>{t.account.private}</Body>
            <Switch
              value={isPrivate}
              onValueChange={onTogglePrivacy}
              trackColor={{ true: colors.accent, false: colors.line2 }}
              thumbColor="#ffffff"
              accessibilityLabel={t.account.private}
            />
          </View>
          <Muted style={styles.hint}>{t.account.privacyHint}</Muted>
        </Card>

        {/* Pilotes bloqués */}
        <Card>
          <Label>{t.account.blocked}</Label>
          {blocked.length === 0 ? (
            <Muted style={styles.hint}>{t.account.blockedEmpty}</Muted>
          ) : (
            blocked.map((b) => (
              <View key={b.id} style={[styles.row, styles.blockedRow]}>
                <Body style={styles.flex}>{b.username}</Body>
                <Pressable onPress={() => onUnblock(b.id)} accessibilityRole="button" style={styles.action}>
                  <Body style={styles.unblock}>{t.account.unblock}</Body>
                </Pressable>
              </View>
            ))
          )}
        </Card>

        {/* Zone sensible */}
        <Banner kind="warn" title={t.account.danger} />
        <Button
          label={t.account.delete}
          variant="ghost"
          onPress={() => router.push('/settings/supprimer')}
        />

        {/* Déconnexion (déménagée depuis le Profil, A17) */}
        <Button label={t.auth.signOut} variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  blockedRow: { marginTop: spacing.sm },
  flex: { flex: 1 },
  hint: { marginTop: spacing.xs },
  ok: { color: colors.pos },
  action: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  unblock: { color: colors.accent, fontWeight: '800' },
  photoRow: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  photoLink: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  photoError: { color: states.err, fontSize: 12, marginTop: 2 },
});
