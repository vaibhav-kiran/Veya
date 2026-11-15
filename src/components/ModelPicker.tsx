import { StyleSheet, View } from "react-native";

import { AI_MODEL_LABEL, AI_MODELS, type AiModel } from "@/constants/aiModels";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { spacing } from "@/theme";

import { AppText } from "./AppText";
import { SegmentedControl } from "./SegmentedControl";

type ModelPickerProps = {
  /** The model of the conversation in progress; the picker hides while one is running. */
  activeModel: AiModel | null;
};

/**
 * Qwen (local), Gemini (Google) or Groq for Veya's thinking. The choice applies
 * when a conversation or chat starts, so during one it just shows which
 * model is in use.
 */
export function ModelPicker({ activeModel }: ModelPickerProps) {
  const aiModel = usePreferencesStore((state) => state.aiModel);
  const setAiModel = usePreferencesStore((state) => state.setAiModel);

  if (activeModel) {
    return (
      <AppText variant="caption" tone="muted" align="center">
        Thinking with {AI_MODEL_LABEL[activeModel]}
      </AppText>
    );
  }
  return (
    <View style={styles.picker}>
      <SegmentedControl segments={AI_MODELS} value={aiModel} onChange={setAiModel} accessibilityLabel="Model Veya thinks with" />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { alignSelf: "center", minWidth: 260, gap: spacing[1] },
});
