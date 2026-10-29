import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getShare, updateLiveText } from "@/lib/shares";

const MAX_TEXT_CHARS = 200_000;

async function checkUnlocked(id: string, hasPasscode: boolean): Promise<boolean> {
  if (!hasPasscode) return true;
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(`share_unlock_${id}`));
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/live/[id]">
) {
  const { id } = await ctx.params;
  const share = await getShare(id);

  if (!share || share.kind !== "live") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await checkUnlocked(id, share.hasPasscode))) {
    return NextResponse.json({ error: "Locked" }, { status: 403 });
  }

  return NextResponse.json(
    { text: share.textContent },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/live/[id]">
) {
  const { id } = await ctx.params;
  const share = await getShare(id);

  if (!share || share.kind !== "live") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await checkUnlocked(id, share.hasPasscode))) {
    return NextResponse.json({ error: "Locked" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = body?.text;

  if (typeof text !== "string") {
    return NextResponse.json({ error: "Invalid text" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: "Text too long" }, { status: 400 });
  }

  await updateLiveText(id, text);

  return NextResponse.json({ ok: true });
}
