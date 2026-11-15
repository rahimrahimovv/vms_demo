// D-024: no endpoint or action signs in as another user without a password, and nothing in the app or its texts speaks of demos.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en.json";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const sources = files("src").map((file) => ({ file, text: readFileSync(file, "utf8") }));

describe("sign-in without a password does not exist", () => {
  it("no code path can create a session for a user without a password", () => {
    // every Supabase Auth call that could open a session for someone else: magic links, OTP, anonymous, ID tokens, SSO, raw sessions
    const forbidden = /\b(generateLink|verifyOtp|signInWithOtp|signInAnonymously|signInWithIdToken|signInWithSSO|signInWithOAuth|setSession|exchangeCodeForSession|createSession|refreshSession)\b|magiclink/;
    const hits = sources.filter((s) => forbidden.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  it("the only way in is signInWithPassword, which always carries the typed password", () => {
    const calls = sources.flatMap((s) => [...s.text.matchAll(/\.signInWith\w*\(([^)]*)\)/g)].map((m) => ({ file: s.file, name: m[0].split("(")[0], args: m[1] })));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.name, c.file).toBe(".signInWithPassword");
      expect(c.args, c.file).toMatch(/password/);
    }
  });

  it("no route, page or action is named after a demo tool, and the app shell and the sign-in page render nothing about demos", () => {
    const names = sources.map((s) => s.file.split(sep).join("/"));
    expect(names.filter((f) => /demo/i.test(f))).toEqual([]);
    for (const s of sources) {
      expect(s.text, s.file).not.toMatch(/DemoBar|demo-access|DEMO_MODE|DEMO_ACCESS_CODE|DEMO_SESSION_SECRET|isDemoUnlocked|switchUser|lockDemo/);
    }
    expect(Object.keys(messages)).not.toContain("demo");
  });

  it("the Auth admin API is used only to create confirmed users, delete a failed registration and set or ban accounts", () => {
    const allowed = /auth\.admin\.(createUser|deleteUser|updateUserById|getUserById|listUsers|signOut)\b/;
    const uses = sources.flatMap((s) => [...s.text.matchAll(/auth\.admin\.\w+/g)].map((m) => ({ file: s.file, call: m[0] })));
    for (const u of uses) expect(u.call, u.file).toMatch(allowed);
  });
});
