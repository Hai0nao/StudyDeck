-- StudyDeck sync: one row per entity, last-write-wins on modified_at (client epoch ms).
-- synced_at is the server time a row last changed; clients pull rows newer than their cursor.

create table public.folders (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb,
  modified_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.sets (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb,
  modified_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.cards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  set_id text not null,
  data jsonb,
  modified_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Daily stats are kept per device and summed on the client, so two devices
-- studying on the same day never overwrite each other's counts.
create table public.day_stats (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id text not null,
  day text not null,
  answers integer not null default 0,
  correct integer not null default 0,
  new_cards integer not null default 0,
  synced_at timestamptz not null default now(),
  primary key (user_id, device_id, day)
);

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  modified_at bigint not null,
  synced_at timestamptz not null default now()
);

create index folders_user_synced_idx on public.folders (user_id, synced_at);
create index sets_user_synced_idx on public.sets (user_id, synced_at);
create index cards_user_synced_idx on public.cards (user_id, synced_at);
create index day_stats_user_synced_idx on public.day_stats (user_id, synced_at);

alter table public.folders enable row level security;
alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.day_stats enable row level security;
alter table public.user_settings enable row level security;

create policy "Own folders" on public.folders for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own sets" on public.sets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own cards" on public.cards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own day stats" on public.day_stats for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own settings" on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Upload a batch of local changes. Older writes never overwrite newer ones.
create or replace function public.push_changes(
  p_folders jsonb default '[]'::jsonb,
  p_sets jsonb default '[]'::jsonb,
  p_cards jsonb default '[]'::jsonb,
  p_days jsonb default '[]'::jsonb,
  p_settings jsonb default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.folders as t (user_id, id, data, modified_at, deleted)
  select uid, x.id, x.data, x.modified_at, coalesce(x.deleted, false)
  from jsonb_to_recordset(p_folders) as x (id text, data jsonb, modified_at bigint, deleted boolean)
  on conflict (user_id, id) do update
    set data = excluded.data, modified_at = excluded.modified_at,
        deleted = excluded.deleted, synced_at = now()
    where t.modified_at < excluded.modified_at;

  insert into public.sets as t (user_id, id, data, modified_at, deleted)
  select uid, x.id, x.data, x.modified_at, coalesce(x.deleted, false)
  from jsonb_to_recordset(p_sets) as x (id text, data jsonb, modified_at bigint, deleted boolean)
  on conflict (user_id, id) do update
    set data = excluded.data, modified_at = excluded.modified_at,
        deleted = excluded.deleted, synced_at = now()
    where t.modified_at < excluded.modified_at;

  insert into public.cards as t (user_id, id, set_id, data, modified_at, deleted)
  select uid, x.id, x.set_id, x.data, x.modified_at, coalesce(x.deleted, false)
  from jsonb_to_recordset(p_cards) as x (id text, set_id text, data jsonb, modified_at bigint, deleted boolean)
  on conflict (user_id, id) do update
    set set_id = excluded.set_id, data = excluded.data, modified_at = excluded.modified_at,
        deleted = excluded.deleted, synced_at = now()
    where t.modified_at < excluded.modified_at;

  insert into public.day_stats as t (user_id, device_id, day, answers, correct, new_cards)
  select uid, x.device_id, x.day, x.answers, x.correct, x.new_cards
  from jsonb_to_recordset(p_days) as x (device_id text, day text, answers integer, correct integer, new_cards integer)
  on conflict (user_id, device_id, day) do update
    set answers = excluded.answers, correct = excluded.correct,
        new_cards = excluded.new_cards, synced_at = now();

  if p_settings is not null then
    insert into public.user_settings as t (user_id, data, modified_at)
    values (uid, p_settings -> 'data', (p_settings ->> 'modified_at')::bigint)
    on conflict (user_id) do update
      set data = excluded.data, modified_at = excluded.modified_at, synced_at = now()
      where t.modified_at < excluded.modified_at;
  end if;

  return now();
end;
$$;

revoke execute on function public.push_changes(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.push_changes(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
