import { describe, expect, it } from "vitest";
import { unattendedRefusal } from "../../scripts/lib/unattended";

const DEV = "devprojectref0000000a";
const PROD = "prodprojectref000000b";
const run = (argv: string[], env: Record<string, string | undefined>, ref = DEV, envFile = ".env.local") => unattendedRefusal(argv, env, ref, envFile);

describe("--unattended", () => {
  it("is not requested without the flag: the typed confirmation applies", () => {
    expect(run([], { DEMO_UNATTENDED_REF: DEV })).toBe("not requested");
  });

  it("is refused without DEMO_UNATTENDED_REF (missing or empty)", () => {
    expect(run(["--unattended"], {})).toMatch(/needs DEMO_UNATTENDED_REF/);
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: "" })).toMatch(/needs DEMO_UNATTENDED_REF/);
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: "   " })).toMatch(/needs DEMO_UNATTENDED_REF/);
  });

  it("is refused when DEMO_UNATTENDED_REF is another reference, not even a prefix or a different case", () => {
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: PROD })).toMatch(/not the target project reference/);
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: DEV.slice(0, 10) })).toMatch(/not the target project reference/);
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: DEV.toUpperCase() })).toMatch(/not the target project reference/);
  });

  it("is refused for a production reference: the variable of the development project does not open the production project, and a production env file never qualifies", () => {
    // target = production, variable = development reference
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: DEV }, PROD, ".env.production.local")).toMatch(/not the target project reference/);
    // even a variable that equals the production reference is refused with a production env file
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: PROD }, PROD, ".env.production.local")).toMatch(/never allowed with a production env file/);
  });

  it("is allowed only when the variable equals the target reference exactly (development env file)", () => {
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: DEV })).toBeNull();
    expect(run(["--unattended"], { DEMO_UNATTENDED_REF: ` ${DEV} ` })).toBeNull();
  });
});
