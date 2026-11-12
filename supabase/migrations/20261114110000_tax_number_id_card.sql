-- REG-01 AC4: an ID card number already used by another vendor is refused, like a VÖEN or a foreign tax number.
drop function public.vendor_tax_number_taken(text, text, uuid);

create function public.vendor_tax_number_taken(p_voen text, p_foreign_tax_number text, p_except uuid default null,
                                               p_id_card_number text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vendor v
                 where v.id is distinct from p_except
                   and ((p_voen is not null and v.voen = p_voen)
                     or (p_foreign_tax_number is not null
                         and upper(btrim(v.foreign_tax_number)) = upper(btrim(p_foreign_tax_number)))
                     or (p_id_card_number is not null
                         and upper(btrim(v.id_card_number)) = upper(btrim(p_id_card_number)))))
$$;

revoke execute on function public.vendor_tax_number_taken(text, text, uuid, text) from public, anon, authenticated;
