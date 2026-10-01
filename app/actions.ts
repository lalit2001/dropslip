"use server";

import { redirect } from "next/navigation";
import {
  createFileShare,
  createTextShare,
  isExpiryOption,
  isValidCustomId,
  SlugTakenError,
} from "@/lib/shares";

const MAX_TEXT_CHARS = 200_000;

function getMaxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB) || 4;
  return mb * 1024 * 1024;
}

export type CreateShareState = { error: string } | null;

export async function createShare(
  _prevState: CreateShareState,
  formData: FormData
): Promise<CreateShareState> {
  const mode = formData.get("mode");
  const expiryRaw = formData.get("expiry");
  const expiry = typeof expiryRaw === "string" && isExpiryOption(expiryRaw)
    ? expiryRaw
    : "7d";

  const customIdRaw = formData.get("customId");
  const customId =
    typeof customIdRaw === "string" && customIdRaw.trim().length > 0
      ? customIdRaw.trim()
      : null;

  if (customId && !isValidCustomId(customId)) {
    return {
      error:
        "Custom link can only contain letters, numbers, hyphens and underscores (3-40 characters).",
    };
  }

  try {
    if (mode === "text") {
      const text = formData.get("text");
      if (typeof text !== "string" || text.trim().length === 0) {
        return { error: "Enter some text to share." };
      }
      if (text.length > MAX_TEXT_CHARS) {
        return { error: `Text is too long (max ${MAX_TEXT_CHARS.toLocaleString()} characters).` };
      }

      const id = await createTextShare(text, expiry, customId);
      redirect(`/s/${id}`);
    }

    if (mode === "file") {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return { error: "Choose a file to share." };
      }

      const maxBytes = getMaxUploadBytes();
      if (file.size > maxBytes) {
        const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
        return { error: `File is too large (max ${maxMb} MB).` };
      }

      const buffer = new Uint8Array(await file.arrayBuffer());
      const id = await createFileShare(file.name, file.type, buffer, expiry, customId);
      redirect(`/s/${id}`);
    }
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return { error: error.message };
    }
    throw error;
  }

  return { error: "Invalid submission." };
}
