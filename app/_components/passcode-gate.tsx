"use client";

import { useState } from "react";
import { unlockShare } from "@/app/actions";

export function PasscodeGate({ id }: { id: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const result = await unlockShare(id, code);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-center gap-4 rounded-lg border border-black/[.08] bg-white p-10 text-center dark:border-white/[.145] dark:bg-zinc-900"
    >
      <div className="space-y-1">
        <p className="font-medium">This share is protected</p>
        <p className="text-sm text-zinc-500">Enter the code to view it.</p>
      </div>
      <input
        type="password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter code"
        autoFocus
        className="w-full max-w-xs rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-center outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-600"
      />
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || code.length === 0}
        className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Checking..." : "Unlock"}
      </button>
    </form>
  );
}
