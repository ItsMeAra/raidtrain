# Raid Train Scheduler

Whatnot raid train signup app. Built with React + Vite, deployed to Netlify, data stored in Supabase.

---

## 1. Supabase Setup

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **SQL Editor** and run this to create the two tables:

```sql
-- Stores the event date (single row)
create table raid_config (
  id text primary key default 'singleton',
  event_date text
);

-- Stores each booked slot
create table raid_slots (
  hour integer primary key,  -- 9 = 9am ET, 23 = 11pm ET
  show_name text not null,
  created_at timestamptz default now()
);

-- Allow public read + write (no auth needed for this app)
alter table raid_config enable row level security;
alter table raid_slots enable row level security;

create policy "public read config" on raid_config for select using (true);
create policy "public write config" on raid_config for all using (true);

create policy "public read slots" on raid_slots for select using (true);
create policy "public insert slots" on raid_slots for insert with check (true);
create policy "public delete slots" on raid_slots for delete using (true);
```

4. Go to **Settings > API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

---

## 2. Local Setup

```bash
# Install dependencies
npm install

# Copy env file and fill in your Supabase credentials
cp .env.example .env

# Run locally
npm run dev
```

---

## 3. Deploy to Netlify

### Option A: Deploy from Git (recommended)
1. Push this project to a GitHub repo
2. Log into [netlify.com](https://netlify.com) and click **Add new site > Import from Git**
3. Connect your repo — Netlify will auto-detect the `netlify.toml` config
4. Go to **Site configuration > Environment variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_PASSWORD` (optional, defaults to `raidtrain`)
5. Trigger a deploy — done!

### Option B: Drag and drop
```bash
npm run build
```
Drag the `dist/` folder into Netlify's deploy area at app.netlify.com.
Note: you'll still need to set environment variables in Netlify's dashboard.

---

## Admin Panel

- URL: your deployed site, any page
- Click the **⚙ ADMIN** button in the bottom-right corner
- Default password: `raidtrain` (change via `VITE_ADMIN_PASSWORD` env var)
- From the panel you can: set the event date and remove any booked slot

---

## Slot reference

| Slot | Time ET         |
|------|-----------------|
| 👑   | 8:50 AM (MrMerchBot opens) |
| #01  | 9:00 AM → 10:00 AM |
| #02  | 10:00 AM → 11:00 AM |
| ...  | ...             |
| #15  | 11:00 PM → 12:00 AM |
| 👑   | 12:00 AM (MrMerchBot closes) |
