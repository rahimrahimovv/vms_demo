/**
 * RFQ-10 saving against the estimate (D-026). The database computes it (app.sourcing_saving, app.po_saving); this module
 * holds the JSON shape and a mirror of the same arithmetic so the rule is tested with the backlog values.
 * Internal users only: nothing here may reach a vendor page, RPC, PDF, notification or export.
 */
export type SavingLine = { lineId: string; estimated: number; awarded: number; saving: number };

export type Saving = {
  lines: SavingLine[];
  /** Sum of quantity x estimated unit price, over the lines that have a winner. */
  estimated: number;
  /** Sum of quantity x the winner's unit price excluding VAT. */
  awarded: number;
  /** estimated - awarded; negative when the winners are above the estimate. */
  saving: number;
  /** One decimal. */
  percent: number;
  over: boolean;
};

/** Half-up rounding of the absolute value at `digits` decimals, then the sign: -3.25 gives -3.3 as 3.25 gives 3.3. */
export function roundHalfUp(value: number, digits: number): number {
  const f = 10 ** digits;
  const r = Math.floor(Number((Math.abs(value) * f).toFixed(6)) + 0.5) / f;
  return value < 0 ? -r : r;
}

export type SavingInput = { lineId: string; estimateUnit: number; winnerUnit: number; quantity: number };

/** The rule: amounts with two decimals per line, percent with one decimal of the total estimate. */
export function computeSaving(inputs: SavingInput[]): Saving {
  const lines = inputs.map((i) => {
    const estimated = roundHalfUp(i.estimateUnit * i.quantity, 2);
    const awarded = roundHalfUp(i.winnerUnit * i.quantity, 2);
    return { lineId: i.lineId, estimated, awarded, saving: roundHalfUp(estimated - awarded, 2) };
  });
  const estimated = roundHalfUp(lines.reduce((a, l) => a + l.estimated, 0), 2);
  const awarded = roundHalfUp(lines.reduce((a, l) => a + l.awarded, 0), 2);
  const saving = roundHalfUp(estimated - awarded, 2);
  return {
    lines,
    estimated,
    awarded,
    saving,
    percent: estimated > 0 ? roundHalfUp((saving * 100) / estimated, 1) : 0,
    over: awarded > estimated,
  };
}

/** "6.9%" or "+3.2%" for an over-estimate (sign shown only when above the estimate). */
export function formatPercent(percent: number): string {
  const abs = Math.abs(percent).toFixed(1);
  return percent < 0 ? `+${abs}%` : `${abs}%`;
}

/** The per-line saving by line id, for the comparison rows. */
export function savingByLine(saving: Saving | undefined): Map<string, SavingLine> {
  return new Map((saving?.lines ?? []).map((l) => [l.lineId, l]));
}
