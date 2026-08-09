-- Account overhaul, step 1: a display name and avatar for each user.
-- auth.users has no such fields, and this also gives the upcoming Google
-- login step somewhere to land the name/photo Google already provides.

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  updated_at   timestamptz default now()
);

alter table profiles enable row level security;

-- Public read (a display name next to a review or contributed place is the
-- whole point), owner-only write.
create policy "Public read access" on profiles for select using (true);
create policy "Users manage their own profile" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row on signup, seeded from whatever the auth
-- provider already gave us (Google's OAuth metadata has full_name/picture;
-- email/password signups fall back to the email's local part) so there's
-- never a signed-in user with no profile row to read/update.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
