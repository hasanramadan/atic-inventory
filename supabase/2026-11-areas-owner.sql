-- ATIC website: areas (Production / Lab / Preparation) and the owner account.
-- Run ONCE in Supabase → SQL Editor → paste → Run. Safe to run again (nothing is duplicated).
-- What it does:
--   1. Each account gets "areas": which of Production, Lab, Preparation it may open (everyone keeps Production).
--   2. The first admin account (the one created at setup = Hasan) becomes the OWNER: all areas, hidden from
--      everyone else's user lists, and no one else can change, reset or delete it.
--   3. Only the owner can choose areas, through owner_set_areas().

alter table public.profiles add column if not exists areas text[] not null default array['production'];
alter table public.profiles add column if not exists is_owner boolean not null default false;

create or replace function public.is_owner(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_owner from public.profiles p where p.id = uid), false)
$$;

-- 2. the owner: the first admin created (only if there is no owner yet)
update public.profiles set is_owner = true, role = 'admin', areas = array['production','lab','preparation']
 where id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
   and not exists (select 1 from public.profiles where is_owner);

-- hidden from everyone else (added on top of the existing read rules)
drop policy if exists profiles_hide_owner on public.profiles;
create policy profiles_hide_owner on public.profiles as restrictive for select to authenticated
  using (not is_owner or id = auth.uid() or public.is_owner(auth.uid()));

-- nobody but the owner may change or delete the owner, make an owner, or choose areas
create or replace function public.protect_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or public.is_owner(me) then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and old.is_owner then raise exception 'The owner account cannot be deleted.'; end if;
  if tg_op = 'UPDATE' then
    if old.is_owner then raise exception 'Only the owner can change the owner account.'; end if;
    if new.is_owner is distinct from old.is_owner then raise exception 'Only the owner can make an owner.'; end if;
    if new.areas is distinct from old.areas then raise exception 'Only the owner chooses areas.'; end if;
  end if;
  if tg_op = 'INSERT' and new.is_owner then raise exception 'Only the owner can make an owner.'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists protect_owner on public.profiles;
create trigger protect_owner before insert or update or delete on public.profiles
  for each row execute function public.protect_owner();

-- the owner's sign-in (password, username) and the account itself are protected too
create or replace function public.protect_owner_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or public.is_owner(me) or not public.is_owner(old.id) then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then raise exception 'The owner account cannot be deleted.'; end if;
  if new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email then
    raise exception 'Only the owner can change the owner sign-in.';
  end if;
  return new;
end $$;
drop trigger if exists protect_owner_auth on auth.users;
create trigger protect_owner_auth before update or delete on auth.users
  for each row execute function public.protect_owner_auth();

-- 3. owner chooses areas
create or replace function public.owner_set_areas(p_user uuid, p_areas text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(auth.uid()) then raise exception 'Only the owner chooses areas.'; end if;
  if coalesce(array_length(p_areas, 1), 0) = 0 then raise exception 'Choose at least one area.'; end if;
  if exists (select 1 from unnest(p_areas) a where a not in ('production', 'lab', 'preparation')) then raise exception 'Unknown area.'; end if;
  update public.profiles set areas = p_areas where id = p_user;
end $$;
revoke all on function public.owner_set_areas(uuid, text[]) from public;
grant execute on function public.owner_set_areas(uuid, text[]) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;

-- check: who is the owner now?
select username, full_name, role, is_owner, areas from public.profiles order by is_owner desc, created_at;
