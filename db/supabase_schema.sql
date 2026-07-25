create table if not exists public.family_calendar_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

alter table public.family_calendar_state enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'family_calendar_state'
      and policyname = 'Allow public read/write'
  ) then
    create policy "Allow public read/write" on public.family_calendar_state
      for all
      using (true)
      with check (true);
  end if;
end
$$;
