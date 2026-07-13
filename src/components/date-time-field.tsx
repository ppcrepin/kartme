import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { formatRaceDate } from '@/lib/datetime';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Champ date + heure cliquable : calendrier mensuel + réglage de l'heure. */
export function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isSelected = (day: number) =>
    value.getFullYear() === year && value.getMonth() === month && value.getDate() === day;

  function shiftMonth(delta: number) {
    setView(new Date(year, month + delta, 1));
  }
  function pickDay(day: number) {
    onChange(new Date(year, month, day, value.getHours(), value.getMinutes()));
  }
  function shiftHours(delta: number) {
    const d = new Date(value);
    d.setHours((value.getHours() + delta + 24) % 24);
    onChange(d);
  }
  function shiftMinutes(delta: number) {
    const d = new Date(value);
    d.setMinutes((value.getMinutes() + delta + 60) % 60);
    onChange(d);
  }

  return (
    <View style={styles.wrap}>
      <Label>{label}</Label>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" style={styles.field}>
        <Body style={styles.value}>{formatRaceDate(value.toISOString())}</Body>
        <Muted>{open ? '▲' : '▼'}</Muted>
      </Pressable>

      {open ? (
        <Card style={styles.panel}>
          {/* En-tête mois */}
          <View style={styles.monthHead}>
            <Pressable onPress={() => shiftMonth(-1)} accessibilityRole="button" style={styles.chev}>
              <Body style={styles.chevTxt}>‹</Body>
            </Pressable>
            <Body style={styles.monthLabel}>{MONTHS[month]} {year}</Body>
            <Pressable onPress={() => shiftMonth(1)} accessibilityRole="button" style={styles.chev}>
              <Body style={styles.chevTxt}>›</Body>
            </Pressable>
          </View>

          {/* Jours de semaine */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={styles.cell}>
                <Muted style={styles.weekday}>{w}</Muted>
              </View>
            ))}
          </View>

          {/* Grille des jours */}
          <View style={styles.grid}>
            {cells.map((day, i) => (
              <View key={i} style={styles.cell}>
                {day ? (
                  <Pressable
                    onPress={() => pickDay(day)}
                    accessibilityRole="button"
                    style={[styles.day, isSelected(day) && styles.daySelected]}>
                    <Body style={[styles.dayTxt, isSelected(day) && styles.dayTxtSelected]}>{day}</Body>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          {/* Heure */}
          <View style={styles.timeRow}>
            <Label>Heure</Label>
            <View style={styles.stepper}>
              <Stepper onDown={() => shiftHours(-1)} onUp={() => shiftHours(1)} value={pad(value.getHours())} />
              <Body style={styles.colon}>:</Body>
              <Stepper onDown={() => shiftMinutes(-5)} onUp={() => shiftMinutes(5)} value={pad(value.getMinutes())} />
            </View>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function Stepper({ value, onUp, onDown }: { value: string; onUp: () => void; onDown: () => void }) {
  return (
    <View style={styles.stepBox}>
      <Pressable onPress={onUp} accessibilityRole="button" style={styles.stepBtn}>
        <Body style={styles.stepSign}>+</Body>
      </Pressable>
      <Body style={styles.stepValue}>{value}</Body>
      <Pressable onPress={onDown} accessibilityRole="button" style={styles.stepBtn}>
        <Body style={styles.stepSign}>−</Body>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface2,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  value: { fontWeight: '700' },
  panel: { gap: spacing.sm, marginTop: spacing.xs },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chev: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chevTxt: { fontSize: 22, color: colors.accent, fontWeight: '800' },
  monthLabel: { fontFamily: fonts.serif, fontSize: 16 },
  weekRow: { flexDirection: 'row' },
  weekday: { fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.accent },
  dayTxt: { fontSize: 14 },
  dayTxtSelected: { color: '#fff', fontWeight: '800' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colon: { fontFamily: fonts.serifBlack, fontSize: 20 },
  stepBox: { alignItems: 'center', gap: 2 },
  stepBtn: { width: 40, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderRadius: radius.sharp, borderWidth: 1, borderColor: colors.line2 },
  stepSign: { fontSize: 16, color: colors.accent, fontWeight: '800' },
  stepValue: { fontFamily: fonts.serifBlack, fontSize: 20, minWidth: 34, textAlign: 'center' },
});
