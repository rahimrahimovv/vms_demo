-- Slice 7 follow-up: a vendor reaches only POs that were released to it (PO-02 AC4, PO-03 AC1). Answering a PO of its own
-- that is still PENDING_APPROVAL, PENDING_COMMITTEE or REJECTED is refused like an unknown PO ("errors.noAccess"), so the
-- vendor learns nothing about it before it is FULLY_APPROVED. Same visible statuses as public.po_list and public.po_view.
create or replace function public.po_respond(p_po uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  po       public.purchase_order;
  s        public.sourcing;
  v_vendor uuid := app.current_vendor_id();
begin
  if v_vendor is null or p_decision not in ('ACCEPT', 'DECLINE') then perform app.fail('errors.noAccess'); end if;
  select * into po from public.purchase_order
   where id = p_po and vendor_id = v_vendor
     and status in ('FULLY_APPROVED', 'ACCEPTED', 'DECLINED_BY_VENDOR') for update;    -- own, released POs only (AC5)
  if po.id is null then perform app.fail('errors.noAccess'); end if;
  if po.status <> 'FULLY_APPROVED' then perform app.fail('errors.statusChanged'); end if;
  select * into s from public.sourcing where id = po.sourcing_id for update;

  if p_decision = 'DECLINE' then                                                        -- AC3
    if nullif(btrim(p_reason), '') is null then perform app.fail('errors.reasonRequired'); end if;
    perform set_config('app.audit_reason', btrim(p_reason), true);
    update public.purchase_order set status = 'DECLINED_BY_VENDOR', reason = btrim(p_reason) where id = po.id;
    perform app.return_po_lines(po.id, 'PO ' || po.number || ' declined by the vendor');
    perform app.notify(array[s.owner_id], 'po.declined', 'purchase_order', po.id, po.number,
                       jsonb_build_object('reason', btrim(p_reason)));
  else                                                                                  -- AC2, AC4
    perform set_config('app.audit_reason', '', true);
    update public.purchase_order set status = 'ACCEPTED' where id = po.id;
    perform app.notify(array[s.owner_id, coalesce(app.sourcing_requester(s.id), s.owner_id)],
                       'po.accepted', 'purchase_order', po.id, po.number);
    perform app.complete_if_done(s.id);
  end if;
end $$;

revoke execute on function public.po_respond(uuid, text, text) from public, anon;
grant execute on function public.po_respond(uuid, text, text) to authenticated;
