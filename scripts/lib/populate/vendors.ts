// DEMO-03: the 15 vendors of the Populated Data Catalogue. Each one walks the real registration path as its own user
// (short form, company details, owners, bank accounts, contact and proof of authority, documents, submit), the Specialist
// decides, and the questionnaire, the category applications and the certificates follow the app's own functions.
import { randomUUID } from "node:crypto";
import { requiredKinds } from "../../../src/lib/vendors/steps";
import { CAT, EMAIL, as, attach, backdate, bakuDate, call, userId, type VendorRef, type World } from "./world";

type Owner = { name: string; id: string; share: number; role: "HEAD" | "FOUNDER" | "SHAREHOLDER" };
type Bank = { bank: string; iban: string; swift: string; currency: string; main: boolean };
export type Grade = "A" | "B" | "C" | "D";
type CatKey = keyof typeof CAT;
type Cert = { type: string; number: string; issuer: string; issuedDaysAgo: number; expiresInDays: number | null };

export type VendorSpec = {
  key: string;
  type: "LOCAL_COMPANY" | "FOREIGN_COMPANY" | "INDIVIDUAL";
  legalName: string;
  tax: string; // VÖEN (local), foreign tax number, or ID card number of the sole trader
  voen?: string; // a sole trader also has a VÖEN, entered in the company step
  country: string;
  email: string;
  contact: string;
  position: string;
  phone: string;
  address: string;
  director?: string;
  vat?: boolean;
  founded: string;
  owners: Owner[];
  bank: Bank[];
  /** how far the registration got */
  stop: "DRAFT_AFTER_OWNERS" | "SUBMITTED" | "RETURNED" | "REJECTED" | "APPROVED";
  comment?: string;
  /** questionnaire: graded A to D, or only submitted */
  grade?: Grade | "SUBMITTED_ONLY";
  qualified?: CatKey[];
  pending?: CatKey[];
  certificates?: Cert[];
  /** days the whole vendor story is moved into the past */
  shift: number;
};

const az = (n: string) => `AZ21DEMO${n.padStart(20, "0")}`;
const ownerOf = (name: string, id: string, share: number, role: Owner["role"] = "HEAD"): Owner => ({ name, id, share, role });
const bankAz = (bank: string, n: string, main = true): Bank => ({ bank, iban: az(n), swift: "DEMOAZ22", currency: "AZN", main });

export const VENDORS: VendorSpec[] = [
  {
    key: "delta", type: "LOCAL_COMPANY", legalName: "Shirvan Seeds MMC", tax: "1700400011", country: "AZ", email: "info@shirvan-seeds.test",
    contact: "Farid Hasanov", position: "Director", phone: "+994501110004", address: "Demo avenue 14, Shamakhi", director: "Farid Hasanov",
    vat: true, founded: "2012-03-12", owners: [ownerOf("Farid Hasanov", "AZE-DEMO-1004", 60), ownerOf("Gunel Hasanova", "AZE-DEMO-1005", 40, "FOUNDER")],
    bank: [bankAz("Demo Bank Azerbaijan", "4001")], stop: "APPROVED", grade: "A", qualified: ["seeds", "plantProtection", "irrigation"], shift: 78,
  },
  {
    key: "epsilon", type: "FOREIGN_COMPANY", legalName: "Rheinland Landtechnik GmbH", tax: "DE-DEMO-0000005", country: "DE", email: "vertrieb@rheinland-landtechnik.test",
    contact: "Jonas Keller", position: "Sales manager", phone: "+4915100000005", address: "Demo Strasse 5, Cologne, Germany", founded: "2005-09-01",
    owners: [ownerOf("Jonas Keller", "DE-ID-DEMO-5001", 55), ownerOf("Marta Keller", "DE-ID-DEMO-5002", 45, "SHAREHOLDER")],
    bank: [{ bank: "Demo Rhein Bank", iban: "DE00DEMO000000000000005", swift: "DEMODEFF", currency: "EUR", main: true }],
    stop: "APPROVED", grade: "B", qualified: ["spareParts", "irrigation", "plantProtection"], shift: 74,
  },
  {
    key: "zeta", type: "LOCAL_COMPANY", legalName: "Mugan Irrigation Systems MMC", tax: "1700400017", country: "AZ", email: "office@mugan-irrigation.test",
    contact: "Kamran Aliyev", position: "Director", phone: "+994501110006", address: "Demo road 6, Sabirabad", director: "Kamran Aliyev", vat: true,
    founded: "2015-06-20", owners: [ownerOf("Kamran Aliyev", "AZE-DEMO-1006", 100)], bank: [bankAz("Demo Bank Azerbaijan", "4002")],
    stop: "APPROVED", grade: "B", qualified: ["irrigation", "spareParts"], shift: 60, // special path: the Irrigation qualification lapses (see buildZeta)
  },
  {
    key: "eta", type: "LOCAL_COMPANY", legalName: "Gobustan Plant Protection MMC", tax: "1700400023", country: "AZ", email: "sales@gobustan-pp.test",
    contact: "Ilaha Gasimova", position: "Director", phone: "+994501110007", address: "Demo lane 7, Gobustan", director: "Ilaha Gasimova", vat: true,
    founded: "2014-02-10", owners: [ownerOf("Ilaha Gasimova", "AZE-DEMO-1007", 70), ownerOf("Vugar Gasimov", "AZE-DEMO-1008", 30, "SHAREHOLDER")],
    bank: [bankAz("Demo Bank Azerbaijan", "4003")], stop: "APPROVED", grade: "C", qualified: ["fertilisers", "plantProtection", "spareParts"], shift: 66,
    certificates: [
      { type: "ISO_9001", number: "DEMO-QMS-0007", issuer: "Demo Certification Body", issuedDaysAgo: 353, expiresInDays: 12 },
      { type: "LICENCE", number: "DEMO-LIC-0007", issuer: "Demo Agriculture Agency", issuedDaysAgo: 200, expiresInDays: null },
    ],
  },
  {
    key: "theta", type: "INDIVIDUAL", legalName: "Elvin Mammadov (sole trader)", tax: "AZE-DEMO-IC-2901", voen: "1700400029", country: "AZ", email: "elvin.mammadov@demo-vendor.test",
    contact: "Elvin Mammadov", position: "Owner", phone: "+994501110008", address: "", founded: "2020-01-15", owners: [],
    bank: [bankAz("Demo Bank Azerbaijan", "4004")], stop: "APPROVED", grade: "SUBMITTED_ONLY", shift: 20,
  },
  {
    key: "pi", type: "LOCAL_COMPANY", legalName: "Absheron Agro Trade MMC", tax: "1700400035", country: "AZ", email: "trade@absheron-agro.test",
    contact: "Rena Ismayilova", position: "Director", phone: "+994501110009", address: "Demo street 9, Khirdalan", director: "Rena Ismayilova", vat: false,
    founded: "2017-11-05", owners: [ownerOf("Rena Ismayilova", "AZE-DEMO-1009", 100)], bank: [bankAz("Demo Bank Azerbaijan", "4005")],
    stop: "APPROVED", grade: "B", qualified: ["seeds", "irrigation"], pending: ["plantProtection", "spareParts"], shift: 55,
    certificates: [{ type: "ISO_14001", number: "DEMO-EMS-0009", issuer: "Demo Certification Body", issuedDaysAgo: 800, expiresInDays: -20 }],
  },
  {
    key: "iota", type: "LOCAL_COMPANY", legalName: "Baku Pack Industry MMC", tax: "1700400041", country: "AZ", email: "info@baku-pack.test",
    contact: "Tofig Rustamov", position: "Director", phone: "+994501110010", address: "Demo zone 10, Baku", director: "Tofig Rustamov", vat: true,
    founded: "2016-08-18", owners: [ownerOf("Tofig Rustamov", "AZE-DEMO-1010", 100)], bank: [bankAz("Demo Bank Azerbaijan", "4006")],
    stop: "SUBMITTED", shift: 3,
  },
  {
    key: "kappa", type: "LOCAL_COMPANY", legalName: "Ganja Fertilizer Trading MMC", tax: "1700400047", country: "AZ", email: "office@ganja-fertilizer.test",
    contact: "Aysel Nasirova", position: "Director", phone: "+994501110011", address: "Demo avenue 11, Ganja", director: "Aysel Nasirova", vat: true,
    founded: "2019-04-22", owners: [ownerOf("Aysel Nasirova", "AZE-DEMO-1011", 50), ownerOf("Rauf Mammadov", "AZE-DEMO-0001", 50, "SHAREHOLDER")],
    bank: [bankAz("Demo Bank Azerbaijan", "4007")], stop: "SUBMITTED", shift: 2,
  },
  {
    key: "lambda", type: "FOREIGN_COMPANY", legalName: "Bursa Alet Makina Ltd. Sti.", tax: "TR-DEMO-0000012", country: "TR", email: "satis@bursa-alet.test",
    contact: "Mehmet Yilmaz", position: "Sales director", phone: "+905550000012", address: "Demo Cad. 12, Bursa, Türkiye", founded: "2010-10-10",
    owners: [ownerOf("Mehmet Yilmaz", "TR-ID-DEMO-1201", 100)],
    bank: [{ bank: "Demo Bank Türkiye", iban: "TR000000000000000000000012", swift: "DEMOTRIS", currency: "USD", main: true }],
    stop: "SUBMITTED", shift: 1,
  },
  {
    key: "mu", type: "LOCAL_COMPANY", legalName: "Lankaran Trade Group MMC", tax: "1700400053", country: "AZ", email: "contact@lankaran-trade.test",
    contact: "Samir Abdullayev", position: "Director", phone: "+994501110013", address: "Demo street 13, Lankaran", director: "Samir Abdullayev", vat: true,
    founded: "2018-05-30", owners: [ownerOf("Samir Abdullayev", "AZE-DEMO-1013", 100)], bank: [bankAz("Demo Bank Azerbaijan", "4008")],
    stop: "RETURNED", comment: "The charter scan is not readable. Please upload a clear copy and check the VAT certificate.", shift: 6,
  },
  {
    key: "nu", type: "LOCAL_COMPANY", legalName: "Sumgait Technical Services MMC", tax: "1700400059", country: "AZ", email: "info@sumgait-tech.test",
    contact: "Nijat Safarov", position: "Director", phone: "+994501110014", address: "Demo block 14, Sumgait", director: "Nijat Safarov", vat: true,
    founded: "2021-09-09", owners: [ownerOf("Nijat Safarov", "AZE-DEMO-1014", 100)], bank: [bankAz("Demo Bank Azerbaijan", "4009")],
    stop: "REJECTED", comment: "The company was founded less than two years ago and cannot show comparable supply contracts.", shift: 9,
  },
  {
    key: "xi", type: "LOCAL_COMPANY", legalName: "Mingachevir Components MMC", tax: "1700400065", country: "AZ", email: "hello@mingachevir-components.test",
    contact: "Leyla Karimli", position: "Director", phone: "+994501110015", address: "Demo road 15, Mingachevir", director: "Leyla Karimli", vat: true,
    founded: "2022-12-01", owners: [ownerOf("Leyla Karimli", "AZE-DEMO-1015", 100)], bank: [], stop: "DRAFT_AFTER_OWNERS", shift: 1,
  },
  {
    key: "omicron", type: "LOCAL_COMPANY", legalName: "Zaqatala Supply MMC", tax: "1700400071", country: "AZ", email: "supply@zaqatala-supply.test",
    contact: "Orkhan Jafarov", position: "Director", phone: "+994501110016", address: "Demo lane 16, Zaqatala", director: "Orkhan Jafarov", vat: false,
    founded: "2016-07-07", owners: [ownerOf("Orkhan Jafarov", "AZE-DEMO-1016", 100)], bank: [bankAz("Demo Bank Azerbaijan", "4010")],
    stop: "APPROVED", grade: "D", shift: 60, // graded D twice (see buildOmicron)
  },
];

/** The two seed vendors (base seed) get more qualified categories through their own logins. */
export const SEED_VENDORS = [
  { key: "beta", id: "00000000-0000-4000-8000-000000000502", email: "sales@beta-trade.test", qualified: ["seeds", "irrigation"] as CatKey[], shift: 90 },
  { key: "gamma", id: "00000000-0000-4000-8000-000000000503", email: "office@gamma-supply.test", qualified: ["seeds", "spareParts"] as CatKey[], shift: 88 },
];

// target points per question (sort_order 1..10); totals 90.0 (A), 73.0 (B), 58.5 (C), 26.5 (D) with the seeded weights
const POINTS: Record<Grade, number[]> = {
  A: [10, 10, 10, 10, 0, 10, 10, 10, 10, 10],
  B: [7, 7, 6, 10, 0, 10, 5, 6, 10, 10],
  C: [4, 7, 6, 0, 0, 10, 5, 6, 10, 10],
  D: [0, 3, 0, 0, 0, 0, 5, 0, 10, 10],
};

const specialist = EMAIL.specialist;

/** What the short account form sends to register_vendor: the app builds the same object with toAccountColumns (src/lib/vendors/validate.ts). */
export function accountColumns(s: VendorSpec) {
  return {
    vendor_type: s.type,
    legal_name: s.legalName,
    voen: s.type === "LOCAL_COMPANY" ? s.tax : null,
    foreign_tax_number: s.type === "FOREIGN_COMPANY" ? s.tax : null,
    country_code: s.type === "FOREIGN_COMPANY" ? s.country : "AZ",
    id_card_number: s.type === "INDIVIDUAL" ? s.tax : null,
    contact_person: s.contact,
    phone: s.phone,
    contact_email: s.email,
  };
}

export async function register(w: World, s: VendorSpec): Promise<VendorRef> {
  const password = w.password;
  const { data: created, error } = await w.admin.auth.admin.createUser({ email: s.email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`createUser ${s.email}: ${error?.message}`);
  const p_vendor = accountColumns(s);
  const { data: vendorId, error: regError } = await w.admin.rpc("register_vendor", { p_user_id: created.user.id, p_vendor });
  if (regError || !vendorId) {
    await w.admin.auth.admin.deleteUser(created.user.id);
    throw new Error(`register_vendor ${s.legalName}: ${regError?.message}`);
  }
  const ref = { id: vendorId as string, email: s.email, userId: created.user.id, legalName: s.legalName };
  w.vendors.set(s.key, ref);
  return ref;
}

/** Company details, owners, bank accounts, contact with proof, documents: the steps of REG-07, as the vendor. */
export async function fillSteps(w: World, s: VendorSpec, v: VendorRef, upTo: "owners" | "all"): Promise<void> {
  const vs = await as(w, s.email);
  const individual = s.type === "INDIVIDUAL";
  const update = individual
    ? { voen: s.voen ?? null }
    : { legal_address: s.address, director_name: s.type === "LOCAL_COMPANY" ? s.director ?? null : null,
        is_vat_payer: s.type === "LOCAL_COMPANY" ? Boolean(s.vat) : null, founded_on: s.founded };

  const u = await vs.from("vendor").update(update).eq("id", v.id);
  if (u.error) throw new Error(`company step of ${s.legalName}: ${u.error.message}`);

  if (!individual) {
    const rows = s.owners.map((o) => ({ vendor_id: v.id, full_name: o.name, id_number: o.id, share_percent: o.share, role: o.role }));
    const r = await vs.from("vendor_owner").insert(rows);
    if (r.error) throw new Error(`owners of ${s.legalName}: ${r.error.message}`);
  }
  if (upTo === "owners") return;

  if (s.bank.length > 0) {
    const accounts = s.bank.map((b) => ({ bank_name: b.bank, iban: b.iban, swift: b.swift, currency: b.currency, is_main: b.main }));
    await call(w, s.email, "registration_bank_save", { p_accounts: accounts });
  }
  const { data: contact } = await vs.from("vendor_contact").select("id").eq("vendor_id", v.id).eq("is_primary", true).single();
  if (!individual) {
    const contactId = await call<string>(w, s.email, "contact_save", {
      p_id: contact!.id, p_full_name: s.contact, p_position: s.position, p_phone: s.phone, p_email: s.email, p_legal: true, p_proof_incoming: true,
    });
    await attach(w, { type: "vendor_contact", id: contactId }, "proof_of_authority", "power-of-attorney.pdf", v.userId, `Proof of authority of ${s.legalName}`);
    await call(w, s.email, "contact_check");
  }
  await Promise.all(
    requiredKinds(s.type, s.vat === true).map((kind) =>
      attach(w, { type: "vendor", id: v.id }, kind as "charter", `${kind.replace(/_/g, "-")}.pdf`, v.userId, s.legalName),
    ),
  );
}

export async function decide(w: World, v: VendorRef, decision: "APPROVE" | "RETURN" | "REJECT", comment: string | null = null): Promise<void> {
  await call(w, specialist, "registration_decide", { p_vendor: v.id, p_decision: decision, p_comment: comment });
}

/** One attempt: start, answer with the points of the grade, evidence where required, submit. Returns the response id. */
export async function fillQuestionnaire(w: World, s: VendorSpec, v: VendorRef, grade: Grade): Promise<string> {
  const responseId = await call<string>(w, s.email, "questionnaire_start");
  const rows = await call<{ answer_id: string; question_id: string; evidence_required: boolean; sort_order: number }[]>(
    w, s.email, "vendor_questionnaire", { p_response: responseId });
  const { rows: options } = await w.db.query("select id, question_id, points from public.questionnaire_option");
  const answers = rows.map((r, i) => {
    const target = POINTS[grade][i];
    const option = options.find((o) => o.question_id === r.question_id && o.points === target);
    if (!option) throw new Error(`no option with ${target} points for question ${i + 1}`);
    return { questionId: r.question_id, optionId: option.id as string };
  });
  await call(w, s.email, "questionnaire_save", { p_response: responseId, p_answers: answers });
  await Promise.all(
    rows
      .filter((x) => x.evidence_required)
      .map((r) =>
        attach(w, { type: "questionnaire_answer", id: r.answer_id }, "attachment", "evidence.pdf", v.userId, `Evidence of ${s.legalName}`),
      ),
  );
  await call(w, s.email, "questionnaire_submit", { p_response: responseId });
  return responseId;
}

export async function gradeVendor(w: World, s: VendorSpec, v: VendorRef, grade: Grade): Promise<void> {
  const id = await fillQuestionnaire(w, s, v, grade);
  await call(w, specialist, "questionnaire_decide", { p_response: id, p_decision: "CONFIRM", p_comment: null });
}

export async function applyFor(w: World, email: string, userUuid: string, category: CatKey, qualify: boolean): Promise<void> {
  const applicationId = randomUUID();
  if (category === "fertilisers") await attach(w, { type: "category_application", id: applicationId }, "licence", "licence.pdf", userUuid, "Fertiliser trading licence");
  await call(w, email, "category_apply", { p_category: CAT[category], p_application_id: applicationId });
  if (qualify) await call(w, specialist, "category_decide", { p_application: applicationId, p_decision: "QUALIFY", p_reason: null });
}

export async function addCertificates(w: World, s: VendorSpec, v: VendorRef): Promise<void> {
  const vs = await as(w, s.email);
  for (const c of s.certificates ?? []) {
    const { data, error } = await vs.from("vendor_certificate").insert({
      vendor_id: v.id, type: c.type, number: c.number, issuer: c.issuer,
      issued_on: bakuDate(-c.issuedDaysAgo), expires_on: c.expiresInDays === null ? null : bakuDate(c.expiresInDays),
    }).select("id").single();
    if (error) throw new Error(`certificate of ${s.legalName}: ${error.message}`);
    await attach(w, { type: "vendor_certificate", id: data.id }, "attachment", `${c.type.toLowerCase()}.pdf`, v.userId, c.type);
    await call(w, s.email, "profile_log", { p_section: "CERTIFICATES" });
  }
}

/** Builds one vendor in the state the catalogue asks for, then moves its story into the past. */
export async function buildVendor(w: World, s: VendorSpec): Promise<void> {
  const v = await register(w, s);
  if (s.stop === "DRAFT_AFTER_OWNERS") {
    await fillSteps(w, s, v, "owners");
    await backdate(w, "vendor", v.id, s.shift);
    return;
  }
  await fillSteps(w, s, v, "all");
  await call(w, s.email, "registration_submit");
  if (s.stop === "RETURNED") await decide(w, v, "RETURN", s.comment!);
  else if (s.stop === "REJECTED") await decide(w, v, "REJECT", s.comment!);
  else if (s.stop === "APPROVED") await decide(w, v, "APPROVE");

  if (s.stop === "APPROVED" && s.grade) {
    if (s.key === "zeta") return void (await buildZeta(w, s, v));
    if (s.key === "omicron") return void (await buildOmicron(w, s, v));
    if (s.grade === "SUBMITTED_ONLY") await fillQuestionnaire(w, s, v, "B");
    else {
      await gradeVendor(w, s, v, s.grade);
      for (const c of s.qualified ?? []) await applyFor(w, s.email, v.userId, c, true);
      for (const c of s.pending ?? []) await applyFor(w, s.email, v.userId, c, false);
    }
    await addCertificates(w, s, v);
  }
  await backdate(w, "vendor", v.id, s.shift);
}

/** Zeta: Irrigation qualified long ago and lapsed (the daily job expires it with its own audit entry); Spare parts qualified again. */
async function buildZeta(w: World, s: VendorSpec, v: VendorRef): Promise<void> {
  await gradeVendor(w, s, v, "B");
  await applyFor(w, s.email, v.userId, "irrigation", true);
  await backdate(w, "vendor", v.id, 430);
  await w.db.query("select app.run_daily_jobs()");
  await gradeVendor(w, s, v, "B"); // the first grade has lapsed too: a new attempt is allowed
  await applyFor(w, s.email, v.userId, "spareParts", true);
  await backdate(w, "vendor", v.id, s.shift);
}

/** Omicron: D, then D again: standing HOLD for six months, moved so that four months remain. */
async function buildOmicron(w: World, s: VendorSpec, v: VendorRef): Promise<void> {
  await gradeVendor(w, s, v, "D");
  await gradeVendor(w, s, v, "D");
  await backdate(w, "vendor", v.id, s.shift);
}

/** The seed vendors: Seeds, Irrigation and Spare parts through their own sessions. */
export async function extendSeedVendors(w: World): Promise<void> {
  for (const sv of SEED_VENDORS) {
    const uid = await userId(w, sv.email);
    w.vendors.set(sv.key, { id: sv.id, email: sv.email, userId: uid, legalName: "" });
    for (const c of sv.qualified) await applyFor(w, sv.email, uid, c, true);
    await backdate(w, "vendor", sv.id, sv.shift);
  }
}

export async function buildVendors(w: World): Promise<void> {
  // registrations and logins carry no document number, so vendors may run side by side; the two long ones (Mugan, Zaqatala) start first
  const first = VENDORS.filter((s) => ["zeta", "omicron"].includes(s.key));
  const queue = [...first, ...VENDORS.filter((s) => !first.includes(s))];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      await buildVendor(w, s);
      w.log(`  vendor ${s.legalName}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  await extendSeedVendors(w);
  // refresh the legal names of the seed vendors for later use
  const { rows } = await w.db.query("select id, legal_name from public.vendor");
  for (const ref of w.vendors.values()) ref.legalName = rows.find((r) => r.id === ref.id)?.legal_name ?? ref.legalName;
}
