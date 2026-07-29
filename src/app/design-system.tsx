import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Banner,
  Button,
  Card,
  CheckeredRule,
  Gauge,
  GradeMedal,
  Tag,
} from '@/components/ui';
import { Body, Heading, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, gradeColors, spacing } from '@/constants/theme';
import { GRADES } from '@/lib/grade';
import { t } from '@/i18n';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Label>{label}</Label>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const FILTERS = ['À venir', 'Passées', 'Amis', 'Global'];

export default function DesignSystemScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('À venir');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" style={styles.back}>
          <Body style={styles.backTxt}>← Retour</Body>
        </Pressable>

        <View style={styles.rule}>
          <CheckeredRule cells={12} />
        </View>
        <Title>{t.gallery.title}</Title>
        <Muted>{t.gallery.subtitle}</Muted>

        <Section label={t.gallery.typography}>
          <Title>Légende du Bitume</Title>
          <Heading>Grand Prix des Amis</Heading>
          <Body>Texte courant en sans-serif système, lisible et neutre.</Body>
          <Muted>Texte secondaire discret pour les détails.</Muted>
        </Section>

        <Section label={t.gallery.buttons}>
          <View style={styles.row}>
            <Button label={t.common.createRace} />
            <Button label={t.common.cancel} variant="ghost" />
          </View>
        </Section>

        <Section label={t.gallery.card}>
          <Card>
            <View style={styles.race}>
              <View style={styles.cal}>
                <Body style={styles.calDay}>18</Body>
                <Label style={styles.calMonth}>Juil</Label>
              </View>
              <View style={styles.flex}>
                <Heading>Grand Prix des Amis</Heading>
                <Muted>Karting de Cormeilles · 6 pilotes</Muted>
              </View>
            </View>
          </Card>
        </Section>

        <Section label={t.gallery.avatars}>
          <View style={styles.row}>
            {['Paul Crepin', 'Marc Lefevre', 'Julie Da', 'Alex Bon'].map((n) => (
              <Avatar key={n} name={n} />
            ))}
          </View>
        </Section>

        <Section label={t.gallery.tags}>
          <View style={styles.row}>
            {FILTERS.map((f) => (
              <Tag key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </View>
        </Section>

        <Section label={t.gallery.grades}>
          <View style={styles.grades}>
            {GRADES.map((g) => (
              <View key={g.key} style={styles.grade}>
                <GradeMedal grade={g} />
                <Muted style={styles.gradeName}>{g.name}</Muted>
              </View>
            ))}
          </View>
        </Section>

        <Section label={t.gallery.gauge}>
          <Gauge value={0.64} color={gradeColors.missile} />
          <View style={styles.gaugeLbl}>
            <Muted>
              <Body style={styles.strong}>Missile des Stands</Body> · 1540 Elo
            </Muted>
            <Muted>plus que 160 → Fusée du Paddock</Muted>
          </View>
        </Section>

        <Section label={t.gallery.banners}>
          <View style={styles.stack}>
            <Banner kind="ok" title="Classement enregistré." message="+18 Elo — tu passes Rookie." />
            <Banner kind="warn" title="Course non confirmée." message="Confirme les présents avant de saisir." />
            <Banner kind="err" title="Échec de l'envoi." message="Vérifie ta connexion et réessaie." />
            <Banner kind="info" title="Invitation partagée." message="Le lien est valable 24 h." />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2, gap: spacing.sm },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backTxt: { color: colors.inkDim },
  rule: { width: 76, marginTop: spacing.sm },
  section: { marginTop: spacing.xl, gap: spacing.md },
  sectionBody: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  stack: { gap: spacing.sm },
  flex: { flex: 1 },
  strong: { color: colors.ink, fontWeight: '700' },
  race: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cal: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDay: { fontFamily: fonts.serifBlack, fontSize: 18, color: colors.ink },
  calMonth: { color: colors.accent, marginTop: -2 },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  grade: { alignItems: 'center', width: 72, gap: spacing.xs },
  gradeName: { textAlign: 'center', fontSize: 11 },
  gaugeLbl: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs },
});
