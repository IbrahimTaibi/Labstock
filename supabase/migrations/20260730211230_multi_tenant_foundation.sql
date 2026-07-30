-- Multi-tenant : un administrateur global, des laboratoires isolés.

create table public.laboratories (
  id serial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  -- Laboratoire d'appartenance (membres). Null pour l'admin global.
  lab_id integer references public.laboratories (id) on delete set null,
  -- Laboratoire consulté par l'admin (ignoré pour les membres).
  active_lab_id integer references public.laboratories (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.laboratories enable row level security;
alter table public.profiles enable row level security;

-- SECURITY DEFINER : lisent uniquement la ligne du demandeur (auth.uid()),
-- pour éviter la récursion des politiques RLS sur profiles.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Laboratoire effectif : le sien pour un membre, le laboratoire consulté
-- pour l'admin (à défaut le premier existant, pour ne jamais le bloquer).
create or replace function public.current_lab_id()
returns integer
language sql stable security definer
set search_path = public
as $$
  select case
    when p.role = 'admin'
      then coalesce(p.active_lab_id, (select min(l.id) from laboratories l))
    else p.lab_id
  end
  from profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.is_admin(), public.current_lab_id() to authenticated;

-- Chaque nouveau compte reçoit un profil « member » sans laboratoire :
-- l'admin l'affecte ensuite depuis l'application.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Amorçage : un laboratoire par défaut qui recevra les données existantes,
-- et les comptes déjà créés deviennent administrateurs globaux.
insert into public.laboratories (name) values ('Laboratoire principal');

insert into public.profiles (id, email, full_name, role, active_lab_id)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data ->> 'full_name',
                split_part(coalesce(u.email, ''), '@', 1)),
       'admin',
       (select min(id) from public.laboratories)
from auth.users u
on conflict (id) do nothing;

grant select, insert, update, delete on public.laboratories, public.profiles to authenticated;
grant usage, select on sequence public.laboratories_id_seq to authenticated;
