import * as ImagePicker from "expo-image-picker";

import { mascotById } from "@/constants/mascots";

/**
 * The user's profile picture: a photo they uploaded (Clerk profile image) or
 * one of Veya's mascots (saved in Clerk unsafeMetadata, so it follows the
 * account to every device). A chosen mascot wins over the photo.
 */

/** The parts of Clerk's user object this module uses. */
type AvatarUser = {
  imageUrl: string;
  hasImage: boolean;
  unsafeMetadata: Record<string, unknown>;
  setProfileImage: (params: { file: string | null }) => Promise<unknown>;
  updateMetadata: (params: { unsafeMetadata: Record<string, unknown> }) => Promise<unknown>;
};

export type AvatarSource =
  | { kind: "mascot"; mascotId: string; source: number }
  | { kind: "photo"; uri: string }
  | { kind: "initial" };

const MASCOT_KEY = "veyaMascot";

export function avatarOf(user: Pick<AvatarUser, "imageUrl" | "hasImage" | "unsafeMetadata"> | null | undefined): AvatarSource {
  if (!user) return { kind: "initial" };
  const mascotId = user.unsafeMetadata?.[MASCOT_KEY];
  const mascot = typeof mascotId === "string" ? mascotById(mascotId) : undefined;
  if (mascot) return { kind: "mascot", mascotId: mascot.id, source: mascot.source };
  if (user.hasImage && user.imageUrl) return { kind: "photo", uri: user.imageUrl };
  return { kind: "initial" };
}

export async function chooseMascot(user: AvatarUser, mascotId: string): Promise<void> {
  await user.updateMetadata({ unsafeMetadata: { [MASCOT_KEY]: mascotId } });
}

export class PhotoAccessDeniedError extends Error {
  constructor() {
    super("Photo access is off.");
    this.name = "PhotoAccessDeniedError";
  }
}

/** Pick a photo from the library, crop it square and make it the profile picture. False if cancelled. */
export async function uploadProfilePhoto(user: AvatarUser): Promise<boolean> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoAccessDeniedError();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
    base64: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset?.base64) return false;

  await user.setProfileImage({ file: `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}` });
  // A new photo replaces a chosen mascot.
  await user.updateMetadata({ unsafeMetadata: { [MASCOT_KEY]: null } });
  return true;
}

/** Back to the initial-letter avatar. */
export async function removeAvatar(user: AvatarUser): Promise<void> {
  if (user.hasImage) await user.setProfileImage({ file: null });
  await user.updateMetadata({ unsafeMetadata: { [MASCOT_KEY]: null } });
}
