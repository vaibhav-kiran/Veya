/**
 * Turns the Markdown plan written by Veya's Reasoning Layer into typed blocks
 * the app can render with its own components (no Markdown library needed).
 *
 * The model writes plans like:
 *   # ProjectName
 *   ## 1. Problem Statement
 *   - bullet / **Key**: value / 1. step / paragraph text
 */

export type InlineSegment = { text: string; bold: boolean };

export type PlanFact = { label: string; value: string };

export type PlanBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "facts"; items: PlanFact[] };

export type PlanSection = {
  /** "1", "2", … when the model numbered the heading. */
  number: string | null;
  title: string;
  blocks: PlanBlock[];
};

export type ParsedPlan = {
  /** Text before the first section heading. */
  intro: PlanBlock[];
  sections: PlanSection[];
};

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const STEP = /^\s*(\d+)[.)]\s+(.*)$/;
const FACT_BOLD = /^\*\*(.+?)\*\*\s*[:\-–]\s*(.+)$/;
const FACT_PLAIN = /^([A-Z][\w /&()+.-]{1,32}):\s+(.+)$/;
const NUMBERED_TITLE = /^(\d+)[.)]\s*(.*)$/;

/** Strip Markdown emphasis characters that the app doesn't render separately. */
function cleanText(text: string): string {
  return text.replace(/`([^`]*)`/g, "$1").replace(/(^|\s)_(\S[^_]*\S|\S)_(?=\s|$)/g, "$1$2").trim();
}

function stripBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(\S[^*]*\S|\S)\*/g, "$1");
}

function asFact(item: string): PlanFact | null {
  const match = FACT_BOLD.exec(item) ?? FACT_PLAIN.exec(item);
  if (!match) return null;
  return { label: stripBold(match[1]).trim(), value: cleanText(match[2]) };
}

export function parsePlan(markdown: string, projectTitle?: string): ParsedPlan {
  const intro: PlanBlock[] = [];
  const sections: PlanSection[] = [];
  let paragraph: string[] = [];
  let inCodeFence = false;

  const target = () => (sections.length ? sections[sections.length - 1].blocks : intro);

  const flushParagraph = () => {
    if (paragraph.length) target().push({ kind: "paragraph", text: cleanText(paragraph.join(" ")) });
    paragraph = [];
  };

  /** Append to the previous block when it is the same kind, so lists stay together. */
  const pushItem = (kind: "bullets" | "steps", text: string) => {
    flushParagraph();
    const blocks = target();
    const fact = kind === "bullets" ? asFact(text) : null;
    const last = blocks[blocks.length - 1];
    if (fact) {
      if (last?.kind === "facts") last.items.push(fact);
      else blocks.push({ kind: "facts", items: [fact] });
      return;
    }
    const item = cleanText(text);
    if (last?.kind === kind) last.items.push(item);
    else blocks.push({ kind, items: [item] });
  };

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();

    if (line.trim().startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue;

    const heading = inCodeFence ? null : HEADING.exec(line.trim());
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const text = stripBold(cleanText(heading[2]));
      // The top title usually repeats the project name, which the screen already shows.
      if (level === 1 && (!projectTitle || normalise(text) === normalise(projectTitle) || sections.length === 0)) continue;
      const numbered = NUMBERED_TITLE.exec(text);
      sections.push({ number: numbered ? numbered[1] : null, title: numbered ? numbered[2] : text, blocks: [] });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      pushItem("bullets", bullet[1]);
      continue;
    }
    const step = STEP.exec(line);
    if (step) {
      pushItem("steps", step[2]);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();

  return { intro, sections: sections.filter((section) => section.blocks.length > 0) };
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Split "**bold** text" into styled segments for <Text> children. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    segments.push({ text: match[1], bold: true });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), bold: false });
  return segments.map((segment) => ({ ...segment, text: segment.text.replace(/\*(\S[^*]*\S|\S)\*/g, "$1") }));
}

/** Values the model uses for "nothing here" — shown dimmed rather than as real content. */
export function isPlaceholderValue(value: string): boolean {
  return /^(not required( for (the )?mvp)?|not specified|not mentioned|unknown|none|n\/a|na|tbd|-)\.?$/i.test(value.trim());
}
