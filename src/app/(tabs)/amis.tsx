import { Screen, Muted } from '@/components/screen';
import { t } from '@/i18n';

export default function AmisScreen() {
  return (
    <Screen title={t.tabs.friends}>
      <Muted>{t.screens.friendsEmpty}</Muted>
    </Screen>
  );
}
