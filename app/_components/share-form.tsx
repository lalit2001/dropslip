"use client";

import { useActionState, useState } from "react";
import { createShare } from "@/app/actions";

const EXPIRY_CHOICES: { value: string; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
];

export function ShareForm() {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(createShare, null);

  return (
    <form action={formAction} className="w-full max-w-xl space-y-5">
      <input type="hidden" name="mode" value={mode} />

      <div className="flex gap-1 rounded-lg bg-black/[.04] p-1 dark:bg-white/[.06]">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "text"
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "file"
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          File
        </button>
      </div>

      {mode === "text" ? (
        <textarea
          name="text"
          rows={10}
          placeholder="Paste or type anything you want to share..."
          className="w-full resize-none rounded-lg border border-black/[.08] bg-white p-4 font-mono text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:focus:border-zinc-600"
        />
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-black/[.12] bg-white p-10 text-center text-sm text-zinc-500 hover:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:hover:border-zinc-600">
          <input
            type="file"
            name="file"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {fileName ?? "Click to choose a file"}
          </span>
          <span>Any file type is supported</span>
        </label>
      )}

      <div className="space-y-1.5">
        <label htmlFor="customId" className="text-sm text-zinc-500">
          Custom link <span className="text-zinc-400">(optional)</span>
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-black/[.08] bg-white px-3 py-2 dark:border-white/[.145] dark:bg-zinc-900">
          <span className="text-sm text-zinc-400 whitespace-nowrap">/s/</span>
          <input
            id="customId"
            name="customId"
            type="text"
            placeholder="my-shared-file"
            pattern="[a-zA-Z0-9_-]{3,40}"
            maxLength={40}
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <p className="text-xs text-zinc-400">
          Leave blank for a random link. Letters, numbers, hyphens and underscores only.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="expiry" className="text-sm text-zinc-500">
          Link expires in
        </label>
        <select
          id="expiry"
          name="expiry"
          defaultValue="7d"
          className="rounded-md border border-black/[.08] bg-white px-2 py-1 text-sm dark:border-white/[.145] dark:bg-zinc-900"
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      {state?.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Sharing..." : "Create share link"}
      </button>
    </form>
  );
}
