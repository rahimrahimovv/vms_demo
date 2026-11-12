// Creates (or refreshes) the seeded demo users from the backlog's "Seeded accounts": the internal
// users and the Vendor B / Vendor C logins (their vendors come from supabase/seed.sql).
// Every account is created as already confirmed; no confirmation e-mail is sent.
// Usage: npm run db:seed (runs seed.sql first). Needs .env.local with
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DEMO_SEED_PASSWORD.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// ENV_FILE picks another env file, e.g. ENV_FILE=.env.production.local for vms-prod.
const ENV_FILE = process.env.ENV_FILE || ".env.local";
config({ path: ENV_FILE, quiet: true });

const COMPANY_ID = "00000000-0000-4000-8000-000000000001"; // Demo Agro LLC, see supabase/seed.sql

type Role = "REQUESTER" | "APPROVER" | "PROCUREMENT_SPECIALIST" | "COMMITTEE_MEMBER" | "ADMIN" | "VENDOR";

const USERS: { email: string; fullName: string; roles: Role[]; vendorId?: string }[] = [
  { email: "leyla@demo-agro.test", fullName: "Leyla Mammadova", roles: ["REQUESTER"] },
  { email: "rashad@demo-agro.test", fullName: "Rashad Aliyev", roles: ["APPROVER"] },
  { email: "nigar@demo-agro.test", fullName: "Nigar Huseynova", roles: ["PROCUREMENT_SPECIALIST"] },
  { email: "elchin@demo-agro.test", fullName: "Elchin Karimov", roles: ["COMMITTEE_MEMBER"] },
  { email: "sevinj@demo-agro.test", fullName: "Sevinj Guliyeva", roles: ["COMMITTEE_MEMBER"] },
  { email: "tural@demo-agro.test", fullName: "Tural Ismayilov", roles: ["COMMITTEE_MEMBER"] },
  { email: "admin@demo-agro.test", fullName: "Demo Admin", roles: ["ADMIN"] },
  {
    email: "sales@beta-trade.test",
    fullName: "Selin Demir",
    roles: ["VENDOR"],
    vendorId: "00000000-0000-4000-8000-000000000502",
  },
  {
    email: "office@gamma-supply.test",
    fullName: "Orkhan Valiyev",
    roles: ["VENDOR"],
    vendorId: "00000000-0000-4000-8000-000000000503",
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in ${ENV_FILE}`);
  return value;
}

async function main() {
  const password = requireEnv("DEMO_SEED_PASSWORD");
  if (password.length < 8) throw new Error("DEMO_SEED_PASSWORD must have at least 8 characters");

  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existing = new Map(list.users.map((u) => [u.email?.toLowerCase(), u.id]));
  const ids = new Map<string, string>();

  for (const user of USERS) {
    let id = existing.get(user.email);
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      id = data.user.id;
    }

    const { error: userError } = await admin.from("app_user").upsert({
      id,
      company_id: COMPANY_ID,
      full_name: user.fullName,
      email: user.email,
      is_active: true,
      vendor_id: user.vendorId ?? null,
    });
    if (userError) throw userError;

    const { error: deleteError } = await admin.from("user_role").delete().eq("user_id", id);
    if (deleteError) throw deleteError;
    const { error: roleError } = await admin
      .from("user_role")
      .insert(user.roles.map((role) => ({ user_id: id, role })));
    if (roleError) throw roleError;

    ids.set(user.email, id);
    console.log(`seeded ${user.email} (${user.roles.join(", ")})`);
  }

  // CMT-01 demo committee: Elchin Karimov (Chair), Sevinj Guliyeva, Tural Ismayilov; voting period from seed.sql.
  const { data: committee, error: committeeError } = await admin
    .from("committee")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .single();
  if (committeeError) throw committeeError;
  const { error: clearError } = await admin.from("committee_member").delete().eq("committee_id", committee.id);
  if (clearError) throw clearError;
  const members = [
    { email: "elchin@demo-agro.test", isChair: true },
    { email: "sevinj@demo-agro.test", isChair: false },
    { email: "tural@demo-agro.test", isChair: false },
  ];
  const { error: memberError } = await admin.from("committee_member").insert(
    members.map((m) => ({ committee_id: committee.id, user_id: ids.get(m.email), is_chair: m.isChair })),
  );
  if (memberError) throw memberError;
  console.log("seeded committee: Elchin Karimov (Chair), Sevinj Guliyeva, Tural Ismayilov");

  // REG-07 AC4: Beta Trade and Gamma Supply keep a legal representative with a sample proof-of-authority file.
  const SAMPLE_PDF = Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj",
      "trailer<</Root 1 0 R>>",
      "%%EOF",
      "",
    ].join("\n"),
  );
  for (const vendorId of ["00000000-0000-4000-8000-000000000502", "00000000-0000-4000-8000-000000000503"]) {
    const { data: contact, error: contactError } = await admin
      .from("vendor_contact")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("is_primary", true)
      .single();
    if (contactError) throw contactError;
    const { data: existing } = await admin
      .from("file")
      .select("id")
      .eq("owner_type", "vendor_contact")
      .eq("owner_id", contact.id)
      .eq("kind", "proof_of_authority");
    if (existing && existing.length > 0) continue;
    const path = `${COMPANY_ID}/vendor_contact/${contact.id}/sample-power-of-attorney.pdf`;
    const { error: uploadError } = await admin.storage.from("files").upload(path, SAMPLE_PDF, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const { error: fileError } = await admin.from("file").insert({
      company_id: COMPANY_ID,
      owner_type: "vendor_contact",
      owner_id: contact.id,
      kind: "proof_of_authority",
      file_name: "sample-power-of-attorney.pdf",
      mime_type: "application/pdf",
      size_bytes: SAMPLE_PDF.length,
      storage_path: path,
    });
    if (fileError) throw fileError;
  }
  console.log("seeded sample proof-of-authority files for Beta Trade and Gamma Supply");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
