-- DE MAILER WEBSITE — Supabase SQL setup
-- Run this whole script in Supabase Dashboard > SQL Editor > New query.
-- The public membership locker uses email-list checking only. Admin access still uses Supabase Auth.

create extension if not exists pgcrypto;

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  email text not null unique check (char_length(email) <= 254),
  consent boolean not null default false check (consent = true),
  created_at timestamptz not null default now()
);


-- Simple membership check for the public Locker form. This returns only true/false;
-- it does not expose the subscriber list. No member-facing Supabase Auth is used.
create or replace function public.is_mailer_member(check_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.newsletter_subscribers
    where lower(email) = lower(trim(check_email)) and consent = true
  );
$$;
revoke all on function public.is_mailer_member(text) from public;
grant execute on function public.is_mailer_member(text) to anon, authenticated;

create table if not exists public.fan_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) <= 254),
  message text not null check (char_length(message) between 1 and 3000),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.public_letters (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 5000),
  published boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.member_deliveries (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

-- Create a member profile automatically when someone creates a Supabase Auth account.
create or replace function public.handle_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (user_id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (user_id) do update
    set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_de_mailer on auth.users;
create trigger on_auth_user_created_de_mailer
after insert on auth.users
for each row execute procedure public.handle_new_member();

-- Helper used by policies. SECURITY DEFINER avoids recursive RLS lookups.
create or replace function public.is_de_mailer_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

alter table public.newsletter_subscribers enable row level security;
alter table public.fan_messages enable row level security;
alter table public.members enable row level security;
alter table public.admin_users enable row level security;
alter table public.public_letters enable row level security;
alter table public.member_deliveries enable row level security;

-- Public can submit signups and messages, but cannot read either table.
drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
create policy "Anyone can subscribe" on public.newsletter_subscribers
for insert to anon, authenticated with check (consent = true);

drop policy if exists "Admins read subscribers" on public.newsletter_subscribers;
create policy "Admins read subscribers" on public.newsletter_subscribers
for select to authenticated using (public.is_de_mailer_admin());

drop policy if exists "Anyone can send fan messages" on public.fan_messages;
create policy "Anyone can send fan messages" on public.fan_messages
for insert to anon, authenticated with check (true);

drop policy if exists "Admins read fan messages" on public.fan_messages;
create policy "Admins read fan messages" on public.fan_messages
for select to authenticated using (public.is_de_mailer_admin());

drop policy if exists "Members read own profile" on public.members;
create policy "Members read own profile" on public.members
for select to authenticated using (user_id = (select auth.uid()) or public.is_de_mailer_admin());

drop policy if exists "Admins read member count" on public.members;
create policy "Admins read member count" on public.members
for select to authenticated using (public.is_de_mailer_admin());

drop policy if exists "Admins manage admin list" on public.admin_users;
create policy "Admins manage admin list" on public.admin_users
for all to authenticated using (public.is_de_mailer_admin()) with check (public.is_de_mailer_admin());

drop policy if exists "Anyone reads published letters" on public.public_letters;
create policy "Anyone reads published letters" on public.public_letters
for select to anon, authenticated using (published = true or public.is_de_mailer_admin());

drop policy if exists "Admins create public letters" on public.public_letters;
create policy "Admins create public letters" on public.public_letters
for insert to authenticated with check (public.is_de_mailer_admin());

drop policy if exists "Admins update public letters" on public.public_letters;
create policy "Admins update public letters" on public.public_letters
for update to authenticated using (public.is_de_mailer_admin()) with check (public.is_de_mailer_admin());

drop policy if exists "Members read locker deliveries" on public.member_deliveries;
drop policy if exists "Public can read locker deliveries" on public.member_deliveries;
create policy "Public can read locker deliveries" on public.member_deliveries
for select to anon, authenticated using (true);

drop policy if exists "Admins create locker deliveries" on public.member_deliveries;
create policy "Admins create locker deliveries" on public.member_deliveries
for insert to authenticated with check (public.is_de_mailer_admin());

-- Restrict table privileges as well as row access.
revoke all on public.newsletter_subscribers, public.fan_messages, public.members,
  public.admin_users, public.public_letters, public.member_deliveries from anon, authenticated;
grant insert on public.newsletter_subscribers, public.fan_messages to anon, authenticated;
grant select on public.newsletter_subscribers, public.fan_messages to authenticated;
grant select on public.members to authenticated;
grant select, insert, update on public.public_letters to anon, authenticated;
grant select on public.member_deliveries to anon, authenticated;
grant insert on public.member_deliveries to authenticated;
grant select, insert, update, delete on public.admin_users to authenticated;

-- IMPORTANT: after creating your own account on the website, find its UUID:
-- Supabase Dashboard > Authentication > Users > click your account > copy User UID.
-- Then run this separately, replacing the UUID:
-- insert into public.admin_users (user_id) values ('YOUR-AUTH-USER-UUID');
-- Only add your own trusted account. Do not make the admin table publicly writable.
