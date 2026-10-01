import { NextResponse } from "next/server";
import { getFileDownloadUrl } from "@/lib/shares";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[id]">
) {
  const { id } = await ctx.params;
  const file = await getFileDownloadUrl(id);

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return NextResponse.redirect(file.downloadUrl, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
