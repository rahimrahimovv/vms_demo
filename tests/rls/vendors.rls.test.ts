/**
 * RLS and workflow tests for Slice 2 (REG-01..REG-06, NFR-001, NFR-011) against vms-dev.
 * Two throwaway vendors (A and B), a Procurement Specialist, a Requester and an Admin; everything
 * they create (vendors, files, notifications, audit entries) is removed afterwards.
 * The seeded questionnaire, categories, Beta Trade and Gamma Supply are read, never changed.
 */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const CAT = {
  agricultural: "00000000-0000-4000-8000-000000000100",
  fertilisers: "00000000-0000-4000-8000-000000000101",
  seeds: "00000000-0000-4000-8000-000000000102",
  mineral: "00000000-0000-4000-8000-000000000105",
  foliar: "00000000-0000-4000-8000-000000000106",
};
const BETA = "00000000-0000-4000-8000-000000000502";
const GAMMA = "00000000-0000-4000-8000-000000000503";
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Rls-${randomUUID()}`;
const SHARED_OWNER = `RLS-OWNER-${RUN}`;

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string };
const actors = {} as Record<"vendorA" | "vendorB" | "specialist" | "requester" | "admin", Actor>;
const recordIds: string[] = []; // for notification / audit cleanup
let today = "";

function anon() {
  return createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function internal(key: "specialist" | "requester" | "admin", role: string) {
  const email = `rls2-${key}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: `RLS ${key}`, email });
  await service.from("user_role").insert({ user_id: data.user.id, role });
  actors[key] = { id: data.user.id, email, client: await signIn(email) };
}

/** REG-01 through the same server function the Register page uses (account confirmed, no e-mail). */
async function vendor(key: "vendorA" | "vendorB") {
  const email = `rls2-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const voen = `98${String(randomInt(0, 99_999_999)).padStart(8, "0")}`;
  const { data: vendorId, error: regError } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: "LOCAL_COMPANY",
      legal_name: `RLS ${key} ${RUN}`,
      voen,
      country_code: "AZ",
      legal_address: "Test street 1",
      director_name: "Test Director",
      is_vat_payer: true,
      contact_person: "Test Contact",
      contact_email: email,
      phone: "+994500000000",
      bank_name: "Test Bank",
      iban: "AZ00TEST",
      swift: "TESTAZ22",
      founded_on: "2015-05-01",
    },
    p_owners: [
      { full_name: "Head Person", id_number: `HEAD-${key}-${RUN}`, share_percent: 60, role: "HEAD" },
      { full_name: "Shared Owner", id_number: SHARED_OWNER, share_percent: 40, role: "SHAREHOLDER" },
    ],
  });
  if (regError) throw regError;
  recordIds.push(vendorId);
  actors[key] = { id: data.user.id, email, client: await signIn(email), vendorId };
}

/** Stands in for a server upload: a file row with a fake storage path (the bucket is not needed here). */
async function fileRow(ownerType: string, ownerId: string, kind: string) {
  await db.query(
    `insert into public.file (company_id, owner_type, owner_id, kind, file_name, mime_type, size_bytes, storage_path)
     values ($1, $2, $3, $4, 'test.pdf', 'application/pdf', 100, $5)`,
    [COMPANY_ID, ownerType, ownerId, kind, `rls/${RUN}/${randomUUID()}.pdf`],
  );
}

async function notificationsFor(userId: string, event: string, recordId: string) {
  const { rows } = await db.query(
    "select params from public.notification where user_id = $1 and event = $2 and record_id = $3",
    [userId, event, recordId],
  );
  return rows;
}

/** Answers every question of an attempt by option label per question sort order. */
async function answerAll(client: SupabaseClient, responseId: string, labels: string[]) {
  const { data, error } = await client.rpc("vendor_questionnaire", { p_response: responseId });
  if (error) throw error;
  const rows = data as { answer_id: string; question_id: string; options: { id: string; label: string }[] }[];
  const answers = rows.map((r, i) => ({ questionId: r.question_id, optionId: r.options.find((o) => o.label === labels[i])!.id }));
  const { error: saveError } = await client.rpc("questionnaire_save", { p_response: responseId, p_answers: answers });
  if (saveError) throw saveError;
  return rows;
}

async function attachEvidence(responseId: string) {
  const { rows } = await db.query(
    `select a.id from public.questionnaire_answer a join public.questionnaire_question q on q.id = a.question_id
     where a.response_id = $1 and q.evidence_required`,
    [responseId],
  );
  for (const r of rows) await fileRow("questionnaire_answer", r.id, "attachment");
}

beforeAll(async () => {
  await db.connect();
  today = (await db.query("select app.today()::text as d")).rows[0].d;
  await internal("specialist", "PROCUREMENT_SPECIALIST");
  await internal("requester", "REQUESTER");
  await internal("admin", "ADMIN");
  await vendor("vendorA");
  await vendor("vendorB");
}, 60_000);

afterAll(async () => {
  const vendorIds = [actors.vendorA?.vendorId, actors.vendorB?.vendorId].filter(Boolean) as string[];
  if (vendorIds.length > 0) {
    const { rows } = await db.query(
      `select id from public.questionnaire_response where vendor_id = any($1::uuid[])
       union all select id from public.category_application where vendor_id = any($1::uuid[])`,
      [vendorIds],
    );
    recordIds.push(...rows.map((r) => r.id));
  }
  await db.query("begin");
  await db.query("alter table public.audit_entry disable trigger audit_entry_immutable");
  await db.query("delete from public.audit_entry where record_id = any($1::uuid[])", [recordIds]);
  await db.query("alter table public.audit_entry enable trigger audit_entry_immutable");
  await db.query("commit");
  await db.query("delete from public.notification where record_id = any($1::uuid[])", [recordIds]);
  await db.query("delete from public.file where storage_path like $1", [`rls/${RUN}/%`]);
  // Order matters: vendor logins, then the vendors (their attempts and applications reference the
  // specialist), then the internal users.
  for (const key of ["vendorA", "vendorB"] as const) if (actors[key]) await service.auth.admin.deleteUser(actors[key].id);
  if (vendorIds.length > 0) await db.query("delete from public.vendor where id = any($1::uuid[])", [vendorIds]);
  for (const key of ["specialist", "requester", "admin"] as const) {
    if (!actors[key]) continue;
    const { error } = await service.auth.admin.deleteUser(actors[key].id);
    if (error) throw new Error(`cleanup: ${key} not deleted (${error.message})`);
  }
  await db.end();
}, 60_000);

describe("NFR-001 vendor isolation", () => {
  it("each vendor reads only its own vendor row and owners", async () => {
    for (const key of ["vendorA", "vendorB"] as const) {
      const { data: vendors } = await actors[key].client.from("vendor").select("id");
      expect(vendors?.map((v) => v.id)).toEqual([actors[key].vendorId]);
      const { data: owners } = await actors[key].client.from("vendor_owner").select("vendor_id");
      expect(new Set(owners?.map((o) => o.vendor_id))).toEqual(new Set([actors[key].vendorId]));
    }
  });

  it("a vendor reads no questionnaire points, no other attempts and no other applications", async () => {
    const { data: options } = await actors.vendorA.client.from("questionnaire_option").select("points");
    expect(options).toEqual([]);
    const { data: answers } = await actors.vendorA.client.from("questionnaire_answer").select("id");
    expect(answers).toEqual([]);
    const { data: responses } = await actors.vendorA.client.from("questionnaire_response").select("vendor_id");
    expect((responses ?? []).every((r) => r.vendor_id === actors.vendorA.vendorId)).toBe(true);
    const { data: apps } = await actors.vendorA.client.from("category_application").select("vendor_id");
    expect((apps ?? []).every((a) => a.vendor_id === actors.vendorA.vendorId)).toBe(true);
  });

  it("a vendor never sees a seeded vendor's certificates or brands (REG-06 AC10)", async () => {
    const { data: certs } = await actors.vendorA.client.from("vendor_certificate").select("id").in("vendor_id", [BETA, GAMMA]);
    expect(certs).toEqual([]);
    const { data: brands } = await actors.vendorA.client.from("vendor_brand").select("id").in("vendor_id", [BETA, GAMMA]);
    expect(brands).toEqual([]);
  });

  it("a Requester reads no vendor data; PS and Admin do", async () => {
    const { data: none } = await actors.requester.client.from("vendor").select("id");
    expect(none).toEqual([]);
    for (const key of ["specialist", "admin"] as const) {
      const { data } = await actors[key].client.from("vendor").select("id").in("id", [BETA, actors.vendorA.vendorId!]);
      expect(data?.length).toBe(2);
    }
  });

  it("users cannot write files, and a vendor cannot change its own status", async () => {
    const { error: fileError } = await actors.vendorA.client.from("file").insert({
      company_id: COMPANY_ID,
      owner_type: "vendor",
      owner_id: actors.vendorA.vendorId,
      file_name: "x.pdf",
      mime_type: "application/pdf",
      size_bytes: 1,
      storage_path: `rls/${RUN}/spoof`,
    });
    expect(fileError).not.toBeNull();
    const { error: statusError } = await actors.vendorA.client
      .from("vendor")
      .update({ status: "APPROVED" })
      .eq("id", actors.vendorA.vendorId!);
    expect(statusError).not.toBeNull();
  });
});

describe("REG-01 / REG-02 registration workflow", () => {
  it("REG-01 AC7: the tax number check finds an existing VÖEN", async () => {
    const { data: row } = await service.from("vendor").select("voen").eq("id", actors.vendorA.vendorId!).single();
    const { data } = await service.rpc("vendor_tax_number_taken", { p_voen: row!.voen, p_foreign_tax_number: null });
    expect(data).toBe(true);
  });

  it("the tax number check is not open to signed-in users", async () => {
    const { error } = await actors.vendorA.client.rpc("vendor_tax_number_taken", { p_voen: "1", p_foreign_tax_number: null });
    expect(error).not.toBeNull();
  });

  it("REG-01 AC1 / AC8: Submit needs the charter and, for a VAT payer, the VAT certificate", async () => {
    const { error: e1 } = await actors.vendorA.client.rpc("registration_submit");
    expect(e1?.message).toBe("errors.uploadCharter");
    await fileRow("vendor", actors.vendorA.vendorId!, "charter");
    const { error: e2 } = await actors.vendorA.client.rpc("registration_submit");
    expect(e2?.message).toBe("errors.uploadVatCertificate");
    await fileRow("vendor", actors.vendorA.vendorId!, "vat_certificate");
    const { error: e3 } = await actors.vendorA.client.rpc("registration_submit");
    expect(e3).toBeNull();
  });

  it("REG-01 AC10: SUBMITTED notifies every Procurement Specialist and is audited", async () => {
    expect(await notificationsFor(actors.specialist.id, "registration.submitted", actors.vendorA.vendorId!)).toHaveLength(1);
    const { rows } = await db.query(
      "select from_status, to_status from public.audit_entry where record_type = 'vendor' and record_id = $1 order by created_at",
      [actors.vendorA.vendorId],
    );
    expect(rows).toEqual([
      { from_status: null, to_status: "DRAFT" },
      { from_status: "DRAFT", to_status: "SUBMITTED" },
    ]);
  });

  it("after Submit the registration fields are read-only, the profile stays editable", async () => {
    const { error: locked } = await actors.vendorA.client
      .from("vendor")
      .update({ legal_name: "Changed" })
      .eq("id", actors.vendorA.vendorId!);
    expect(locked?.message).toBe("errors.registrationReadOnly");
    const { error: profile } = await actors.vendorA.client
      .from("vendor")
      .update({ main_activity: "DISTRIBUTOR" })
      .eq("id", actors.vendorA.vendorId!);
    expect(profile).toBeNull();
    const { error: owners } = await actors.vendorA.client.from("vendor_owner").delete().eq("vendor_id", actors.vendorA.vendorId!).select();
    const { data: still } = await service.from("vendor_owner").select("id").eq("vendor_id", actors.vendorA.vendorId!);
    expect(owners === null && still?.length).toBe(2);
  });

  it("REG-02: only a Procurement Specialist decides", async () => {
    const { error } = await actors.requester.client.rpc("registration_decide", {
      p_vendor: actors.vendorA.vendorId,
      p_decision: "APPROVE",
    });
    expect(error?.message).toBe("errors.noAccess");
  });

  it("REG-02 AC3 / AC4: Return needs a comment; the vendor resubmits and the comment stays in History", async () => {
    const { error: noComment } = await actors.specialist.client.rpc("registration_decide", {
      p_vendor: actors.vendorA.vendorId,
      p_decision: "RETURN",
      p_comment: " ",
    });
    expect(noComment?.message).toBe("errors.commentRequired");
    const { error } = await actors.specialist.client.rpc("registration_decide", {
      p_vendor: actors.vendorA.vendorId,
      p_decision: "RETURN",
      p_comment: "Charter is unreadable",
    });
    expect(error).toBeNull();
    expect(await notificationsFor(actors.vendorA.id, "registration.returned", actors.vendorA.vendorId!)).toHaveLength(1);

    const { error: resubmit } = await actors.vendorA.client.rpc("registration_submit");
    expect(resubmit).toBeNull();
    const { data: history } = await actors.vendorA.client
      .from("audit_entry")
      .select("to_status, reason")
      .eq("record_id", actors.vendorA.vendorId!)
      .order("created_at", { ascending: false });
    expect(history?.map((h) => h.to_status)).toEqual(["SUBMITTED", "RETURNED", "SUBMITTED", "DRAFT"]);
    expect(history?.[1].reason).toBe("Charter is unreadable");
  });

  it("a vendor cannot read another vendor's History (NFR-001)", async () => {
    const { data } = await actors.vendorB.client.from("audit_entry").select("id").eq("record_id", actors.vendorA.vendorId!);
    expect(data).toEqual([]);
  });

  it("REG-02 AC2: Approve sets APPROVED and standing ACTIVE (audited as vendor_standing)", async () => {
    const { error } = await actors.specialist.client.rpc("registration_decide", {
      p_vendor: actors.vendorA.vendorId,
      p_decision: "APPROVE",
    });
    expect(error).toBeNull();
    const { data } = await service.from("vendor").select("status, standing").eq("id", actors.vendorA.vendorId!).single();
    expect(data).toEqual({ status: "APPROVED", standing: "ACTIVE" });
    const { rows } = await db.query(
      "select to_status from public.audit_entry where record_type = 'vendor_standing' and record_id = $1",
      [actors.vendorA.vendorId],
    );
    expect(rows).toEqual([{ to_status: "ACTIVE" }]);
  });

  it("REG-02 AC5: Reject needs a reason and is final", async () => {
    await fileRow("vendor", actors.vendorB.vendorId!, "charter");
    await fileRow("vendor", actors.vendorB.vendorId!, "vat_certificate");
    await actors.vendorB.client.rpc("registration_submit");
    const { error: noReason } = await actors.specialist.client.rpc("registration_decide", {
      p_vendor: actors.vendorB.vendorId,
      p_decision: "REJECT",
    });
    expect(noReason?.message).toBe("errors.reasonRequired");
    // vendor B is approved for the questionnaire tests below; rejection is checked on a copy
    await db.query("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actors.specialist.id })]);
      await db.query("select public.registration_decide($1, 'REJECT', 'Fake documents')", [actors.vendorB.vendorId]);
      const { rows } = await db.query("select status from public.vendor where id = $1", [actors.vendorB.vendorId]);
      expect(rows[0].status).toBe("REJECTED");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actors.vendorB.id })]);
      await expect(db.query("select public.registration_submit()")).rejects.toThrow("errors.registrationReadOnly");
    } finally {
      await db.query("rollback");
    }
    const { error } = await actors.specialist.client.rpc("registration_decide", {
      p_vendor: actors.vendorB.vendorId,
      p_decision: "APPROVE",
    });
    expect(error).toBeNull();
  });
});

describe("REG-05 questionnaire and grade", () => {
  // Backlog Scenario A: Alpha Agro scores 78.0 -> B (weights 3,1,2,2,2,3,2,1,2,2).
  const ALPHA = [
    "More than 5 years", "More than 50", "3 or more", "Yes", "No",
    "Yes", "No formal control", "Rented warehouse", "Yes", "No",
  ];
  const LOWEST = [
    "Less than 1 year", "Fewer than 10", "None", "No", "No",
    "No", "No formal control", "None", "No", "Yes",
  ];
  let responseA = "";

  it("REG-02 AC6: no category application before a valid grade", async () => {
    const { error } = await actors.vendorA.client.rpc("category_apply", { p_category: CAT.fertilisers, p_application_id: randomUUID() });
    expect(error?.message).toBe("errors.questionnaireFirst");
  });

  it("AC2: the vendor sees questions and labels, never points", async () => {
    const { data, error } = await actors.vendorA.client.rpc("questionnaire_start");
    expect(error).toBeNull();
    responseA = data as string;
    const { data: rows } = await actors.vendorA.client.rpc("vendor_questionnaire", { p_response: responseA });
    expect((rows as unknown[]).length).toBe(10);
    expect(JSON.stringify(rows)).not.toContain("points");
    const { data: other } = await actors.vendorB.client.rpc("vendor_questionnaire", { p_response: responseA });
    expect(other).toEqual([]);
  });

  it("AC2: Submit needs every answer and the evidence files", async () => {
    const { error: incomplete } = await actors.vendorA.client.rpc("questionnaire_submit", { p_response: responseA });
    expect(incomplete?.message).toBe("errors.answerEveryQuestion");
    await answerAll(actors.vendorA.client, responseA, ALPHA);
    const { error: noEvidence } = await actors.vendorA.client.rpc("questionnaire_submit", { p_response: responseA });
    expect(noEvidence?.message).toBe("errors.attachEvidence");
    await attachEvidence(responseA);
    const { error } = await actors.vendorA.client.rpc("questionnaire_submit", { p_response: responseA });
    expect(error).toBeNull();
  });

  it("AC3: the score is 78.0 (Calculation Rules) and hidden from the vendor until GRADED", async () => {
    const { rows } = await db.query("select app.questionnaire_score($1)::text as s", [responseA]);
    expect(rows[0].s).toBe("78.0");
    const { data } = await actors.vendorA.client.from("questionnaire_response").select("score, grade").eq("id", responseA).single();
    expect(data).toEqual({ score: null, grade: null });
    expect(await notificationsFor(actors.specialist.id, "questionnaire.submitted", responseA)).toHaveLength(1);
  });

  it("AC4: points change only with a comment, within the question's maximum", async () => {
    const { rows } = await db.query(
      `select a.id from public.questionnaire_answer a where a.response_id = $1 and a.question_id = '00000000-0000-4000-8000-000000000605'`,
      [responseA],
    );
    const answerId = rows[0].id;
    const { error: noComment } = await actors.specialist.client.rpc("questionnaire_adjust", { p_answer: answerId, p_points: 10, p_comment: "" });
    expect(noComment?.message).toBe("errors.commentRequired");
    const { error: tooHigh } = await actors.specialist.client.rpc("questionnaire_adjust", { p_answer: answerId, p_points: 11, p_comment: "x" });
    expect(tooHigh?.message).toBe("errors.pointsOutOfRange");
    const { error: vendorTry } = await actors.vendorA.client.rpc("questionnaire_adjust", { p_answer: answerId, p_points: 10, p_comment: "x" });
    expect(vendorTry?.message).toBe("errors.noAccess");
    const { error } = await actors.specialist.client.rpc("questionnaire_adjust", {
      p_answer: answerId,
      p_points: 10,
      p_comment: "Bank letter attached later",
    });
    expect(error).toBeNull();
    const { rows: score } = await db.query("select app.questionnaire_score($1)::text as s", [responseA]);
    expect(score[0].s).toBe("88.0");
  });

  it("AC5: Confirm grade -> GRADED with grade A, valid 12 months, vendor notified with grade and score", async () => {
    const { error } = await actors.specialist.client.rpc("questionnaire_decide", { p_response: responseA, p_decision: "CONFIRM" });
    expect(error).toBeNull();
    const { data } = await actors.vendorA.client
      .from("questionnaire_response")
      .select("status, grade, score, valid_until")
      .eq("id", responseA)
      .single();
    const { rows } = await db.query("select ($1::date + interval '12 months')::date::text as d", [today]);
    expect(data).toEqual({ status: "GRADED", grade: "A", score: 88, valid_until: rows[0].d });
    const [note] = await notificationsFor(actors.vendorA.id, "questionnaire.graded", responseA);
    expect(note.params).toMatchObject({ grade: "A", score: 88 });
  });

  it("AC8: a valid grade blocks a new attempt until its last 30 days, then the new grade replaces it", async () => {
    const { error: blocked } = await actors.vendorA.client.rpc("questionnaire_start");
    expect(blocked?.message).toBe("errors.gradeStillValid");
    await db.query("begin");
    try {
      await db.query("update public.questionnaire_response set valid_until = app.today() + 30 where id = $1", [responseA]);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actors.vendorA.id })]);
      const { rows } = await db.query("select public.questionnaire_start() as id");
      expect(rows[0].id).toBeTruthy();
    } finally {
      await db.query("rollback");
    }
  });

  it("AC7: a second consecutive D puts the vendor on HOLD for 6 months and out of the AVL", async () => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const { data: id, error } = await actors.vendorB.client.rpc("questionnaire_start");
      expect(error).toBeNull();
      await answerAll(actors.vendorB.client, id as string, LOWEST);
      await attachEvidence(id as string);
      expect((await actors.vendorB.client.rpc("questionnaire_submit", { p_response: id })).error).toBeNull();
      expect((await actors.specialist.client.rpc("questionnaire_decide", { p_response: id, p_decision: "CONFIRM" })).error).toBeNull();
      const { data } = await service.from("questionnaire_response").select("grade").eq("id", id as string).single();
      expect(data?.grade).toBe("D");
    }
    const { data: v } = await service.from("vendor").select("standing, standing_until").eq("id", actors.vendorB.vendorId!).single();
    const { rows } = await db.query("select ($1::date + interval '6 months')::date::text as d", [today]);
    expect(v).toEqual({ standing: "HOLD", standing_until: rows[0].d });
    const { error } = await actors.vendorB.client.rpc("questionnaire_start");
    expect(error?.message).toBe("errors.vendorOnHold");
  });

  it("AC6: Return needs a comment", async () => {
    await db.query("begin");
    try {
      await db.query("update public.vendor set standing = 'ACTIVE', standing_until = null where id = $1", [actors.vendorB.vendorId]);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actors.vendorB.id })]);
      const { rows } = await db.query("select public.questionnaire_start() as id");
      await db.query("update public.questionnaire_response set status = 'SUBMITTED' where id = $1", [rows[0].id]);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actors.specialist.id })]);
      await expect(db.query("select public.questionnaire_decide($1, 'RETURN', '')", [rows[0].id])).rejects.toThrow(
        "errors.commentRequired",
      );
    } finally {
      await db.query("rollback");
    }
  });
});

describe("REG-03 / REG-04 categories and the AVL", () => {
  let applicationId = "";

  it("REG-03 AC2: a licence is required for Fertilisers and for its children", async () => {
    for (const category of [CAT.fertilisers, CAT.mineral]) {
      const { error } = await actors.vendorA.client.rpc("category_apply", { p_category: category, p_application_id: randomUUID() });
      expect(error?.message).toBe("errors.licenceRequired");
    }
  });

  it("REG-03 AC1: with the licence a PENDING application is created and specialists are notified", async () => {
    applicationId = randomUUID();
    await fileRow("category_application", applicationId, "licence");
    const { error } = await actors.vendorA.client.rpc("category_apply", { p_category: CAT.fertilisers, p_application_id: applicationId });
    expect(error).toBeNull();
    recordIds.push(applicationId);
    expect(await notificationsFor(actors.specialist.id, "category.applied", applicationId)).toHaveLength(1);
  });

  it("REG-03 AC3: a category with a PENDING application cannot be applied for again", async () => {
    const again = randomUUID();
    await fileRow("category_application", again, "licence");
    const { error } = await actors.vendorA.client.rpc("category_apply", { p_category: CAT.fertilisers, p_application_id: again });
    expect(error?.message).toBe("errors.alreadyApplied");
  });

  it("a vendor on HOLD (grade D) cannot apply", async () => {
    const { error } = await actors.vendorB.client.rpc("category_apply", { p_category: CAT.seeds, p_application_id: randomUUID() });
    expect(error?.message).toBe("errors.questionnaireFirst");
  });

  it("REG-04 AC2: Reject needs a reason", async () => {
    const { error } = await actors.specialist.client.rpc("category_decide", { p_application: applicationId, p_decision: "REJECT" });
    expect(error?.message).toBe("errors.reasonRequired");
  });

  it("REG-04 AC1: Qualify sets valid until + 12 months and notifies the vendor", async () => {
    const { error } = await actors.specialist.client.rpc("category_decide", { p_application: applicationId, p_decision: "QUALIFY" });
    expect(error).toBeNull();
    const { data } = await actors.vendorA.client.from("category_application").select("status, valid_until").eq("id", applicationId).single();
    const { rows } = await db.query("select ($1::date + interval '12 months')::date::text as d", [today]);
    expect(data).toEqual({ status: "QUALIFIED", valid_until: rows[0].d });
    expect(await notificationsFor(actors.vendorA.id, "category.qualified", applicationId)).toHaveLength(1);
  });

  it("MDM-02 AC3 / REG-04 AC4: a Fertilisers qualification covers its children, not the parent or siblings", async () => {
    const ids = async (category: string) =>
      (((await actors.specialist.client.rpc("avl_list", { p_category: category })).data ?? []) as { vendor_id: string }[]).map(
        (r) => r.vendor_id,
      );
    for (const child of [CAT.fertilisers, CAT.mineral, CAT.foliar]) {
      expect(await ids(child)).toEqual(expect.arrayContaining([actors.vendorA.vendorId, BETA, GAMMA]));
    }
    expect(await ids(CAT.agricultural)).not.toContain(actors.vendorA.vendorId);
    expect(await ids(CAT.seeds)).not.toContain(actors.vendorA.vendorId);
    expect(await ids(CAT.mineral)).not.toContain(actors.vendorB.vendorId); // HOLD, grade D
  });

  it("REG-04 AC3: a qualification past its date leaves the AVL at once and can be applied for again", async () => {
    await db.query("update public.category_application set valid_until = app.today() - 1 where id = $1", [applicationId]);
    const { data } = await actors.specialist.client.rpc("avl_list", { p_category: CAT.mineral });
    expect((data as { vendor_id: string }[]).map((r) => r.vendor_id)).not.toContain(actors.vendorA.vendorId);
    const again = randomUUID();
    await fileRow("category_application", again, "licence");
    const { error } = await actors.vendorA.client.rpc("category_apply", { p_category: CAT.fertilisers, p_application_id: again });
    expect(error).toBeNull();
    recordIds.push(again);
    const { data: old } = await service.from("category_application").select("status").eq("id", applicationId).single();
    expect(old?.status).toBe("EXPIRED");
  });

  it("the AVL is closed to Requesters, Committee-less roles and vendors", async () => {
    for (const key of ["requester", "vendorA"] as const) {
      const { data } = await actors[key].client.rpc("avl_list", { p_category: CAT.fertilisers });
      expect(data ?? []).toEqual([]);
    }
  });
});

describe("REG-06 profile, certificates and the vendor card", () => {
  it("AC8: vendors sharing an owner ID are flagged for internal users only", async () => {
    const { data } = await actors.specialist.client.rpc("vendor_shared_owners", { p_vendor: actors.vendorA.vendorId });
    expect((data as { vendor_id: string }[]).map((r) => r.vendor_id)).toEqual([actors.vendorB.vendorId]);
    const { data: seeded } = await actors.specialist.client.rpc("vendor_shared_owners", { p_vendor: BETA });
    expect((seeded as { legal_name: string }[]).map((r) => r.legal_name)).toEqual(["Gamma Supply LLC"]);
    const { data: forVendor } = await actors.vendorA.client.rpc("vendor_shared_owners", { p_vendor: actors.vendorA.vendorId });
    expect(forVendor).toEqual([]);
  });

  it("AC2: owner shares cannot exceed 100% in total", async () => {
    // Vendor B's owners already add up to 100% (60 + 40); one more share is refused.
    await db.query("begin");
    try {
      await db.query(
        "insert into public.vendor_owner (vendor_id, full_name, id_number, share_percent, role) values ($1, 'Extra', $2, 10, 'FOUNDER')",
        [actors.vendorB.vendorId, `X-${RUN}`],
      );
      await expect(db.query("set constraints all immediate")).rejects.toThrow("errors.sharesOver100");
    } finally {
      await db.query("rollback");
    }
  });

  it("AC1: owners can no longer be changed by the vendor once the registration is submitted", async () => {
    const { data } = await actors.vendorB.client
      .from("vendor_owner")
      .insert({ vendor_id: actors.vendorB.vendorId, full_name: "Late", id_number: `L-${RUN}`, share_percent: 1, role: "FOUNDER" })
      .select();
    expect(data ?? []).toEqual([]);
  });

  it("AC5: a certificate expiring within 30 days notifies the vendor and every specialist once", async () => {
    const { data, error } = await actors.vendorA.client
      .from("vendor_certificate")
      .insert({ vendor_id: actors.vendorA.vendorId, type: "ISO_9001", issued_on: "2024-01-01", expires_on: new Date(Date.parse(today) + 20 * 864e5).toISOString().slice(0, 10) })
      .select("id")
      .single();
    expect(error).toBeNull();
    await actors.vendorA.client.from("vendor_certificate").update({ number: "N-1" }).eq("id", data!.id);
    expect(await notificationsFor(actors.vendorA.id, "certificate.expiring", actors.vendorA.vendorId!)).toHaveLength(1);
    expect(await notificationsFor(actors.specialist.id, "certificate.expiring", actors.vendorA.vendorId!)).toHaveLength(1);
  });

  it("AC5: after the expiry date the daily job sends one 'expired' notice", async () => {
    await db.query(
      `insert into public.vendor_certificate (vendor_id, type, issued_on, expires_on, reminder_sent_at)
       values ($1, 'LICENCE', '2020-01-01', app.today() - 1, now())`,
      [actors.vendorA.vendorId],
    );
    await db.query("select app.run_daily_jobs()");
    await db.query("select app.run_daily_jobs()");
    expect(await notificationsFor(actors.vendorA.id, "certificate.expired", actors.vendorA.vendorId!)).toHaveLength(1);
  });

  it("AC3: brands up to the vendor; main goods limited to 20", async () => {
    const { error: brand } = await actors.vendorA.client.from("vendor_brand").insert({ vendor_id: actors.vendorA.vendorId, brand: "AgroMax", is_official_dealer: true });
    expect(brand).toBeNull();
    const { error: goods } = await actors.vendorA.client
      .from("vendor")
      .update({ main_goods: Array.from({ length: 21 }, (_, i) => `Item ${i}`) })
      .eq("id", actors.vendorA.vendorId!);
    expect(goods).not.toBeNull();
    const { error: spoof } = await actors.vendorB.client.from("vendor_brand").insert({ vendor_id: actors.vendorA.vendorId, brand: "Spoof" });
    expect(spoof).not.toBeNull();
  });
});

describe("Data model for later slices", () => {
  it("vendors and Requesters read none of the sealed procurement data", async () => {
    for (const table of ["sourcing", "proposal", "proposal_line", "decision", "minutes", "comparison_cost"]) {
      const { data } = await actors.vendorA.client.from(table).select("id").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("the voting period lives on the committee; the old setting key is gone", async () => {
    const { rows } = await db.query("select voting_period_days from public.committee where company_id = $1", [COMPANY_ID]);
    expect(rows).toEqual([{ voting_period_days: 3 }]);
    const { rows: setting } = await db.query("select 1 from public.setting where key = 'voting_period_days'");
    expect(setting).toEqual([]);
  });

  it("document numbers restart per year and are never reused", async () => {
    await db.query("begin");
    try {
      const a = (await db.query("select app.next_number($1, 'PR') as n", [COMPANY_ID])).rows[0].n;
      const b = (await db.query("select app.next_number($1, 'PR') as n", [COMPANY_ID])).rows[0].n;
      const m = (await db.query("select app.next_number($1, 'MIN') as n", [COMPANY_ID])).rows[0].n;
      expect(a).toMatch(/^PR-\d{4}-\d{4}$/);
      expect(Number(b.slice(-4))).toBe(Number(a.slice(-4)) + 1);
      expect(m).toMatch(/^MIN-\d{4}-\d{3}$/);
    } finally {
      await db.query("rollback");
    }
  });
});
