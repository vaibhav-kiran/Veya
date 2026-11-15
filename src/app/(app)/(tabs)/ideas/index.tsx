import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { AppText } from "@/components/AppText";
import { DraggableRow, useDragToPage, type DragPayload, type DropTarget } from "@/components/boards/DragToPage";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { IdeaListItem } from "@/components/IdeaListItem";
import { ProjectListItem } from "@/components/ProjectListItem";
import { ScreenBackground } from "@/components/ScreenBackground";
import { SwipeHint, useSwipeHint } from "@/components/SwipeHint";
import { ModeIndicator, type Mode } from "@/components/talk/ModeIndicator";
import { TextLink } from "@/components/TextLink";
import { GROUP_BG, Group, HAIRLINE, PRESSED_BG, SectionHeader, TABULAR } from "@/components/ui/Grouped";
import { purposeInfo } from "@/constants/boardPurposes";
import { folderColor, folderThatChanged } from "@/constants/folderColors";
import { haptics } from "@/lib/haptics";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, radii, screenGutter, spacing } from "@/theme";
import type { Idea, IdeaBoard, IdeaStatus } from "@/types/models";

type Filter = "all" | IdeaStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "selected", label: "Selected" },
  { value: "converted", label: "Built" },
];

const PAGES: Mode[] = [
  { label: "Projects", icon: "folder" },
  { label: "Analyze", icon: "target" },
];

const STEPS = [
  { title: "Make an analysis", text: "For a hackathon, a college project or any event. Veya looks up its themes and judging criteria." },
  { title: "Add your projects", text: "Tap + inside it, or hold a project on the Projects page and drag it in." },
  { title: "Let Veya work", text: "It rates and compares them, checks what already exists, then improves the winner and updates its plan." },
];

const ANALYZE_STEPS = ["Add", "Analyze", "Check", "Enhance", "Implement"];
const NEXT_STEP = ["Add projects", "Analyze them", "Check existing projects", "Enhance the strongest", "Implement the plan", "Done"];

/** How far an analysis has got (0–5) — the same steps as inside it. */
function analysisStep(board: IdeaBoard, itemCount: number): number {
  if (!itemCount) return 0;
  if (!board.rating) return 1;
  const rated = board.rating.ratings.map((rating) => rating.idea_id);
  if (!rated.every((key) => board.checks?.[key])) return 2;
  if (!board.improvement) return 3;
  if (!Object.keys(board.implemented ?? {}).length) return 4;
  return 5;
}

function PageHeader({ eyebrow, title, description, accessory }: { eyebrow: string; title: string; description: string; accessory?: React.ReactNode }) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderTop}>
        <View style={styles.flex}>
          <AppText variant="bodySmall" tone="secondary">
            {eyebrow}
          </AppText>
          <AppText style={styles.title} accessibilityRole="header">
            {title}
          </AppText>
        </View>
        {accessory}
      </View>
      <AppText variant="bodyMedium" tone="muted">
        {description}
      </AppText>
    </View>
  );
}

/** One analysis: what it's for, how far it got, and the strongest project so far. */
function AnalysisCard({
  board,
  itemCount,
  bestTitle,
  onPress,
}: {
  board: IdeaBoard;
  itemCount: number;
  bestTitle: string | undefined;
  onPress: () => void;
}) {
  const info = purposeInfo(board.purpose);
  const color = folderColor(board);
  const step = analysisStep(board, itemCount);
  const best = board.rating?.ratings.find((rating) => rating.idea_id === board.rating?.best_idea_id) ?? board.rating?.ratings[0];
  const about =
    board.context?.summary ||
    [board.context?.themes.slice(0, 3).join(", "), board.context?.judging_criteria.length ? `${board.context.judging_criteria.length} judging criteria` : ""]
      .filter(Boolean)
      .join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${board.name}, ${info.label}, ${itemCount} projects, ${NEXT_STEP[step]}${best ? `, strongest ${bestTitle ?? ""} at ${best.total}` : ""}`}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.analysis, pressed && styles.pressed]}
    >
      <View style={[styles.analysisBar, { backgroundColor: color }]} />
      <View style={styles.analysisBody}>
        <View style={styles.analysisHead}>
          <AppText variant="caption" style={[styles.analysisPurpose, { color }]}>
            {info.label}
          </AppText>
          <AppText variant="caption" tone="muted" style={TABULAR}>
            {itemCount} {itemCount === 1 ? "project" : "projects"}
          </AppText>
        </View>
        <AppText variant="h4" numberOfLines={2} style={styles.strong}>
          {board.name}
        </AppText>
        {about ? (
          <AppText variant="bodySmall" tone="muted" numberOfLines={2}>
            {about}
          </AppText>
        ) : null}

        {/* how far it got */}
        <View style={styles.steps}>
          {ANALYZE_STEPS.map((label, index) => (
            <View key={label} style={[styles.stepSegment, { backgroundColor: index < step ? color : HAIRLINE }]} />
          ))}
        </View>
        <View style={styles.analysisFoot}>
          <AppText variant="caption" tone="secondary" style={styles.flex} numberOfLines={1}>
            {step >= 5 ? "Done · plan updated" : `Next: ${NEXT_STEP[step]}`}
          </AppText>
          {best ? (
            <AppText variant="caption" numberOfLines={1} style={styles.best}>
              {bestTitle ?? "Strongest"} · <AppText variant="caption" style={[TABULAR, { color }]}>{best.total}</AppText>
            </AppText>
          ) : null}
        </View>
      </View>
      <Icon name="chevronRight" size={13} color={colors.text.muted} />
    </Pressable>
  );
}

/**
 * "Your Ideas" tab, two pages side by side (swipe like Talk and Chat):
 *  - Projects: project plans and saved ideas. Hold one and drag it onto an analysis.
 *  - Analyze: one analysis per hackathon or event, where Veya rates, compares
 *    and improves your projects.
 */
export default function IdeasListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const ideasById = useWorkspaceStore((state) => state.ideas);
  const boardsById = useWorkspaceStore((state) => state.boards);
  const boards = Object.values(boardsById).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const moveIdea = useWorkspaceStore((state) => state.moveIdea);
  const addProjectToBoard = useWorkspaceStore((state) => state.addProjectToBoard);
  const projects = useProjectsStore((state) => state.summaries);
  const listState = useProjectsStore((state) => state.listState);
  const listError = useProjectsStore((state) => state.listError);
  const refreshProjects = useProjectsStore((state) => state.refresh);

  const [dropNote, setDropNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pagerHeight, setPagerHeight] = useState(0);
  const pager = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);

  // Drag a project or idea onto an analysis.
  const onDrop = (payload: DragPayload, target: DropTarget) => {
    if (target === "new") {
      router.push({ pathname: "/board-new", params: payload.kind === "project" ? { addProjectId: payload.id } : { addIdeaId: payload.id } });
      return;
    }
    if (payload.kind === "project") addProjectToBoard(target, payload.id);
    else moveIdea(payload.id, target);
    setDropNote(`Put “${payload.title}” in ${boardsById[target]?.name ?? "the analysis"}.`);
  };
  const { dragging, rootRef, rowProps, overlay } = useDragToPage(onDrop);

  useEffect(() => {
    if (!dropNote) return;
    const timer = setTimeout(() => setDropNote(null), 2600);
    return () => clearTimeout(timer);
  }, [dropNote]);

  // Projects live on the backend; refresh whenever the tab is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshProjects();
    }, [refreshProjects]),
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });
  const [page, setPage] = useState(0);
  const onPageChange = (next: number) => {
    setPage(next);
    haptics.selection();
  };
  useAnimatedReaction(
    () => (width > 0 ? Math.round(scrollX.get() / width) : 0),
    (next, previous) => {
      if (previous !== null && next !== previous) scheduleOnRN(onPageChange, next);
    },
    [width],
  );
  // Once per launch: peek at Analyze and show "‹ Analyze" at the edge.
  const showHint = useSwipeHint("ideas", pager, page, width);
  const goToPage = (index: number) => pager.current?.scrollTo({ x: index * width, animated: true });

  const ideas = Object.values(ideasById).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visible = filter === "all" ? ideas : ideas.filter((idea) => idea.status === filter);
  const counts = ideas.reduce<Record<string, number>>((acc, idea) => ({ ...acc, [idea.status]: (acc[idea.status] ?? 0) + 1 }), {});

  const newIdea = () => router.push("/idea-editor");
  const newAnalysis = () => router.push("/board-new");
  // Projects changed from an analysis show in its colour.
  const changedBy = (projectId: string) => {
    const changer = folderThatChanged(boardsById, projectId);
    return changer ? { name: changer.name, color: folderColor(changer) } : undefined;
  };
  // "idea:<id>" / "project:<id>" (how an analysis names its items) to a title.
  const titleOf = (key: string | null | undefined) => {
    if (!key) return undefined;
    const kind = key.slice(0, key.indexOf(":"));
    const id = key.slice(key.indexOf(":") + 1);
    if (kind === "idea") return ideasById[id]?.title;
    return projects.find((project) => project.project_id === id)?.title;
  };
  const itemCount = (board: IdeaBoard) => ideas.filter((idea) => idea.boardId === board.id).length + (board.projectIds?.length ?? 0);

  // ---------------- page 1: projects and ideas ----------------
  const projectsPage = (
    <FlatList<Idea>
      scrollEnabled={!dragging}
      data={visible}
      keyExtractor={(idea) => idea.id}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={
        <View>
          <PageHeader
            eyebrow="Your ideas"
            title="Projects"
            description="Plans Veya built with you and ideas you saved. Hold one and drag it onto an analysis to compare it."
            accessory={<IconButton icon="plus" variant="accent" accessibilityLabel="Write down a new idea" onPress={newIdea} />}
          />

          {projects.length > 0 || listState === "loading" || listError ? (
            <>
              <SectionHeader title="Project plans" />
              {listState === "loading" && !projects.length ? <ActivityIndicator size="small" color={colors.text.secondary} style={styles.loading} /> : null}
              {listError ? (
                <View style={styles.error}>
                  <AppText variant="bodySmall" tone="secondary" accessibilityRole="alert">
                    {listError}
                  </AppText>
                  <TextLink label="Try again" onPress={() => void refreshProjects()} />
                </View>
              ) : null}
              <View style={styles.list}>
                {projects.map((project) => (
                  <DraggableRow key={project.project_id} payload={{ kind: "project", id: project.project_id, title: project.title }} {...rowProps}>
                    <ProjectListItem
                      project={project}
                      folder={changedBy(project.project_id)}
                      onPress={() => router.push({ pathname: "/project/[id]", params: { id: project.project_id } })}
                    />
                  </DraggableRow>
                ))}
              </View>
            </>
          ) : null}

          {ideas.length > 0 ? (
            <>
              <SectionHeader title="Ideas" action="+ Write one" onAction={newIdea} />
              <AppText variant="bodySmall" tone="muted" style={styles.hint}>
                Thoughts you saved. Tap one to add detail or turn it into a project.
              </AppText>
              <FilterChips
                options={FILTERS.map((option) => ({ ...option, count: option.value === "all" ? ideas.length : (counts[option.value] ?? 0) }))}
                value={filter}
                onChange={setFilter}
              />
              <View style={styles.separator} />
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        ideas.length === 0 && projects.length > 0 ? undefined : ideas.length === 0 ? (
          <EmptyState
            icon="idea"
            title="No ideas yet"
            message="Start a conversation with Veya, or write a thought down. Saved ideas appear here for review."
            action={
              <View style={styles.emptyActions}>
                <Button label="Talk to Veya" icon="mic" iconPosition="left" onPress={() => router.navigate("/talk")} />
                <Button label="Write it down" variant="secondary" icon="edit" iconPosition="left" onPress={newIdea} />
              </View>
            }
          />
        ) : (
          <EmptyState icon="list" title="Nothing here" message="No ideas match this filter yet." />
        )
      }
      renderItem={({ item }) => (
        <DraggableRow payload={{ kind: "idea", id: item.id, title: item.title }} {...rowProps}>
          <IdeaListItem idea={item} onPress={() => router.push({ pathname: "/ideas/[id]", params: { id: item.id } })} />
        </DraggableRow>
      )}
      showsVerticalScrollIndicator={false}
    />
  );

  // ---------------- page 2: analyze ----------------
  const analyzePage = (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <PageHeader
        eyebrow="Your ideas"
        title="Analyze"
        description="Choosing between projects for a hackathon or event? Put them in an analysis and Veya tells you which one to build, and how to make it win."
        accessory={<IconButton icon="plus" variant="accent" accessibilityLabel="New analysis" onPress={newAnalysis} />}
      />

      {boards.length ? (
        <>
          <SectionHeader title="Your analyses" />
          <View style={styles.list}>
            {boards.map((board) => (
              <AnalysisCard
                key={board.id}
                board={board}
                itemCount={itemCount(board)}
                bestTitle={titleOf(board.rating?.best_idea_id ?? board.rating?.ratings[0]?.idea_id)}
                onPress={() => router.push({ pathname: "/board/[id]", params: { id: board.id } })}
              />
            ))}
          </View>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New analysis, for a hackathon, a college project or any other event"
        onPress={() => {
          haptics.selection();
          newAnalysis();
        }}
        style={({ pressed }) => [styles.newAnalysis, pressed && styles.pressed]}
      >
        <View style={styles.newIcon}>
          <Icon name="plus" size={16} color={colors.text.primary} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyMedium" style={styles.strong}>
            New analysis
          </AppText>
          <AppText variant="bodySmall" tone="muted">
            For a hackathon, a college project or any other event
          </AppText>
        </View>
      </Pressable>

      <SectionHeader title="How it works" />
      <Group>
        {STEPS.map((step, index) => (
          <View key={step.title} style={styles.how}>
            <AppText variant="bodySmall" style={[styles.howNumber, TABULAR]}>
              {String(index + 1).padStart(2, "0")}
            </AppText>
            <View style={styles.flex}>
              <AppText variant="bodyMedium" style={styles.strong}>
                {step.title}
              </AppText>
              <AppText variant="bodySmall" tone="muted">
                {step.text}
              </AppText>
            </View>
          </View>
        ))}
      </Group>
    </ScrollView>
  );

  return (
    <ScreenBackground>
      <View ref={rootRef} style={styles.safe} collapsable={false}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <ModeIndicator
            scrollX={scrollX}
            width={width}
            modes={PAGES}
            onSelect={goToPage}
            accessibilityLabel="Swipe between projects and analyze"
          />
          <Animated.ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            bounces={false}
            scrollEnabled={!dragging}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            style={styles.safe}
            onLayout={(event) => setPagerHeight(event.nativeEvent.layout.height)}
          >
            <View style={{ width, height: pagerHeight || undefined }}>{projectsPage}</View>
            <View style={{ width, height: pagerHeight || undefined }}>{analyzePage}</View>
          </Animated.ScrollView>
          <SwipeHint label="Analyze" visible={showHint} top="30%" />
        </SafeAreaView>
        {dropNote ? (
          <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite">
            <Icon name="checkCircle" size={16} color={colors.semantic.success} />
            <AppText variant="bodySmall" style={styles.flex}>
              {dropNote}
            </AppText>
          </View>
        ) : null}
        {overlay(boards)}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamilies.semibold, color: colors.text.primary },
  pressed: { backgroundColor: PRESSED_BG },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[2], paddingBottom: spacing[10] },
  pageHeader: { gap: spacing[2], marginBottom: spacing[2] },
  pageHeaderTop: { flexDirection: "row", alignItems: "flex-end", gap: spacing[3] },
  title: { fontFamily: fontFamilies.bold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6, color: colors.text.primary },
  hint: { marginBottom: spacing[3], paddingHorizontal: spacing[1] },
  list: { gap: spacing[3] },
  loading: { alignSelf: "flex-start", marginBottom: spacing[2] },
  error: { gap: spacing[1], marginBottom: spacing[3] },
  separator: { height: spacing[3] },
  emptyActions: { gap: spacing[3] },
  // analyses
  analysis: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingRight: spacing[4],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: GROUP_BG,
    overflow: "hidden",
  },
  analysisBar: { width: 4, alignSelf: "stretch" },
  analysisBody: { flex: 1, gap: 6, paddingVertical: spacing[4] },
  analysisHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[2] },
  analysisPurpose: { fontFamily: fontFamilies.medium, letterSpacing: 0.4, textTransform: "uppercase" },
  steps: { flexDirection: "row", gap: 3, marginTop: spacing[1] },
  stepSegment: { flex: 1, height: 3, borderRadius: 2 },
  analysisFoot: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  best: { maxWidth: "55%", color: colors.text.secondary, fontFamily: fontFamilies.medium },
  newAnalysis: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginTop: spacing[3],
    padding: spacing[4],
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: HAIRLINE,
  },
  newIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
  },
  how: { flexDirection: "row", gap: spacing[3], alignItems: "flex-start", padding: spacing[4] },
  howNumber: { width: 22, paddingTop: 2, fontFamily: fontFamilies.semibold, color: colors.text.muted },
  toast: {
    position: "absolute",
    left: screenGutter,
    right: screenGutter,
    bottom: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.semantic.success,
    backgroundColor: colors.veya.surface,
  },
});
