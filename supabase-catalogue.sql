-- KAP catalogue leads: run once in Supabase → SQL Editor.
-- The website form may INSERT rows with the public anon key; nobody can read them with that key.
create table if not exists public.catalogue_leads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 80),
  phone       text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  email       text not null check (char_length(email) <= 100 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  org         text check (org is null or char_length(org) <= 120),
  source      text check (source is null or char_length(source) <= 30),
  page        text check (page is null or char_length(page) <= 200),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 250)
);

alter table public.catalogue_leads enable row level security;

create policy "website can insert catalogue leads"
  on public.catalogue_leads for insert
  to anon
  with check (true);
grant usage on schema public to anon;
grant insert on public.catalogue_leads to anon;
-- View the rows in Supabase → Table Editor → catalogue_leads (Export → CSV for Excel).
