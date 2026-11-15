import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type ViewInstance } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { haptics } from "@/lib/haptics";
import { colors, radii, spacing, themed } from "@/theme";
import type { IdeaBoard } from "@/types/models";

import { AppText } from "../AppText";
import { Icon } from "../Icon";

/** What is being dragged onto a page. */
export type DragPayload = {
  kind: "idea" | "project";
  id: string;
  title: string;
};

/** Drop target: a page id, or "new" for a new page. */
export type DropTarget = string;

type Rect = { x: number; y: number; width: number; height: number };

const LONG_PRESS_MS = 350;

/**
 * Drag a project or idea onto an idea page.
 *
 * Long-press a row to pick it up; a bar with every page (and "New page")
 * appears at the top of the screen, and the item follows the finger. Drop it
 * on a page to put it there. A quick tap still opens the row, and moving
 * before the long-press still scrolls the list.
 */
export function useDragToPage(
  onDrop: (payload: DragPayload, target: DropTarget) => void,
) {
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [hover, setHover] = useState<DropTarget | null>(null);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const rootOffset = useSharedValue({ x: 0, y: 0 });
  const rootRef = useRef<ViewInstance>(null);
  const zones = useRef(new Map<DropTarget, Rect>());
  // Refs, so the gesture callbacks stay the same function for the whole drag.
  const draggingRef = useRef<DragPayload | null>(null);
  const hoverRef = useRef<DropTarget | null>(null);
  const onDropRef = useRef(onDrop);
  useLayoutEffect(() => {
    onDropRef.current = onDrop;
  });

  // Created once, so the gesture callbacks stay the same function for the whole drag.
  const [handlers] = useState(() => {
    const zoneAt = (px: number, py: number): DropTarget | null => {
      for (const [target, rect] of zones.current) {
        if (
          px >= rect.x &&
          px <= rect.x + rect.width &&
          py >= rect.y &&
          py <= rect.y + rect.height
        )
          return target;
      }
      return null;
    };
    return {
      onBegin: (payload: DragPayload) => {
        haptics.light();
        zones.current.clear();
        rootRef.current?.measureInWindow((left, top) => {
          rootOffset.set({ x: left, y: top });
        });
        draggingRef.current = payload;
        setDragging(payload);
      },
      onMove: (px: number, py: number) => {
        const target = zoneAt(px, py);
        if (target === hoverRef.current) return;
        if (target) haptics.selection();
        hoverRef.current = target;
        setHover(target);
      },
      onEnd: (px: number, py: number) => {
        const target = zoneAt(px, py);
        const payload = draggingRef.current;
        draggingRef.current = null;
        hoverRef.current = null;
        setDragging(null);
        setHover(null);
        if (payload && target) {
          haptics.success();
          onDropRef.current(payload, target);
        }
      },
      onCancel: () => {
        draggingRef.current = null;
        hoverRef.current = null;
        setDragging(null);
        setHover(null);
      },
    };
  });

  return {
    dragging,
    rootRef,
    /** Spread on every <DraggableRow>. */
    rowProps: { x, y, ...handlers },
    overlay: (boards: IdeaBoard[]) =>
      dragging ? (
        <DropOverlay
          payload={dragging}
          boards={boards}
          hover={hover}
          x={x}
          y={y}
          rootOffset={rootOffset}
          onZone={(target, rect) => zones.current.set(target, rect)}
        />
      ) : null,
  };
}

/** A row that can be long-pressed and dragged onto a page (see useDragToPage). */
export function DraggableRow({
  payload,
  x,
  y,
  onBegin,
  onMove,
  onEnd,
  onCancel,
  children,
}: {
  payload: DragPayload;
  x: SharedValue<number>;
  y: SharedValue<number>;
  onBegin: (payload: DragPayload) => void;
  onMove: (x: number, y: number) => void;
  onEnd: (x: number, y: number) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const lifted = useSharedValue(0);
  const pan = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((event) => {
      x.set(event.absoluteX);
      y.set(event.absoluteY);
      lifted.set(1);
      scheduleOnRN(onBegin, payload);
    })
    .onUpdate((event) => {
      x.set(event.absoluteX);
      y.set(event.absoluteY);
      scheduleOnRN(onMove, event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      scheduleOnRN(onEnd, event.absoluteX, event.absoluteY);
    })
    .onFinalize((_event, success) => {
      if (lifted.get() === 1 && !success) scheduleOnRN(onCancel);
      lifted.set(0);
    });

  const style = useAnimatedStyle(() => ({ opacity: lifted.value ? 0.35 : 1 }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}

function DropZone({
  target,
  label,
  sublabel,
  icon,
  active,
  onZone,
}: {
  target: DropTarget;
  label: string;
  sublabel?: string;
  icon: "plus" | "folder";
  active: boolean;
  onZone: (target: DropTarget, rect: Rect) => void;
}) {
  const ref = useRef<ViewInstance>(null);
  return (
    <View
      ref={ref}
      onLayout={() =>
        ref.current?.measureInWindow((left, top, width, height) =>
          onZone(target, { x: left, y: top, width, height }),
        )
      }
      style={[
        styles.zone,
        target === "new" && styles.zoneNew,
        active && styles.zoneActive,
      ]}
      accessibilityLabel={`Drop into ${label}`}
    >
      <Icon
        name={icon}
        size={14}
        color={active ? colors.text.primary : colors.veya.lavender}
      />
      <View style={styles.zoneText}>
        <AppText
          variant="bodySmall"
          numberOfLines={1}
          style={active ? styles.zoneLabelActive : undefined}
        >
          {label}
        </AppText>
        {sublabel ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {sublabel}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function DropOverlay({
  payload,
  boards,
  hover,
  x,
  y,
  rootOffset,
  onZone,
}: {
  payload: DragPayload;
  boards: IdeaBoard[];
  hover: DropTarget | null;
  x: SharedValue<number>;
  y: SharedValue<number>;
  rootOffset: SharedValue<{ x: number; y: number }>;
  onZone: (target: DropTarget, rect: Rect) => void;
}) {
  const insets = useSafeAreaInsets();
  const ghost = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - rootOffset.value.x - 90 },
      { translateY: y.value - rootOffset.value.y - 28 },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(120)}
        style={[styles.bar, { paddingTop: insets.top + spacing[2] }]}
      >
        <AppText variant="eyebrow" tone="accent">
          Drop it into a folder
        </AppText>
        <View style={styles.zones}>
          <DropZone
            target="new"
            label="New folder"
            sublabel="Make one for it"
            icon="plus"
            active={hover === "new"}
            onZone={onZone}
          />
          {boards.map((board) => (
            <DropZone
              key={board.id}
              target={board.id}
              label={board.name}
              icon="folder"
              active={hover === board.id}
              onZone={onZone}
            />
          ))}
        </View>
      </Animated.View>
      <Animated.View style={[styles.ghost, ghost]}>
        <Icon
          name={payload.kind === "project" ? "folder" : "idea"}
          size={14}
          color={colors.veya.lavender}
        />
        <AppText variant="bodySmall" numberOfLines={1} style={styles.ghostText}>
          {payload.title}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderColor: colors.overlay.lavenderBorder,
    backgroundColor: themed("rgba(15, 14, 23, 0.97)"),
  },
  zones: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  zone: {
    minWidth: 120,
    maxWidth: 200,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: themed("rgba(196, 181, 253, 0.3)"),
    backgroundColor: themed("rgba(22, 20, 36, 0.9)"),
  },
  zoneNew: { borderStyle: "dashed" },
  zoneActive: {
    borderColor: colors.veya.lavender,
    backgroundColor: colors.veya.purple,
    transform: [{ scale: 1.05 }],
  },
  zoneText: { flexShrink: 1 },
  zoneLabelActive: { color: colors.text.primary },
  ghost: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 180,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.veya.lavender,
    backgroundColor: colors.veya.surface,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ghostText: { flex: 1 },
});
