-- Shared six-category equipment catalog for Inventory and Paraphernalia.
--
-- Paste this entire file into the Supabase SQL Editor and run it once before
-- using the updated pages. It is safe to rerun and preserves item prices and
-- all existing Inventory fixed-asset records.

begin;

alter table if exists public.paraphernalia_items
  add column if not exists item_group text;

-- Normalize the historical misspelling before both pages share the catalog.
update public.restock
set item = 'SYSTEM UNIT'
where upper(btrim(coalesce(item, ''))) = 'SYTEM UNIT';

update public.paraphernalia
set items = 'SYSTEM UNIT'
where upper(btrim(coalesce(items::text, ''))) = 'SYTEM UNIT';

update public.paraphernalia_inventory
set items = 'SYSTEM UNIT'
where upper(btrim(coalesce(items, ''))) = 'SYTEM UNIT';

insert into public.paraphernalia_items (
  item_name,
  item_category,
  item_group,
  display_order,
  is_active
)
values
  ('CIGNUS', 'SEC', 'Communication', 1, true),
  ('KENWOOD', 'SEC', 'Communication', 2, true),
  ('MOTOROLA', 'SEC', 'Communication', 4, true),
  ('VERSA', 'SEC', 'Communication', 5, true),
  ('IQONIC', 'SEC', 'Communication', 6, true),
  ('PHONE', 'SEC', 'Communication', 7, true),
  ('SATELLITE PHONE', 'SEC', 'Communication', 8, true),
  ('MEGAPHONE', 'SEC', 'Communication', 9, true),
  ('BINOCULAR', 'SEC', 'Security / Safety', 10, true),
  ('BODYCAMERA', 'SEC', 'Security / Safety', 12, true),
  ('BULLET PROOF VEST', 'SEC', 'Security / Safety', 13, true),
  ('DRONE', 'SEC', 'Security / Safety', 14, true),
  ('FIRE EXTINGUISHER', 'SEC', 'Security / Safety', 15, true),
  ('GUARD TOUR SYSTEM', 'SEC', 'Security / Safety', 16, true),
  ('HAND TALLY COUNTER', 'SEC', 'Security / Safety', 17, true),
  ('INDUSTRIAL MASK', 'SEC', 'Security / Safety', 18, true),
  ('LIFE RING', 'SEC', 'Security / Safety', 19, true),
  ('LIFE VEST', 'SEC', 'Security / Safety', 20, true),
  ('METAL DETECTOR', 'SEC', 'Security / Safety', 21, true),
  ('NIGHT STICK', 'SEC', 'Security / Safety', 22, true),
  ('SEARCH LIGHT', 'SEC', 'Security / Safety', 23, true),
  ('SIGNAGE', 'SEC', 'Security / Safety', 24, true),
  ('SPEED RADAR', 'SEC', 'Security / Safety', 25, true),
  ('TRAFFIC CONE', 'SEC', 'Security / Safety', 26, true),
  ('WALK THROUGH', 'SEC', 'Security / Safety', 27, true),
  ('HARD HAT', 'SEC', 'Security / Safety', 28, true),
  ('FLARE GUN', 'SEC', 'Tactical', 29, true),
  ('PISTOL', 'SEC', 'Tactical', 30, true),
  ('SHOTGUN', 'SEC', 'Tactical', 31, true),
  ('TASER GUN', 'SEC', 'Tactical', 32, true),
  ('EXTRA MAGAZINE 9MM', 'SEC', 'Tactical', 33, true),
  ('BIKE', 'SEC', 'Transportation / Mobility', 34, true),
  ('MOBILE', 'SEC', 'Transportation / Mobility', 35, true),
  ('MOTORCYCLE', 'SEC', 'Transportation / Mobility', 36, true),
  ('SEABOURNE', 'SEC', 'Transportation / Mobility', 37, true),
  ('BP APPRATUS', 'SEC', 'Emergency / Medical', 38, true),
  ('C-COLLAR', 'SEC', 'Emergency / Medical', 39, true),
  ('CPR DUMMY', 'SEC', 'Emergency / Medical', 40, true),
  ('FIRST AID CABINET', 'SEC', 'Emergency / Medical', 41, true),
  ('FIRST AID KIT', 'SEC', 'Emergency / Medical', 42, true),
  ('OXYGEN TANK', 'SEC', 'Emergency / Medical', 43, true),
  ('SPINEBOARD', 'SEC', 'Emergency / Medical', 44, true),
  ('STRETCHER', 'SEC', 'Emergency / Medical', 45, true),
  ('WHEEL CHAIR', 'SEC', 'Emergency / Medical', 46, true),
  ('AIRCON', 'OFFICE', 'Office Equipment', 47, true),
  ('BIOMETRIC', 'OFFICE', 'Office Equipment', 48, true),
  ('BUILT-IN-MONITOR', 'OFFICE', 'Office Equipment', 49, true),
  ('BUNDYCLOCK', 'OFFICE', 'Office Equipment', 50, true),
  ('DISCHARGE TUBE/BOX', 'OFFICE', 'Office Equipment', 51, true),
  ('ELECTRICFAN', 'OFFICE', 'Office Equipment', 52, true),
  ('INDUSTRIAL FAN', 'OFFICE', 'Office Equipment', 53, true),
  ('LIFTING BELT', 'OFFICE', 'Office Equipment', 54, true),
  ('MONITOR', 'OFFICE', 'Office Equipment', 55, true),
  ('OFFICE TABLE', 'OFFICE', 'Office Equipment', 56, true),
  ('PODIUM TABLE', 'OFFICE', 'Office Equipment', 57, true),
  ('PRINTER', 'OFFICE', 'Office Equipment', 58, true),
  ('PROJECTOR', 'OFFICE', 'Office Equipment', 59, true),
  ('SAFETY VAULT', 'OFFICE', 'Office Equipment', 60, true),
  ('STEEL CABINET', 'OFFICE', 'Office Equipment', 61, true),
  ('STEEL LOCKER', 'OFFICE', 'Office Equipment', 62, true),
  ('SYSTEM UNIT', 'OFFICE', 'Office Equipment', 63, true),
  ('LAPTOP', 'OFFICE', 'Office Equipment', 64, true),
  ('CIGNUS CHARGER', 'OFFICE', 'Office Equipment', 65, true),
  ('VERSA CHARGER', 'OFFICE', 'Office Equipment', 66, true),
  ('SPARE BATTERY', 'OFFICE', 'Office Equipment', 67, true),
  ('OFFICE CHAIR', 'OFFICE', 'Office Equipment', 68, true),
  ('DOUBLE DECK', 'OFFICE', 'Office Equipment', 69, true),
  ('XEROX MACHINE', 'OFFICE', 'Office Equipment', 70, true)
on conflict (item_name) do update
set item_category = excluded.item_category,
    item_group = excluded.item_group,
    display_order = excluded.display_order,
    is_active = true,
    updated_at = now();

update public.paraphernalia_items target
set unit_price = source.unit_price,
    updated_at = now()
from public.paraphernalia_items source
where upper(btrim(target.item_name)) = 'SYSTEM UNIT'
  and upper(btrim(source.item_name)) = 'SYTEM UNIT'
  and coalesce(target.unit_price, 0) = 0
  and coalesce(source.unit_price, 0) > 0;

delete from public.paraphernalia_items
where upper(btrim(item_name)) = 'SYTEM UNIT';

-- Custom historical items remain available. Assign them to their existing
-- Security/Office inventory family when no six-category value is known.
update public.paraphernalia_items
set item_group = case
  when upper(btrim(coalesce(item_category, 'SEC'))) = 'OFFICE' then 'Office Equipment'
  else 'Security / Safety'
end
where nullif(btrim(coalesce(item_group, '')), '') is null;

alter table public.paraphernalia_items
  alter column item_group set default 'Security / Safety',
  alter column item_group set not null;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select pc.conname
    from pg_constraint pc
    where pc.conrelid = 'public.paraphernalia_items'::regclass
      and pc.contype = 'c'
      and lower(pg_get_constraintdef(pc.oid)) like '%item_group%'
  loop
    execute format(
      'alter table public.paraphernalia_items drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end
$$;

alter table public.paraphernalia_items
  add constraint paraphernalia_items_item_group_check
  check (item_group in (
    'Communication',
    'Security / Safety',
    'Tactical',
    'Transportation / Mobility',
    'Emergency / Medical',
    'Office Equipment'
  ));

create index if not exists paraphernalia_items_group_order_idx
  on public.paraphernalia_items (item_group, display_order, item_name);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.paraphernalia_items
  to anon, authenticated, service_role;

commit;

-- Optional verification:
-- select item_group, count(*) as item_count
-- from public.paraphernalia_items
-- where is_active = true
-- group by item_group
-- order by item_group;
