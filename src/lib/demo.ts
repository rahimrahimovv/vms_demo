import "server-only";

/**
 * Demo tools (role switcher, Fill sample, End deadline now, Reset demo) exist only when
 * DEMO_MODE=true (CLAUDE.md rule 13, DEMO-01 AC5). Built in Slice 8.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Every demo endpoint starts with this; answers "Not available" with no effect when demo mode is off. */
export function demoNotAvailable(): Response | null {
  return isDemoMode() ? null : Response.json({ error: "Not available" }, { status: 404 });
}
