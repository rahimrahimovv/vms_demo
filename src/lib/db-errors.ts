/**
 * The database functions raise errors whose message is a key in messages/en.json ("errors.*").
 * Anything else becomes the generic message, so no database text reaches the screen.
 */
export function errorKey(error: { message?: string; code?: string } | null | undefined): string | null {
  if (!error) return null;
  if (error.message && /^errors\.[A-Za-z0-9]+$/.test(error.message)) return error.message;
  return "common.genericError";
}
