import { themed } from "@/theme";
/**
 * A tiny HTML page that draws one Mermaid diagram. Mermaid is loaded from a
 * pinned CDN version; the diagram source is embedded as a JSON string so it
 * can never break out of the script.
 */
const MERMAID_SRC = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";

export function mermaidHtml(code: string): string {
  const source = JSON.stringify(code).replace(/</g, "\\u003c");
  return themed(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; color: #EDE9FE; font-family: -apple-system, system-ui, sans-serif; }
  #diagram { padding: 8px; display: flex; justify-content: center; }
  #diagram svg { max-width: 100%; height: auto; }
  #error { display: none; padding: 12px; font-size: 13px; color: #FCA5A5; }
</style>
<script src="${MERMAID_SRC}"></script>
</head>
<body>
<div id="diagram"></div>
<div id="error">The diagram couldn't be drawn.</div>
<script>
  function report(message) {
    var payload = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
    else if (window.parent !== window) window.parent.postMessage(payload, "*");
  }
  (async function () {
    try {
      mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
      var result = await mermaid.render("veya-diagram", ${source});
      document.getElementById("diagram").innerHTML = result.svg;
      report({ type: "height", value: document.body.scrollHeight });
    } catch (e) {
      document.getElementById("error").style.display = "block";
      report({ type: "error" });
    }
  })();
</script>
</body>
</html>`);
}

export type DiagramMessage = { type: "height"; value: number } | { type: "error" };

export function parseDiagramMessage(data: unknown): DiagramMessage | null {
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object" && "type" in parsed) {
      const message = parsed as { type: unknown; value?: unknown };
      if (message.type === "error") return { type: "error" };
      if (message.type === "height" && typeof message.value === "number") return { type: "height", value: message.value };
    }
  } catch {
    // Not one of ours.
  }
  return null;
}
