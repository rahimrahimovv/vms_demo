import { getRequestConfig } from "next-intl/server";

// English only in this release; every UI string lives in messages/en.json (CLAUDE.md rule 2).
export const LOCALE = "en";
export const TIME_ZONE = "Asia/Baku";

export default getRequestConfig(async () => ({
  locale: LOCALE,
  timeZone: TIME_ZONE,
  messages: (await import("../../messages/en.json")).default,
}));
