-- ============================================================
-- K Co Register (/pos) — schema
-- Additive only. Nothing here touches existing tables.
-- Run once in the Supabase SQL editor (project lheytkgixafdhluuvrbg).
-- ============================================================

-- ---------- events ----------
create table if not exists public.pos_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  event_date  date,
  location    text,
  tax_rate    numeric(6,4) not null default 0,   -- 0.0888 = 8.88%
  active      boolean not null default false,    -- exactly one is the "open register"
  notes       text,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

-- Only one event can be active at a time. Enforced, not just hoped for.
create unique index if not exists pos_events_one_active
  on public.pos_events ((active)) where active;

-- ---------- the buttons on the register ----------
create table if not exists public.pos_event_items (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.pos_events(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null, -- null = event-only item
  label        text not null,          -- what the button says
  price        numeric(10,2) not null, -- event price; overrides the catalog price
  taxable      boolean not null default true,
  stock_qty    integer,                -- null = don't track; else decrements per sale
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists pos_event_items_event on public.pos_event_items(event_id, sort_order);

-- ---------- sales ----------
create table if not exists public.pos_sales (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.pos_events(id) on delete restrict,
  client_ref      text not null,   -- idempotency: one cart == one client_ref, forever
  tender          text not null check (tender in ('card','cash','link')),
  status          text not null default 'pending'
                  check (status in ('pending','processing','paid','failed','canceled','refunded')),
  subtotal        numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  tax             numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  cash_received   numeric(10,2),
  change_due      numeric(10,2),
  customer_email  text,
  stripe_payment_intent text,
  stripe_reader   text,
  failure_reason  text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);
-- The double-charge guard. Same cart re-submitted == same row.
create unique index if not exists pos_sales_client_ref on public.pos_sales(client_ref);
create index if not exists pos_sales_event on public.pos_sales(event_id, created_at desc);
create index if not exists pos_sales_pi on public.pos_sales(stripe_payment_intent);

-- ---------- line items ----------
create table if not exists public.pos_sale_lines (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.pos_sales(id) on delete cascade,
  item_id     uuid references public.pos_event_items(id) on delete set null,
  product_id  uuid references public.products(id) on delete set null,
  label       text not null,
  unit_price  numeric(10,2) not null,
  qty         integer not null default 1,
  taxable     boolean not null default true
);
create index if not exists pos_sale_lines_sale on public.pos_sale_lines(sale_id);

-- ---------- lock it down ----------
-- The POS talks through an Edge Function using the service role.
-- RLS on with no policies = the public anon key cannot read or write any of this.
alter table public.pos_events      enable row level security;
alter table public.pos_event_items enable row level security;
alter table public.pos_sales       enable row level security;
alter table public.pos_sale_lines  enable row level security;

-- ---------- stock decrement ----------
-- Only fires when a sale actually lands on 'paid'. Never on pending or failed.
create or replace function public.pos_decrement_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    update public.pos_event_items i
       set stock_qty = greatest(0, i.stock_qty - l.qty)
      from (select item_id, sum(qty) as qty
              from public.pos_sale_lines
             where sale_id = new.id and item_id is not null
             group by item_id) l
     where i.id = l.item_id and i.stock_qty is not null;
  end if;
  return new;
end $$;

drop trigger if exists trg_pos_decrement_stock on public.pos_sales;
create trigger trg_pos_decrement_stock
  after update on public.pos_sales
  for each row execute function public.pos_decrement_stock();

-- ---------- event totals, card vs cash ----------
create or replace view public.pos_event_totals as
select
  e.id as event_id,
  e.name,
  e.event_date,
  e.active,
  count(s.id) filter (where s.status = 'paid')                        as sale_count,
  coalesce(sum(s.total)    filter (where s.status = 'paid'), 0)       as gross,
  coalesce(sum(s.total)    filter (where s.status = 'paid' and s.tender = 'card'), 0) as card_total,
  coalesce(sum(s.total)    filter (where s.status = 'paid' and s.tender = 'cash'), 0) as cash_total,
  coalesce(sum(s.total)    filter (where s.status = 'paid' and s.tender = 'link'), 0) as link_total,
  coalesce(sum(s.tax)      filter (where s.status = 'paid'), 0)       as tax_collected,
  coalesce(sum(s.discount) filter (where s.status = 'paid'), 0)       as discounts_given
from public.pos_events e
left join public.pos_sales s on s.event_id = e.id
group by e.id, e.name, e.event_date, e.active;

-- ---------- close the two doors a view leaves open ----------
-- A view normally runs with its creator's rights, which would let the public
-- anon key read every sale total straight past the RLS above. This makes the
-- view obey the caller's permissions instead. Do not remove.
alter view public.pos_event_totals set (security_invoker = on);

-- Trigger function — nothing should be able to call it over the REST API.
revoke execute on function public.pos_decrement_stock() from anon, authenticated, public;
