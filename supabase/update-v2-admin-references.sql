-- Cosette — Mise à jour V2 admin + références
-- À exécuter dans Supabase > SQL Editor sur le projet déjà installé.

alter table public.inventory_items
  add column if not exists store_reference text not null default '',
  add column if not exists supplier_reference text not null default '';

create or replace function public.is_cosette_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_members
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.clear_inventory(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_deleted integer := 0;
  v_movements_deleted integer := 0;
begin
  if not public.is_cosette_admin() then
    raise exception 'not_allowed_admin_only';
  end if;

  if coalesce(p_code, '') <> 'SUPPRIMER' then
    raise exception 'invalid_confirmation_code';
  end if;

  delete from public.stock_movements;
  get diagnostics v_movements_deleted = row_count;

  delete from public.inventory_items;
  get diagnostics v_items_deleted = row_count;

  return jsonb_build_object(
    'items_deleted', v_items_deleted,
    'movements_deleted', v_movements_deleted
  );
end;
$$;

grant execute on function public.clear_inventory(text) to authenticated;
