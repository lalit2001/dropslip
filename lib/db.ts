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

const SHARES_TABLE_DEFINITION = `
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'file', 'live')),
  text_content TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  file_url TEXT,
  file_download_url TEXT,
  file_pathname TEXT,
  passcode_hash TEXT,
  passcode_salt TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0
`;

async function migrateKindConstraintIfNeeded(db: Client): Promise<void> {
  const result = await db.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'shares'`
  );
  if (result.rows.length === 0) return; // table doesn't exist yet; CREATE TABLE below handles it

  const createSql = result.rows[0].sql as string;
  if (createSql.includes("'live'")) return; // already migrated

  // SQLite can't ALTER a CHECK constraint in place — rebuild the table.
  // Columns are named explicitly (not SELECT *) so this still works if the
  // old table has extra legacy columns (e.g. a leftover `file_data` BLOB).
  // Wrapped in a transaction via batch() so this is all-or-nothing.
  const columns =
    "id, kind, text_content, file_name, file_type, file_size, file_url, file_download_url, file_pathname, passcode_hash, passcode_salt, created_at, expires_at, download_count";
  await db.batch(
    [
      `ALTER TABLE shares RENAME TO shares_old`,
      `CREATE TABLE shares (${SHARES_TABLE_DEFINITION})`,
      `INSERT INTO shares (${columns}) SELECT ${columns} FROM shares_old`,
      `DROP TABLE shares_old`,
    ],
    "write"
  );
}

async function initSchema(db: Client): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS shares (${SHARES_TABLE_DEFINITION})`);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at)`
  );

  // Older deployments created this table with a `file_data BLOB` column
  // instead of Vercel Blob references. Add the new columns if missing;
  // leftover `file_data` columns (if any) are simply left unused.
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN file_url TEXT`);
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN file_download_url TEXT`);
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN file_pathname TEXT`);
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN passcode_hash TEXT`);
  await tryAddColumn(db, `ALTER TABLE shares ADD COLUMN passcode_salt TEXT`);

  // Run after the ADD COLUMN calls above so the rebuild (if needed) can
  // assume every target column already exists on the old table.
  await migrateKindConstraintIfNeeded(db);
}

export async function ensureSchema(): Promise<void> {
  if (!global.__tursoSchemaReady) {
    global.__tursoSchemaReady = initSchema(getDb());
  }
  await global.__tursoSchemaReady;
}
