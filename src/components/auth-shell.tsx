import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/logo-mark";

/** Sign-in and Register: the centred glass card on the page layer, logo and product name at its top. */
export function AuthShell({ name, children, wide = false }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className={`surface-dialog flex w-full flex-col gap-2.5 rounded-[30px]! p-8 ${wide ? "max-w-3xl" : "max-w-[400px]"}`}
      >
        <div className="flex items-center gap-3 pb-2">
          <LogoMark className="size-11" iconClassName="size-6" />
          <span className="text-xl font-bold">{name}</span>
        </div>
        {children}
      </div>
    </main>
  );
}
