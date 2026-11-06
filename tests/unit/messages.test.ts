import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en.json";
import { ROLES } from "@/lib/auth/roles";
import { SECTIONS } from "@/lib/auth/sections";

function get(path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], messages);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

// CLAUDE.md rule 2 / NFR-012: every UI string lives in messages/en.json.
describe("messages/en.json", () => {
  it("has a label for every section and role", () => {
    for (const s of SECTIONS) expect(get(`nav.${s.labelKey}`), s.key).toBeTypeOf("string");
    for (const r of ROLES) expect(get(`roles.${r}`), r).toBeTypeOf("string");
  });

  it("has every message key that the code returns as an error", () => {
    const keys = new Set<string>();
    for (const file of files("src")) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/"((?:users|common|access)\.errors?\.[A-Za-z]+|common\.genericError|access\.denied)"/g)) {
        keys.add(m[1]);
      }
    }
    expect(keys.size).toBeGreaterThan(0);
    for (const key of keys) expect(get(key), key).toBeTypeOf("string");
  });

  it("keeps the backlog's exact texts", () => {
    expect(get("users.errors.emailInUse")).toBe("This e-mail is already in use");
    expect(get("signIn.errors.invalid")).toBe("Incorrect e-mail or password");
    expect(get("signIn.errors.unavailable")).toBe("Sign-in is unavailable, try again");
    expect(get("access.denied")).toBe("You do not have access to this page");
  });
});
