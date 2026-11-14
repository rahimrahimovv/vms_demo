"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column = {
  key: string;
  label: string;
  /** Amounts are right-aligned (CLAUDE.md Design). */
  align?: "left" | "right";
  sortable?: boolean;
};

export type Cell = { node: ReactNode; sort: string | number };

export type Row = { id: string; cells: Record<string, Cell> };

/** Table with sortable columns. Cells carry a rendered node plus a plain sort value. */
export function SortableTable({
  columns,
  rows,
  initialSort,
}: {
  columns: Column[];
  rows: Row[];
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const t = useTranslations("common");
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a.cells[sort.key]?.sort ?? "";
      const y = b.cells[sort.key]?.sort ?? "";
      if (typeof x === "number" && typeof y === "number") return (x - y) * factor;
      return String(x).localeCompare(String(y), "en", { sensitivity: "base", numeric: true }) * factor;
    });
  }, [rows, sort]);

  function toggle(key: string) {
    setSort((current) =>
      current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  return (
    <div className="surface-solid overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <TableHead
                  key={column.key}
                  className={cn(column.align === "right" && "text-right")}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {column.sortable === false ? (
                    column.label
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 font-medium hover:text-foreground",
                        column.align === "right" && "flex-row-reverse",
                      )}
                      aria-label={t("sortBy", { column: column.label })}
                    >
                      {column.label}
                      <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground/60")} />
                    </button>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column) => (
                <TableCell key={column.key} className={cn(column.align === "right" && "text-right tabular-nums")}>
                  {row.cells[column.key]?.node}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
