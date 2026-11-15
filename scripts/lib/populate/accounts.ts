// DEMO-03: docs/DEMO-ACCOUNTS.md, generated from the loaded data at the end of `npm run demo:load`: every account with its e-mail, display
// name, role, company and a short note of the state it shows, grouped by role. No passwords: every account uses the demo password.
import { writeFileSync } from "node:fs";
import type { World } from "./world";

export type AccountRow = { email: string; name: string; role: string; company: string; note: string };

const ROLE_ORDER = ["REQUESTER", "APPROVER", "PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER", "ADMIN", "VENDOR"];
const ROLE_TITLE: Record<string, string> = {
  REQUESTER: "Requester",
  APPROVER: "Approver",
  PROCUREMENT_SPECIALIST: "Procurement Specialist",
  COMMITTEE_MEMBER: "Committee Member",
  ADMIN: "Admin",
  VENDOR: "Vendor",
};

async function one<T>(w: World, sql: string, params: unknown[] = []): Promise<T> {
  return (await w.db.query(sql, params)).rows[0] as T;
}
const n = async (w: World, sql: string, params: unknown[] = []) => Number((await one<{ n: string }>(w, sql, params)).n);
const list = (items: string[]) => (items.length ? items.join(", ") : "none");

/** Collects one row per account from the database as it is now. */
export async function collectAccounts(w: World): Promise<AccountRow[]> {
  const company = (await one<{ name: string }>(w, "select name from public.company limit 1")).name;
  const { rows: users } = await w.db.query(
    `select u.id, u.email, u.full_name, u.vendor_id, array_agg(r.role::text order by r.role::text) as roles
       from public.app_user u join public.user_role r on r.user_id = u.id where u.is_active group by u.id order by u.full_name`);
  const prs = Object.fromEntries((await w.db.query("select status, count(*)::int as n from public.requisition group by status")).rows.map((r) => [r.status, r.n]));
  const rows: AccountRow[] = [];

  for (const u of users) {
    const role = (u.roles as string[])[0];
    let note = "";
    let companyName = company;
    if (role === "REQUESTER") {
      const mine = await n(w, "select count(*) as n from public.requisition where requester_id = $1", [u.id]);
      const returned = await n(w, "select count(*) as n from public.requisition where requester_id = $1 and status = 'RETURNED'", [u.id]);
      note = `Requested ${mine} PRs (${prs.APPROVED ?? 0} approved and waiting, ${prs.IN_SOURCING ?? 0} in sourcing, ${prs.COMPLETED ?? 0} completed, ${prs.PENDING_APPROVAL ?? 0} pending, ${returned} returned, ${prs.REJECTED ?? 0} rejected, ${prs.DRAFT ?? 0} draft); one pending PR exceeds its plan line.`;
    } else if (role === "APPROVER") {
      const poWaiting = await n(w, "select count(*) as n from public.purchase_order where status = 'PENDING_APPROVAL'");
      note = `${prs.PENDING_APPROVAL ?? 0} PRs to approve (one shows the plan warning) and ${poWaiting} PO to approve.`;
    } else if (role === "PROCUREMENT_SPECIALIST") {
      const sub = await n(w, "select count(*) as n from public.vendor where status = 'SUBMITTED'");
      const q = await n(w, "select count(*) as n from public.questionnaire_response where status = 'SUBMITTED'");
      const a = await n(w, "select count(*) as n from public.category_application where status = 'PENDING'");
      const cr = await n(w, "select count(*) as n from public.vendor_change_request where status = 'SUBMITTED'");
      const below = await n(w, "select count(*) as n from public.sourcing where owner_id = $1 and status = 'CLOSED'", [u.id]);
      const owned = await n(w, "select count(*) as n from public.sourcing where owner_id = $1", [u.id]);
      note = `Owns ${owned} sourcings. To do: ${sub} registrations to review, ${q} questionnaire to grade, ${a} category applications, ${cr} change request, ${prs.APPROVED ?? 0} approved PRs ready for sourcing, ${below} sourcing below the minimum.`;
    } else if (role === "COMMITTEE_MEMBER") {
      const chair = await n(w, "select count(*) as n from public.committee_member where user_id = $1 and is_chair", [u.id]);
      const votes = await n(w, "select count(*) as n from public.decision_voter v join public.decision d on d.id = v.decision_id where v.user_id = $1 and v.vote = 'NONE' and d.status = 'VOTING'", [u.id]);
      note = `${chair ? "Chair of the committee. " : ""}${votes} open vote${votes === 1 ? "" : "s"} waiting; the minutes of the closed decisions are readable.`;
    } else if (role === "ADMIN") {
      const total = await n(w, "select count(*) as n from public.app_user");
      note = `Manages ${total} users, the committee, the catalogue, categories, dictionaries and plan lines.`;
    } else if (role === "VENDOR" && u.vendor_id) {
      const v = await one<{ legal_name: string; status: string; standing: string | null; standing_until: string | null }>(
        w, "select legal_name, status, standing, to_char(standing_until, 'DD Mon YYYY') as standing_until from public.vendor where id = $1", [u.vendor_id]);
      companyName = v.legal_name;
      const grade = (await one<{ g: string | null }>(w, "select app.vendor_grade($1) as g", [u.vendor_id])).g;
      const cats = (await w.db.query(
        `select c.name, a.status, a.valid_until < app.today() as lapsed from public.category_application a join public.category c on c.id = a.category_id where a.vendor_id = $1 order by c.name`, [u.vendor_id])).rows;
      const qualified = cats.filter((c) => c.status === "QUALIFIED" && !c.lapsed).map((c) => c.name as string);
      const expired = cats.filter((c) => c.status === "EXPIRED" || (c.status === "QUALIFIED" && c.lapsed)).map((c) => c.name as string);
      const pending = cats.filter((c) => c.status === "PENDING").map((c) => c.name as string);
      const parts: string[] = [];
      const reg: Record<string, string> = {
        DRAFT: "registration DRAFT, stopped early (incomplete)",
        SUBMITTED: "registration SUBMITTED, waiting for review",
        RETURNED: "registration RETURNED with the specialist's comment",
        REJECTED: "registration REJECTED with a reason",
        APPROVED: "registration APPROVED",
      };
      parts.push(reg[v.status] ?? v.status);
      const q = (await w.db.query("select status from public.questionnaire_response where vendor_id = $1 order by attempt_no desc limit 1", [u.vendor_id])).rows[0] as { status: string } | undefined;
      if (v.status === "APPROVED") {
        if (v.standing === "HOLD") parts.push(`standing HOLD until ${v.standing_until} after two D grades`);
        else if (q?.status === "SUBMITTED") parts.push("questionnaire SUBMITTED, waiting for the grade");
        else if (grade) parts.push(`grade ${grade}`);
        if (qualified.length) parts.push(`qualified in ${list(qualified)}`);
        if (expired.length) parts.push(`qualification EXPIRED in ${list(expired)}`);
        if (pending.length) parts.push(`applications PENDING: ${list(pending)}`);
      }
      const certs = (await w.db.query("select type, (expires_on - app.today()) as days from public.vendor_certificate where vendor_id = $1 and expires_on is not null", [u.vendor_id])).rows;
      for (const c of certs) {
        if (c.days < 0) parts.push(`${String(c.type).replace(/_/g, " ")} certificate EXPIRED`);
        else if (c.days <= 30) parts.push(`${String(c.type).replace(/_/g, " ")} certificate EXPIRING in ${c.days} days`);
      }
      const cr = await n(w, "select count(*) as n from public.vendor_change_request where vendor_id = $1 and status = 'SUBMITTED'", [u.vendor_id]);
      if (cr) parts.push("Bank accounts change request SUBMITTED");
      const toAnswer = await n(w, "select count(*) as n from public.invitation i join public.sourcing s on s.id = i.sourcing_id where i.vendor_id = $1 and s.status = 'OPEN' and i.status = 'INVITED'", [u.vendor_id]);
      const poAccept = await n(w, "select count(*) as n from public.purchase_order where vendor_id = $1 and status = 'FULLY_APPROVED'", [u.vendor_id]);
      const invited = await n(w, "select count(*) as n from public.invitation where vendor_id = $1", [u.vendor_id]);
      const won = await n(w, "select count(*) as n from public.purchase_order where vendor_id = $1", [u.vendor_id]);
      if (invited) parts.push(`${invited} invitation${invited === 1 ? "" : "s"}`);
      if (toAnswer) parts.push(`${toAnswer} open invitation${toAnswer === 1 ? "" : "s"} to answer`);
      if (won) parts.push(`${won} PO${won === 1 ? "" : "s"}${poAccept ? `, ${poAccept} to accept` : ""}`);
      note = parts.join("; ") + ".";
    }
    rows.push({ email: u.email, name: u.full_name, role, company: companyName, note: note.replace(/\|/g, "/") });
  }
  return rows;
}

export function renderAccounts(rows: AccountRow[], generatedAt: string, project: string): string {
  const lines: string[] = [
    "# Demo accounts",
    "",
    `Generated by \`npm run demo:load\` from the loaded data of the Supabase project ${project} at ${generatedAt}. Do not edit by hand: the next load rewrites it.`,
    "Every account signs in with the demo password (`DEMO_SEED_PASSWORD` in `.env.local`); no password is written here.",
    "",
  ];
  for (const role of ROLE_ORDER) {
    const group = rows.filter((r) => r.role === role);
    if (group.length === 0) continue;
    lines.push(`## ${ROLE_TITLE[role]} (${group.length})`, "", "| E-mail | Name | Company | State it shows |", "| --- | --- | --- | --- |");
    for (const r of group) lines.push(`| ${r.email} | ${r.name} | ${r.company} | ${r.note} |`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function writeDemoAccounts(w: World, project: string, path = "docs/DEMO-ACCOUNTS.md"): Promise<AccountRow[]> {
  const rows = await collectAccounts(w);
  const stamp = new Date().toLocaleString("en-GB", { timeZone: "Asia/Baku", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  writeFileSync(path, renderAccounts(rows, `${stamp} (Asia/Baku)`, project) + "\n", "utf8");
  return rows;
}
