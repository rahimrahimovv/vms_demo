"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { isUpload } from "@/lib/files/rules";
import { removeFiles, storeFile, validateUpload } from "@/lib/files/server";
import { errorKey } from "@/lib/db-errors";

export type ApplyState = {
  error: string | null;
  perCategory: Record<string, string>;
  created: number;
  attempt?: number;
};

/**
 * REG-03 AC1-AC4: one PENDING application per selected category. A licence file is uploaded
 * first for categories that need one; the database refuses the application without it.
 */
export async function applyForCategories(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const answer = (error: string | null, perCategory: Record<string, string> = {}, created = 0): ApplyState => ({
    error,
    perCategory,
    created,
    attempt: Date.now(),
  });
  const user = await requireUser();
  if (!user.vendorId || !canAccess(user.roles, "vendorCategories")) return answer("access.denied");

  const selected = formData.getAll("category").map(String).filter(Boolean);
  if (selected.length === 0) return answer("errors.selectCategory");

  const supabase = await createClient();
  const perCategory: Record<string, string> = {};
  let created = 0;

  for (const categoryId of selected) {
    const applicationId = randomUUID();
    const licence = formData.get(`licence-${categoryId}`);
    if (isUpload(licence)) {
      const fileError = await validateUpload(licence);
      if (fileError) {
        perCategory[categoryId] = fileError;
        continue;
      }
      const { error } = await storeFile({
        companyId: user.companyId,
        ownerType: "category_application",
        ownerId: applicationId,
        kind: "licence",
        file: licence,
        userId: user.id,
      });
      if (error) {
        perCategory[categoryId] = error;
        continue;
      }
    }
    const { error } = await supabase.rpc("category_apply", { p_category: categoryId, p_application_id: applicationId });
    if (error) {
      perCategory[categoryId] = errorKey(error) ?? "common.genericError";
      if (isUpload(licence)) await removeFiles("category_application", applicationId);
    } else {
      created += 1;
    }
  }

  revalidatePath("/vendor/categories");
  revalidatePath("/");
  return answer(null, perCategory, created);
}
