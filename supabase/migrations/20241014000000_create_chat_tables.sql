-- Chat persistence for Arena/Lobby conversations
-- Messages saved per lobby/match, with X (Twitter) integration for gating

-- 1) Chat rooms (optional grouping by lobby/match/global)
create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lobby','match','global')),
  lobby_id text,
  match_session_id text,
  created_at timestamptz not null default now()
);

create index if not exists chat_rooms_kind_idx on chat_rooms(kind);
create index if not exists chat_rooms_lobby_idx on chat_rooms(lobby_id);
create index if not exists chat_rooms_match_idx on chat_rooms(match_session_id);

-- 2) Messages with X (Twitter) integration
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  lobby_id text,                    -- denormalized for fast lobby history
  match_session_id text,            -- denormalized for fast match history
  sender_wallet text,               -- optional wallet (for wallet users)
  sender_x_user_id text,            -- X user id if connected (primary identity for chat)
  sender_x_username text,           -- @handle snapshot
  sender_display_name text,         -- display name snapshot
  sender_avatar_url text,           -- avatar snapshot
  message text not null check (char_length(message) > 0 and char_length(message) <= 2000),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes for fast pagination and history queries
create index if not exists chat_messages_room_time_idx
  on chat_messages(room_id, created_at desc);

create index if not exists chat_messages_lobby_time_idx
  on chat_messages(lobby_id, created_at desc)
  where lobby_id is not null;

create index if not exists chat_messages_match_time_idx
  on chat_messages(match_session_id, created_at desc)
  where match_session_id is not null;

-- Index for sender queries
create index if not exists chat_messages_sender_x_idx
  on chat_messages(sender_x_user_id, created_at desc)
  where sender_x_user_id is not null;

-- 3) RLS policies (read all, write gated by service role or future policy)
alter table chat_rooms enable row level security;
alter table chat_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'chat_rooms' and policyname = 'chat_rooms_read_all') then
    create policy chat_rooms_read_all on chat_rooms for select using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'chat_messages' and policyname = 'chat_messages_read_all') then
    create policy chat_messages_read_all on chat_messages for select using (true);
  end if;
end$$;

-- 4) Helper function to auto-create a room for a lobby or match
create or replace function ensure_chat_room(p_kind text, p_lobby text, p_match text)
returns uuid language plpgsql as $$
declare
  r_id uuid;
begin
  select id into r_id from chat_rooms
   where kind = p_kind
     and coalesce(lobby_id,'') = coalesce(p_lobby,'')
     and coalesce(match_session_id,'') = coalesce(p_match,'')
   limit 1;

  if r_id is null then
    insert into chat_rooms(kind, lobby_id, match_session_id)
    values (p_kind, p_lobby, p_match)
    returning id into r_id;
  end if;

  return r_id;
end$$;

-- 5) Auto-cleanup of old chat messages (optional: keep last 7 days for lobbies, 30 days for matches)
-- You can run this as a periodic cron job or skip if you want full history
create or replace function cleanup_old_chat_messages()
returns void language plpgsql as $$
begin
  -- Delete lobby messages older than 7 days
  delete from chat_messages
   where lobby_id is not null
     and created_at < now() - interval '7 days';

  -- Delete match messages older than 30 days
  delete from chat_messages
   where match_session_id is not null
     and created_at < now() - interval '30 days';
end$$;

