import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { BoardContextCard } from "@/components/boards/BoardContextCard";
import { VoiceInputButton } from "@/components/boards/VoiceInputButton";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { TextField } from "@/components/TextField";
import { BOARD_PURPOSES, purposeInfo } from "@/constants/boardPurposes";
import { haptics } from "@/lib/haptics";
import { boardsApi, describeApiError } from "@/lib/veyaApi";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, radii, screenGutter, spacing, themed } from "@/theme";
import type { BoardContext, BoardPurpose } from "@/types/api";

type Step = "purpose" | "details" | "researching" | "review";

/**
 * New idea page. Asks what it's for; for a hackathon, which one (by voice
 * or text: a name or a link), then researches it and shows what it found.
 */
export default function NewBoardScreen() {
  const router = useRouter();
  const aiModel = usePreferencesStore((state) => state.aiModel);
  const createBoard = useWorkspaceStore((state) => state.createBoard);
  const addProjectToBoard = useWorkspaceStore((state) => state.addProjectToBoard);
  const moveIdea = useWorkspaceStore((state) => state.moveIdea);
  // Dropped on "New page" from Your Ideas: put it on the page once it's created.
  const { addProjectId, addIdeaId } = useLocalSearchParams<{ addProjectId?: string; addIdeaId?: string }>();
  const pendingTitle = useWorkspaceStore((state) => (addIdeaId ? state.ideas[addIdeaId]?.title : undefined));
  const pendingProjectTitle = useProjectsStore((state) =>
    addProjectId ? state.summaries.find((project) => project.project_id === addProjectId)?.title : undefined,
  );
  const pendingName = pendingTitle ?? pendingProjectTitle;

  const [step, setStep] = useState<Step>("purpose");
  const [purpose, setPurpose] = useState<BoardPurpose>("hackathon");
  const [inputMode, setInputMode] = useState<"voice" | "text" | null>(null);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [context, setContext] = useState<BoardContext | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const info = purposeInfo(purpose);
  const isHackathon = purpose === "hackathon";

  const choosePurpose = (value: BoardPurpose) => {
    haptics.selection();
    setPurpose(value);
    setInputMode(null);
    setError(null);
    setStep("details");
  };

  const research = async () => {
    if (isHackathon && !query.trim()) {
      haptics.error();
      setError("Say or type the hackathon's name, or paste its link.");
      return;
    }
    setError(null);
    setStep("researching");
    try {
      const found = await boardsApi.researchBoard(purpose, query.trim(), notes.trim(), aiModel);
      setContext(found);
      setName(found.found || !isHackathon ? found.name : query.trim());
      setStep("review");
    } catch (problem) {
      setError(describeApiError(problem));
      setStep("details");
    }
  };

  const create = () => {
    if (!context) return;
    const id = createBoard({ name: name.trim() || context.name, purpose, query: query.trim(), notes: notes.trim(), context });
    if (addProjectId) addProjectToBoard(id, addProjectId);
    if (addIdeaId) moveIdea(addIdeaId, id);
    haptics.success();
    router.replace({ pathname: "/board/[id]", params: { id } });
  };

  const back = () => {
    if (step === "details") setStep("purpose");
    else if (step === "review") setStep("details");
    else router.back();
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScreenTopBar
          title="New analysis"
          onBack={step === "purpose" ? () => router.back() : back}
          backIcon={step === "purpose" ? "close" : "chevronLeft"}
          backLabel={step === "purpose" ? "Cancel" : "Back"}
        />
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {step === "purpose" ? (
              <>
                <AppText variant="h2" accessibilityRole="header">
                  What are you analyzing for?
                </AppText>
                <AppText variant="bodyMedium" tone="secondary">
                  Put the ideas you&apos;re choosing between in it. Veya rates them against what you&apos;re aiming for, picks the best one, and shows how to make each one stronger.
                </AppText>
                {pendingName ? (
                  <AppText variant="bodySmall" tone="accent">
                    “{pendingName}” will be added to this analysis.
                  </AppText>
                ) : null}
                {BOARD_PURPOSES.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.label}. ${option.description}`}
                    onPress={() => choosePurpose(option.value)}
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  >
                    <View style={styles.optionIcon}>
                      <Icon name={option.icon} size={18} color={colors.veya.lavender} />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="h4">{option.label}</AppText>
                      <AppText variant="bodySmall" tone="secondary">
                        {option.description}
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={colors.text.muted} />
                  </Pressable>
                ))}
              </>
            ) : null}

            {step === "details" ? (
              <>
                <AppText variant="h2" accessibilityRole="header">
                  {isHackathon ? "Which hackathon?" : info.label}
                </AppText>
                <AppText variant="bodyMedium" tone="secondary">
                  {isHackathon
                    ? "Tell me its name, or paste the link to its page (Devpost, Unstop, Devfolio or its own site). I'll look up the themes, tracks and judging criteria."
                    : info.notesPrompt}
                </AppText>

                {isHackathon && inputMode === null ? (
                  <View style={styles.modes}>
                    <Button label="Continue with voice" icon="mic" iconPosition="left" onPress={() => setInputMode("voice")} />
                    <Button label="Continue with text" variant="secondary" icon="keyboard" iconPosition="left" onPress={() => setInputMode("text")} />
                  </View>
                ) : null}

                {isHackathon && inputMode === "voice" ? (
                  <VoiceInputButton label="Tap and say the hackathon's name" onText={(text) => setQuery(text)} />
                ) : null}

                {isHackathon && inputMode !== null ? (
                  <TextField
                    label={inputMode === "voice" ? "What I heard (you can edit it)" : "Hackathon name or link"}
                    placeholder="e.g. Smart India Hackathon 2025, or https://…"
                    value={query}
                    onChangeText={(text) => {
                      setQuery(text);
                      setError(null);
                    }}
                    autoFocus={inputMode === "text"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={() => void research()}
                    error={error}
                  />
                ) : null}

                {!isHackathon || inputMode !== null ? (
                  <>
                    {!isHackathon ? <VoiceInputButton onText={(text) => setNotes((current) => (current ? `${current} ${text}` : text))} /> : null}
                    <TextField
                      label={isHackathon ? info.notesPrompt : "Details"}
                      placeholder={info.notesPlaceholder}
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                    />
                    {!isHackathon && error ? (
                      <AppText variant="bodySmall" tone="error" accessibilityRole="alert">
                        {error}
                      </AppText>
                    ) : null}
                    <Button label={isHackathon ? "Find the details" : "Continue"} icon={isHackathon ? "target" : "arrowRight"} onPress={() => void research()} />
                  </>
                ) : null}
              </>
            ) : null}

            {step === "researching" ? (
              <View style={styles.researching} accessibilityLiveRegion="polite">
                <ActivityIndicator size="large" color={colors.veya.lavender} />
                <AppText variant="h3" align="center">
                  {isHackathon ? "Looking it up…" : "Setting up your analysis…"}
                </AppText>
                {isHackathon ? (
                  <AppText variant="bodySmall" tone="secondary" align="center">
                    Searching Devpost, Unstop, Devfolio and the web, then reading the hackathon&apos;s pages. This takes about 10–30 seconds.
                  </AppText>
                ) : null}
              </View>
            ) : null}

            {step === "review" && context ? (
              <>
                <AppText variant="h2" accessibilityRole="header">
                  {isHackathon ? (context.found ? "Here's what I found" : "I couldn't find it") : "Your analysis"}
                </AppText>
                {isHackathon && !context.found ? (
                  <AppText variant="bodyMedium" tone="secondary">
                    Go back and paste the link to the hackathon&apos;s page, or create it anyway and your ideas will be rated with typical hackathon criteria.
                  </AppText>
                ) : null}
                <BoardContextCard context={context} />
                <TextField label="Name" value={name} onChangeText={setName} maxLength={80} />
              </>
            ) : null}
          </ScrollView>
          {step === "review" ? (
            <View style={styles.footer}>
              <Button label="Create analysis" icon="check" onPress={create} />
              {isHackathon ? <Button label="Search again" variant="ghost" onPress={() => setStep("details")} /> : null}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[6], gap: spacing[4] },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.16)"),
    backgroundColor: themed("rgba(22, 20, 36, 0.8)"),
  },
  optionPressed: { borderColor: colors.overlay.lavenderBorder },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
  },
  modes: { gap: spacing[3] },
  researching: { alignItems: "center", gap: spacing[3], paddingTop: spacing[10] },
  footer: { paddingHorizontal: screenGutter, paddingBottom: spacing[2], gap: spacing[2] },
});
