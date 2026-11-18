import { cn } from "@/lib/utils";

/** Product mark: a white "e" on a black rounded square. Monochrome by rule (docs/DESIGN.md, Iconography). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 items-center justify-center rounded-lg bg-primary text-[13px] leading-none font-semibold text-primary-foreground",
        className,
      )}
    >
      e
    </span>
  );
}
