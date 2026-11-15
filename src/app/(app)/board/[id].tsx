import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import {
  ActionBar,
  type BoardItem,
  ChecksCard,
  Cooking,
  DoneCard,
  Group,
  ANALYZE_HAIRLINE as HAIRLINE,
  ImprovementCard,
  NeutralGroups,
  WhyCard,
  Row,
  SectionHeader,
  STEP_ENTER,
  StepProgress,
} from "@/components/boards/AnalyzeSteps";
import { BoardContextCard } from "@/components/boards/BoardContextCard";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Icon, type IconName } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { IdeaCheckSheet } from "@/components/IdeaCheckSheet";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { TextLink } from "@/components/TextLink";
import { purposeInfo } from "@/constants/boardPurposes";
import { folderColor } from "@/constants/folderColors";
import { BACKEND_LANGUAGE } from "@/constants/languages";
import { haptics } from "@/lib/haptics";
import { boardsApi, describeApiError } from "@/lib/veyaApi";
import type { BoardIdeaInput } from "@/lib/api/boards";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  colors,
  fontFamilies,
  radii,
  screenGutter,
  spacing,
  themed,
} from "@/theme";
import type { StoredProject } from "@/types/api";
import type { BoardItemKey, Idea } from "@/types/models";

/** The backend rates at most this many items at once. */
const MAX_RATED = 12;

const ideaSummary = (idea: Idea) =>
  [
    { label: "The idea", text: idea.description },
    { label: "Problem", text: idea.problem },
    { label: "Solution", text: idea.solution },
    { label: "For", text: idea.targetUsers },
  ].filter((line) => line.text.trim());

const projectSummary = (project: StoredProject | undefined) =>
  project
    ? [
        { label: "Overview", text: project.sections.overview },
        { label: "Problem", text: project.sections.problem },
        { label: "Solution", text: project.sections.solution },
        { label: "Tech", text: project.sections.tech_stack },
      ]
        .filter((line) => line.text.trim())
        .map((line) => ({
          ...line,
          text:
            line.text.length > 400
              ? `${line.text.slice(0, 399).trimEnd()}…`
              : line.text,
        }))
    : [];

/**
 * One Analyze folder, as steps that appear one under the other:
 * about the event (folded) -> add projects -> Analyze (rate) -> Compare ->
 * Make it better (for the event) -> Implement the plan (edits the project's
 * README) -> Done changing (tap to open the project; back returns here).
 * The folder's colour runs through the page and marks the projects it changed.
 */
export default function BoardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const board = useWorkspaceStore((state) => state.boards[id]);
  const allIdeas = useWorkspaceStore((state) => state.ideas);
  const boards = useWorkspaceStore((state) => state.boards);
  const updateBoard = useWorkspaceStore((state) => state.updateBoard);
  const setBoardRating = useWorkspaceStore((state) => state.setBoardRating);
  const setItemCheck = useWorkspaceStore((state) => state.setItemCheck);
  const setBoardImprovement = useWorkspaceStore(
    (state) => state.setBoardImprovement,
  );
  const markImplemented = useWorkspaceStore((state) => state.markImplemented);
  const editPlan = useProjectsStore((state) => state.editPlan);
  const language = usePreferencesStore((state) => state.language);
  const deleteBoard = useWorkspaceStore((state) => state.deleteBoard);
  const moveIdea = useWorkspaceStore((state) => state.moveIdea);
  const addProjectToBoard = useWorkspaceStore(
    (state) => state.addProjectToBoard,
  );
  const removeProjectFromBoard = useWorkspaceStore(
    (state) => state.removeProjectFromBoard,
  );
  const projectSummaries = useProjectsStore((state) => state.summaries);
  const projectDetails = useProjectsStore((state) => state.details);
  const loadProject = useProjectsStore((state) => state.load);
  const refreshProjects = useProjectsStore((state) => state.refresh);
  const aiModel = usePreferencesStore((state) => state.aiModel);

  const [busy, setBusy] = useState<
    "rating" | "researching" | "checking" | "improving" | "implementing" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({});
  const [openCheck, setOpenCheck] = useState<BoardItemKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The event summary starts folded; tap to open it.
  const [aboutOpen, setAboutOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Which rated item "Make it better" works on (default: the winner).
  const [improveKey, setImproveKey] = useState<BoardItemKey | null>(null);

  const projectIds = useMemo(
    () => board?.projectIds ?? [],
    [board?.projectIds],
  );

  // Project summaries come from the backend: load the ones on this page.
  useFocusEffect(
    useCallback(() => {
      void refreshProjects();
      for (const projectId of projectIds) {
        if (!useProjectsStore.getState().details[projectId])
          void loadProject(projectId).catch(() => undefined);
      }
    }, [loadProject, projectIds, refreshProjects]),
  );

  const items: BoardItem[] = useMemo(() => {
    const ideas = Object.values(allIdeas)
      .filter((idea) => idea.boardId === id)
      .map<BoardItem>((idea) => ({
        key: `idea:${idea.id}`,
        kind: "idea",
        title: idea.title,
        summary: ideaSummary(idea),
        updatedAt: idea.updatedAt,
      }));
    const projects = projectIds.map<BoardItem>((projectId) => {
      const summary = projectSummaries.find(
        (project) => project.project_id === projectId,
      );
      const detail = projectDetails[projectId];
      return {
        key: `project:${projectId}`,
        kind: "project",
        title: detail?.title ?? summary?.title ?? "Project",
        summary: projectSummary(detail),
        updatedAt: detail?.updated_at ?? summary?.updated_at ?? "",
      };
    });
    return [...projects, ...ideas];
  }, [allIdeas, id, projectDetails, projectIds, projectSummaries]);

  const rating = board?.rating ?? null;
  const ratingByKey = useMemo(
    () => new Map((rating?.ratings ?? []).map((item) => [item.idea_id, item])),
    [rating],
  );
  const rankByKey = useMemo(
    () =>
      new Map(
        (rating?.ratings ?? []).map((item, index) => [item.idea_id, index + 1]),
      ),
    [rating],
  );
  const ordered = [...items].sort((a, b) => {
    const rankA = rankByKey.get(a.key) ?? Infinity;
    const rankB = rankByKey.get(b.key) ?? Infinity;
    return rankA !== rankB
      ? rankA - rankB
      : b.updatedAt.localeCompare(a.updatedAt);
  });
  const isOutdated = (item: BoardItem) =>
    Boolean(rating) &&
    board?.ratedIdeas[item.key] !== undefined &&
    board.ratedIdeas[item.key] !== item.updatedAt;
  const needsRating =
    items.length > 0 &&
    (!rating ||
      items.some(
        (item) => board?.ratedIdeas[item.key] === undefined || isOutdated(item),
      ));

  if (!board) {
    return (
      <ScreenBackground glow="top">
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <ScreenTopBar onBack={() => router.back()} />
          <EmptyState
            icon="list"
            title="Folder not found"
            message="It may have been deleted."
          />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const info = purposeInfo(board.purpose);
  const checks = board.checks ?? {};

  /** What the backend needs to judge an item. */
  const inputFor = (item: BoardItem): BoardIdeaInput => {
    if (item.kind === "idea") {
      const idea = allIdeas[item.key.slice(5)];
      return {
        id: item.key,
        title: item.title,
        description: idea?.description ?? "",
        problem: idea?.problem ?? "",
        solution: idea?.solution ?? "",
        target_users: idea?.targetUsers ?? "",
      };
    }
    const detail = projectDetails[item.key.slice(8)];
    return {
      id: item.key,
      title: item.title,
      description: [detail?.sections.overview, detail?.sections.tech_stack]
        .filter(Boolean)
        .join("\n")
        .slice(0, 3900),
      problem: (detail?.sections.problem ?? "").slice(0, 1900),
      solution: (detail?.sections.solution ?? "").slice(0, 1900),
      target_users: "",
    };
  };

  const ensureProjectsLoaded = async () => {
    await Promise.all(
      projectIds
        .filter((p) => !useProjectsStore.getState().details[p])
        .map((p) => loadProject(p).catch(() => undefined)),
    );
  };

  const rate = async () => {
    if (!board.context || items.length === 0) return;
    setBusy("rating");
    setError(null);
    try {
      await ensureProjectsLoaded();
      const selection = [...items]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_RATED);
      const result = await boardsApi.rateBoard(
        board.context,
        selection.map(inputFor),
        aiModel,
      );
      setBoardRating(
        board.id,
        result,
        Object.fromEntries(selection.map((item) => [item.key, item.updatedAt])),
      );
      haptics.success();
    } catch (problem) {
      setError(describeApiError(problem));
    } finally {
      setBusy(null);
    }
  };

  const checkItem = async (item: BoardItem) => {
    setCheckErrors(({ [item.key]: _old, ...rest }) => rest);
    try {
      await ensureProjectsLoaded();
      const result = await boardsApi.checkItem(
        inputFor(item),
        board.context,
        aiModel,
      );
      setItemCheck(board.id, item.key, result);
      haptics.success();
    } catch (problem) {
      setCheckErrors((current) => ({
        ...current,
        [item.key]: describeApiError(problem),
      }));
    }
  };

  const researchAgain = async () => {
    setBusy("researching");
    setError(null);
    try {
      const context = await boardsApi.researchBoard(
        board.purpose,
        board.query,
        board.notes,
        aiModel,
      );
      updateBoard(board.id, { context });
      haptics.success();
    } catch (problem) {
      setError(describeApiError(problem));
    } finally {
      setBusy(null);
    }
  };

  const removeItem = (item: BoardItem) => {
    haptics.selection();
    if (item.kind === "idea") moveIdea(item.key.slice(5), null);
    else removeProjectFromBoard(board.id, item.key.slice(8));
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteBoard(board.id);
    haptics.success();
    router.back();
  };

  // ---- the steps ----
  const color = folderColor(board);
  const titles = Object.fromEntries(
    items.map((item) => [item.key, item.title]),
  );
  const rated = (rating?.ratings ?? []).filter((item) => titles[item.idea_id]);
  const improvement =
    board.improvement && titles[board.improvement.key]
      ? board.improvement
      : null;
  const target: BoardItemKey | null =
    improveKey ??
    improvement?.key ??
    (rating?.best_idea_id && titles[rating.best_idea_id]
      ? (rating.best_idea_id as BoardItemKey)
      : null) ??
    (rated[0]?.idea_id as BoardItemKey | undefined) ??
    null;
  const targetItem = target
    ? items.find((item) => item.key === target)
    : undefined;
  // "Check these ideas": every rated project checked against what already exists.
  const ratedKeys = rated.map((item) => item.idea_id as BoardItemKey);
  const checkedAll =
    ratedKeys.length > 0 && ratedKeys.every((key) => checks[key]);
  const checkedAny = ratedKeys.some((key) => checks[key]);
  const doneEntries = Object.entries(board.implemented ?? {}).filter(
    ([key]) => titles[key],
  ) as [
    BoardItemKey,
    { at: string; summary: string; changedSections: string[] },
  ][];
  const eventName = board.purpose === "hackathon" ? board.name : "this event";

  const makeBetter = async () => {
    if (!board.context || !targetItem) return;
    setBusy("improving");
    setError(null);
    try {
      await ensureProjectsLoaded();
      const plan = await boardsApi.improveItem(
        inputFor(targetItem),
        board.context,
        ratingByKey.get(targetItem.key),
        checks[targetItem.key],
        aiModel,
      );
      setBoardImprovement(board.id, { key: targetItem.key, plan });
      haptics.success();
    } catch (problem) {
      setError(describeApiError(problem));
    } finally {
      setBusy(null);
    }
  };

  /** Idea Check for every rated project, two at a time (each searches GitHub and Devpost). */
  const checkAll = async (again = false) => {
    const queue = rated
      .map((item) => items.find((candidate) => candidate.key === item.idea_id))
      .filter(
        (item): item is BoardItem =>
          Boolean(item) && (again || !checks[item!.key]),
      );
    if (!queue.length) return;
    setBusy("checking");
    setError(null);
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift())
        await checkItem(next);
    };
    try {
      await Promise.all([worker(), worker()]);
    } finally {
      setBusy(null);
    }
  };

  const implement = async () => {
    if (!improvement || !improvement.key.startsWith("project:")) return;
    const projectId = improvement.key.slice(8);
    setBusy("implementing");
    setError(null);
    try {
      const result = await editPlan(projectId, {
        instruction: improvement.plan.instruction,
        model: aiModel,
        language: BACKEND_LANGUAGE[language],
      });
      if (result.changed) {
        markImplemented(board.id, improvement.key, {
          summary: result.summary,
          changedSections: result.changed_sections,
        });
        haptics.success();
      } else {
        setError(result.summary || "Nothing needed changing.");
      }
    } catch (problem) {
      setError(describeApiError(problem));
    } finally {
      setBusy(null);
    }
  };

  const sheetCheck = openCheck ? checks[openCheck] : undefined;
  const openItem = (key: BoardItemKey) =>
    key.startsWith("idea:")
      ? router.push({ pathname: "/ideas/[id]", params: { id: key.slice(5) } })
      : router.push({
          pathname: "/project/[id]",
          params: { id: key.slice(8) },
        });

  // ---- where we are: the next step gets the button at the bottom ----
  const STEPS = ["Add", "Analyze", "Check", "Enhance", "Implement"];
  const analyzed = Boolean(rating) && !needsRating;
  const enhanced = Boolean(improvement && improvement.key === target);
  const implemented = Boolean(improvement && board.implemented?.[improvement.key]);
  const stepsDone = !items.length ? 0 : !analyzed ? 1 : !checkedAll ? 2 : !enhanced ? 3 : !implemented ? 4 : 5;
  const working = {
    rating: "Analyzing…",
    checking: "Checking against existing projects…",
    improving: "Enhancing…",
    implementing: "Updating the plan…",
    researching: "Looking it up again…",
  } as const;
  const next: { label: string; caption?: string; icon: IconName; run: () => void; disabled?: boolean } = !items.length
    ? { label: "Add a project", caption: "Add the projects you're choosing between", icon: "plus", run: () => setPickerOpen(true) }
    : !analyzed
      ? {
          label: rating ? "Analyze again" : `Analyze ${items.length === 1 ? "project" : `${items.length} projects`}`,
          caption: rating ? "Something changed since the last analysis" : `Scored against ${board.purpose === "hackathon" ? "the judging criteria" : "what matters for it"}`,
          icon: "target",
          run: () => void rate(),
          disabled: !board.context,
        }
      : !checkedAll
        ? {
            label: rated.length > 1 ? `Check ${rated.length} ideas` : "Check this idea",
            caption: "Finds similar projects on GitHub and Devpost",
            icon: "target",
            run: () => void checkAll(),
          }
        : !enhanced
          ? {
              label: `Enhance ${targetItem?.title ?? ""}`.trim(),
              caption: `For ${eventName}, and ahead of what already exists`,
              icon: "sparkle",
              run: () => void makeBetter(),
              disabled: !targetItem,
            }
          : !implemented && improvement && improvement.key.startsWith("project:")
            ? {
                label: "Implement the plan",
                caption: "Rewrites the project's README with these changes",
                icon: "build",
                run: () => void implement(),
              }
            : {
                label: improvement?.key.startsWith("idea:") ? "Open the idea" : "Open the project",
                caption: improvement?.key.startsWith("idea:") ? "Turn it into a project to apply these changes" : undefined,
                icon: "arrowRight",
                run: () => (improvement ? openItem(improvement.key) : undefined),
              };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenTopBar onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <NeutralGroups>
          <LayoutAnimationConfig skipEntering>
            {/* ---- title ---- */}
            <View style={styles.header}>
              <View style={styles.meta}>
                <View style={[styles.metaDot, { backgroundColor: color }]} />
                <AppText variant="bodySmall" tone="secondary">
                  {info.label}
                  {items.length ? ` · ${items.length} ${items.length === 1 ? "project" : "projects"}` : ""}
                </AppText>
              </View>
              <AppText style={styles.title} accessibilityRole="header" numberOfLines={3}>
                {board.name}
              </AppText>
              {board.context && board.purpose === "hackathon" && !board.context.found ? (
                <AppText variant="bodySmall" tone="muted">
                  Not found online, so typical hackathon criteria are used.
                </AppText>
              ) : null}
            </View>
            <StepProgress steps={STEPS} done={stepsDone} color={color} />

            {/* ---- about the event: folded ---- */}
            {board.context ? (
              <>
                <SectionHeader title={board.purpose === "hackathon" ? "Hackathon" : "Event"} />
                <Group>
                  <Row
                    title={`About ${board.name}`}
                    subtitle={
                      aboutOpen
                        ? undefined
                        : board.context.summary ||
                          [board.context.themes.slice(0, 3).join(", "), `${board.context.judging_criteria.length} judging criteria`]
                            .filter(Boolean)
                            .join(" · ")
                    }
                    onPress={() => {
                      haptics.selection();
                      setAboutOpen((open) => !open);
                    }}
                    trailing={<Icon name="chevronDown" size={13} color={colors.text.muted} style={aboutOpen ? styles.chevronOpen : undefined} />}
                  />
                </Group>
                {aboutOpen ? (
                  <Animated.View entering={STEP_ENTER} style={styles.aboutBody}>
                    <BoardContextCard context={board.context} />
                    {board.purpose === "hackathon" ? (
                      <TextLink label={busy === "researching" ? "Looking it up…" : "Look it up again"} onPress={() => void researchAgain()} />
                    ) : null}
                  </Animated.View>
                ) : null}
              </>
            ) : null}

            {/* ---- projects ---- */}
            <SectionHeader
              title="Projects"
              action={items.length ? (editing ? "Done" : "Edit") : undefined}
              onAction={() => setEditing((value) => !value)}
            />
            {items.length ? (
              <Group>
                {ordered.map((item) => {
                  const score = ratingByKey.get(item.key);
                  const changed = board.implemented?.[item.key];
                  const notes = [
                    item.kind === "project" ? "Project" : "Idea",
                    changed ? "Improved here" : "",
                    isOutdated(item) ? "Changed since analysis" : "",
                  ].filter(Boolean);
                  return (
                    <Row
                      key={item.key}
                      title={item.title}
                      subtitle={notes.join(" · ")}
                      onPress={editing ? undefined : () => openItem(item.key)}
                      leading={
                        editing ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${item.title}`}
                            hitSlop={10}
                            onPress={() => removeItem(item)}
                          >
                            <Icon name="close" size={14} color={colors.semantic.error} />
                          </Pressable>
                        ) : (
                          <Icon name={item.kind === "project" ? "folder" : "idea"} size={15} color={changed ? color : colors.text.muted} />
                        )
                      }
                      trailing={
                        score ? (
                          <AppText variant="bodyMedium" style={[styles.score, item.key === rating?.best_idea_id && { color }]}>
                            {score.total}
                          </AppText>
                        ) : editing ? undefined : (
                          <Icon name="chevronRight" size={13} color={colors.text.muted} />
                        )
                      }
                    />
                  );
                })}
              </Group>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a project to analyze"
              onPress={() => {
                haptics.selection();
                setPickerOpen(true);
              }}
              style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
            >
              <View style={styles.addIcon}>
                <Icon name="plus" size={14} color={colors.text.primary} />
              </View>
              <AppText variant="bodySmall" tone="secondary">
                Add project
              </AppText>
            </Pressable>

            {/* ---- analysis ---- */}
            {busy === "rating" ? (
              <>
                <SectionHeader title="Analysis" />
                <Cooking
                  color={color}
                  lines={[
                    `Reading ${board.purpose === "hackathon" ? "the judging criteria" : "what matters for it"}`,
                    "Scoring each project, criterion by criterion",
                    `Working out which has the best chance at ${eventName}`,
                  ]}
                />
              </>
            ) : rating && rated.length ? (
              <>
                <SectionHeader title="Why it's the strongest" action={analyzed ? "Analyze again" : undefined} onAction={() => void rate()} />
                <WhyCard rating={rating} titles={titles} color={color} />
              </>
            ) : null}

            {/* ---- what already exists ---- */}
            {busy === "checking" ? (
              <>
                <SectionHeader title="Existing projects" />
                <Cooking
                  color={color}
                  lines={["Searching GitHub for similar projects", "Looking through Devpost winners", "Working out how different each one is"]}
                />
              </>
            ) : checkedAny && busy !== "rating" ? (
              <>
                <SectionHeader title="Existing projects" action={checkedAll ? "Check again" : undefined} onAction={() => void checkAll(true)} />
                <ChecksCard
                  color={color}
                  rows={ratedKeys.map((key) => ({ key, title: titles[key], check: checks[key], error: checkErrors[key] }))}
                  onOpen={(key) => setOpenCheck(key as BoardItemKey)}
                />
              </>
            ) : null}

            {/* ---- enhance ---- */}
            {rating && checkedAny && busy !== "rating" && busy !== "checking" ? (
              <>
                <SectionHeader
                  title={`Enhance for ${eventName}`}
                  action={enhanced && busy === null ? "Try again" : undefined}
                  onAction={() => void makeBetter()}
                />
                {rated.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targets}>
                    {rated.map((item) => {
                      const on = item.idea_id === target;
                      return (
                        <Pressable
                          key={item.idea_id}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          onPress={() => {
                            haptics.selection();
                            setImproveKey(item.idea_id as BoardItemKey);
                          }}
                          style={[styles.target, on && styles.targetOn]}
                        >
                          <AppText variant="bodySmall" numberOfLines={1} style={on ? styles.targetLabelOn : styles.targetLabel}>
                            {titles[item.idea_id]}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
                {busy === "improving" ? (
                  <Cooking
                    color={color}
                    lines={[
                      `Comparing ${targetItem?.title ?? "it"} with what already exists`,
                      "Finding what the existing projects don't do",
                      `Matching it to ${eventName}'s judging criteria`,
                    ]}
                  />
                ) : improvement && improvement.key === target ? (
                  <ImprovementCard plan={improvement.plan} title={titles[improvement.key]} color={color} />
                ) : (
                  <AppText variant="bodySmall" tone="muted" style={styles.note}>
                    {target && !checks[target]
                      ? "Not checked yet, so it's enhanced without comparing to existing projects."
                      : "Makes it a stronger fit and puts it ahead of the similar projects found."}
                  </AppText>
                )}
              </>
            ) : null}

            {/* ---- implement ---- */}
            {busy === "implementing" ? (
              <>
                <SectionHeader title="Plan" />
                <Cooking color={color} lines={["Rewriting the plan with every change", "Updating features, tech and build steps", "Checking the timeline still fits"]} />
              </>
            ) : doneEntries.length ? (
              <>
                <SectionHeader title="Updated" />
                {doneEntries.map(([key, done]) => (
                  <DoneCard
                    key={key}
                    title={titles[key]}
                    summary={done.summary}
                    changedSections={done.changedSections}
                    color={color}
                    onOpen={() => openItem(key)}
                  />
                ))}
              </>
            ) : null}

            {error ? (
              <AppText variant="bodySmall" tone="error" accessibilityRole="alert" style={styles.note}>
                {error}
              </AppText>
            ) : null}

            <Pressable accessibilityRole="button" onPress={remove} style={styles.delete}>
              <AppText variant="bodySmall" style={styles.deleteLabel}>
                {confirmDelete ? "Tap again to delete" : "Delete analysis"}
              </AppText>
              {confirmDelete ? (
                <AppText variant="caption" tone="muted">
                  Its projects and ideas stay in Your Ideas.
                </AppText>
              ) : null}
            </Pressable>
          </LayoutAnimationConfig>
          </NeutralGroups>
        </ScrollView>

        <ActionBar
          label={busy ? working[busy] : next.label}
          caption={busy ? undefined : next.caption}
          icon={next.icon}
          color={color}
          busy={busy !== null}
          disabled={next.disabled}
          onPress={next.run}
          bottomInset={insets.bottom}
        />

        {sheetCheck ? (
          <IdeaCheckSheet check={sheetCheck} visible title={items.find((item) => item.key === openCheck)?.title} onClose={() => setOpenCheck(null)} />
        ) : null}

        <Modal
          visible={pickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setPickerOpen(false)}
        >
          <View style={styles.backdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setPickerOpen(false)}
            />
            <View
              style={[
                styles.sheet,
                { paddingBottom: Math.max(insets.bottom, spacing[4]) },
              ]}
            >
              <View style={styles.sectionHeader}>
                <AppText variant="h3">Add to {board.name}</AppText>
                <IconButton
                  icon="close"
                  variant="plain"
                  size={36}
                  accessibilityLabel="Done"
                  onPress={() => setPickerOpen(false)}
                />
              </View>
              <AppText variant="bodySmall" tone="secondary">
                Tap to add it; tap again to take it out.
              </AppText>
              <Button
                label="Write a new idea"
                variant="secondary"
                size="small"
                icon="edit"
                iconPosition="left"
                onPress={() => {
                  setPickerOpen(false);
                  router.push({
                    pathname: "/idea-editor",
                    params: { boardId: board.id },
                  });
                }}
              />
              <ScrollView contentContainerStyle={styles.pickerList}>
                {projectSummaries.length ? (
                  <AppText variant="eyebrow" tone="secondary">
                    Project plans
                  </AppText>
                ) : null}
                {projectSummaries.map((project) => {
                  const here = projectIds.includes(project.project_id);
                  const elsewhere = here
                    ? undefined
                    : Object.values(boards).find((other) =>
                        other.projectIds?.includes(project.project_id),
                      )?.name;
                  return (
                    <PickRow
                      key={project.project_id}
                      title={project.title}
                      icon="folder"
                      here={here}
                      elsewhere={elsewhere}
                      onPress={() => {
                        haptics.selection();
                        if (here)
                          removeProjectFromBoard(board.id, project.project_id);
                        else {
                          addProjectToBoard(board.id, project.project_id);
                          void loadProject(project.project_id).catch(
                            () => undefined,
                          );
                        }
                      }}
                    />
                  );
                })}
                {Object.keys(allIdeas).length ? (
                  <AppText
                    variant="eyebrow"
                    tone="secondary"
                    style={styles.pickerLabel}
                  >
                    Ideas
                  </AppText>
                ) : null}
                {Object.values(allIdeas)
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .map((idea) => {
                    const here = idea.boardId === board.id;
                    return (
                      <PickRow
                        key={idea.id}
                        title={idea.title}
                        icon="idea"
                        here={here}
                        elsewhere={
                          idea.boardId && !here
                            ? boards[idea.boardId]?.name
                            : undefined
                        }
                        onPress={() => {
                          haptics.selection();
                          moveIdea(idea.id, here ? null : board.id);
                        }}
                      />
                    );
                  })}
                {projectSummaries.length === 0 &&
                Object.keys(allIdeas).length === 0 ? (
                  <AppText variant="bodySmall" tone="muted">
                    No saved projects or ideas yet.
                  </AppText>
                ) : null}
              </ScrollView>
              <Button label="Done" onPress={() => setPickerOpen(false)} />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function PickRow({
  title,
  icon,
  here,
  elsewhere,
  onPress,
}: {
  title: string;
  icon: "folder" | "idea";
  here: boolean;
  elsewhere?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: here }}
      accessibilityLabel={`${title}${elsewhere ? `, in ${elsewhere}` : ""}`}
      onPress={onPress}
      style={[styles.pickRow, here && styles.pickRowOn]}
    >
      <Icon
        name={here ? "checkCircle" : "circle"}
        size={18}
        color={here ? colors.text.primary : colors.text.muted}
      />
      <Icon name={icon} size={14} color={colors.text.muted} />
      <View style={styles.flex}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {title}
        </AppText>
        {elsewhere ? (
          <AppText variant="caption" tone="muted">
            In {elsewhere} (it moves here)
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  bold: { fontFamily: fontFamilies.medium },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[8] },
  header: { gap: spacing[2], paddingTop: spacing[2], paddingBottom: spacing[5] },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  metaDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontFamily: fontFamilies.bold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6, color: colors.text.primary },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  aboutBody: { gap: spacing[2], marginTop: spacing[3] },
  score: { fontFamily: fontFamilies.semibold, fontVariant: ["tabular-nums"], color: colors.text.primary },
  add: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2], alignSelf: "center", marginTop: spacing[3], paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: 10 },
  addPressed: { backgroundColor: "rgba(255, 255, 255, 0.05)" },
  addIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.text.muted },
  cards: { gap: spacing[2], marginTop: spacing[3] },
  targets: { gap: spacing[2], paddingBottom: spacing[3] },
  target: { paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  targetOn: { backgroundColor: colors.text.primary, borderColor: colors.text.primary },
  targetLabel: { color: colors.text.secondary, fontFamily: fontFamilies.medium },
  targetLabelOn: { color: colors.text.inverse, fontFamily: fontFamilies.medium },
  note: { marginTop: spacing[2], paddingHorizontal: spacing[1] },
  delete: { alignItems: "center", gap: 2, marginTop: spacing[10], paddingVertical: spacing[3] },
  deleteLabel: { color: colors.semantic.error, fontFamily: fontFamilies.medium },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheet: {
    maxHeight: "80%",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.veya.surface,
  },
  pickerList: { gap: spacing[2], paddingBottom: spacing[2] },
  pickerLabel: { marginTop: spacing[2] },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.12)"),
  },
  pickRowOn: {
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
});
