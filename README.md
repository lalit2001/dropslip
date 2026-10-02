A simple text and file sharing app, built on Next.js 16, [Turso](https://turso.tech) (libSQL), and [Vercel Blob](https://vercel.com/docs/vercel-blob).

## How it works

- Paste text or upload a file on the home page, optionally pick a custom link name and an expiry, and get a shareable `/s/<id>` link.
- **Text** content and all share metadata (filename, size, expiry, download count) live in Turso.
- **File bytes** upload directly from the browser to Vercel Blob storage (`app/api/blob-upload/route.ts` only issues a short-lived upload token; it never sees the file bytes). Turso stores a reference (URL + pathname) to the blob, not the file itself.
- Links expire automatically: once a share is read after its `expires_at` has passed, the Turso row **and** its Blob file (if any) are deleted.
- Downloads hit `app/api/files/[id]/route.ts`, which checks the optional access code, then 307-redirects to the blob's `downloadUrl` — a URL Vercel Blob generates that forces `Content-Disposition: attachment` with the original filename. File bytes never pass through your serverless function on upload or download.
- Shares can optionally require an access code to view/download, and can use a custom link name instead of a random id.
- Each share page shows a QR code linking to it.

## One-time setup: create a Vercel Blob store

You need a `BLOB_READ_WRITE_TOKEN`. Easiest path with the Vercel CLI (already installed on this machine):

```bash
vercel login          # interactive — opens a browser
vercel link            # links this folder to a Vercel project
vercel blob store add  # creates a Blob store, follow the prompt to name it
vercel env pull .env.local   # pulls BLOB_READ_WRITE_TOKEN (and other linked env vars) into .env.local
```

Alternatively, in the Vercel dashboard: **Storage → Create Database → Blob**, then copy the `BLOB_READ_WRITE_TOKEN` from the store's **.env.local** tab.

## Local development

1. Copy `.env.example` to `.env.local` (if you didn't use `vercel env pull` above) and fill in:

   ```
   TURSO_DATABASE_URL=libsql://your-database.turso.io
   TURSO_AUTH_TOKEN=your-turso-auth-token
   BLOB_READ_WRITE_TOKEN=your-vercel-blob-read-write-token
   MAX_UPLOAD_MB=1024
   ```

2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

The `shares` table is created automatically on first use — no manual migration step needed.

## Upload size limit

`MAX_UPLOAD_MB` caps how large a shared file can be (default 1024 MB / 1 GB). Because uploads go directly from the browser to Vercel Blob using [client uploads](https://vercel.com/docs/vercel-blob/client-upload) with multipart enabled, this is a Blob-enforced limit, not a Vercel serverless request-body limit — raise it freely (Vercel Blob supports up to 5 TB per file). The practical ceiling is your Vercel plan's storage/bandwidth allowance and how long you're willing to let a browser upload run.

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel (or just run `vercel deploy` after `vercel link`, done above).
2. If you created the Blob store via the CLI above, `BLOB_READ_WRITE_TOKEN` is already attached to the project. Otherwise, add these in the project's Environment Variables settings:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `BLOB_READ_WRITE_TOKEN`
   - `MAX_UPLOAD_MB` (optional, defaults to 1024)
3. Deploy. No other configuration is required.

## Tech

- Next.js 16 (App Router, Server Actions, Route Handlers)
- `@libsql/client` for Turso (metadata + text content)
- `@vercel/blob` for file storage
- Tailwind CSS
