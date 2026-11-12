import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { buildMinutesPdf, type MinutesView } from "@/lib/minutes/pdf";

/**
 * CMT-03 AC3, AC5: the English minutes PDF. The minutes are read as the user (public.minutes_view checks the role
 * and the company), so a vendor or another company gets nothing. A failure leaves the data unchanged and answers
 * with a message key ("The PDF could not be generated, try again").
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/minutes/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(user.roles, "minutes")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("minutes_view", { p_id: id });
  if (error) return NextResponse.json({ error: "errors.pdfFailed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const minutes = data as MinutesView;
    const bytes = await buildMinutesPdf(minutes);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${minutes.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "errors.pdfFailed" }, { status: 500 });
  }
}
