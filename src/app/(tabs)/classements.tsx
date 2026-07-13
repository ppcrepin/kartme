import { Screen, Muted } from '@/components/screen';
import { t } from '@/i18n';

export default function ClassementsScreen() {
  return (
    <Screen title={t.tabs.rankings}>
      <Muted>{t.screens.rankingsEmpty}</Muted>
    </Screen>
  );
}
