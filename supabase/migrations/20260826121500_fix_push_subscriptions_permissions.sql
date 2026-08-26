-- Fix push subscription permissions for the external Supabase deployment.
-- Safe to run more than once.

alter table if exists public.push_subscriptions enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant all privileges on table public.push_subscriptions to service_role;

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can create own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;

create policy "Users can read own push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own push subscriptions"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own push subscriptions"
on public.push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own push subscriptions"
on public.push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

create unique index if not exists push_subscriptions_endpoint_key
on public.push_subscriptions (endpoint);
