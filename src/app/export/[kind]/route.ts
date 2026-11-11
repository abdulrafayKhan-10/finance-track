import type { NextRequest } from "next/server";
import { buildExport, EXPORT_KINDS, type ExportKind } from "@/features/exports/exports";
import { getCurrentUser } from "@/lib/auth";

/**
 * CSV exports and the JSON backup, downloaded as files. Same access rules as
 * the pages: a verified session that has passed MFA when it is enrolled.
 * Responses are never cached (the proxy also sets no-store).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/export/[kind]">) {
  const user = await getCurrentUser();
  if (!user || (user.mfaRequired && user.aal !== "aal2")) {
    return new Response("Sign in to export your data.", { status: 401 });
  }
  const { kind } = await ctx.params;
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return new Response("Unknown export.", { status: 404 });

  try {
    const file = await buildExport(kind as ExportKind, request.nextUrl.searchParams);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Export failed:", error instanceof Error ? error.name : typeof error);
    return new Response("The export failed. Nothing was changed; please try again.", { status: 500 });
  }
}
