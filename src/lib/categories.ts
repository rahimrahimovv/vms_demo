/** Category tree helpers (MDM-02): flat rows in, depth-first order with depth and inherited licence flag out. */
export type CategoryRow = { id: string; parent_id: string | null; name: string; licence_required: boolean; is_active: boolean };

export type CategoryNode = CategoryRow & { depth: number; needsLicence: boolean; path: string };

export function flattenTree(rows: CategoryRow[]): CategoryNode[] {
  const children = new Map<string | null, CategoryRow[]>();
  for (const row of rows) {
    const list = children.get(row.parent_id) ?? [];
    list.push(row);
    children.set(row.parent_id, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, "en"));

  const out: CategoryNode[] = [];
  const walk = (parent: string | null, depth: number, inherited: boolean, prefix: string) => {
    for (const row of children.get(parent) ?? []) {
      const needsLicence = inherited || row.licence_required;
      const path = prefix ? `${prefix} / ${row.name}` : row.name;
      out.push({ ...row, depth, needsLicence, path });
      walk(row.id, depth + 1, needsLicence, path);
    }
  };
  walk(null, 0, false, "");
  return out;
}

/** The category and its parents (a qualification in a parent covers its children, MDM-02 AC3). */
export function ancestorsOf(rows: CategoryRow[], id: string): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: string[] = [];
  let current = byId.get(id);
  while (current) {
    out.push(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return out;
}
