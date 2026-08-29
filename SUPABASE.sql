-- Zalijepi ovo u Supabase -> SQL Editor -> New query -> Run.
-- Stvara tablicu i pravila koja svakom korisniku daju pristup samo
-- vlastitom retku. Anon ključ u aplikaciji je javan po dizajnu;
-- sigurnost dolazi odavde.

create table if not exists public.obroci_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.obroci_state enable row level security;

drop policy if exists "vlastiti redak - citanje" on public.obroci_state;
create policy "vlastiti redak - citanje" on public.obroci_state
  for select using (auth.uid() = user_id);

drop policy if exists "vlastiti redak - upis" on public.obroci_state;
create policy "vlastiti redak - upis" on public.obroci_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "vlastiti redak - izmjena" on public.obroci_state;
create policy "vlastiti redak - izmjena" on public.obroci_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
