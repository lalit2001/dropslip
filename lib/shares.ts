import { del } from "@vercel/blob";
import { ensureSchema, getDb } from "@/lib/db";
import { generateShareId } from "@/lib/id";
import { hashPasscode, verifyPasscode } from "@/lib/passcode";

export const EXPIRY_OPTIONS = {
  never: null,
  "1h": 60 * 60,
  "1d": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
} as const;

export type ExpiryOption = keyof typeof EXPIRY_OPTIONS;

export function isExpiryOption(value: string): value is ExpiryOption {
  return value in EXPIRY_OPTIONS;
}

export function getMaxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB) || 1024;
  return mb * 1024 * 1024;
}

export type TextShare = {
  id: string;
  kind: "text";
  textContent: string;
  createdAt: number;
  expiresAt: number | null;
  hasPasscode: boolean;
};

export type FileShare = {
  id: string;
  kind: "file";
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number | null;
  downloadCount: number;
  hasPasscode: boolean;
};

export type Share = TextShare | FileShare;

function expiresAtFromOption(option: ExpiryOption): number | null {
  const seconds = EXPIRY_OPTIONS[option];
  if (seconds === null) return null;
  return Math.floor(Date.now() / 1000) + seconds;
}

const CUSTOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,40}$/;

export function isValidCustomId(id: string): boolean {
  return CUSTOM_ID_PATTERN.test(id);
}

export class SlugTakenError extends Error {
  constructor(public slug: string) {
    super(`"${slug}" is already taken. Try another name.`);
  }
}

async function idExists(id: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT 1 FROM shares WHERE id = ? LIMIT 1",
    args: [id],
  });
  return existing.rows.length > 0;
}

async function generateUniqueId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateShareId();
    if (!(await idExists(id))) return id;
  }
  throw new Error("Could not generate a unique share id");
}

async function resolveId(customId?: string | null): Promise<string> {
  if (customId) {
    if (await idExists(customId)) {
      throw new SlugTakenError(customId);
    }
    return customId;
  }
  return generateUniqueId();
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique/i.test(error.message);
}

async function deleteBlobIfExists(pathname: string | null): Promise<void> {
  if (!pathname) return;
  try {
    await del(pathname);
  } catch {
    // Best-effort cleanup (e.g. already removed) — never block on this.
  }
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150) || "file";
}

export async function createTextShare(
  textContent: string,
  expiry: ExpiryOption,
  customId?: string | null,
  passcode?: string | null
): Promise<string> {
  await ensureSchema();
  const db = getDb();
  const id = await resolveId(customId);
  const createdAt = Math.floor(Date.now() / 1000);
  const { hash, salt } = passcode ? hashPasscode(passcode) : { hash: null, salt: null };

  try {
    await db.execute({
      sql: `INSERT INTO shares (id, kind, text_content, passcode_hash, passcode_salt, created_at, expires_at)
            VALUES (?, 'text', ?, ?, ?, ?, ?)`,
      args: [id, textContent, hash, salt, createdAt, expiresAtFromOption(expiry)],
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new SlugTakenError(id);
    throw error;
  }

  return id;
}

/**
 * Reserves a share id (random or custom) and the Blob pathname the client
 * will upload to directly, without touching file bytes server-side.
 */
export async function reserveFileShare(
  fileName: string,
  customId?: string | null
): Promise<{ id: string; pathname: string }> {
  await ensureSchema();
  const id = await resolveId(customId);
  return { id, pathname: `shares/${id}/${sanitizeFileName(fileName)}` };
}

export async function finalizeFileShare(params: {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  downloadUrl: string;
  pathname: string;
  expiry: ExpiryOption;
  passcode?: string | null;
}): Promise<void> {
  await ensureSchema();
  const db = getDb();
  const createdAt = Math.floor(Date.now() / 1000);
  const { hash, salt } = params.passcode
    ? hashPasscode(params.passcode)
    : { hash: null, salt: null };

  try {
    await db.execute({
      sql: `INSERT INTO shares (id, kind, file_name, file_type, file_size, file_url, file_download_url, file_pathname, passcode_hash, passcode_salt, created_at, expires_at)
            VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        params.id,
        params.fileName,
        params.fileType || "application/octet-stream",
        params.fileSize,
        params.url,
        params.downloadUrl,
        params.pathname,
        hash,
        salt,
        createdAt,
        expiresAtFromOption(params.expiry),
      ],
    });
  } catch (error) {
    await deleteBlobIfExists(params.pathname);
    if (isUniqueConstraintError(error)) throw new SlugTakenError(params.id);
    throw error;
  }
}

async function purgeShare(id: string, pathname: string | null): Promise<void> {
  await deleteBlobIfExists(pathname);
  const db = getDb();
  await db.execute({ sql: "DELETE FROM shares WHERE id = ?", args: [id] });
}

function isExpired(expiresAt: number | null): boolean {
  if (expiresAt === null) return false;
  return expiresAt < Math.floor(Date.now() / 1000);
}

export async function getShare(id: string): Promise<Share | null> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, kind, text_content, file_name, file_type, file_size, file_pathname, passcode_hash, created_at, expires_at, download_count
          FROM shares WHERE id = ? LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const expiresAt = row.expires_at as number | null;

  if (isExpired(expiresAt)) {
    await purgeShare(id, row.file_pathname as string | null);
    return null;
  }

  const hasPasscode = row.passcode_hash !== null;

  if (row.kind === "text") {
    return {
      id: row.id as string,
      kind: "text",
      textContent: row.text_content as string,
      createdAt: row.created_at as number,
      expiresAt,
      hasPasscode,
    };
  }

  return {
    id: row.id as string,
    kind: "file",
    fileName: row.file_name as string,
    fileType: row.file_type as string,
    fileSize: row.file_size as number,
    createdAt: row.created_at as number,
    expiresAt,
    downloadCount: row.download_count as number,
    hasPasscode,
  };
}

export async function checkSharePasscode(
  id: string,
  code: string
): Promise<boolean> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT passcode_hash, passcode_salt FROM shares WHERE id = ? LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  const hash = row.passcode_hash as string | null;
  const salt = row.passcode_salt as string | null;
  if (!hash || !salt) return true; // no passcode set

  return verifyPasscode(code, hash, salt);
}

export async function getFileShareMeta(
  id: string
): Promise<{ downloadUrl: string; hasPasscode: boolean } | null> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT kind, file_download_url, file_pathname, passcode_hash, expires_at
          FROM shares WHERE id = ? LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (row.kind !== "file") return null;

  if (isExpired(row.expires_at as number | null)) {
    await purgeShare(id, row.file_pathname as string | null);
    return null;
  }

  return {
    downloadUrl: row.file_download_url as string,
    hasPasscode: row.passcode_hash !== null,
  };
}

export async function incrementDownloadCount(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE shares SET download_count = download_count + 1 WHERE id = ?",
    args: [id],
  });
}
