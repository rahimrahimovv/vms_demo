import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { parseProfileEvent } from "@/lib/vendors/change-requests";
import { certificateStatus, yearsInBusiness } from "@/lib/vendors/rules";
import { initials, ringShare, type AttentionItem } from "@/lib/vendors/attention";
import type { BankAccountRow, ContactRow, FileRow, OwnerRow, VendorRow } from "@/lib/vendors/queries";
import { StatusBadge, ToneChip } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type T = Awaited<ReturnType<typeof getTranslations>>;

/** A row inside a card: a thin divider above it, compact text (density tokens). */
const ROW = "flex flex-col gap-0.5 border-t border-[rgba(23,38,43,0.08)] py-1.5 text-[13px]";
const MUTED = "text-xs text-muted-foreground";

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
    <div className="flex gap-3 border-t border-[rgba(23,38,43,0.08)] py-1.5 text-[13px]">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium break-words" data-testid={testId}>
        {children}
      </dd>
    </div>
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

export type OpenRequest = { id: string; section: string; submitted_at: string | null; created_at: string };

export type VendorRailProps = {
  vendor: VendorRow;
  attention: AttentionItem[];
  grade: { grade: string; score: string | number; valid_until: string | null } | null;
  brands: { brand: string; is_official_dealer: boolean }[];
  today: string;
  categoryName: (id: string) => string;
  /** the buttons, already decided by role and status in the page */
  actions: ReactNode;
};

/** The left summary rail: who the vendor is, where it stands, what needs attention, key facts, the actions. */
export async function VendorRail({ vendor, attention, grade, brands, today, categoryName, actions }: VendorRailProps) {
  const t = await getTranslations();
  const none = t("common.none");
  const score = grade ? Number(grade.score) : 0;
  const scoreText = score.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const R = 48;
  const C = 2 * Math.PI * R;

  return (
    <aside
      aria-label={t("vendorCard.summary")}
      className="sticky top-4 w-[300px] shrink-0 self-start min-[1400px]:w-[340px]"
      data-testid="vendor-rail"
    >
      <Card className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <CardContent className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3.5">
            <div
              aria-hidden
              className="brand-button flex size-16 shrink-0 items-center justify-center rounded-[18px] text-[22px] font-bold"
            >
              {initials(vendor.legal_name)}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-xl leading-tight font-bold break-words">{vendor.legal_name}</h1>
              <p className="text-[13px] text-muted-foreground">
                {t(`vendorTypes.${vendor.vendor_type}`)} · {t(`countries.${vendor.country_code}`)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={vendor.status} />
            {vendor.standing && <StatusBadge status={vendor.standing} />}
            {grade && <Badge data-testid="card-grade">{t("vendorCard.gradeBadge", { grade: grade.grade })}</Badge>}
          </div>

          <div className="surface-inner flex items-center gap-3.5 px-3.5 py-3">
            {grade ? (
              <svg
                width="104"
                height="104"
                viewBox="0 0 120 120"
                role="img"
                aria-label={t("vendorCard.gradeAria", { grade: grade.grade, score: scoreText })}
                className="shrink-0"
              >
                <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" className="stroke-foreground/15" />
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(C * ringShare(score)).toFixed(1)} ${C.toFixed(1)}`}
                  transform="rotate(-90 60 60)"
                  className="stroke-primary"
                />
                <text x="60" y="70" textAnchor="middle" fontSize="36" fontWeight="700" className="fill-(--brand-grade-fg)">
                  {grade.grade}
                </text>
              </svg>
            ) : null}
            <div className="min-w-0">
              <div className="text-[13px] text-muted-foreground">{t("vendorCard.qualification")}</div>
              {grade ? (
                <>
                  <div className="text-lg font-bold">{t("vendorCard.points", { score: scoreText })}</div>
                  {grade.valid_until && (
                    <div className="text-[13px] text-muted-foreground">
                      {t("qualification.validUntil")} {formatDate(grade.valid_until)}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[13px] font-medium">{t("vendorCard.noGrade")}</div>
              )}
            </div>
          </div>

          <section aria-labelledby="attention-title" data-testid="needs-attention">
            <h2 id="attention-title" className="pb-1.5 text-xs font-bold tracking-[0.06em] text-(--tone-amber-fg) uppercase">
              {t("vendorCard.attention.title")}
            </h2>
            {attention.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("vendorCard.attention.none")}</p>
            ) : (
              <ul className="flex flex-col items-start gap-1.5">
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
            )}
          </section>

          <dl data-testid="vendor-details">
            <Fact label={t("vendors.columns.taxNumber")}>{vendor.voen ?? vendor.foreign_tax_number ?? none}</Fact>
            <Fact label={t("vendorCard.founded")}>{vendor.founded_on ? formatDate(vendor.founded_on) : none}</Fact>
            <Fact label={t("vendorCard.inBusiness")}>
              {vendor.founded_on ? t("vendorCard.years", { years: yearsInBusiness(vendor.founded_on, today) }) : none}
            </Fact>
            <Fact label={t("registration.fields.legalAddress")}>{vendor.legal_address ?? none}</Fact>
            <Fact label={t("registration.fields.directorName")}>{vendor.director_name ?? none}</Fact>
            <Fact label={t("registration.fields.vatPayer")}>
              {vendor.is_vat_payer === null ? none : t(vendor.is_vat_payer ? "common.yes" : "common.no")}
            </Fact>
            <Fact label={t("profile.fields.mainActivity")}>{vendor.main_activity ? t(`activities.${vendor.main_activity}`) : none}</Fact>
            <Fact label={t("profile.sections.brands")}>
              {brands.length > 0
                ? brands.map((b) => (b.is_official_dealer ? `${b.brand} (${t("profile.fields.officialDealer")})` : b.brand)).join(", ")
                : none}
            </Fact>
          </dl>

          {actions && <div className="flex flex-col gap-2">{actions}</div>}
        </CardContent>
      </Card>
    </aside>
  );
}

/** Amber glass banner for one open change request; the Review button only for a role that can decide. */
export async function ChangeRequestBanner({ request, canReview }: { request: OpenRequest; canReview: boolean }) {
  const t = await getTranslations();
  const section = t(`changeRequest.sections.${request.section}`);
  return (
    <section role="status" className="surface-warning flex items-center gap-3.5 px-[18px] py-3" data-testid="change-request-banner">
      <AlertCircle className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-bold">{t("vendorCard.banner.title", { section })}</div>
        <div className="text-[13px]">{t("vendorCard.banner.body", { date: formatDate(request.submitted_at ?? request.created_at) })}</div>
      </div>
      {canReview && (
        <Button asChild variant="outline">
          <Link href={`/change-requests/${request.id}`} data-testid="banner-review">
            {t("vendorCard.banner.review")}
          </Link>
        </Button>
      )}
    </section>
  );
}

export async function DraftNotice() {
  const t = await getTranslations();
  return (
    <section role="status" className="surface-glass px-[18px] py-3 text-[13px] font-medium" data-testid="draft-notice">
      {t("vendorCard.draft")}
    </section>
  );
}

export type OwnerShare = { ownerName: string; vendorId: string; vendorName: string };

export async function OwnersCard({ owners, shares }: { owners: OwnerRow[]; shares: OwnerShare[] }) {
  const t = await getTranslations();
  return (
    <SectionCard title={t("vendorCard.cards.owners")}>
      {owners.length === 0 ? (
        <Calm>{t("vendorCard.empty.owners")}</Calm>
      ) : (
        <ul data-testid="owners">
          {owners.map((o) => (
            <li key={o.id} className={ROW}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{o.full_name}</span>
                <span className="font-medium tabular-nums">{o.share_percent !== null ? `${Number(o.share_percent)}%` : t("common.none")}</span>
              </div>
              <div className={MUTED}>
                {t(`ownerRoles.${o.role}`)} · {t("vendorCard.idNumber", { number: o.id_number })}
              </div>
            </li>
          ))}
        </ul>
      )}
      {shares.length > 0 && (
        <div className="flex flex-col items-start gap-1.5 pt-2">
          {shares.map((s) => (
            <ToneChip key={`${s.ownerName}-${s.vendorId}`} tone="amber" className="h-auto min-h-5 py-0.5 text-left whitespace-normal">
              <Link href={`/vendors/${s.vendorId}`} className="underline">
                {t("vendorCard.sharedOwnerChip", { owner: s.ownerName, vendor: s.vendorName })}
              </Link>
            </ToneChip>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export async function ContactsCard({ contacts }: { contacts: ContactRow[] }) {
  const t = await getTranslations();
  const none = t("common.none");
  return (
    <SectionCard title={t("vendorCard.cards.contacts")}>
      {contacts.length === 0 ? (
        <Calm>{t("vendorCard.empty.contacts")}</Calm>
      ) : (
        <ul data-testid="contacts">
          {contacts.map((c) => (
            <li key={c.id} className={ROW} data-testid="contact-row">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.full_name}</span>
                {c.is_primary && <Badge variant="secondary">{t("registration.contacts.primary")}</Badge>}
              </div>
              <div className={MUTED}>{c.position ?? none}</div>
              <div className={`${MUTED} break-all`}>
                {c.phone} · {c.email}
              </div>
              {c.is_legal_representative && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <ToneChip tone="green">{t("registration.contacts.legalRepresentative")}</ToneChip>
                  {c.proof.map((f) => (
                    <a key={f.id} href={"/api/files/" + f.id} className="text-xs font-semibold text-primary hover:underline" data-testid="proof-file">
                      {f.file_name}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Every bank account exactly as the signed-in role is allowed to read it today (the IBAN is shown as stored). */
export async function BankAccountsCard({ accounts }: { accounts: BankAccountRow[] }) {
  const t = await getTranslations();
  return (
    <SectionCard title={t("vendorCard.cards.bankAccounts")}>
      {accounts.length === 0 ? (
        <Calm>{t("vendorCard.empty.bankAccounts")}</Calm>
      ) : (
        <ul data-testid="bank-accounts">
          {accounts.map((a) => (
            <li key={a.id} className={ROW} data-testid="bank-account-row">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{a.bank_name}</span>
                {a.is_main && <Badge>{t("bankAccounts.main")}</Badge>}
              </div>
              <div className="font-mono text-xs break-all">{a.iban}</div>
              <div className={MUTED}>
                {t("bankAccounts.swift")} {a.swift} · {a.currency}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export async function CertificatesCard({
  certificates,
  today,
}: {
  certificates: { id: string; type: string; number: string | null; issuer: string | null; expires_on: string | null }[];
  today: string;
}) {
  const t = await getTranslations();
  return (
    <SectionCard title={t("vendorCard.cards.certificates")}>
      {certificates.length === 0 ? (
        <Calm>{t("vendorCard.empty.certificates")}</Calm>
      ) : (
        <ul>
          {certificates.map((c) => (
            <li key={c.id} className={ROW}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t(`certificateTypes.${c.type}`)}</span>
                <StatusBadge status={certificateStatus(c.expires_on, today)} />
              </div>
              <div className={MUTED}>
                {c.expires_on ? t("vendorCard.until", { date: formatDate(c.expires_on) }) : t("profile.noExpiry")}
                {[c.number, c.issuer].filter(Boolean).map((v) => ` · ${v}`)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
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
  // qualified first, then the rest in the order they arrive (newest first)
  const shown = (a: (typeof applications)[number]) => (a.status === "QUALIFIED" && a.valid_until && a.valid_until < today ? "EXPIRED" : a.status);
  const sorted = [...applications].sort((a, b) => Number(shown(b) === "QUALIFIED") - Number(shown(a) === "QUALIFIED"));
  return (
    <SectionCard title={t("vendorCard.cards.categories")}>
      {sorted.length === 0 ? (
        <Calm>{t("vendorCard.empty.categories")}</Calm>
      ) : (
        <ul>
          {sorted.map((a) => (
            <li key={a.id} className={ROW}>
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
              <div className={MUTED}>
                {a.valid_until ? t("vendorCard.until", { date: formatDate(a.valid_until) }) : t("vendorCard.appliedOn", { date: formatDate(a.created_at) })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export async function DocumentsCard({ files }: { files: FileRow[] }) {
  const t = await getTranslations();
  return (
    <SectionCard title={t("vendorCard.cards.documents")}>
      {files.length === 0 ? (
        <Calm>{t("vendorCard.empty.documents")}</Calm>
      ) : (
        <ul>
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 border-t border-[rgba(23,38,43,0.08)] py-1.5 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-words">
                  <span className="font-medium">{f.file_name}</span>
                  {f.kind && <span className={`${MUTED} block`}>{t(`files.kinds.${f.kind}`)}</span>}
                </span>
              </span>
              <a href={`/api/files/${f.id}`} className="shrink-0 text-xs font-semibold text-primary hover:underline" data-testid="file-link">
                {t("vendorCard.download")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** What the old Details tab showed besides the summary facts: goods, guarantee, contact data, review comment. */
export async function MoreDetailsCard({ vendor }: { vendor: VendorRow }) {
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
    <SectionCard title={t("vendorCard.cards.details")}>
      <dl>
        <Fact label={t("profile.fields.mainGoods")}>{vendor.main_goods.length > 0 ? vendor.main_goods.join(", ") : none}</Fact>
        <Fact label={t("profile.fields.bankGuarantee")}>{guarantee}</Fact>
        {vendor.id_card_number && <Fact label={t("registration.fields.idCardNumber")}>{vendor.id_card_number}</Fact>}
        <Fact label={t("registration.fields.contactPerson")}>{vendor.contact_person}</Fact>
        <Fact label={t("registration.fields.contactEmail")}>{vendor.contact_email}</Fact>
        <Fact label={t("registration.fields.phone")}>{vendor.phone}</Fact>
        {vendor.review_comment && <Fact label={t("vendorCard.reviewComment")}>{vendor.review_comment}</Fact>}
      </dl>
    </SectionCard>
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
type Entry = { id: string; at: string; node: ReactNode };

const first = <V,>(v: V | V[] | null): V | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const LIMIT = 6;

/**
 * Full-width Activity card: the registration history, the standing history, the change requests and the profile updates
 * in one list, latest first. Read as the signed-in user, so RLS decides what is visible (the same reads as the old History tab).
 */
export async function ActivityCard({ vendorId, showAll }: { vendorId: string; showAll: boolean }) {
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
  const entries: Entry[] = [];

  for (const r of registration ?? []) {
    const profile = r.to_status === "PROFILE_UPDATED" ? parseProfileEvent(r.reason) : null;
    entries.push({
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
    entries.push({
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
    entries.push({
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

  entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const visible = showAll ? entries : entries.slice(0, LIMIT);
  const link =
    entries.length > LIMIT ? (
      <Link
        href={showAll ? "?" : "?activity=all"}
        scroll={false}
        className="text-xs font-semibold text-primary hover:underline"
        data-testid="activity-toggle"
      >
        {showAll ? t("vendorCard.showLess") : t("vendorCard.showAll")}
      </Link>
    ) : null;

  return (
    <SectionCard title={t("vendorCard.cards.activity")} action={link} testId="vendor-activity">
      {entries.length === 0 ? (
        <Calm>{t("vendorCard.empty.activity")}</Calm>
      ) : (
        <ul>
          {visible.map((e) => (
            <li key={e.id} className="flex gap-3 border-t border-[rgba(23,38,43,0.08)] py-1.5 text-[13px]">
              <span className="w-[8.5rem] shrink-0 text-muted-foreground tabular-nums">{formatDateTime(e.at)}</span>
              {e.node}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Line({ title, sub }: { title: ReactNode; sub: string }) {
  return (
    <span className="min-w-0 flex-1">
      {title}
      {sub && <span className="block text-xs whitespace-pre-wrap text-muted-foreground">{sub}</span>}
    </span>
  );
}
