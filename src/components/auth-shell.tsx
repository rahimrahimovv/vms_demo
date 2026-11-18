import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/logo-mark";

/** Sign-in and Register: the centred card on a pale page, logo and product name above it. */
export function AuthShell({ name, children, wide = false }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#fafafa] px-4 py-10">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="text-lg font-semibold">{name}</span>
      </div>
      <div
        className={`surface-card flex w-full flex-col gap-2.5 p-7 ${wide ? "max-w-3xl" : "max-w-[408px]"}`}
      >
        {children}
      </div>
    </main>
  );
}
