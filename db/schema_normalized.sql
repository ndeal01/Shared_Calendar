-- Families, members, events, and assignments for Shared Calendar

create table if not exists public.families (
  id text primary key,
  name text not null,
  invite_code text unique,
  created_at timestamptz default now()
);

create table if not exists public.members (
  id text primary key,
  family_id text references public.families(id) on delete cascade,
  name text not null,
  color text,
  role text,
  created_at timestamptz default now()
);

create table if not exists public.events (
  id text primary key,
  family_id text references public.families(id) on delete cascade,
  title text not null,
  date date not null,
  start_time time,
  end_time time,
  all_day boolean default false,
  location text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.event_assignments (
  event_id text references public.events(id) on delete cascade,
  member_id text references public.members(id) on delete cascade,
  primary key (event_id, member_id)
);

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.event_assignments enable row level security;

-- permissive policy for demo usage (adjust for production)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and policyname = 'allow_public'
  ) then
    create policy allow_public on public.families for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'members' and policyname = 'allow_public'
  ) then
    create policy allow_public on public.members for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'allow_public'
  ) then
    create policy allow_public on public.events for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'event_assignments' and policyname = 'allow_public'
  ) then
    create policy allow_public on public.event_assignments for all using (true) with check (true);
  end if;
end
$$;
