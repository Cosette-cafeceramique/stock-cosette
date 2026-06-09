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

-- IMPORT DU STOCK PHOTO
-- Les prix et références fournisseur sont à compléter ensuite dans l'app.
delete from public.stock_movements;
delete from public.inventory_items;

insert into public.inventory_items (
  name, category, supplier, sku, store_reference, supplier_reference, purchase_origin,
  stock_qty, min_qty, price_ttc, sale_vat_rate, purchase_price_ht, purchase_vat_recoverable,
  paint_cost_ht, firing_cost_ht, packaging_cost_ht, other_fixed_cost_ht, payment_fee_rate, note
)
values
('Assiette Cœur Amour','Assiettes','','','COS-001','A_COMPLETER','FR',1,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Audrey','Stock photo','','','COS-002','A_COMPLETER','FR',8,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Ambre','Stock photo','','','COS-003','A_COMPLETER','FR',16,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Alena','Stock photo','','','COS-004','A_COMPLETER','FR',4,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Apollo','Stock photo','','','COS-005','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Amélie','Stock photo','','','COS-006','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Assiette Vagues','Assiettes','','','COS-007','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Amelia','Stock photo','','','COS-008','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Alba','Stock photo','','','COS-009','A_COMPLETER','FR',48,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Akim','Stock photo','','','COS-010','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Blandine','Stock photo','','','COS-011','A_COMPLETER','FR',19,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Barbara','Stock photo','','','COS-012','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Bol Chat','Bols','','','COS-013','A_COMPLETER','FR',26,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Boîte Cœur Amour','Boîtes','','','COS-014','A_COMPLETER','FR',29,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Charlotte','Stock photo','','','COS-015','A_COMPLETER','FR',15,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Christine','Stock photo','','','COS-016','A_COMPLETER','FR',3,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Colette','Stock photo','','','COS-017','A_COMPLETER','FR',18,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Clarisse','Stock photo','','','COS-018','A_COMPLETER','FR',13,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Clémence','Stock photo','','','COS-019','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Catia','Stock photo','','','COS-020','A_COMPLETER','FR',4,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Corine','Stock photo','','','COS-021','A_COMPLETER','FR',4,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Corentin','Stock photo','','','COS-022','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Claire','Stock photo','','','COS-023','A_COMPLETER','FR',24,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Coline','Stock photo','','','COS-024','A_COMPLETER','FR',47,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Cyndi','Stock photo','','','COS-025','A_COMPLETER','FR',48,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Caroline','Stock photo','','','COS-026','A_COMPLETER','FR',18,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Cheval','Stock photo','','','COS-027','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Cid','Stock photo','','','COS-028','A_COMPLETER','FR',24,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Dessous de plat bulle','Plats','','','COS-029','A_COMPLETER','FR',23,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Delphine','Stock photo','','','COS-030','A_COMPLETER','FR',10,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Didier','Stock photo','','','COS-031','A_COMPLETER','FR',6,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Dominique','Stock photo','','','COS-032','A_COMPLETER','FR',7,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Escargot','Stock photo','','','COS-033','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Flore','Stock photo','','','COS-034','A_COMPLETER','FR',18,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Elsa','Stock photo','','','COS-035','A_COMPLETER','FR',6,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Elodie','Stock photo','','','COS-036','A_COMPLETER','FR',1,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Enola','Stock photo','','','COS-037','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Fitz','Stock photo','','','COS-038','A_COMPLETER','FR',34,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Figaro','Stock photo','','','COS-039','A_COMPLETER','FR',16,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Flavie','Stock photo','','','COS-040','A_COMPLETER','FR',4,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Florence','Stock photo','','','COS-041','A_COMPLETER','FR',1,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Grand Vase Rond','Vases','','','COS-042','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Hélène','Stock photo','','','COS-043','A_COMPLETER','FR',23,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Julie','Stock photo','','','COS-044','A_COMPLETER','FR',3,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Jacqueline','Stock photo','','','COS-045','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Johanna','Stock photo','','','COS-046','A_COMPLETER','FR',84,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Josette','Stock photo','','','COS-047','A_COMPLETER','FR',1,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Liam','Stock photo','','','COS-048','A_COMPLETER','FR',21,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Lydia','Stock photo','','','COS-049','A_COMPLETER','FR',3,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Laura','Stock photo','','','COS-050','A_COMPLETER','FR',28,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Lisa','Stock photo','','','COS-051','A_COMPLETER','FR',8,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Louise','Stock photo','','','COS-052','A_COMPLETER','FR',24,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Laurianne','Stock photo','','','COS-053','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Lili','Stock photo','','','COS-054','A_COMPLETER','FR',24,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Marinette','Stock photo','','','COS-055','A_COMPLETER','FR',9,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Martine','Stock photo','','','COS-056','A_COMPLETER','FR',6,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Monique','Stock photo','','','COS-057','A_COMPLETER','FR',21,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Margot','Stock photo','','','COS-058','A_COMPLETER','FR',9,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Myriam','Stock photo','','','COS-059','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Manon','Stock photo','','','COS-060','A_COMPLETER','FR',26,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Mirabelle','Stock photo','','','COS-061','A_COMPLETER','FR',2,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Michael','Stock photo','','','COS-062','A_COMPLETER','FR',77,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Mug Clément','Tasses','','','COS-063','A_COMPLETER','FR',10,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Maryline','Stock photo','','','COS-064','A_COMPLETER','FR',120,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Maëlys','Stock photo','','','COS-065','A_COMPLETER','FR',36,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Nicole','Stock photo','','','COS-066','A_COMPLETER','FR',23,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Noémie','Stock photo','','','COS-067','A_COMPLETER','FR',10,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Nash','Stock photo','','','COS-068','A_COMPLETER','FR',7,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Octavie','Stock photo','','','COS-069','A_COMPLETER','FR',8,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Orane (cuvettes pâtes)','Stock photo','','','COS-070','A_COMPLETER','FR',36,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Paola','Stock photo','','','COS-071','A_COMPLETER','FR',24,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Pauline','Stock photo','','','COS-072','A_COMPLETER','FR',25,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Petits casiers','Accessoires','','','COS-073','A_COMPLETER','FR',45,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Poule','Stock photo','','','COS-074','A_COMPLETER','FR',16,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Presse citron','Accessoires','','','COS-075','A_COMPLETER','FR',8,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Patrick','Stock photo','','','COS-076','A_COMPLETER','FR',4,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Plats','Plats','','','COS-077','A_COMPLETER','FR',22,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Pierre','Stock photo','','','COS-078','A_COMPLETER','FR',3,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Solveig','Stock photo','','','COS-079','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Stéphanie','Stock photo','','','COS-080','A_COMPLETER','FR',23,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Sophie','Stock photo','','','COS-081','A_COMPLETER','FR',22,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Suzan','Stock photo','','','COS-082','A_COMPLETER','FR',1,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Stéphane','Stock photo','','','COS-083','A_COMPLETER','FR',3,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Simon','Stock photo','','','COS-084','A_COMPLETER','FR',18,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Thomas','Stock photo','','','COS-085','A_COMPLETER','FR',11,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Ulys','Stock photo','','','COS-086','A_COMPLETER','FR',4,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Valentin','Stock photo','','','COS-087','A_COMPLETER','FR',18,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('V & G','Stock photo','','','COS-088','A_COMPLETER','FR',8,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Victoria','Stock photo','','','COS-089','A_COMPLETER','FR',12,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix'),
('Yanis','Stock photo','','','COS-090','A_COMPLETER','FR',18,3,0,20,0,0,0.50,0.65,0.25,0.15,1.50,'Import photo stock 09/06/2026 – vérifier nom/références/prix');
