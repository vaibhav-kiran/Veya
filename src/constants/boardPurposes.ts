import type { IconName } from "@/components/Icon";
import type { BoardPurpose } from "@/types/api";

/** What an idea page can be for, and how Veya asks about it. */
export const BOARD_PURPOSES: readonly {
  value: BoardPurpose;
  label: string;
  description: string;
  icon: IconName;
  /** Optional details Veya asks for (not for hackathons, which are researched). */
  notesPrompt: string;
  notesPlaceholder: string;
}[] = [
  {
    value: "hackathon",
    label: "A hackathon",
    description: "Veya finds its themes, tracks and judging criteria, then rates your ideas against them.",
    icon: "trophy",
    notesPrompt: "Anything else? (optional)",
    notesPlaceholder: "Your team, the track you like…",
  },
  {
    value: "college_project",
    label: "A college project",
    description: "Rated the way faculty and examiners judge projects: novelty, depth, feasibility, report.",
    icon: "document",
    notesPrompt: "Tell me about the project (optional)",
    notesPlaceholder: "Course and year, what your guide expects, the deadline…",
  },
  {
    value: "startup",
    label: "A startup",
    description: "Rated like an early pitch: problem, market, competition, business model.",
    icon: "rocket",
    notesPrompt: "Tell me about it (optional)",
    notesPlaceholder: "The domain, who your customers are, what you can build…",
  },
  {
    value: "personal",
    label: "A personal project",
    description: "Rated on what you'd learn, your portfolio and whether you'd enjoy it.",
    icon: "star",
    notesPrompt: "What do you want from it? (optional)",
    notesPlaceholder: "Skills you want to learn, the time you have…",
  },
  {
    value: "other",
    label: "Something else",
    description: "Rated on usefulness, originality, feasibility and impact.",
    icon: "idea",
    notesPrompt: "What is it for? (optional)",
    notesPlaceholder: "A competition, a club, a grant…",
  },
];

export const purposeInfo = (purpose: BoardPurpose) => BOARD_PURPOSES.find((item) => item.value === purpose) ?? BOARD_PURPOSES[4];
