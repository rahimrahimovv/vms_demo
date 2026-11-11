/** Value lists from the backlog ERD (vendor, vendor_owner, vendor_certificate). Labels live in messages/en.json. */
export const VENDOR_TYPES = ["LOCAL_COMPANY", "INDIVIDUAL", "FOREIGN_COMPANY"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const OWNER_ROLES = ["HEAD", "FOUNDER", "SHAREHOLDER"] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

export const ACTIVITIES = [
  "MANUFACTURER",
  "DISTRIBUTOR",
  "OFFICIAL_DEALER",
  "SERVICE_PROVIDER",
  "TRADER",
  "OTHER",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const GUARANTEE_TYPES = ["BID", "ADVANCE", "PERFORMANCE"] as const;

export const CERTIFICATE_TYPES = [
  "ISO_9001",
  "ISO_14001",
  "ISO_45001",
  "HSE_POLICY",
  "PRODUCT",
  "LICENCE",
  "REFERENCE",
  "CATALOGUE",
  "OTHER",
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

/** Countries offered on registration (ISO 3166 codes; names under "countries" in messages). */
export const COUNTRIES = [
  "AZ", "TR", "GE", "KZ", "UZ", "RU", "UA", "IR", "AE", "SA", "CN", "IN",
  "DE", "NL", "FR", "IT", "ES", "PL", "GB", "US", "IL", "EG", "BY", "TM",
] as const;

/** Currencies for the bank guarantee amount (the vendor's own capacity; purchases stay in AZN). */
export const GUARANTEE_CURRENCIES = ["AZN", "USD", "EUR"] as const;

export const MAX_MAIN_GOODS = 20;
