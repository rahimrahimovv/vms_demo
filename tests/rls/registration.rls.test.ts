/**
 * RLS and workflow tests for Slice 2b (REG-01 short form, REG-07 steps, REG-06 contact persons) against vms-dev.
 * Two throwaway company vendors (A and B), one throwaway individual (C) and a Procurement Specialist; everything
 * they create is removed afterwards. Seeded vendors are only read.
 */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { withAuditTriggerOff } from "./helpers/dev-cleanup";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const BETA = "00000000-0000-4000-8000-000000000502";
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Rls-${randomUUID()}`;

const service = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

type Actor = { id: string; email: string; client: SupabaseClient; vendorId?: string; contactId?: string };
const actors = {} as Record<"A" | "B" | "C" | "specialist", Actor>;

async function signIn(email: string) {
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

/** REG-01 through the same server function the Register page uses: only the short-form fields. */
async function register(key: "A" | "B" | "C", type: "LOCAL_COMPANY" | "INDIVIDUAL") {
  const email = `rls3-${key.toLowerCase()}-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const voen = `97${String(randomInt(0, 99_999_999)).padStart(8, "0")}`;
  const { data: vendorId, error: regError } = await service.rpc("register_vendor", {
    p_user_id: data.user.id,
    p_vendor: {
      vendor_type: type,
      legal_name: `RLS3 ${key} ${RUN}`,
      voen: type === "LOCAL_COMPANY" ? voen : null,
      id_card_number: type === "INDIVIDUAL" ? `ID-${RUN}` : null,
      country_code: "AZ",
      contact_person: `Contact ${key}`,
      contact_email: email,
      phone: "+994500000000",
    },
  });
  if (regError) throw regError;
  const { rows } = await db.query("select id from public.vendor_contact where vendor_id = $1 and is_primary", [vendorId]);
  actors[key] = { id: data.user.id, email, client: await signIn(email), vendorId, contactId: rows[0].id };
}

async function fileRow(ownerType: string, ownerId: string, kind: string) {
  await db.query(
    `insert into public.file (company_id, owner_type, owner_id, kind, file_name, mime_type, size_bytes, storage_path)
     values ($1, $2, $3, $4, 'test.pdf', 'application/pdf', 100, $5)`,
    [COMPANY_ID, ownerType, ownerId, kind, `rls/${RUN}/${randomUUID()}.pdf`],
  );
}

const account = (overrides: Record<string, unknown> = {}) => ({
  bank_name: "Test Bank",
  iban: "AZ00TEST0001",
  swift: "TESTAZ22",
  currency: "AZN",
  is_main: true,
  ...overrides,
});

beforeAll(async () => {
  await db.connect();
  const email = `rls3-specialist-${RUN}@rls.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await service.from("app_user").insert({ id: data.user.id, company_id: COMPANY_ID, full_name: "RLS3 specialist", email });
  await service.from("user_role").insert({ user_id: data.user.id, role: "PROCUREMENT_SPECIALIST" });
  actors.specialist = { id: data.user.id, email, client: await signIn(email) };
  await register("A", "LOCAL_COMPANY");
  await register("B", "LOCAL_COMPANY");
  await register("C", "INDIVIDUAL");
}, 60_000);

afterAll(async () => {
  const vendorIds = (["A", "B", "C"] as const).map((k) => actors[k]?.vendorId).filter(Boolean) as string[];
  await withAuditTriggerOff(db, async () => {
    await db.query("delete from public.audit_entry where record_id = any($1::uuid[])", [vendorIds]);
  });
  await db.query("delete from public.notification where record_id = any($1::uuid[])", [vendorIds]);
  await db.query("delete from public.file where storage_path like $1", [`rls/${RUN}/%`]);
  for (const key of ["A", "B", "C"] as const) if (actors[key]) await service.auth.admin.deleteUser(actors[key].id);
  if (vendorIds.length > 0) await db.query("delete from public.vendor where id = any($1::uuid[])", [vendorIds]);
  if (actors.specialist) await service.auth.admin.deleteUser(actors.specialist.id);
  await db.end();
}, 60_000);

describe("REG-01 AC6: the short account form", () => {
  it("creates a DRAFT vendor with the person from the form as the primary contact; no owners, no accounts", async () => {
    const { rows } = await db.query("select status from public.vendor where id = $1", [actors.A.vendorId]);
    expect(rows[0].status).toBe("DRAFT");
    const { data: contacts } = await actors.A.client.from("vendor_contact").select("full_name, is_primary, is_legal_representative");
    expect(contacts).toEqual([{ full_name: "Contact A", is_primary: true, is_legal_representative: false }]);
    expect((await actors.A.client.from("vendor_owner").select("id")).data).toEqual([]);
    expect((await actors.A.client.from("vendor_bank_account").select("id")).data).toEqual([]);
  });

  it("REG-01 AC8: a DRAFT account is never in the review queue (SUBMITTED only)", async () => {
    const { data } = await actors.specialist.client.from("vendor").select("id").eq("status", "SUBMITTED").eq("id", actors.A.vendorId!);
    expect(data).toEqual([]);
    const { data: drafts } = await actors.specialist.client.from("vendor").select("id").eq("status", "DRAFT").eq("id", actors.A.vendorId!);
    expect(drafts).toHaveLength(1); // "Incomplete registrations"
  });

  it("an ID card number already used by another vendor is refused (AC4)", async () => {
    const { data: taken } = await service.rpc("vendor_tax_number_taken", { p_voen: null, p_foreign_tax_number: null, p_id_card_number: `ID-${RUN}` });
    expect(taken).toBe(true);
    const { data: free } = await service.rpc("vendor_tax_number_taken", { p_voen: null, p_foreign_tax_number: null, p_id_card_number: `ID-none-${RUN}` });
    expect(free).toBe(false);
  });
});

describe("vendor_contact RLS with two vendors", () => {
  it("each vendor reads only its own contacts", async () => {
    for (const key of ["A", "B"] as const) {
      const { data } = await actors[key].client.from("vendor_contact").select("vendor_id");
      expect(new Set(data?.map((c) => c.vendor_id))).toEqual(new Set([actors[key].vendorId]));
    }
    const { data: other } = await actors.A.client.from("vendor_contact").select("id").eq("vendor_id", actors.B.vendorId!);
    expect(other).toEqual([]);
    const { data: seeded } = await actors.A.client.from("vendor_contact").select("id").eq("vendor_id", BETA);
    expect(seeded).toEqual([]);
  });

  it("the Procurement Specialist reads every vendor's contacts; anon reads none", async () => {
    const { data } = await actors.specialist.client.from("vendor_contact").select("vendor_id").in("vendor_id", [actors.A.vendorId!, actors.B.vendorId!, BETA]);
    expect(new Set(data?.map((c) => c.vendor_id))).toEqual(new Set([actors.A.vendorId, actors.B.vendorId, BETA]));
    const anon = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await anon.from("vendor_contact").select("id")).data ?? []).toEqual([]);
  });

  it("no direct writes: insert, update and delete are refused", async () => {
    const insert = await actors.A.client.from("vendor_contact").insert({ company_id: COMPANY_ID, vendor_id: actors.A.vendorId, full_name: "X", phone: "+994500000001", email: "x@rls.test" });
    expect(insert.error).not.toBeNull();
    const update = await actors.A.client.from("vendor_contact").update({ is_legal_representative: true }).eq("id", actors.A.contactId!).select();
    expect(update.data ?? []).toEqual([]);
    const del = await actors.A.client.from("vendor_contact").delete().eq("id", actors.A.contactId!).select();
    expect(del.data ?? []).toEqual([]);
  });

  it("a vendor cannot change another vendor's contact", async () => {
    const { error } = await actors.A.client.rpc("contact_save", {
      p_id: actors.B.contactId, p_full_name: "Hijack", p_position: "", p_phone: "+994500000002", p_email: "h@rls.test", p_legal: false,
    });
    expect(error?.message).toBe("errors.noAccess");
    expect((await actors.A.client.rpc("contact_delete", { p_id: actors.B.contactId })).error?.message).toBe("errors.noAccess");
  });
});

describe("proof-of-authority files", () => {
  it("only the owning vendor and internal users read a proof file", async () => {
    await fileRow("vendor_contact", actors.A.contactId!, "proof_of_authority");
    const read = async (key: "A" | "B" | "specialist") =>
      (await actors[key].client.from("file").select("id").eq("owner_id", actors.A.contactId!)).data ?? [];
    expect(await read("A")).toHaveLength(1);
    expect(await read("specialist")).toHaveLength(1);
    expect(await read("B")).toEqual([]);
    await db.query("delete from public.file where owner_id = $1", [actors.A.contactId]);
  });
});

describe("REG-07 AC4 contact persons", () => {
  it("ticking Legal representative needs a proof file: errors.proofRequired", async () => {
    const { error } = await actors.A.client.rpc("contact_save", {
      p_id: actors.A.contactId, p_full_name: "Contact A", p_position: "Director", p_phone: "+994500000000", p_email: actors.A.email, p_legal: true,
    });
    expect(error?.message).toBe("errors.proofRequired");
  });

  it("with a proof file the person is saved as legal representative; an extra contact can be added and removed", async () => {
    const { error } = await actors.A.client.rpc("contact_save", {
      p_id: actors.A.contactId, p_full_name: "Contact A", p_position: "Director", p_phone: "+994500000000", p_email: actors.A.email, p_legal: true, p_proof_incoming: true,
    });
    expect(error).toBeNull();
    await fileRow("vendor_contact", actors.A.contactId!, "proof_of_authority");
    const { data: second, error: addError } = await actors.A.client.rpc("contact_save", {
      p_id: null, p_full_name: "Second Person", p_position: "Accountant", p_phone: "+994500000003", p_email: "second@rls.test", p_legal: false,
    });
    expect(addError).toBeNull();
    expect((await actors.A.client.from("vendor_contact").select("id")).data).toHaveLength(2);
    expect((await actors.A.client.rpc("contact_delete", { p_id: second })).error).toBeNull();
    expect((await actors.A.client.from("vendor_contact").select("id")).data).toHaveLength(1);
  });

  it("the primary contact cannot be removed; phone and e-mail are checked", async () => {
    expect((await actors.A.client.rpc("contact_delete", { p_id: actors.A.contactId })).error?.message).toBe("errors.noAccess");
    const bad = await actors.A.client.rpc("contact_save", {
      p_id: null, p_full_name: "Bad", p_position: "", p_phone: "12345", p_email: "bad@rls.test", p_legal: false,
    });
    expect(bad.error?.message).toBe("errors.phoneFormat");
  });

  it("editing the primary contact keeps the sign-in e-mail (vendor.contact_email) and syncs name and phone", async () => {
    const { error } = await actors.A.client.rpc("contact_save", {
      p_id: actors.A.contactId, p_full_name: "Contact A Renamed", p_position: "Director", p_phone: "+994500000009", p_email: "changed@rls.test", p_legal: true,
    });
    expect(error).toBeNull();
    const { rows } = await db.query("select contact_person, phone, contact_email from public.vendor where id = $1", [actors.A.vendorId]);
    expect(rows[0]).toEqual({ contact_person: "Contact A Renamed", phone: "+994500000009", contact_email: actors.A.email });
  });
});

describe("REG-07 AC5, AC8 bank accounts while DRAFT", () => {
  it("the list may be empty or without a main account; two main accounts are refused", async () => {
    expect((await actors.B.client.rpc("registration_bank_save", { p_accounts: [] })).error).toBeNull();
    expect((await actors.B.client.rpc("registration_bank_save", { p_accounts: [account({ is_main: false })] })).error).toBeNull();
    const two = [account(), account({ iban: "AZ00TEST0002" })];
    expect((await actors.B.client.rpc("registration_bank_save", { p_accounts: two })).error?.message).toBe("errors.mainAccountOne");
    expect((await actors.B.client.rpc("registration_bank_save", { p_accounts: [account({ iban: "bad iban!" })] })).error?.message).toBe("errors.ibanFormat");
    expect((await actors.B.client.rpc("registration_bank_save", { p_accounts: [account()] })).error).toBeNull();
    expect((await actors.B.client.from("vendor_bank_account").select("iban")).data).toEqual([{ iban: "AZ00TEST0001" }]);
  });

  it("another vendor's accounts are untouched", async () => {
    expect((await actors.A.client.from("vendor_bank_account").select("id")).data).toEqual([]);
  });
});

describe("REG-07 AC9 Submit", () => {
  it("lists what is missing, step by step, and nothing is submitted", async () => {
    const submit = async () => (await actors.A.client.rpc("registration_submit")).error?.message;
    expect(await submit()).toBe("errors.required"); // company details
    const { error } = await actors.A.client.from("vendor").update({
      legal_address: "Test street 1", director_name: "Test Director", is_vat_payer: false, founded_on: "2015-05-01",
    }).eq("id", actors.A.vendorId!);
    expect(error).toBeNull();
    expect(await submit()).toBe("errors.headOwnerRequired"); // owners
    await actors.A.client.from("vendor_owner").insert({ vendor_id: actors.A.vendorId, full_name: "Head", id_number: `H-${RUN}`, share_percent: 100, role: "HEAD" });
    expect(await submit()).toBe("errors.bankAccountRequired");
    expect((await actors.A.client.rpc("registration_bank_save", { p_accounts: [account()] })).error).toBeNull();
    expect(await submit()).toBe("errors.uploadCharter");
    await fileRow("vendor", actors.A.vendorId!, "charter");
    const { rows } = await db.query("select status from public.vendor where id = $1", [actors.A.vendorId]);
    expect(rows[0].status).toBe("DRAFT");
  });

  it("a company without a legal representative with a proof file cannot submit", async () => {
    // vendor B is complete except for the contact rule
    await actors.B.client.from("vendor").update({ legal_address: "Test street 2", director_name: "Dir", is_vat_payer: false, founded_on: "2015-05-01" }).eq("id", actors.B.vendorId!);
    await actors.B.client.from("vendor_owner").insert({ vendor_id: actors.B.vendorId, full_name: "Head", id_number: `HB-${RUN}`, share_percent: 100, role: "HEAD" });
    await fileRow("vendor", actors.B.vendorId!, "charter");
    expect((await actors.B.client.rpc("registration_submit")).error?.message).toBe("errors.legalRepresentativeRequired");
    // a legal representative flag without the proof file does not count either
    await db.query("update public.vendor_contact set is_legal_representative = true where id = $1", [actors.B.contactId]);
    expect((await actors.B.client.rpc("registration_submit")).error?.message).toBe("errors.legalRepresentativeRequired");
  });

  it("with a legal representative and proof file it submits, notifies the specialist and turns read-only", async () => {
    const { error } = await actors.A.client.rpc("registration_submit");
    expect(error).toBeNull();
    const { rows } = await db.query("select status from public.vendor where id = $1", [actors.A.vendorId]);
    expect(rows[0].status).toBe("SUBMITTED");
    const { rows: notes } = await db.query("select 1 from public.notification where user_id = $1 and event = 'registration.submitted' and record_id = $2", [actors.specialist.id, actors.A.vendorId]);
    expect(notes).toHaveLength(1);
    const { data: queue } = await actors.specialist.client.from("vendor").select("id").eq("status", "SUBMITTED").eq("id", actors.A.vendorId!);
    expect(queue).toHaveLength(1);
    expect((await actors.A.client.rpc("contact_save", { p_id: null, p_full_name: "Late", p_position: "", p_phone: "+994500000004", p_email: "late@rls.test", p_legal: false })).error?.message).toBe("errors.registrationReadOnly");
    expect((await actors.A.client.rpc("registration_bank_save", { p_accounts: [account()] })).error?.message).toBe("errors.registrationReadOnly");
  });

  it("the Individual exception: only the main contact, no owners, no legal representative", async () => {
    const submit = async () => (await actors.C.client.rpc("registration_submit")).error?.message;
    expect(await submit()).toBe("errors.bankAccountRequired");
    expect((await actors.C.client.rpc("registration_bank_save", { p_accounts: [account()] })).error).toBeNull();
    expect(await submit()).toBe("errors.uploadIdCard");
    await fileRow("vendor", actors.C.vendorId!, "id_card");
    expect(await submit()).toBeUndefined();
  });
});

describe("REG-06 AC3 after approval", () => {
  it("approval; then the vendor must keep one legal representative with a proof file", async () => {
    const { error } = await actors.specialist.client.rpc("registration_decide", { p_vendor: actors.A.vendorId, p_decision: "APPROVE" });
    expect(error).toBeNull();
    const add = await actors.A.client.rpc("contact_save", { p_id: null, p_full_name: "Deputy", p_position: "Deputy", p_phone: "+994500000005", p_email: "deputy@rls.test", p_legal: true });
    expect(add.error?.message).toBe("errors.proofRequired");
    // the only legal representative cannot be unticked
    const untick = await actors.A.client.rpc("contact_save", { p_id: actors.A.contactId, p_full_name: "Contact A Renamed", p_position: "Director", p_phone: "+994500000009", p_email: actors.A.email, p_legal: false });
    expect(untick.error?.message).toBe("errors.keepLegalRepresentative");
    const { rows } = await db.query("select is_legal_representative from public.vendor_contact where id = $1", [actors.A.contactId]);
    expect(rows[0].is_legal_representative).toBe(true);
  });

  it("a second legal representative with a proof lets the first one go; a plain contact can be added and removed", async () => {
    const { data: deputy, error } = await actors.A.client.rpc("contact_save", {
      p_id: null, p_full_name: "Deputy", p_position: "Deputy", p_phone: "+994500000005", p_email: "deputy@rls.test", p_legal: true, p_proof_incoming: true,
    });
    expect(error).toBeNull();
    await fileRow("vendor_contact", deputy, "proof_of_authority");
    const untick = await actors.A.client.rpc("contact_save", { p_id: actors.A.contactId, p_full_name: "Contact A Renamed", p_position: "Director", p_phone: "+994500000009", p_email: actors.A.email, p_legal: false });
    expect(untick.error).toBeNull();
    // the deputy is now the last one
    expect((await actors.A.client.rpc("contact_delete", { p_id: deputy })).error?.message).toBe("errors.keepLegalRepresentative");
    expect((await actors.A.client.from("vendor_contact").select("id")).data).toHaveLength(2);
  });

  it("the strict bank rule applies again after approval: the last account cannot be removed", async () => {
    expect((await actors.A.client.rpc("bank_accounts_save", { p_accounts: [] })).error?.message).toBe("errors.bankAccountRequired");
  });
});
