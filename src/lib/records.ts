/**
 * Where a record opens, by record_type (used by notifications and links).
 * Each slice adds its record types; unknown types open My tasks.
 */
const RECORD_PATHS: Record<string, (id: string) => string> = {};

export function recordHref(recordType: string, recordId: string): string {
  const build = RECORD_PATHS[recordType];
  return build ? build(recordId) : "/";
}
