# Whatnot Raid Train Scheduler

Single-page app for streamers to claim hourly slots in a Whatnot raid train. Built with React, Vite, Tailwind CSS v4, and Supabase.

## Setup

```bash
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_ADMIN_PASSWORD
npm install
npm run dev
```

## Supabase

Run this SQL in the Supabase SQL editor:

```sql
create table raid_config (
  id text primary key default 'singleton',
  event_date text
);

create table raid_slots (
  hour integer primary key,
  show_name text not null,
  created_at timestamptz default now()
);

alter table raid_config enable row level security;
alter table raid_slots  enable row level security;

create policy "public read config"  on raid_config for select using (true);
create policy "public write config" on raid_config for all    using (true);

create policy "public read slots"   on raid_slots for select using (true);
create policy "public insert slots" on raid_slots for insert  with check (true);
create policy "public delete slots" on raid_slots for delete  using (true);
```

Enable **realtime** for `raid_config` and `raid_slots`: Project Settings → API → Replication (or Database → Publications), and include both tables so the public schedule updates live.

## Deploy (Netlify)

Set the same environment variables in Netlify. The included `netlify.toml` runs `npm run build` and publishes `dist`.
