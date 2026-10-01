import { createClient, type Client } from "@libsql/client";

declare global {
  // eslint-disable-next-line no-var
  var __tursoClient: Client | undefined;
  // eslint-disable-next-line no-var
  var __tursoSchemaReady: Promise<void> | undefined;
}

function createTursoClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL environment variable is not set");
  }

  return createClient({ url, authToken });
}

export function getDb(): Client {
  if (!global.__tursoClient) {
    global.__tursoClient = createTursoClient();
  }
  return global.__tursoClient;
}

async function tryAddColumn(db: Client, sql: string): Promise<void> {
  try {
    await db.execute(sql);
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column/i.test(error.message)) {
      throw error;
    }
  }
}

async function initSchema(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('text', 'file')),
      text_content TEXT,
      file_name TEXT,
      file_type TEXT,
      file_size INTEGER,
      file_url TEXT,
      file_download_url TEXT,
      file_pathname TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      download_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at)`
  );

  // Older deployments created this table with a `file_data BLOB` column
  // instead of Vercel Blob references. Add the new columns if missing;
  // leftover `file_data` columns (if any) are simply left unused.
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN file_url TEXT`);
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN file_download_url TEXT`);
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN file_pathname TEXT`);
}

export async function ensureSchema(): Promise<void> {
  if (!global.__tursoSchemaReady) {
    global.__tursoSchemaReady = initSchema(getDb());
  }
  await global.__tursoSchemaReady;
}
