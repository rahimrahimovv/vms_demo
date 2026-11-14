// Creates (or refreshes) the seeded demo users from the backlog's "Seeded accounts" (list: scripts/lib/demo-data.ts): the internal
// users and the Vendor B / Vendor C logins (their vendors come from supabase/seed.sql).
// Every account is created as already confirmed; no confirmation e-mail is sent.
// Usage: npm run db:seed (runs seed.sql first). Needs .env.local with
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DEMO_SEED_PASSWORD.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_ID, SCENARIO_START_USERS as USERS, seedProofFiles, type Context } from "./lib/demo-data";

// ENV_FILE picks another env file, e.g. ENV_FILE=.env.production.local for vms-prod.
const ENV_FILE = process.env.ENV_FILE || ".env.local";
config({ path: ENV_FILE, quiet: true });

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

  // CMT-01 demo committee: Elchin Karimov (Chair), Sevinj Guliyeva, Tural Ismayilov; voting period from the seed.
  const { data: committee, error: committeeError } = await admin
    .from("committee")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .single();
  if (committeeError) throw committeeError;
  const { error: clearError } = await admin.from("committee_member").delete().eq("committee_id", committee.id);
  if (clearError) throw clearError;
  const { error: memberError } = await admin.from("committee_member").insert(
    USERS.filter((u) => u.committee).map((u) => ({ committee_id: committee.id, user_id: ids.get(u.email), is_chair: u.committee === "CHAIR" })),
  );
  if (memberError) throw memberError;
  console.log("seeded committee: Elchin Karimov (Chair), Sevinj Guliyeva, Tural Ismayilov");

  // REG-07 AC4: Beta Trade and Gamma Supply keep a legal representative with a sample proof-of-authority file.
  await seedProofFiles({ admin } as Context);
  console.log("seeded sample proof-of-authority files for Beta Trade and Gamma Supply");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
