import { cn } from "@/lib/utils";

/** Product logo icon: white shield with a check mark on the brand-coloured rounded square. */
export function LogoMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span className={cn("flex items-center justify-center rounded-md bg-primary text-primary-foreground", className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconClassName}
        aria-hidden
      >
        <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </span>
  );
}
