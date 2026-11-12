-- REG-01 / REG-07: the account form asks for the type's identifier only; address, director and the VAT answer
-- are filled in later, step by step. The per-type field rules now apply once the registration is SUBMITTED
-- (registration_submit checks them again) and stay true for every SUBMITTED, APPROVED or REJECTED vendor.
alter table public.vendor drop constraint vendor_local_fields;
alter table public.vendor add constraint vendor_local_fields check (
  vendor_type <> 'LOCAL_COMPANY' or (voen is not null
    and (status in ('DRAFT', 'RETURNED')
         or (legal_address is not null and director_name is not null and is_vat_payer is not null)))
);

alter table public.vendor drop constraint vendor_foreign_fields;
alter table public.vendor add constraint vendor_foreign_fields check (
  vendor_type <> 'FOREIGN_COMPANY' or (foreign_tax_number is not null and voen is null
    and (status in ('DRAFT', 'RETURNED') or legal_address is not null))
);
