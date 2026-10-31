-- ==============================================================================
-- STΔN studio. — Production Order Pipeline schema (idempotent)
-- Run ONCE in Supabase Dashboard > SQL Editor.
-- The `orders` table stores the deterministic lamp recipe + design SVG + BOM,
-- so any machine can rebuild the exact print-ready STL/ZIP from the row.
-- ==============================================================================

create table if not exists public.orders (
    id               uuid primary key default gen_random_uuid(),
    order_id         text unique not null,                 -- e.g. STAN-261031-4829
    customer_name    text not null,
    customer_phone   text not null,
    customer_address text,
    customer_notes   text,
    status           text not null default 'pending',
    recipe_json      jsonb not null,                       -- stock params(): shape, iw, ih, floor, pt, ph, led, strut, pitch, bx, by, size, mirror, invert, exactMode, exactW, plOn, plMode, plSize, plThick, plInvert
    design_svg       text not null,                        -- the converted design SVG (figure stencil)
    design_name      text,                                 -- original file name
    plate_svg        text,                                 -- optional floor inlay SVG
    preview_data_url text,                                 -- base64 WebP snapshot of the wall shadow
    bom_json         jsonb not null default '{}'::jsonb,   -- shadow_size, box_outer_size, panels_count, led_eff_mm, panel_eff_mm, weight_g, material, print_cost_inr, led_rod_inr, service_inr, total_inr
    total_inr        integer not null default 0,
    created_at       timestamptz not null default now()
);

-- Idempotent guards (re-running the migration never fails)
create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_status on public.orders (status);

-- ─── In-place migration of an older `orders` table ───────────────────────────
-- A previous schema (old admin panel) may already define `orders` with
-- different columns; `create table if not exists` alone would leave it stale
-- ("could not find the bom_json column"). Add every production column that is
-- missing, then rebuild the constraints.
alter table public.orders add column if not exists order_id         text;
alter table public.orders add column if not exists customer_name    text;
alter table public.orders add column if not exists customer_phone   text;
alter table public.orders add column if not exists customer_address text;
alter table public.orders add column if not exists customer_notes   text;
alter table public.orders add column if not exists status           text not null default 'pending';
alter table public.orders add column if not exists recipe_json      jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists design_svg       text not null default '';
alter table public.orders add column if not exists design_name      text;
alter table public.orders add column if not exists plate_svg        text;
alter table public.orders add column if not exists preview_data_url text;
alter table public.orders add column if not exists bom_json         jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists total_inr        integer not null default 0;
alter table public.orders add column if not exists created_at       timestamptz not null default now();

create unique index if not exists orders_order_id_key on public.orders (order_id);

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'printing', 'shipped', 'cancelled'));

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Anonymous users may SUBMIT an order (insert-only). Every read/update goes
-- through the Admin API (service role) — the public can never read or mutate
-- existing orders.
alter table public.orders enable row level security;

-- Remove every legacy policy (e.g. old anon SELECT grants exposing customer
-- data), then install the single insert-only submission policy.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'orders'
      and policyname <> 'Allow public order submission'
  loop
    execute format('drop policy if exists %I on public.orders', r.policyname);
  end loop;
end $$;

drop policy if exists "Allow public order submission" on public.orders;
create policy "Allow public order submission"
on public.orders
for insert
to anon, authenticated
with check (true);

-- No SELECT / UPDATE / DELETE policies for anon or authenticated:
-- reads and updates flow exclusively through the Admin API (service role).

-- ==============================================================================
-- Mailbox — synced from Titan Mail (Name.com) IMAP by the dedicated backend.
-- Reads/writes happen exclusively via the Admin API (service role); RLS has no
-- policies so anon/authenticated clients can never touch email content.
-- ==============================================================================

create table if not exists public.emails (
    id          uuid primary key default gen_random_uuid(),
    message_id  text unique not null,                 -- RFC Message-ID (or provider fallback)
    sender      text not null default '',
    recipient   text not null default '',
    subject     text not null default '(no subject)',
    body_html   text,
    body_text   text,
    is_read     boolean not null default false,
    received_at timestamptz not null default now(),
    created_at  timestamptz not null default now()
);

create index if not exists idx_emails_received_at on public.emails (received_at desc);
create index if not exists idx_emails_is_read on public.emails (is_read);

alter table public.emails enable row level security;

-- Deliberately NO policies: the mailbox is admin-API only (service role).
