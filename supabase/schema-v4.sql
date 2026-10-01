-- Flow Manager v0.4: purchase order workflow classification
alter table public.purchase_orders
  add column if not exists workflow_type text not null default 'PTA';

alter table public.purchase_orders
  drop constraint if exists purchase_orders_workflow_type_check;

alter table public.purchase_orders
  add constraint purchase_orders_workflow_type_check
  check (workflow_type in ('PTA', 'PTO'));

create index if not exists purchase_orders_workflow_idx
  on public.purchase_orders(org_id, workflow_type);


-- Flow Manager v0.4.1: PO lines are source-system commitments, not unique PO/product pairs.
alter table public.purchase_orders
  drop constraint if exists purchase_orders_org_id_po_number_stock_code_key;


-- Flow Manager v0.5: minimum order quantity for replenishment calculations
alter table public.stock
  add column if not exists minimum_order_quantity numeric not null default 1;


-- Flow Manager v0.6: daily stock history for DBR and future trend analysis.
create table if not exists public.stock_daily_history (
  org_id uuid not null references public.organizations(id) on delete cascade,
  stock_code text not null,
  snapshot_date date not null,
  actual_stock numeric not null default 0,
  theoretical_stock numeric not null default 0,
  target_stock numeric not null default 0,
  captured_at timestamptz not null default now(),
  primary key (org_id, stock_code, snapshot_date)
);

create index if not exists stock_daily_history_org_date_idx
  on public.stock_daily_history(org_id, snapshot_date);

create index if not exists stock_daily_history_org_stock_idx
  on public.stock_daily_history(org_id, stock_code, snapshot_date);

alter table public.stock_daily_history enable row level security;
