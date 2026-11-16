import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { mayUseApi } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildReceiptPdf, type ReceiptData } from "@/lib/proposals/receipt";

/**
 * RFQ-12: the English receipt PDF of a SUBMITTED proposal, for the vendor that owns it. Every internal user is refused
 * (403). The data comes from public.proposal_receipt, read as the user, which returns nothing for a DRAFT or WITHDRAWN
 * proposal and for another vendor's proposal (404). It never holds an estimate, another vendor's data or committee data.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mayUseApi(user) || !user.vendorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("proposal_receipt", { p_proposal: id });
  if (error) return NextResponse.json({ error: "errors.pdfFailed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const receipt = data as ReceiptData;
    const bytes = await buildReceiptPdf(receipt);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receipt.sourcingNumber}-receipt.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "errors.pdfFailed" }, { status: 500 });
  }
}
