/**
 * Where a record opens, by record_type (used by notifications and links). Vendors and internal
 * users open the same record on different screens. Unknown types open My tasks.
 */
type Audience = "vendor" | "internal";

const INTERNAL_PATHS: Record<string, (id: string) => string> = {
  vendor: (id) => `/vendors/${id}`,
  vendor_standing: (id) => `/vendors/${id}`,
  questionnaire_response: (id) => `/questionnaires/${id}`,
  category_application: (id) => `/category-applications/${id}`,
};

const VENDOR_PATHS: Record<string, (id: string, event?: string) => string> = {
  vendor: (_id, event) => (event?.startsWith("certificate.") ? "/vendor/profile" : "/vendor/registration"),
  vendor_standing: () => "/vendor/qualification",
  questionnaire_response: () => "/vendor/qualification",
  category_application: () => "/vendor/categories",
};

export function recordHref(recordType: string, recordId: string, audience: Audience = "internal", event?: string) {
  const build = audience === "vendor" ? VENDOR_PATHS[recordType] : INTERNAL_PATHS[recordType];
  return build ? build(recordId, event) : "/";
}
