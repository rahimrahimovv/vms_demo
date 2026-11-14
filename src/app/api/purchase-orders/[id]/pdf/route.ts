import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { mayUseApi } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildPoPdf } from "@/lib/purchase-orders/pdf";
import type { PoView } from "@/lib/purchase-orders/types";

/**
 * PO-03 AC1: the English PO PDF. The PO is read as the user (public.po_view applies the same rule as the lists:
 * a vendor gets only its own POs that are FULLY_APPROVED, ACCEPTED or DECLINED_BY_VENDOR), so another vendor or a
 * PO that is not released yet answers 404. A failure leaves the data unchanged ("The PDF could not be generated, try again").
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/purchase-orders/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mayUseApi(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); // PLT-03: password must change

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("po_view", { p_id: id });
  if (error) return NextResponse.json({ error: "errors.pdfFailed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const po = data as PoView;
    const bytes = await buildPoPdf(po);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${po.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "errors.pdfFailed" }, { status: 500 });
  }
}
