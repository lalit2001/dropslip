"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CopyButton } from "@/app/_components/copy-button";

const POLL_INTERVAL_MS = 2000;
const SAVE_DEBOUNCE_MS = 600;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function LiveTextEditor({
  id,
  initialText,
}: {
  id: string;
  initialText: string;
}) {
  const [text, setText] = useState(initialText);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [expired, setExpired] = useState(false);
  const isFocusedRef = useRef(false);
  const latestTextRef = useRef(initialText);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestTextRef.current = text;
  }, [text]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/${id}`, { cache: "no-store" });
        if (res.status === 404) {
          setExpired(true);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!isFocusedRef.current && data.text !== latestTextRef.current) {
          setText(data.text);
        }
      } catch {
        // Ignore transient poll failures — next tick will retry.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    setStatus("saving");

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/live/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value }),
        });
        if (res.status === 404) {
          setExpired(true);
          return;
        }
        setStatus(res.ok ? "saved" : "error");
      } catch {
        setStatus("error");
      }
    }, SAVE_DEBOUNCE_MS);
  }

  if (expired) {
    return (
      <p className="rounded-lg border border-black/[.08] bg-white p-6 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:bg-zinc-900">
        This live share has expired.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-zinc-500">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Live — edits sync automatically
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            {status === "saving"
              ? "Saving..."
              : status === "saved"
                ? "Saved"
                : status === "error"
                  ? "Couldn't save"
                  : ""}
          </span>
          <CopyButton text={text} label="Copy text" />
        </div>
      </div>
      <textarea
        value={text}
        onChange={handleChange}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
        }}
        rows={14}
        placeholder="Start typing — anyone with this link sees it live."
        className="w-full resize-none rounded-lg border border-black/[.08] bg-white p-4 font-mono text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:focus:border-zinc-600"
      />
    </div>
  );
}
