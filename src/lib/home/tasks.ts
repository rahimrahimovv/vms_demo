import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoListRow } from "@/lib/purchase-orders/types";

/**
 * "My tasks": every item that still needs this user, read from the CURRENT state. The count of a card and the rows of the
 * "Waiting for you" list come from the same query, so they always agree (a card shows N, the list holds the same N items).
 */
export type TaskKey =
  | "votesWaiting"
  | "posToApprove"
  | "prsToApprove"
  | "prsReturned"
  | "registrations"
  | "changeRequests"
  | "questionnaires"
  | "applications"
  | "sourcingsBelowMinimum"
  | "prsReadyForSourcing";

export const TASK_ICON_KEYS: TaskKey[] = [
  "votesWaiting", "posToApprove", "prsToApprove", "prsReturned", "registrations", "changeRequests", "questionnaires", "applications",
  "sourcingsBelowMinimum", "prsReadyForSourcing",
];

/** Where each card links to. Each key has home.cardLabels, home.cardLinks, home.cards and home.tasks texts (checked by a test). */
export const TASK_HREF: Record<TaskKey, string> = {
  votesWaiting: "/decisions",
  posToApprove: "/purchase-orders",
  prsToApprove: "/requisitions?tab=toApprove",
  prsReturned: "/requisitions?tab=mine",
  registrations: "/vendors",
  changeRequests: "/change-requests",
  questionnaires: "/questionnaires",
  applications: "/category-applications",
  sourcingsBelowMinimum: "/sourcing",
  prsReadyForSourcing: "/requisitions?tab=all",
};

export type TaskRow = {
  key: TaskKey;
  /** record_type of the record that opens (see src/lib/records.ts), id of that record */
  recordType: string;
  recordId: string;
  /** values for the text home.tasks.<key>: number, name, category, section, type, vendor */
  params: Record<string, string>;
  since: string;
};
export type TaskResult = { key: TaskKey; count: number; rows: TaskRow[] };

export type TaskUser = { id: string; roles: string[] };
export const ROW_LIMIT = 50;

type Embedded<T> = T | T[] | null;
const one = <T,>(v: Embedded<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Which cards a user has, in display order. */
export function taskKeysFor(roles: string[]): TaskKey[] {
  const has = (r: string) => roles.includes(r);
  return [
    ...(has("COMMITTEE_MEMBER") ? (["votesWaiting"] as const) : []),
    ...(has("APPROVER") ? (["posToApprove", "prsToApprove"] as const) : []),
    ...(has("REQUESTER") ? (["prsReturned"] as const) : []),
    ...(has("PROCUREMENT_SPECIALIST")
      ? (["registrations", "changeRequests", "questionnaires", "applications", "sourcingsBelowMinimum", "prsReadyForSourcing"] as const)
      : []),
  ];
}

export async function loadTasks(supabase: SupabaseClient, user: TaskUser): Promise<TaskResult[]> {
  const run = async (key: TaskKey): Promise<TaskResult> => {
    switch (key) {
      case "registrations": {
        const { data, count } = await supabase
          .from("vendor").select("id, legal_name, submitted_at, created_at", { count: "exact" })
          .eq("status", "SUBMITTED").order("submitted_at", { ascending: false }).limit(ROW_LIMIT)
          .returns<{ id: string; legal_name: string; submitted_at: string | null; created_at: string }[]>();
        return { key, count: count ?? 0, rows: (data ?? []).map((r) => ({ key, recordType: "vendor", recordId: r.id, params: { name: r.legal_name }, since: r.submitted_at ?? r.created_at })) };
      }
      case "questionnaires": {
        const { data, count } = await supabase
          .from("questionnaire_response").select("id, submitted_at, created_at, vendor(legal_name)", { count: "exact" })
          .eq("status", "SUBMITTED").order("submitted_at", { ascending: false }).limit(ROW_LIMIT)
          .returns<{ id: string; submitted_at: string | null; created_at: string; vendor: Embedded<{ legal_name: string }> }[]>();
        return { key, count: count ?? 0, rows: (data ?? []).map((r) => ({ key, recordType: "questionnaire_response", recordId: r.id, params: { name: one(r.vendor)?.legal_name ?? "" }, since: r.submitted_at ?? r.created_at })) };
      }
      case "applications": {
        const { data, count } = await supabase
          .from("category_application").select("id, created_at, vendor(legal_name), category(name)", { count: "exact" })
          .eq("status", "PENDING").order("created_at", { ascending: false }).limit(ROW_LIMIT)
          .returns<{ id: string; created_at: string; vendor: Embedded<{ legal_name: string }>; category: Embedded<{ name: string }> }[]>();
        return { key, count: count ?? 0, rows: (data ?? []).map((r) => ({ key, recordType: "category_application", recordId: r.id, params: { name: one(r.vendor)?.legal_name ?? "", category: one(r.category)?.name ?? "" }, since: r.created_at })) };
      }
      case "changeRequests": {
        const { data, count } = await supabase
          .from("vendor_change_request").select("id, section, submitted_at, created_at, vendor(legal_name)", { count: "exact" })
          .eq("status", "SUBMITTED").order("submitted_at", { ascending: false }).limit(ROW_LIMIT)
          .returns<{ id: string; section: string; submitted_at: string | null; created_at: string; vendor: Embedded<{ legal_name: string }> }[]>();
        return { key, count: count ?? 0, rows: (data ?? []).map((r) => ({ key, recordType: "vendor_change_request", recordId: r.id, params: { name: one(r.vendor)?.legal_name ?? "", section: r.section }, since: r.submitted_at ?? r.created_at })) };
      }
      case "sourcingsBelowMinimum": {
        const { data, count } = await supabase
          .from("sourcing").select("id, number, deadline, created_at", { count: "exact" })
          .eq("status", "CLOSED").eq("owner_id", user.id).order("deadline", { ascending: false }).limit(ROW_LIMIT)
          .returns<{ id: string; number: string; deadline: string | null; created_at: string }[]>();
        return { key, count: count ?? 0, rows: (data ?? []).map((r) => ({ key, recordType: "sourcing", recordId: r.id, params: { number: r.number }, since: r.deadline ?? r.created_at })) };
      }
      case "prsReadyForSourcing":
      case "prsToApprove":
      case "prsReturned": {
        const status = key === "prsReadyForSourcing" ? "APPROVED" : key === "prsToApprove" ? "PENDING_APPROVAL" : "RETURNED";
        let q = supabase.from("requisition").select("id, number, submitted_at, created_at", { count: "exact" }).eq("status", status);
        if (key === "prsToApprove") q = q.neq("requester_id", user.id); // never one's own PR (#83)
        if (key === "prsReturned") q = q.eq("requester_id", user.id);
        const { data, count } = await q.order("created_at", { ascending: false }).limit(ROW_LIMIT)
          .returns<{ id: string; number: string; submitted_at: string | null; created_at: string }[]>();
        return { key, count: count ?? 0, rows: (data ?? []).map((r) => ({ key, recordType: "requisition", recordId: r.id, params: { number: r.number }, since: r.submitted_at ?? r.created_at })) };
      }
      case "votesWaiting": {
        // the sourcing owner is never a voter, so the voter rows are exactly this member's open votes
        const { data, count } = await supabase
          .from("decision_voter").select("id, decision!inner(id, type, opened_at, status, sourcing(number))", { count: "exact" })
          .eq("user_id", user.id).eq("vote", "NONE").eq("decision.status", "VOTING").limit(ROW_LIMIT)
          .returns<{ id: string; decision: Embedded<{ id: string; type: string; opened_at: string; sourcing: Embedded<{ number: string }> }> }[]>();
        return {
          key, count: count ?? 0,
          rows: (data ?? []).flatMap((r) => {
            const d = one(r.decision);
            return d ? [{ key, recordType: "decision", recordId: d.id, params: { number: one(d.sourcing)?.number ?? "", type: d.type }, since: d.opened_at }] : [];
          }),
        };
      }
      case "posToApprove": {
        const all = ((await supabase.rpc("po_list")).data ?? []) as PoListRow[];
        // never the PO of one's own PR or own sourcing (#83)
        const rows = all.filter((po) => po.status === "PENDING_APPROVAL" && po.requester_id !== user.id && po.owner_id !== user.id);
        return {
          key, count: rows.length,
          rows: rows.slice(0, ROW_LIMIT).map((po) => ({ key, recordType: "purchase_order", recordId: po.id, params: { number: po.number, vendor: po.vendor_name }, since: po.created_at })),
        };
      }
    }
  };
  return Promise.all(taskKeysFor(user.roles).map(run));
}

/** All rows of all cards, newest first: the "Waiting for you" list. */
export function waitingRows(results: TaskResult[]): TaskRow[] {
  return results.flatMap((r) => r.rows).sort((a, b) => Date.parse(b.since) - Date.parse(a.since));
}
export const waitingTotal = (results: TaskResult[]) => results.reduce((sum, r) => sum + r.count, 0);
