"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorKey } from "@/lib/db-errors";
import { formatAmount } from "@/lib/format";
import { bakuLocalToIso } from "@/lib/sourcing/dates";
import { isUpload } from "@/lib/files/rules";
import { storeFile, validateUpload } from "@/lib/files/server";
import type { DecisionState } from "@/components/decision-panel";

export type SourcingFormState = {
  errors: Record<string, string>;
  params?: Record<string, string>;
  saved?: boolean;
  attempt?: number;
};

async function singleSourceLimit(): Promise<string> {
  const { data } = await createAdminClient().from("setting").select("value").eq("key", "single_source_limit").limit(1).maybeSingle();
  return formatAmount(Number(data?.value ?? 0)).replace(" AZN", "");
}

function refresh(id?: string) {
  revalidatePath("/sourcing");
  revalidatePath("/requisitions");
  revalidatePath("/");
  if (id) revalidatePath(`/sourcing/${id}`);
}

/** RFQ-01 AC1, RFQ-06 AC1: Start sourcing on an APPROVED PR; Competitive or Single Source with one AVL vendor. */
export async function startSourcing(requisitionId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return { error: "access.denied", attempt: Date.now() };
  const method = formData.get("method") === "SINGLE_SOURCE" ? "SINGLE_SOURCE" : "COMPETITIVE";
  const vendor = String(formData.get("sspVendor") ?? "");
  if (method === "SINGLE_SOURCE" && !vendor) return { error: "errors.sspVendorRequired", attempt: Date.now() };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sourcing_start", {
    p_requisition: requisitionId,
    p_method: method,
    p_ssp_vendor: method === "SINGLE_SOURCE" ? vendor : undefined,
  });
  if (error || !data) return { error: errorKey(error) ?? "common.genericError", attempt: Date.now() };
  refresh();
  revalidatePath(`/requisitions/${requisitionId}`);
  redirect(`/sourcing/${data}`);
}

/**
 * RFQ-01 AC4-AC7, RFQ-06 AC2-AC3: Save keeps the DRAFT; Publish saves, then opens the sourcing. A justification
 * file is attached only when the database says the user may (file_attach_allowed), after the checks of NFR-009.
 */
export async function saveSourcing(id: string, _prev: SourcingFormState, formData: FormData): Promise<SourcingFormState> {
  const user = await requireUser();
  const publish = formData.get("intent") === "publish";
  const fail = (errors: Record<string, string>, params?: Record<string, string>) => ({ errors, params, attempt: Date.now() });
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return fail({ form: "access.denied" });

  const deadlineRaw = String(formData.get("deadline") ?? "");
  const deadline = bakuLocalToIso(deadlineRaw);
  if (deadlineRaw && !deadline) return fail({ deadline: "errors.deadlinePast" });

  const upload = formData.get("justificationFile");
  if (isUpload(upload)) {
    const fileError = await validateUpload(upload);
    if (fileError) return fail({ justificationFile: fileError });
  }

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("sourcing_save", {
    p_id: id,
    p_deadline: deadline ?? undefined,
    p_incoterm: String(formData.get("incoterm") ?? ""),
    p_named_place: (formData.get("namedPlace") as string) || undefined,
    p_delivery_mode: (formData.get("deliveryMode") as string) || undefined,
    p_payment_term: (formData.get("paymentTerm") as string) || undefined,
    p_tech_doc: formData.get("techDoc") === "yes",
    p_justification: String(formData.get("justification") ?? ""),
    p_excluded: formData.getAll("excluded").map(String),
  });
  if (saveError) {
    const key = errorKey(saveError) ?? "common.genericError";
    return fail(key === "errors.deadlinePast" ? { deadline: key } : { form: key });
  }

  if (isUpload(upload)) {
    const { data: allowed } = await supabase.rpc("file_attach_allowed", { p_owner_type: "sourcing", p_owner_id: id });
    if (!allowed) return fail({ form: "errors.noAccess" });
    const { error } = await storeFile({
      companyId: user.companyId, ownerType: "sourcing", ownerId: id, kind: "justification", file: upload, userId: user.id,
    });
    if (error) return fail({ justificationFile: error });
  }

  if (publish) {
    const { error } = await supabase.rpc("sourcing_publish", { p_id: id });
    if (error) {
      const key = errorKey(error) ?? "common.genericError";
      refresh(id);
      if (key === "errors.deadlinePast") return fail({ deadline: key });
      return fail({ form: key }, key === "errors.sspJustification" ? { limit: await singleSourceLimit() } : undefined);
    }
  }
  refresh(id);
  return { errors: {}, saved: true, attempt: Date.now() };
}

/** RFQ-01 AC5: a justification file attached by mistake can be removed while the sourcing is a DRAFT. */
export async function removeJustificationFile(sourcingId: string, fileId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("file_attach_allowed", { p_owner_type: "sourcing", p_owner_id: sourcingId });
  if (!allowed || !user.roles.includes("PROCUREMENT_SPECIALIST")) return;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("file").select("id, storage_path").eq("id", fileId).eq("owner_type", "sourcing").eq("owner_id", sourcingId).maybeSingle();
  if (!row) return;
  await admin.storage.from("files").remove([row.storage_path]);
  await admin.from("file").delete().eq("id", row.id);
  revalidatePath(`/sourcing/${sourcingId}`);
}

/** RFQ-04 AC4-AC6: Extend (new deadline + reason), Continue (reason) and Cancel (reason). */
export async function decideSourcing(id: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await requireUser();
  const fail = (error: string) => ({ error, attempt: Date.now() });
  if (!user.roles.includes("PROCUREMENT_SPECIALIST")) return fail("access.denied");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("comment") ?? "").trim();
  if (!reason) return fail("errors.reasonRequired");

  const supabase = await createClient();
  let error;
  if (decision === "EXTEND") {
    const deadline = bakuLocalToIso(String(formData.get("deadline") ?? ""));
    if (!deadline || new Date(deadline) <= new Date()) return fail("errors.deadlinePast");
    ({ error } = await supabase.rpc("sourcing_extend", { p_id: id, p_deadline: deadline, p_reason: reason }));
  } else if (decision === "CONTINUE") {
    ({ error } = await supabase.rpc("sourcing_continue", { p_id: id, p_reason: reason }));
  } else if (decision === "CANCEL") {
    ({ error } = await supabase.rpc("sourcing_cancel", { p_id: id, p_reason: reason }));
  } else {
    return fail("common.genericError");
  }
  refresh(id);
  return { error: errorKey(error), attempt: Date.now() };
}
