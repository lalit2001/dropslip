import { del, put } from "@vercel/blob";
import { ensureSchema, getDb } from "@/lib/db";
import { generateShareId } from "@/lib/id";

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

export type TextShare = {
  id: string;
  kind: "text";
  textContent: string;
  createdAt: number;
  expiresAt: number | null;
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

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150) || "file";
}

export async function createTextShare(
  textContent: string,
  expiry: ExpiryOption,
  customId?: string | null
): Promise<string> {
  await ensureSchema();
  const db = getDb();
  const id = await resolveId(customId);
  const createdAt = Math.floor(Date.now() / 1000);

  try {
    await db.execute({
      sql: `INSERT INTO shares (id, kind, text_content, created_at, expires_at)
            VALUES (?, 'text', ?, ?, ?)`,
      args: [id, textContent, createdAt, expiresAtFromOption(expiry)],
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new SlugTakenError(id);
    throw error;
  }

  return id;
}

export async function createFileShare(
  fileName: string,
  fileType: string,
  fileData: Uint8Array,
  expiry: ExpiryOption,
  customId?: string | null
): Promise<string> {
  await ensureSchema();
  const db = getDb();
  const id = await resolveId(customId);
  const createdAt = Math.floor(Date.now() / 1000);
  const contentType = fileType || "application/octet-stream";

  const blob = await put(`shares/${id}/${sanitizeFileName(fileName)}`, Buffer.from(fileData), {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });

  try {
    await db.execute({
      sql: `INSERT INTO shares (id, kind, file_name, file_type, file_size, file_url, file_download_url, file_pathname, created_at, expires_at)
            VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        fileName,
        contentType,
        fileData.byteLength,
        blob.url,
        blob.downloadUrl,
        blob.pathname,
        createdAt,
        expiresAtFromOption(expiry),
      ],
    });
  } catch (error) {
    await deleteBlobIfExists(blob.pathname);
    if (isUniqueConstraintError(error)) throw new SlugTakenError(id);
    throw error;
  }

  return id;
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
    sql: `SELECT id, kind, text_content, file_name, file_type, file_size, file_pathname, created_at, expires_at, download_count
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

  if (row.kind === "text") {
    return {
      id: row.id as string,
      kind: "text",
      textContent: row.text_content as string,
      createdAt: row.created_at as number,
      expiresAt,
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
  };
}

export async function getFileDownloadUrl(
  id: string
): Promise<{ downloadUrl: string } | null> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT kind, file_download_url, file_pathname, expires_at
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

  await db.execute({
    sql: "UPDATE shares SET download_count = download_count + 1 WHERE id = ?",
    args: [id],
  });

  return { downloadUrl: row.file_download_url as string };
}
