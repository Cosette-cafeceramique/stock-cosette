-- Cosette — V4 réglages appliquables + dashboard stock immobilisé
-- À exécuter dans Supabase > SQL Editor avant de redéployer la V4.

create table if not exists public.app_settings (
  id text primary key default 'global',
  default_category text not null default 'Tasses',
  default_purchase_origin text not null default 'FR' check (default_purchase_origin in ('FR','UE','HORS_UE')),
  default_min_qty integer not null default 3,
  default_sale_vat_rate numeric(5,2) not null default 20,
  default_paint_cost_ht numeric(10,2) not null default 0.50,
  default_firing_cost_ht numeric(10,2) not null default 0.65,
  default_packaging_cost_ht numeric(10,2) not null default 0.25,
  default_other_fixed_cost_ht numeric(10,2) not null default 0.15,
  default_payment_fee_rate numeric(5,2) not null default 1.50,
  default_purchase_vat_rate numeric(5,2) not null default 20,
  default_supplier text not null default '',
  low_margin_alert_rate numeric(5,2) not null default 55,
  updated_at timestamptz not null default now()
);

alter table public.app_settings
  add column if not exists default_category text not null default 'Tasses',
  add column if not exists default_purchase_origin text not null default 'FR',
  add column if not exists default_min_qty integer not null default 3,
  add column if not exists default_sale_vat_rate numeric(5,2) not null default 20,
  add column if not exists default_paint_cost_ht numeric(10,2) not null default 0.50,
  add column if not exists default_firing_cost_ht numeric(10,2) not null default 0.65,
  add column if not exists default_packaging_cost_ht numeric(10,2) not null default 0.25,
  add column if not exists default_other_fixed_cost_ht numeric(10,2) not null default 0.15,
  add column if not exists default_payment_fee_rate numeric(5,2) not null default 1.50,
  add column if not exists default_purchase_vat_rate numeric(5,2) not null default 20,
  add column if not exists default_supplier text not null default '',
  add column if not exists low_margin_alert_rate numeric(5,2) not null default 55,
  add column if not exists updated_at timestamptz not null default now();

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

alter table public.app_settings enable row level security;

drop policy if exists "Cosette members can read settings" on public.app_settings;
create policy "Cosette members can read settings"
on public.app_settings
for select
to authenticated
using (public.is_cosette_member());

-- Dans cette V4, tous les membres Cosette peuvent modifier les réglages.
-- Ça évite d'être bloquée si le rôle n'a pas été mis exactement à admin dans app_members.
drop policy if exists "Cosette admins can insert settings" on public.app_settings;
drop policy if exists "Cosette admins can update settings" on public.app_settings;
drop policy if exists "Cosette members can insert settings" on public.app_settings;
create policy "Cosette members can insert settings"
on public.app_settings
for insert
to authenticated
with check (public.is_cosette_member());

drop policy if exists "Cosette members can update settings" on public.app_settings;
create policy "Cosette members can update settings"
on public.app_settings
for update
to authenticated
using (public.is_cosette_member())
with check (public.is_cosette_member());
