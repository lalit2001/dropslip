"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import { createShare, finalizeFileShare, prepareFileShare } from "@/app/actions";

const EXPIRY_CHOICES: { value: string; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
];

export function ShareForm() {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [customId, setCustomId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [expiry, setExpiry] = useState("7d");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCustomId = customId.trim() || null;
    const trimmedPasscode = passcode.trim() || null;

    if (mode === "text") {
      if (text.trim().length === 0) {
        setError("Enter some text to share.");
        return;
      }

      setPending(true);
      const formData = new FormData();
      formData.set("text", text);
      formData.set("expiry", expiry);
      if (trimmedCustomId) formData.set("customId", trimmedCustomId);
      if (trimmedPasscode) formData.set("passcode", trimmedPasscode);

      const result = await createShare(null, formData);
      if (result?.error) {
        setError(result.error);
        setPending(false);
      }
      return;
    }

    if (!file) {
      setError("Choose a file to share.");
      return;
    }

    setPending(true);

    const prep = await prepareFileShare(file.name, trimmedCustomId);
    if ("error" in prep) {
      setError(prep.error);
      setPending(false);
      return;
    }

    if (file.size > prep.maxUploadBytes) {
      const maxMb = (prep.maxUploadBytes / (1024 * 1024)).toFixed(0);
      setError(`File is too large (max ${maxMb} MB).`);
      setPending(false);
      return;
    }

    try {
      const blob = await upload(prep.pathname, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        multipart: true,
      });

      const result = await finalizeFileShare({
        id: prep.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        expiry,
        passcode: trimmedPasscode,
      });

      if (result?.error) {
        setError(result.error);
        setPending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-5">
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Paste or type anything you want to share..."
          className="w-full resize-none rounded-lg border border-black/[.08] bg-white p-4 font-mono text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:focus:border-zinc-600"
        />
      ) : (
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center text-sm transition-colors ${
            isDragging
              ? "border-zinc-400 bg-zinc-100 text-zinc-700 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-200"
              : "border-black/[.12] bg-white text-zinc-500 hover:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:hover:border-zinc-600"
          }`}
        >
          <input
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {file?.name ?? (isDragging ? "Drop file to upload" : "Click to choose a file, or drag one here")}
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
            type="text"
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
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

      <div className="space-y-1.5">
        <label htmlFor="passcode" className="text-sm text-zinc-500">
          Access code <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          id="passcode"
          type="text"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Require a code to view"
          maxLength={100}
          className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:focus:border-zinc-600"
        />
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="expiry" className="text-sm text-zinc-500">
          Link expires in
        </label>
        <select
          id="expiry"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="rounded-md border border-black/[.08] bg-white px-2 py-1 text-sm dark:border-white/[.145] dark:bg-zinc-900"
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
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
