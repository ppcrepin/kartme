import { Screen, Muted } from '@/components/screen';
import { t } from '@/i18n';

export default function CoursesScreen() {
  return (
    <Screen title={t.tabs.races}>
      <Muted>{t.screens.racesEmpty}</Muted>
    </Screen>
  );
}
