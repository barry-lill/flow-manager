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


-- Flow Manager v0.5: track the last successful import separately from settings changes.
alter table public.data_sources
  add column if not exists last_imported_at timestamptz null;
