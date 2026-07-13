import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
 *
 * Important : les PanResponder sont créés UNE FOIS par position (stables entre
 * rendus) — un gestionnaire recréé en plein geste perd le suivi du doigt.
 * Ils lisent les données vivantes via une ref.
 */
export function DragList<T>({ items, keyOf, renderItem, onReorder, onDraggingChange }: DragListProps<T>) {
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);

  const liveRef = useRef({ items, onReorder, onDraggingChange });
  useEffect(() => {
    liveRef.current = { items, onReorder, onDraggingChange };
  }, [items, onReorder, onDraggingChange]);

  /* eslint-disable react-hooks/refs -- la ref n'est lue que dans les
     callbacks de geste (jamais pendant le rendu) : le create() au rendu ne
     fait que les enregistrer. */
  const responders = useMemo(
    () =>
      Array.from({ length: items.length }, (_, index) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          // Ne pas céder le geste au défilement une fois le drag commencé.
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
          onPanResponderGrant: () => {
            setDrag({ index, dy: 0 });
            liveRef.current.onDraggingChange?.(true);
          },
          onPanResponderMove: (_evt, g) => {
            setDrag({ index, dy: g.dy });
          },
          onPanResponderRelease: (_evt, g) => {
            const list = liveRef.current.items;
            const to = clamp(index + Math.round(g.dy / STEP), 0, list.length - 1);
            setDrag(null);
            liveRef.current.onDraggingChange?.(false);
            if (to !== index) liveRef.current.onReorder(move(list, index, to));
          },
          onPanResponderTerminate: () => {
            setDrag(null);
            liveRef.current.onDraggingChange?.(false);
          },
        }),
      ),
    [items.length],
  );

  /* eslint-enable react-hooks/refs */
  const dropAt = drag ? clamp(drag.index + Math.round(drag.dy / STEP), 0, items.length - 1) : null;

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
              {...(responders[index]?.panHandlers ?? {})}
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
