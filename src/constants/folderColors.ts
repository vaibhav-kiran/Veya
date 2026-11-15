import type { IdeaBoard } from "@/types/models";

/**
 * Each Analyze folder gets its own colour. Projects a folder changed
 * ("Implement the plan") take the same colour, so you can see where they
 * were improved. Bright enough for the dark theme, distinct from each other.
 */
export const FOLDER_COLORS = ["#A78BFA", "#2DD4BF", "#FBBF24", "#F472B6", "#38BDF8", "#A3E635", "#FB923C"] as const;

/** A colour for a new folder: the first one not in use yet, else the next in turn. */
export function nextFolderColor(boards: IdeaBoard[]): string {
  const used = new Set(boards.map((board) => board.color));
  return FOLDER_COLORS.find((color) => !used.has(color)) ?? FOLDER_COLORS[boards.length % FOLDER_COLORS.length];
}

/** The folder's colour (older folders get one from their id). */
export function folderColor(board: Pick<IdeaBoard, "id" | "color">): string {
  if (board.color) return board.color;
  let hash = 0;
  for (const char of board.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FOLDER_COLORS[hash % FOLDER_COLORS.length];
}

/** The folder that changed this project (Implement the plan), if any: the latest one wins. */
export function folderThatChanged(boards: Record<string, IdeaBoard>, projectId: string): IdeaBoard | undefined {
  const key = `project:${projectId}` as const;
  return Object.values(boards)
    .filter((board) => board.implemented?.[key])
    .sort((a, b) => (b.implemented?.[key]?.at ?? "").localeCompare(a.implemented?.[key]?.at ?? ""))[0];
}
