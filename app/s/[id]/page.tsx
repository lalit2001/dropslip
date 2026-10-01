import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getShare } from "@/lib/shares";
import { getShareUrl } from "@/lib/url";
import { CopyButton } from "@/app/_components/copy-button";
import { ShareLink } from "@/app/_components/share-link";
import { ShareQrCode } from "@/app/_components/share-qr-code";
import { PasscodeGate } from "@/app/_components/passcode-gate";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatExpiry(expiresAt: number | null): string {
  if (expiresAt === null) return "Never expires";
  const diffMs = expiresAt * 1000 - Date.now();
  if (diffMs <= 0) return "Expired";
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `Expires in ${hours}h`;
  return `Expires in ${Math.round(hours / 24)}d`;
}

export default async function SharePage({
  params,
}: PageProps<"/s/[id]">) {
  const { id } = await params;
  const share = await getShare(id);

  if (!share) {
    notFound();
  }

  const shareUrl = await getShareUrl(id);

  let unlocked = true;
  if (share.hasPasscode) {
    const cookieStore = await cookies();
    unlocked = Boolean(cookieStore.get(`share_unlock_${id}`));
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-xl space-y-6">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          ← New share
        </Link>

        <ShareLink />

        {!unlocked ? (
          <PasscodeGate id={id} />
        ) : (
          <>
            {share.kind === "text" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    {formatExpiry(share.expiresAt)}
                  </span>
                  <CopyButton text={share.textContent} label="Copy text" />
                </div>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-black/[.08] bg-white p-4 font-mono text-sm dark:border-white/[.145] dark:bg-zinc-900">
                  {share.textContent}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-black/[.08] bg-white p-10 text-center dark:border-white/[.145] dark:bg-zinc-900">
                <div className="space-y-1">
                  <p className="font-medium">{share.fileName}</p>
                  <p className="text-sm text-zinc-500">
                    {formatBytes(share.fileSize)} · {formatExpiry(share.expiresAt)}
                  </p>
                </div>
                <a
                  href={`/api/files/${share.id}`}
                  className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                >
                  Download
                </a>
              </div>
            )}
          </>
        )}

        <div className="flex flex-col items-center gap-2 pt-2">
          <ShareQrCode url={shareUrl} />
          <p className="text-xs text-zinc-400">Scan to open on another device</p>
        </div>
      </div>
    </div>
  );
}
