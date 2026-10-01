"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  checkSharePasscode,
  createTextShare,
  finalizeFileShare as finalizeFileShareDb,
  getMaxUploadBytes,
  isExpiryOption,
  isValidCustomId,
  reserveFileShare,
  SlugTakenError,
  type ExpiryOption,
} from "@/lib/shares";

const MAX_TEXT_CHARS = 200_000;

function parseExpiry(value: FormDataEntryValue | null): ExpiryOption {
  return typeof value === "string" && isExpiryOption(value) ? value : "7d";
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateCustomId(customId: string | null): string | null {
  if (customId && !isValidCustomId(customId)) {
    return "Custom link can only contain letters, numbers, hyphens and underscores (3-40 characters).";
  }
  return null;
}

export type CreateShareState = { error: string } | null;

export async function createShare(
  _prevState: CreateShareState,
  formData: FormData
): Promise<CreateShareState> {
  const expiry = parseExpiry(formData.get("expiry"));
  const customId = parseOptionalString(formData.get("customId"));
  const passcode = parseOptionalString(formData.get("passcode"));

  const customIdError = validateCustomId(customId);
  if (customIdError) return { error: customIdError };

  const text = formData.get("text");
  if (typeof text !== "string" || text.trim().length === 0) {
    return { error: "Enter some text to share." };
  }
  if (text.length > MAX_TEXT_CHARS) {
    return {
      error: `Text is too long (max ${MAX_TEXT_CHARS.toLocaleString()} characters).`,
    };
  }

  let id: string;
  try {
    id = await createTextShare(text, expiry, customId, passcode);
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect(`/s/${id}`);
}

export type PrepareFileShareResult =
  | { id: string; pathname: string; maxUploadBytes: number }
  | { error: string };

export async function prepareFileShare(
  fileName: string,
  customId: string | null
): Promise<PrepareFileShareResult> {
  const customIdError = validateCustomId(customId);
  if (customIdError) return { error: customIdError };

  try {
    const { id, pathname } = await reserveFileShare(fileName, customId);
    return { id, pathname, maxUploadBytes: getMaxUploadBytes() };
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return { error: error.message };
    }
    throw error;
  }
}

export type FinalizeFileShareInput = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  downloadUrl: string;
  pathname: string;
  expiry: string;
  passcode?: string | null;
};

export type FinalizeFileShareResult = { error: string } | undefined;

export async function finalizeFileShare(
  input: FinalizeFileShareInput
): Promise<FinalizeFileShareResult> {
  const expiry = isExpiryOption(input.expiry) ? input.expiry : "7d";

  try {
    await finalizeFileShareDb({ ...input, expiry });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect(`/s/${input.id}`);
}

export async function unlockShare(
  id: string,
  code: string
): Promise<{ error: string } | undefined> {
  const ok = await checkSharePasscode(id, code);
  if (!ok) {
    return { error: "Incorrect code." };
  }

  const cookieStore = await cookies();
  cookieStore.set(`share_unlock_${id}`, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  refresh();
}
