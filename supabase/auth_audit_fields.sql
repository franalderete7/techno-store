begin;

alter table public.purchases
  add column if not exists created_by_user_id uuid;

alter table public.stock_units
  add column if not exists created_by_user_id uuid,
  add column if not exists sold_by_user_id uuid;

alter table public.purchases
  alter column created_by_user_id set default auth.uid();

alter table public.stock_units
  alter column created_by_user_id set default auth.uid();

create index if not exists idx_purchases_created_by_user_id
  on public.purchases (created_by_user_id);

create index if not exists idx_stock_units_created_by_user_id
  on public.stock_units (created_by_user_id);

create index if not exists idx_stock_units_sold_by_user_id
  on public.stock_units (sold_by_user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_created_by_user_id_fkey'
      and conrelid = 'public.purchases'::regclass
  ) then
    alter table public.purchases
      add constraint purchases_created_by_user_id_fkey
      foreign key (created_by_user_id)
      references auth.users (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_units_created_by_user_id_fkey'
      and conrelid = 'public.stock_units'::regclass
  ) then
    alter table public.stock_units
      add constraint stock_units_created_by_user_id_fkey
      foreign key (created_by_user_id)
      references auth.users (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_units_sold_by_user_id_fkey'
      and conrelid = 'public.stock_units'::regclass
  ) then
    alter table public.stock_units
      add constraint stock_units_sold_by_user_id_fkey
      foreign key (sold_by_user_id)
      references auth.users (id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'created_by'
  ) then
    execute $legacy$
      update public.purchases
      set notes = case
        when created_by is null or btrim(created_by) = '' then notes
        when notes is null or btrim(notes) = '' then '[legacy created_by] ' || btrim(created_by)
        when position('[legacy created_by]' in notes) > 0 then notes
        else notes || E'\n[legacy created_by] ' || btrim(created_by)
      end
      where created_by is not null
        and btrim(created_by) <> ''
    $legacy$;

    execute 'alter table public.purchases drop column created_by';
  end if;
end $$;

create or replace function public.assign_purchase_created_by_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.created_by_user_id is null then
    new.created_by_user_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_purchases_created_by_user_id on public.purchases;

create trigger trg_purchases_created_by_user_id
before insert on public.purchases
for each row
execute function public.assign_purchase_created_by_user_id();

create or replace function public.assign_stock_unit_audit_user_ids()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.created_by_user_id is null then
    new.created_by_user_id := auth.uid();
  end if;

  if new.status = 'sold' then
    if tg_op = 'INSERT' and new.sold_by_user_id is null then
      new.sold_by_user_id := auth.uid();
    elsif tg_op = 'UPDATE' and old.status is distinct from 'sold' and new.sold_by_user_id is null then
      new.sold_by_user_id := auth.uid();
    end if;
  else
    new.sold_by_user_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stock_units_audit_user_ids on public.stock_units;

create trigger trg_stock_units_audit_user_ids
before insert or update on public.stock_units
for each row
execute function public.assign_stock_unit_audit_user_ids();

commit;
