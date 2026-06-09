-- Cosette — Supabase schema
-- À exécuter dans Supabase > SQL Editor.
-- Cette version utilise RLS + table app_members.
-- Après création de ton compte dans l'app, copie ton UUID et ajoute-le dans app_members.

create extension if not exists pgcrypto;

create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'admin' check (role in ('admin','team')),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Autre',
  supplier text not null default '',
  sku text not null default '',
  store_reference text not null default '',
  supplier_reference text not null default '',
  purchase_origin text not null default 'FR' check (purchase_origin in ('FR','UE','HORS_UE')),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  min_qty integer not null default 0 check (min_qty >= 0),
  price_ttc numeric(10,2) not null default 0 check (price_ttc >= 0),
  sale_vat_rate numeric(5,2) not null default 20 check (sale_vat_rate >= 0),
  purchase_price_ht numeric(10,2) not null default 0 check (purchase_price_ht >= 0),
  purchase_vat_recoverable numeric(10,2) not null default 0 check (purchase_vat_recoverable >= 0),
  paint_cost_ht numeric(10,2) not null default 0.50 check (paint_cost_ht >= 0),
  firing_cost_ht numeric(10,2) not null default 0.65 check (firing_cost_ht >= 0),
  packaging_cost_ht numeric(10,2) not null default 0.25 check (packaging_cost_ht >= 0),
  other_fixed_cost_ht numeric(10,2) not null default 0.15 check (other_fixed_cost_ht >= 0),
  payment_fee_rate numeric(5,2) not null default 1.50 check (payment_fee_rate >= 0),
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  type text not null check (type in ('purchase','sale','loss','adjust_plus','adjust_minus')),
  qty integer not null check (qty > 0),
  before_qty integer not null,
  after_qty integer not null,
  unit_price_ttc numeric(10,2) not null default 0,
  unit_purchase_price_ht numeric(10,2) not null default 0,
  unit_full_cost_ht numeric(10,2) not null default 0,
  unit_margin_ht numeric(10,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

create or replace function public.is_cosette_member()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_members
    where user_id = auth.uid()
  );
$$;


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

alter table public.app_members enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "Members can read their own member row" on public.app_members;
create policy "Members can read their own member row"
on public.app_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Cosette members can read inventory" on public.inventory_items;
create policy "Cosette members can read inventory"
on public.inventory_items
for select
to authenticated
using (public.is_cosette_member());

drop policy if exists "Cosette members can insert inventory" on public.inventory_items;
create policy "Cosette members can insert inventory"
on public.inventory_items
for insert
to authenticated
with check (public.is_cosette_member());

drop policy if exists "Cosette members can update inventory" on public.inventory_items;
create policy "Cosette members can update inventory"
on public.inventory_items
for update
to authenticated
using (public.is_cosette_member())
with check (public.is_cosette_member());

drop policy if exists "Cosette members can delete inventory" on public.inventory_items;
create policy "Cosette members can delete inventory"
on public.inventory_items
for delete
to authenticated
using (public.is_cosette_member());

drop policy if exists "Cosette members can read movements" on public.stock_movements;
create policy "Cosette members can read movements"
on public.stock_movements
for select
to authenticated
using (public.is_cosette_member());

drop policy if exists "Cosette members can insert movements" on public.stock_movements;
create policy "Cosette members can insert movements"
on public.stock_movements
for insert
to authenticated
with check (public.is_cosette_member());

create or replace function public.record_stock_movement(
  p_item_id uuid,
  p_type text,
  p_qty integer,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_before integer;
  v_after integer;
  v_delta integer;
  v_price_ht numeric;
  v_unit_full_cost numeric;
  v_unit_margin numeric;
begin
  if not public.is_cosette_member() then
    raise exception 'not_allowed';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid_qty';
  end if;

  if p_type not in ('purchase','sale','loss','adjust_plus','adjust_minus') then
    raise exception 'invalid_type';
  end if;

  select *
  into v_item
  from public.inventory_items
  where id = p_item_id and active = true
  for update;

  if not found then
    raise exception 'item_not_found';
  end if;

  v_before := v_item.stock_qty;

  v_delta := case
    when p_type in ('purchase','adjust_plus') then p_qty
    else -p_qty
  end;

  v_after := greatest(0, v_before + v_delta);

  update public.inventory_items
  set stock_qty = v_after
  where id = p_item_id;

  v_price_ht := case
    when v_item.sale_vat_rate > 0 then v_item.price_ttc / (1 + v_item.sale_vat_rate / 100)
    else v_item.price_ttc
  end;

  v_unit_full_cost :=
    v_item.purchase_price_ht
    + v_item.paint_cost_ht
    + v_item.firing_cost_ht
    + v_item.packaging_cost_ht
    + v_item.other_fixed_cost_ht
    + (v_item.price_ttc * v_item.payment_fee_rate / 100);

  v_unit_margin := v_price_ht - v_unit_full_cost;

  insert into public.stock_movements (
    item_id,
    type,
    qty,
    before_qty,
    after_qty,
    unit_price_ttc,
    unit_purchase_price_ht,
    unit_full_cost_ht,
    unit_margin_ht,
    note
  )
  values (
    p_item_id,
    p_type,
    p_qty,
    v_before,
    v_after,
    v_item.price_ttc,
    v_item.purchase_price_ht,
    v_unit_full_cost,
    v_unit_margin,
    coalesce(p_note, '')
  );

  return jsonb_build_object('before', v_before, 'after', v_after);
end;
$$;

grant execute on function public.record_stock_movement(uuid, text, integer, text) to authenticated;

-- Données exemple. Tu peux supprimer ce bloc après test.
insert into public.inventory_items (
  name, category, supplier, sku, store_reference, supplier_reference, purchase_origin, stock_qty, min_qty,
  price_ttc, sale_vat_rate, purchase_price_ht, purchase_vat_recoverable,
  paint_cost_ht, firing_cost_ht, packaging_cost_ht, other_fixed_cost_ht, payment_fee_rate, note
)
values
('Assiette S', 'Assiettes', '', '', 'COS-A-S', 'FOUR-A-S', 'FR', 24, 8, 18.00, 20, 2.10, 0.42, 0.45, 0.65, 0.25, 0.15, 1.50, 'Format très populaire'),
('Assiette M', 'Assiettes', '', '', 'COS-A-M', 'FOUR-A-M', 'FR', 18, 6, 23.00, 20, 3.20, 0.64, 0.50, 0.70, 0.30, 0.20, 1.50, 'Bon panier moyen'),
('Bol M', 'Bols', '', '', 'COS-B-M', 'FOUR-B-M', 'UE', 12, 5, 25.00, 20, 3.80, 0.00, 0.55, 0.75, 0.30, 0.20, 1.50, 'Fournisseur UE HT'),
('Tasse standard', 'Tasses', '', '', 'COS-T-STD', 'FOUR-T-STD', 'FR', 30, 10, 22.00, 20, 2.90, 0.58, 0.50, 0.65, 0.25, 0.15, 1.50, 'Best-seller atelier'),
('Vase', 'Vases', '', '', 'COS-VASE', 'FOUR-VASE', 'UE', 4, 5, 39.00, 20, 8.50, 0.00, 0.90, 1.20, 0.60, 0.30, 1.50, 'Stock bas'),
('Beurrier', 'Grosses pièces', '', '', 'COS-BEUR', 'FOUR-BEUR', 'FR', 0, 2, 45.00, 20, 10.20, 2.04, 0.85, 1.30, 0.55, 0.30, 1.50, 'À recommander')
on conflict do nothing;


-- Cosette — V3 responsive + réglages + import du stock photo
-- À exécuter dans Supabase > SQL Editor.
-- Cette version :
-- 1) ajoute les réglages par défaut,
-- 2) ajoute/répare les références magasin/fournisseur,
-- 3) remplace l'inventaire actuel par le stock lu sur la photo.

alter table public.inventory_items
  add column if not exists store_reference text not null default '',
  add column if not exists supplier_reference text not null default '';

create table if not exists public.app_settings (
  id text primary key default 'global',
  default_category text not null default 'Tasses',
  default_purchase_origin text not null default 'FR' check (default_purchase_origin in ('FR','UE','HORS_UE')),
  default_min_qty integer not null default 3 check (default_min_qty >= 0),
  default_sale_vat_rate numeric(5,2) not null default 20 check (default_sale_vat_rate >= 0),
  default_paint_cost_ht numeric(10,2) not null default 0.50 check (default_paint_cost_ht >= 0),
  default_firing_cost_ht numeric(10,2) not null default 0.65 check (default_firing_cost_ht >= 0),
  default_packaging_cost_ht numeric(10,2) not null default 0.25 check (default_packaging_cost_ht >= 0),
  default_other_fixed_cost_ht numeric(10,2) not null default 0.15 check (default_other_fixed_cost_ht >= 0),
  default_payment_fee_rate numeric(5,2) not null default 1.50 check (default_payment_fee_rate >= 0),
  default_purchase_vat_rate numeric(5,2) not null default 20 check (default_purchase_vat_rate >= 0),
  default_supplier text not null default '',
  low_margin_alert_rate numeric(5,2) not null default 55 check (low_margin_alert_rate >= 0),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Cosette members can read settings" on public.app_settings;
create policy "Cosette members can read settings"
on public.app_settings
for select
to authenticated
using (public.is_cosette_member());

drop policy if exists "Cosette admins can insert settings" on public.app_settings;
create policy "Cosette admins can insert settings"
on public.app_settings
for insert
to authenticated
with check (public.is_cosette_admin());

drop policy if exists "Cosette admins can update settings" on public.app_settings;
create policy "Cosette admins can update settings"
on public.app_settings
for update
to authenticated
using (public.is_cosette_admin())
with check (public.is_cosette_admin());

insert into public.app_settings (id)
values ('global')
on conflict (id) do nothing;

create or replace function public.set_app_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_app_settings_updated_at();

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

