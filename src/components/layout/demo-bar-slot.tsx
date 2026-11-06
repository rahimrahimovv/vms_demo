import { isDemoMode } from "@/lib/demo";

/**
 * Slot above the top bar for the demo bar (Switch user, Reset demo). The bar itself is
 * built in Slice 8 (DEMO-01); with DEMO_MODE off nothing renders (rule 13).
 */
export function DemoBarSlot() {
  if (!isDemoMode()) return null;
  return <div id="demo-bar" data-testid="demo-bar-slot" />;
}
