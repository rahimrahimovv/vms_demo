import { config } from "dotenv";

// Unit tests need nothing from here; RLS tests use the vms-dev values in .env.local.
config({ path: ".env.local", quiet: true });
