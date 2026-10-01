import { ShareForm } from "@/app/_components/share-form";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Share text or files, fast
          </h1>
          <p className="text-zinc-500">
            Paste text or upload a file to get a shareable link.
          </p>
        </div>
        <ShareForm />
      </div>
    </div>
  );
}
