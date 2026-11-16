import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { parseProfileEvent } from "@/lib/vendors/change-requests";
import { certificateStatus, daysBetween, yearsInBusiness } from "@/lib/vendors/rules";
import { initials, ringShare, type AttentionItem } from "@/lib/vendors/attention";
import type { BankAccountRow, ContactRow, FileRow, OwnerRow, VendorRow } from "@/lib/vendors/queries";
import { StatusBadge, ToneChip } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityList, SidePanel, type ActivityEntry } from "@/components/vendor/side-panel";

type T = Awaited<ReturnType<typeof getTranslations>>;

const ROW = "flex flex-col gap-0.5 border-t border-[rgba(23,38,43,0.08)] py-1.5 text-[13px]";
const MUTED = "text-xs text-muted-foreground";

/** A compact card: 15 px title, 13 px text, about 14 px padding (Card size "sm"). */
export function SectionCard({ title, action, children, testId }: { title: string; action?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <Card size="sm" data-testid={testId}>
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <CardTitle>
          <h2 className="text-[15px] font-bold">{title}</h2>
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col">{children}</CardContent>
    </Card>
  );
}

function Calm({ children }: { children: ReactNode }) {
  return <p className="border-t border-[rgba(23,38,43,0.08)] pt-2 text-[13px] text-muted-foreground">{children}</p>;
}

function Fact({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex gap-3 border-t border-[rgba(23,38,43,0.08)] py-1 text-[13px]">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium break-words" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

/**
 * A list card: the first `limit` rows; with more, a "Show all (N)" link opens the full list (with the detail rows) in the side panel,
 * so a long list never stretches the page.
 */
function ListCard({
  title,
  rows,
  detailRows,
  limit,
  empty,
  showAllLabel,
  testId,
}: {
  title: string;
  rows: ReactNode[];
  detailRows?: ReactNode[];
  limit: number;
  empty: string;
  showAllLabel: string;
  testId?: string;
}) {
  const more = rows.length > limit;
  return (
    <SectionCard
      title={title}
      testId={testId}
      action={
        more ? (
          <SidePanel title={title} trigger={showAllLabel} testId={`${testId}-all`}>
            <ul>{detailRows ?? rows}</ul>
          </SidePanel>
        ) : undefined
      }
    >
      {rows.length === 0 ? <Calm>{empty}</Calm> : <ul>{rows.slice(0, limit)}</ul>}
    </SectionCard>
  );
}

function attentionText(t: T, item: AttentionItem, categoryName: (id: string) => string): string {
  switch (item.kind) {
    case "registration":
      return t("vendorCard.attention.registration");
    case "sharedOwner":
      return `${t("vendorCard.sharesOwner")} ${item.vendorName}`;
    case "certificateExpiring":
      return t("vendorCard.attention.certificateExpiring", { type: t(`certificateTypes.${item.certificateType}`), days: item.days });
    case "certificateExpired":
      return t("vendorCard.attention.certificateExpired", { type: t(`certificateTypes.${item.certificateType}`), days: item.days });
    case "hold":
      return item.until ? t("vendorCard.attention.holdUntil", { date: formatDate(item.until) }) : t("vendorCard.attention.hold");
    case "changeRequest":
      return t("vendorCard.attention.changeRequest", { section: t(`changeRequest.sections.${item.section}`) });
    case "questionnaire":
      return t("vendorCard.attention.questionnaire");
    case "application":
      return t("vendorCard.attention.application", { category: categoryName(item.categoryId) });
  }
}

export type VendorHeaderProps = {
  vendor: VendorRow;
  grade: { grade: string } | null;
  today: string;
  /** the buttons (decisions, review, reset password), already decided by role and status in the page */
  actions: ReactNode;
  /** the Activity button with its side panel */
  activity: ReactNode;
};

/** The header strip: avatar, name with its badges, one subline, and the actions on the right. */
export async function VendorHeader({ vendor, grade, today, actions, activity }: VendorHeaderProps) {
  const t = await getTranslations();
  const none = t("common.none");
  const subline = [
    t(`countries.${vendor.country_code}`),
    `${t("vendors.columns.taxNumber")} ${vendor.voen ?? vendor.foreign_tax_number ?? none}`,
    vendor.founded_on
      ? t("vendorCard.foundedLine", { date: formatDate(vendor.founded_on), years: yearsInBusiness(vendor.founded_on, today) })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card size="sm" data-testid="vendor-header">
      <CardContent className="flex items-center gap-3.5">
        <div aria-hidden className="brand-button flex size-[52px] shrink-0 items-center justify-center rounded-2xl text-lg font-bold">
          {initials(vendor.legal_name)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-lg leading-tight font-bold">{vendor.legal_name}</h1>
            <StatusBadge status={vendor.status} />
            {vendor.standing && <StatusBadge status={vendor.standing} />}
            {grade && <Badge data-testid="card-grade">{t("vendorCard.gradeBadge", { grade: grade.grade })}</Badge>}
            <Badge variant="secondary">{t(`vendorTypes.${vendor.vendor_type}`)}</Badge>
          </div>
          <p className="text-[13px] text-muted-foreground" data-testid="vendor-subline">
            {subline}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {activity}
        </div>
      </CardContent>
    </Card>
  );
}

export type OpenRequest = { id: string; section: string; submitted_at: string | null; created_at: string };

/** One amber glass strip with the chips of "Needs attention"; calm and slim when there is nothing. A DRAFT shows its own line. */
export async function AttentionStrip({
  attention,
  categoryName,
  isDraft,
  review,
}: {
  attention: AttentionItem[];
  categoryName: (id: string) => string;
  isDraft: boolean;
  /** the open change request the Specialist can review from here (null for a role that cannot act) */
  review: OpenRequest | null;
}) {
  const t = await getTranslations();
  if (isDraft) {
    return (
      <section role="status" className="surface-glass px-4 py-2.5 text-[13px] font-medium" data-testid="draft-notice">
        {t("vendorCard.draft")}
      </section>
    );
  }
  if (attention.length === 0) {
    return (
      <section className="surface-glass px-4 py-2.5 text-[13px] text-muted-foreground" data-testid="needs-attention">
        {t("vendorCard.attention.none")}
      </section>
    );
  }
  return (
    <section aria-labelledby="attention-title" className="surface-warning flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2" data-testid="needs-attention">
      <h2 id="attention-title" className="text-xs font-bold tracking-[0.06em] text-(--tone-amber-fg) uppercase">
        {t("vendorCard.attention.title")}
      </h2>
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {attention.map((item, i) => {
          const text = attentionText(t, item, categoryName);
          return (
            <li key={`${item.kind}-${i}`}>
              <ToneChip tone={item.tone} className="h-auto min-h-5 py-0.5 text-left whitespace-normal">
                {item.kind === "sharedOwner" ? (
                  <Link href={`/vendors/${item.vendorId}`} className="underline" data-testid="shared-owner">
                    {text}
                  </Link>
                ) : (
                  text
                )}
              </ToneChip>
            </li>
          );
        })}
      </ul>
      {review && (
        <Button asChild variant="outline">
          <Link href={`/change-requests/${review.id}`} data-testid="strip-review">
            {t("vendorCard.banner.review")}
          </Link>
        </Button>
      )}
    </section>
  );
}

export async function QualificationCard({
  vendor,
  grade,
}: {
  vendor: VendorRow;
  grade: { grade: string; score: string | number; valid_until: string | null } | null;
}) {
  const t = await getTranslations();
  const score = grade ? Number(grade.score) : 0;
  const scoreText = score.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <SectionCard title={t("vendorCard.qualification")} testId="qualification">
      <div className="flex items-center gap-3.5 border-t border-[rgba(23,38,43,0.08)] pt-2">
        {grade ? (
          <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={t("vendorCard.gradeAria", { grade: grade.grade, score: scoreText })} className="shrink-0">
            <circle cx="42" cy="42" r={R} fill="none" strokeWidth="9" className="stroke-foreground/15" />
            <circle
              cx="42"
              cy="42"
              r={R}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(C * ringShare(score)).toFixed(1)} ${C.toFixed(1)}`}
              transform="rotate(-90 42 42)"
              className="stroke-primary"
            />
            <text x="42" y="51" textAnchor="middle" fontSize="26" fontWeight="700" className="fill-(--brand-grade-fg)">
              {grade.grade}
            </text>
          </svg>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          {grade ? (
            <>
              <div className="text-base font-bold">{t("vendorCard.points", { score: scoreText })}</div>
              {grade.valid_until && (
                <div className="text-[13px] text-muted-foreground">
                  {t("qualification.validUntil")} {formatDate(grade.valid_until)}
                </div>
              )}
            </>
          ) : (
            <div className="text-[13px] font-medium">{t("vendorCard.noGrade")}</div>
          )}
          {vendor.standing && (
            <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="text-muted-foreground">{t("vendors.columns.standing")}:</span>
              <StatusBadge status={vendor.standing} />
              {vendor.standing === "HOLD" && vendor.standing_until && <span className={MUTED}>{t("vendorCard.holdUntil", { date: formatDate(vendor.standing_until) })}</span>}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/** Company data: the summary facts plus what the old "More details" card held, except the contact data (the Contact persons card has it). */
export async function CompanyCard({ vendor, brands }: { vendor: VendorRow; brands: { brand: string; is_official_dealer: boolean }[] }) {
  const t = await getTranslations();
  const none = t("common.none");
  const guarantee = vendor.bank_guarantee_available
    ? [
        vendor.bank_guarantee_types.map((g) => t(`guaranteeTypes.${g}`)).join(", "),
        vendor.bank_guarantee_max
          ? `${t("profile.fields.guaranteeMax")} ${Number(vendor.bank_guarantee_max).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${vendor.bank_guarantee_currency}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ") || t("common.yes")
    : t("common.no");
  return (
    <SectionCard title={t("vendorCard.cards.company")} testId="company">
      <dl data-testid="vendor-details">
        <Fact label={t("registration.fields.legalAddress")}>{vendor.legal_address ?? none}</Fact>
        <Fact label={t("registration.fields.directorName")}>{vendor.director_name ?? none}</Fact>
        {vendor.id_card_number && <Fact label={t("registration.fields.idCardNumber")}>{vendor.id_card_number}</Fact>}
        <Fact label={t("registration.fields.vatPayer")}>{vendor.is_vat_payer === null ? none : t(vendor.is_vat_payer ? "common.yes" : "common.no")}</Fact>
        <Fact label={t("profile.fields.mainActivity")}>{vendor.main_activity ? t(`activities.${vendor.main_activity}`) : none}</Fact>
        <Fact label={t("profile.sections.brands")}>
          {brands.length > 0 ? brands.map((b) => (b.is_official_dealer ? `${b.brand} (${t("profile.fields.officialDealer")})` : b.brand)).join(", ") : none}
        </Fact>
        <Fact label={t("profile.fields.mainGoods")}>{vendor.main_goods.length > 0 ? vendor.main_goods.join(", ") : none}</Fact>
        <Fact label={t("profile.fields.bankGuarantee")}>{guarantee}</Fact>
        {vendor.review_comment && <Fact label={t("vendorCard.reviewComment")}>{vendor.review_comment}</Fact>}
      </dl>
    </SectionCard>
  );
}

export type OwnerShare = { ownerName: string; vendorId: string; vendorName: string };

export async function OwnersCard({ owners, shares }: { owners: OwnerRow[]; shares: OwnerShare[] }) {
  const t = await getTranslations();
  const row = (o: OwnerRow, detail: boolean) => {
    const mine = shares.filter((s) => s.ownerName === o.full_name);
    const pct = o.share_percent !== null ? Number(o.share_percent) : null;
    return (
      <li key={o.id} className={ROW} data-testid="owner-row">
        <div className="flex items-baseline justify-between gap-3">
          <span>
            <span className="font-medium">{o.full_name}</span> <span className="text-muted-foreground">· {t(`ownerRoles.${o.role}`)}</span>
          </span>
          <span className="font-bold tabular-nums">{pct !== null ? `${pct}%` : t("common.none")}</span>
        </div>
        {pct !== null && (
          <div aria-hidden className="h-1 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
          </div>
        )}
        {detail && <div className={MUTED}>{t("vendorCard.idNumber", { number: o.id_number })}</div>}
        {mine.length > 0 &&
          (detail ? (
            <div className="flex flex-col items-start gap-1 pt-0.5">
              {mine.map((s) => (
                <ToneChip key={s.vendorId} tone="amber" className="h-auto min-h-5 py-0.5 text-left whitespace-normal">
                  <Link href={`/vendors/${s.vendorId}`} className="underline">
                    {t("vendorCard.sharedOwnerChip", { owner: s.ownerName, vendor: s.vendorName })}
                  </Link>
                </ToneChip>
              ))}
            </div>
          ) : (
            <div className="pt-0.5">
              <ToneChip tone="amber">{t("vendorCard.alsoOwns", { count: mine.length })}</ToneChip>
            </div>
          ))}
      </li>
    );
  };
  return (
    <ListCard
      title={t("vendorCard.cards.owners")}
      testId="owners"
      rows={owners.map((o) => row(o, false))}
      detailRows={owners.map((o) => row(o, true))}
      limit={3}
      empty={t("vendorCard.empty.owners")}
      showAllLabel={t("vendorCard.showAllCount", { count: owners.length })}
    />
  );
}

export async function ContactsCard({ contacts }: { contacts: ContactRow[] }) {
  const t = await getTranslations();
  const none = t("common.none");
  const rows = contacts.map((c) => (
    <li key={c.id} className={ROW} data-testid="contact-row">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span>
          <span className="font-medium">{c.full_name}</span> <span className="text-muted-foreground">· {c.position ?? none}</span>
        </span>
        <span className="flex flex-wrap gap-1">
          {c.is_primary && <ToneChip tone="grey">{t("registration.contacts.primary")}</ToneChip>}
          {c.is_legal_representative && <ToneChip tone="green">{t("registration.contacts.legalRepresentative")}</ToneChip>}
        </span>
      </div>
      <div className={`${MUTED} break-all`}>
        {c.phone} · {c.email}
        {c.is_legal_representative &&
          c.proof.map((f) => (
            <span key={f.id}>
              {" · "}
              <a href={"/api/files/" + f.id} className="font-semibold text-primary hover:underline" data-testid="proof-file">
                {f.file_name}
              </a>
            </span>
          ))}
      </div>
    </li>
  ));
  return (
    <ListCard
      title={t("vendorCard.cards.contacts")}
      testId="contacts"
      rows={rows}
      limit={2}
      empty={t("vendorCard.empty.contacts")}
      showAllLabel={t("vendorCard.showAllCount", { count: rows.length })}
    />
  );
}

/** Every bank account exactly as the signed-in role is allowed to read it today (the IBAN is shown as the page showed it before). */
export async function BankAccountsCard({ accounts }: { accounts: BankAccountRow[] }) {
  const t = await getTranslations();
  const rows = accounts.map((a) => (
    <li key={a.id} className={ROW} data-testid="bank-account-row">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="font-medium">{a.bank_name}</span> <span className="text-muted-foreground">· {a.currency}</span>
        </span>
        {a.is_main && <Badge>{t("bankAccounts.main")}</Badge>}
      </div>
      <div className={`${MUTED} break-all`}>
        <span className="font-mono">{a.iban}</span> · {t("bankAccounts.swift")} {a.swift}
      </div>
    </li>
  ));
  return (
    <ListCard
      title={t("vendorCard.cards.bankAccounts")}
      testId="bank-accounts"
      rows={rows}
      limit={2}
      empty={t("vendorCard.empty.bankAccounts")}
      showAllLabel={t("vendorCard.showAllCount", { count: rows.length })}
    />
  );
}

export async function CertificatesCard({
  certificates,
  today,
}: {
  certificates: { id: string; type: string; number: string | null; issuer: string | null; issued_on: string | null; expires_on: string | null }[];
  today: string;
}) {
  const t = await getTranslations();
  const rows = certificates.map((c) => {
    const status = certificateStatus(c.expires_on, today);
    let left: number | null = null;
    if (c.issued_on && c.expires_on) {
      const total = daysBetween(c.issued_on, c.expires_on);
      left = total > 0 ? Math.min(100, Math.max(0, Math.round((daysBetween(today, c.expires_on) / total) * 100))) : null;
    }
    return (
      <li key={c.id} className={ROW} data-testid="certificate-row">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="font-medium">{t(`certificateTypes.${c.type}`)}</span>
            {c.issuer && <span className="text-muted-foreground"> · {c.issuer}</span>}
          </span>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center gap-2">
          {left !== null && (
            <div
              role="img"
              aria-label={t("vendorCard.validityLeft", { percent: left })}
              className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10"
            >
              <div className={status === "VALID" ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-(--tone-amber-fg)"} style={{ width: `${left}%` }} />
            </div>
          )}
          <span className={`${MUTED} shrink-0`}>{c.expires_on ? t("vendorCard.until", { date: formatDate(c.expires_on) }) : t("profile.noExpiry")}</span>
        </div>
      </li>
    );
  });
  return (
    <ListCard
      title={t("vendorCard.cards.certificates")}
      testId="certificates"
      rows={rows}
      limit={3}
      empty={t("vendorCard.empty.certificates")}
      showAllLabel={t("vendorCard.showAllCount", { count: rows.length })}
    />
  );
}

export async function CategoriesCard({
  applications,
  categoryName,
  today,
  canOpen,
}: {
  applications: { id: string; category_id: string; status: string; valid_until: string | null; created_at: string }[];
  categoryName: (id: string) => string;
  today: string;
  canOpen: boolean;
}) {
  const t = await getTranslations();
  const shown = (a: (typeof applications)[number]) => (a.status === "QUALIFIED" && a.valid_until && a.valid_until < today ? "EXPIRED" : a.status);
  // qualified first, then the rest in the order they arrive (newest first)
  const sorted = [...applications].sort((a, b) => Number(shown(b) === "QUALIFIED") - Number(shown(a) === "QUALIFIED"));
  const rows = sorted.map((a) => (
    <li key={a.id} className={ROW} data-testid="category-row">
      <div className="flex items-center justify-between gap-3">
        {canOpen ? (
          <Link href={`/category-applications/${a.id}`} className="font-medium text-primary hover:underline">
            {categoryName(a.category_id)}
          </Link>
        ) : (
          <span className="font-medium">{categoryName(a.category_id)}</span>
        )}
        <StatusBadge status={shown(a)} />
      </div>
      <div className={MUTED}>{a.valid_until ? t("vendorCard.until", { date: formatDate(a.valid_until) }) : t("vendorCard.appliedOn", { date: formatDate(a.created_at) })}</div>
    </li>
  ));
  return (
    <ListCard
      title={t("vendorCard.cards.categories")}
      testId="categories"
      rows={rows}
      limit={3}
      empty={t("vendorCard.empty.categories")}
      showAllLabel={t("vendorCard.showAllCount", { count: rows.length })}
    />
  );
}

export async function DocumentsCard({ files }: { files: FileRow[] }) {
  const t = await getTranslations();
  const rows = files.map((f) => (
    <li key={f.id} className="flex items-center justify-between gap-3 border-t border-[rgba(23,38,43,0.08)] py-1.5 text-[13px]">
      <span className="min-w-0 break-words">
        <span className="font-medium">{f.file_name}</span>
        {f.kind && <span className="text-muted-foreground"> · {t(`files.kinds.${f.kind}`)}</span>}
      </span>
      <a href={`/api/files/${f.id}`} className="shrink-0 text-xs font-semibold text-primary hover:underline" data-testid="file-link">
        {t("vendorCard.download")}
      </a>
    </li>
  ));
  return (
    <ListCard
      title={t("vendorCard.cards.documents")}
      testId="documents"
      rows={rows}
      limit={3}
      empty={t("vendorCard.empty.documents")}
      showAllLabel={t("vendorCard.showAllCount", { count: rows.length })}
    />
  );
}

type AuditRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at: string;
  user_id: string | null;
  user: { full_name: string } | { full_name: string }[] | null;
};
type RequestRow = {
  id: string;
  section: string;
  status: string;
  reason: string;
  review_comment: string | null;
  submitted_at: string | null;
  created_at: string;
  decided_at: string | null;
  decider: { full_name: string } | { full_name: string }[] | null;
};

const first = <V,>(v: V | V[] | null): V | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function Line({ title, sub }: { title: ReactNode; sub: string }) {
  return (
    <span className="min-w-0">
      {title}
      {sub && <span className="block text-xs whitespace-pre-wrap text-muted-foreground">{sub}</span>}
    </span>
  );
}

/**
 * The Activity button in the header and its side panel: the registration history, the standing history, the change requests and the
 * profile updates in one list, latest first. Read as the signed-in user, so RLS decides what is visible (the same reads as before).
 */
export async function ActivityButton({ vendorId }: { vendorId: string }) {
  const t = await getTranslations();
  const supabase = await createClient();
  const auditSelect = "id, from_status, to_status, reason, created_at, user_id, user:app_user(full_name)";
  const [{ data: registration }, { data: standing }, { data: requests }] = await Promise.all([
    supabase.from("audit_entry").select(auditSelect).eq("record_type", "vendor").eq("record_id", vendorId).returns<AuditRow[]>(),
    supabase.from("audit_entry").select(auditSelect).eq("record_type", "vendor_standing").eq("record_id", vendorId).returns<AuditRow[]>(),
    supabase
      .from("vendor_change_request")
      .select("id, section, status, reason, review_comment, submitted_at, created_at, decided_at, decider:app_user!vendor_change_request_decided_by_fkey(full_name)")
      .eq("vendor_id", vendorId)
      .returns<RequestRow[]>(),
  ]);

  const who = (r: AuditRow) => (r.user_id ? (first(r.user)?.full_name ?? "") : t("history.system"));
  const raw: { id: string; at: string; node: ReactNode }[] = [];

  for (const r of registration ?? []) {
    const profile = r.to_status === "PROFILE_UPDATED" ? parseProfileEvent(r.reason) : null;
    raw.push({
      id: `a-${r.id}`,
      at: r.created_at,
      node: (
        <Line
          title={
            profile ? (
              <span className="font-medium" data-testid="profile-updated">
                {t("history.profileUpdated", { section: t(`history.sections.${profile.code}`) })}
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {r.from_status && <StatusBadge status={r.from_status} />}
                {r.from_status && <span aria-hidden>→</span>}
                <StatusBadge status={r.to_status} />
              </span>
            )
          }
          sub={[who(r), profile ? profile.detail : r.reason].filter(Boolean).join(" · ")}
        />
      ),
    });
  }
  for (const r of standing ?? []) {
    raw.push({
      id: `s-${r.id}`,
      at: r.created_at,
      node: (
        <Line
          title={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{t("vendorCard.standingHistory")}:</span>
              {r.from_status && <StatusBadge status={r.from_status} />}
              {r.from_status && <span aria-hidden>→</span>}
              <StatusBadge status={r.to_status} />
            </span>
          }
          sub={[who(r), r.reason].filter(Boolean).join(" · ")}
        />
      ),
    });
  }
  for (const r of requests ?? []) {
    const decider = first(r.decider);
    raw.push({
      id: `c-${r.id}`,
      at: r.submitted_at ?? r.created_at,
      node: (
        <Line
          title={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Link href={`/change-requests/${r.id}`} className="font-medium text-primary hover:underline" data-testid="change-request-row">
                {t("vendorCard.activityChangeRequest", { section: t(`changeRequest.sections.${r.section}`) })}
              </Link>
              <StatusBadge status={r.status} />
            </span>
          }
          sub={[r.decided_at ? `${decider?.full_name ?? ""} · ${formatDateTime(r.decided_at)}` : "", r.reason, r.review_comment].filter(Boolean).join(" · ")}
        />
      ),
    });
  }
  raw.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const entries: ActivityEntry[] = raw.map((e) => ({ id: e.id, at: formatDateTime(e.at), node: e.node }));

  return (
    <SidePanel title={t("vendorCard.cards.activity")} trigger={t("vendorCard.activityButton", { count: entries.length })} asButton testId="activity-button">
      <ActivityList entries={entries} />
    </SidePanel>
  );
}
