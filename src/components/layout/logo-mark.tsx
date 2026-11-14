import { cn } from "@/lib/utils";

/**
 * Product logo icon: white shield with a check mark on a rounded square. The default is the brand gradient with a
 * glow (sign-in); `tone="sidebar"` is the lighter square used on the dark sidebar.
 */
export function LogoMark({
  className,
  iconClassName,
  tone = "brand",
}: {
  className?: string;
  iconClassName?: string;
  tone?: "brand" | "sidebar";
}) {
  return (
    <span
      className={cn(
        "flex items-center justify-center text-white",
        tone === "brand"
          ? "rounded-[13px] bg-(image:--brand-gradient) shadow-[0_6px_16px_var(--brand-glow),inset_0_1px_0_rgba(255,255,255,0.4)]"
          : "rounded-[9px] bg-(image:--sidebar-logo) shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]",
        className,
      )}
    >
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
