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

    console.log(`seeded ${user.email} (${user.roles.join(", ")})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
