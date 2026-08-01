import { ReactNode, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BadgeIcon, GradeMedal, Sheet } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import type { BadgeKey } from '@/lib/badges';
import { formatRaceDate } from '@/lib/datetime';
import { ContexteExplications, type Explications } from '@/lib/explications';
import { GRADES, gradeProgress, type Grade } from '@/lib/grade';
import { pluriel } from '@/lib/nombre';

type Cible =
  | { genre: 'grade'; grade: Grade; elo: number | null }
  | { genre: 'badge'; badge: BadgeKey; obtenuLe: string | null };

/** La plage d'Elo d'un grade, écrite pour être lue à voix haute. */
function plage(g: Grade): string {
  return g.max === null
    ? t.explications.plageOuverte.replace('%m', String(g.min))
    : t.explications.plage.replace('%e', `${g.min} – ${g.max}`);
}

/**
 * Le fournisseur des fiches d'explication, monté UNE fois sur la mise en page
 * des onglets. Une seule feuille pour toute l'application : le médaillon de
 * grade est présent sur six écrans, et câbler une feuille par écran aurait
 * garanti que l'un d'eux soit oublié — c'est exactement ce qui s'était passé
 * pour l'écran « Échelle des grades », accessible du profil et de nulle part
 * ailleurs.
 */
export function FournisseurExplications({ children }: { children: ReactNode }) {
  const [cible, setCible] = useState<Cible | null>(null);

  const expliquerGrade = useCallback((grade: Grade, elo?: number | null) => {
    setCible({ genre: 'grade', grade, elo: elo ?? null });
  }, []);
  const expliquerBadge = useCallback((badge: BadgeKey, obtenuLe?: string | null) => {
    setCible({ genre: 'badge', badge, obtenuLe: obtenuLe ?? null });
  }, []);

  const api = useMemo<Explications>(
    () => ({ expliquerGrade, expliquerBadge }),
    [expliquerGrade, expliquerBadge],
  );

  return (
    <ContexteExplications.Provider value={api}>
      {children}
      <Sheet
        open={cible !== null}
        onClose={() => setCible(null)}
        title={
          cible?.genre === 'badge' ? t.explications.badgeTitre : t.explications.gradeTitre
        }>
        {cible?.genre === 'grade' ? <FicheGrade grade={cible.grade} elo={cible.elo} /> : null}
        {cible?.genre === 'badge' ? (
          <FicheBadge badge={cible.badge} obtenuLe={cible.obtenuLe} />
        ) : null}
      </Sheet>
    </ContexteExplications.Provider>
  );
}

function FicheGrade({ grade, elo }: { grade: Grade; elo: number | null }) {
  const gp = elo === null ? null : gradeProgress(elo);
  return (
    <>
      <View style={styles.entete}>
        {/* Non tapable : rouvrir la feuille depuis la feuille ne mène nulle part. */}
        <GradeMedal grade={grade} size={56} />
        <View style={styles.flex}>
          <Body style={[styles.titre, { color: grade.colorTexte }]}>{grade.name}</Body>
          <Muted>{plage(grade)}</Muted>
        </View>
      </View>

      <Muted>{t.explications.quoi}</Muted>

      {elo !== null ? (
        <View style={styles.bloc}>
          <Label>{t.explications.tonElo.replace('%e', String(elo))}</Label>
          {gp?.next ? (
            <Muted>
              {t.explications.ilTeReste
                .replace('%n', pluriel(gp.remaining, 'point'))
                .replace('%g', gp.next.name)}
            </Muted>
          ) : (
            <Muted>{t.explications.auSommet}</Muted>
          )}
        </View>
      ) : null}

      {/* L'échelle entière, ICI. Un lien « voir l'échelle » aurait fait changer
          d'onglet depuis le classement — le défaut même qu'on vient de corriger
          sur cet écran. */}
      <Label style={styles.section}>{t.explications.echelle}</Label>
      <View style={styles.echelle}>
        {[...GRADES].reverse().map((g) => {
          const ici = g.key === grade.key;
          return (
            <View key={g.key} style={[styles.ligne, ici && { borderColor: g.color }]}>
              <View style={[styles.pastille, { backgroundColor: g.color }]} />
              <Body style={[styles.nom, ici && styles.nomIci, { color: g.colorTexte }]}>
                {g.name}
              </Body>
              <Muted style={styles.plage}>
                {g.max === null ? `${g.min}+` : `${g.min}–${g.max}`}
              </Muted>
            </View>
          );
        })}
      </View>
    </>
  );
}

function FicheBadge({ badge, obtenuLe }: { badge: BadgeKey; obtenuLe: string | null }) {
  const item = t.badges.items[badge];
  const got = obtenuLe !== null;
  return (
    <>
      <View style={styles.entete}>
        <View style={[styles.rond, got ? styles.rondOn : styles.rondOff]}>
          <BadgeIcon badge={badge} size={34} color={got ? colors.accent : colors.inkDim} />
        </View>
        <View style={styles.flex}>
          <Body style={[styles.titre, got && { color: colors.accentTexte }]}>{item.name}</Body>
          <Muted>{got ? t.explications.badgeObtenu.replace('%d', formatRaceDate(obtenuLe)) : t.explications.badgeAFaire}</Muted>
        </View>
      </View>
      <Muted>{item.condition}</Muted>
    </>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  titre: { fontWeight: '800', fontSize: 17 },
  bloc: { gap: spacing.xs },
  section: { marginTop: spacing.xs },
  echelle: { gap: 2 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pastille: { width: 10, height: 10, borderRadius: 5 },
  nom: { flex: 1, fontSize: 14 },
  nomIci: { fontWeight: '800' },
  plage: { fontSize: 12 },
  rond: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  rondOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  rondOff: { borderColor: colors.line2, backgroundColor: colors.surface2, opacity: 0.7 },
});
