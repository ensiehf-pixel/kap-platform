-- KAP digital card: run once in Supabase → SQL Editor.
-- Creates the leads table and lets the public card page INSERT rows only (no reading).

create table if not exists public.card_leads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 80),
  phone       text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  email       text check (email is null or char_length(email) <= 100),
  org         text check (org is null or char_length(org) <= 120),
  source      text default 'card',
  user_agent  text
);

alter table public.card_leads enable row level security;

-- Anyone with the public (anon) key may add a row…
create policy "card can insert leads"
  on public.card_leads for insert
  to anon
  with check (true);

-- …but nobody can read, edit or delete through the public key.
-- You read the data in Supabase → Table Editor, or export it as CSV for Excel.
