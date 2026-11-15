// `--unattended` for npm run demo:reset and demo:load: skips the typed confirmation, but only when DEMO_UNATTENDED_REF in the
// env file equals the target project reference exactly. The variable lives in .env.local only (the development project); it never
// goes into .env.production.local, Vercel or an example file with a real value. Anything else keeps the typed confirmation mandatory.
export const UNATTENDED_FLAG = "--unattended";

export const wantsUnattended = (argv: string[]) => argv.includes(UNATTENDED_FLAG);

/** Returns null when the unattended run is allowed, otherwise the reason it is refused. */
export function unattendedRefusal(
  argv: string[],
  env: Record<string, string | undefined>,
  projectRef: string,
  envFile: string,
): string | null {
  if (!wantsUnattended(argv)) return "not requested";
  const configured = (env.DEMO_UNATTENDED_REF ?? "").trim();
  if (!configured) return "Refused: --unattended needs DEMO_UNATTENDED_REF in the env file. The typed confirmation stays mandatory.";
  if (configured !== projectRef) {
    return "Refused: DEMO_UNATTENDED_REF is not the target project reference. The typed confirmation stays mandatory.";
  }
  if (/production/i.test(envFile)) return "Refused: --unattended is never allowed with a production env file. The typed confirmation stays mandatory.";
  return null;
}
