"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/app/_components/copy-button";

export function ShareLink() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-black/[.08] bg-black/[.02] px-4 py-3 dark:border-white/[.145] dark:bg-white/[.04]">
      <code className="flex-1 truncate text-sm">{url}</code>
      <CopyButton text={url} label="Copy link" />
    </div>
  );
}
