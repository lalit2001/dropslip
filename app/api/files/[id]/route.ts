import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getFileShareMeta, incrementDownloadCount } from "@/lib/shares";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[id]">
) {
  const { id } = await ctx.params;
  const file = await getFileShareMeta(id);

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  if (file.hasPasscode) {
    const cookieStore = await cookies();
    if (!cookieStore.get(`share_unlock_${id}`)) {
      return new Response("This share is locked.", { status: 403 });
    }
  }

  await incrementDownloadCount(id);

  return NextResponse.redirect(file.downloadUrl, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
