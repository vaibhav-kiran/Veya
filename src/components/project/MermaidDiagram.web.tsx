import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { colors, radii } from "@/theme";

import { AppText } from "../AppText";
import { mermaidHtml, parseDiagramMessage } from "./mermaidHtml";

const MIN_HEIGHT = 220;
const MAX_HEIGHT = 900;

/** Web: react-native-webview isn't available, so draw the diagram in a sandboxed iframe. */
export function MermaidDiagram({ code }: { code: string }) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = parseDiagramMessage(event.data);
      if (message?.type === "height") setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, message.value + 8)));
      if (message?.type === "error") setFailed(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (failed) {
    return (
      <View style={styles.fallback}>
        <AppText variant="bodySmall" tone="secondary">
          The diagram couldn&apos;t be drawn. Here is its source:
        </AppText>
        <AppText selectable style={styles.code}>
          {code}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <iframe
        title="Workflow diagram"
        srcDoc={mermaidHtml(code)}
        sandbox="allow-scripts"
        style={{ border: 0, width: "100%", height: "100%", background: "transparent" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.overlay.borderStrong },
  fallback: { gap: 8 },
  code: { fontFamily: "monospace", fontSize: 12, lineHeight: 16, color: colors.text.secondary },
});
