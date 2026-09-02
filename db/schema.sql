-- Single global chat room. Everything here is idempotent so the migration
-- script can run on every deploy.

create extension if not exists pgcrypto;

create table if not exists room (
  id          int primary key default 1,
  invite_code text not null unique,
  created_at  timestamptz not null default now(),
  constraint room_is_singleton check (id = 1)
);

create table if not exists members (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- At most one admin member row.
create unique index if not exists members_single_admin on members (is_admin) where is_admin;

create table if not exists messages (
  id         bigserial primary key,
  member_id  uuid not null references members(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_id_desc on messages (id desc);

-- Web Push subscriptions. One row per device, so a member can have several.
create table if not exists push_subscriptions (
  endpoint   text primary key,
  member_id  uuid not null references members(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_member on push_subscriptions (member_id);
