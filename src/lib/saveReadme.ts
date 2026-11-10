import { Share } from "react-native";

/**
 * Native: hand the README to the system share sheet, where the user can
 * save it to Files, send it, or paste it into a repo.
 */
export async function saveReadme(filename: string, markdown: string): Promise<void> {
  await Share.share({ title: filename, message: markdown });
}
