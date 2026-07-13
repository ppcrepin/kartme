import { useState, type ReactNode } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/constants/theme';

export const DRAG_ROW_HEIGHT = 60;
const GAP = 8;
const STEP = DRAG_ROW_HEIGHT + GAP;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface DragListProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (next: T[]) => void;
  /** Prévenir le parent qu'un drag est en cours (pour figer le scroll). */
  onDraggingChange?: (dragging: boolean) => void;
}

/**
 * Liste réordonnables par glisser-déposer (poignée ≡ à droite de chaque ligne).
 * PanResponder : fonctionne à la souris (web) comme au doigt (mobile).
 * Lignes de hauteur fixe pour un calcul de position simple et fiable.
 */
export function DragList<T>({ items, keyOf, renderItem, onReorder, onDraggingChange }: DragListProps<T>) {
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);

  // Les gestionnaires sont recréés à chaque rendu : leurs closures voient
  // toujours la liste courante — pas besoin de ref.
  const targetIndex = (from: number, dy: number) =>
    clamp(from + Math.round(dy / STEP), 0, items.length - 1);

  function makeResponder(index: number) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setDrag({ index, dy: 0 });
        onDraggingChange?.(true);
      },
      onPanResponderMove: (_evt, g) => {
        setDrag({ index, dy: g.dy });
      },
      onPanResponderRelease: (_evt, g) => {
        const to = targetIndex(index, g.dy);
        setDrag(null);
        onDraggingChange?.(false);
        if (to !== index) onReorder(move(items, index, to));
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        onDraggingChange?.(false);
      },
    });
  }

  const dropAt = drag ? targetIndex(drag.index, drag.dy) : null;

  return (
    <View style={styles.list}>
      {items.map((item, index) => {
        const isDragged = drag?.index === index;
        // Les autres lignes s'écartent pour montrer où la ligne va atterrir.
        let shift = 0;
        if (drag && dropAt !== null && !isDragged) {
          if (drag.index < index && index <= dropAt) shift = -STEP;
          else if (dropAt <= index && index < drag.index) shift = STEP;
        }
        return (
          <View
            key={keyOf(item)}
            style={[
              styles.row,
              { transform: [{ translateY: isDragged ? drag.dy : shift }] },
              isDragged && styles.rowDragged,
            ]}>
            <View style={styles.rowContent}>{renderItem(item, index)}</View>
            <View
              {...makeResponder(index).panHandlers}
              style={[styles.handle, Platform.OS === 'web' && ({ touchAction: 'none', cursor: 'grab' } as object)]}
              accessibilityLabel="Réordonner"
              accessibilityHint="Glisser pour déplacer ce pilote">
              <Text style={styles.handleTxt}>≡</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: GAP },
  row: {
    height: DRAG_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
  },
  rowDragged: {
    borderColor: colors.accent,
    backgroundColor: colors.surface2,
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  rowContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md },
  handle: {
    width: 52,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleTxt: { color: colors.inkDim2, fontSize: 22, fontFamily: fonts.sans },
});
