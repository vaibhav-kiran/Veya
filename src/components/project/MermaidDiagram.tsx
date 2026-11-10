import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { colors, radii } from "@/theme";

import { AppText } from "../AppText";
import { mermaidHtml, parseDiagramMessage } from "./mermaidHtml";

const MIN_HEIGHT = 220;
const MAX_HEIGHT = 900;

/** Renders the backend's Mermaid workflow diagram in a sandboxed WebView. */
export function MermaidDiagram({ code }: { code: string }) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={styles.fallback}>
        <AppText variant="bodySmall" tone="secondary">
          The diagram couldn&apos;t be drawn (it needs an internet connection). Here is its source:
        </AppText>
        <AppText selectable style={styles.code}>
          {code}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: mermaidHtml(code) }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        // Links inside the diagram must not navigate the app's WebView away.
        onShouldStartLoadWithRequest={(request) => request.url === "about:blank" || request.url.startsWith("data:") || !request.isTopFrame}
        onMessage={(event) => {
          const message = parseDiagramMessage(event.nativeEvent.data);
          if (message?.type === "height") setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, message.value + 8)));
          if (message?.type === "error") setFailed(true);
        }}
        onError={() => setFailed(true)}
        accessibilityLabel="Workflow diagram"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.overlay.borderStrong },
  webview: { flex: 1, backgroundColor: "transparent" },
  fallback: { gap: 8 },
  code: { fontFamily: Platform.select({ ios: "Courier", default: "monospace" }), fontSize: 12, lineHeight: 16, color: colors.text.secondary },
});
