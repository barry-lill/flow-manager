-- Flow Manager v0.3: customer data-source mappings
create table if not exists public.data_mappings (
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  field_key text not null,
  source_column text not null default '',
  required boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (org_id, source_key, field_key)
);

create table if not exists public.data_sources (
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  name text not null,
  description text not null default '',
  configured boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (org_id, source_key)
);

alter table public.data_mappings enable row level security;
alter table public.data_sources enable row level security;

create policy "members can read data mappings"
  on public.data_mappings for select to authenticated
  using (public.user_has_org_access(org_id));

create policy "admins can manage data mappings"
  on public.data_mappings for all to authenticated
  using (public.user_is_org_admin(org_id))
  with check (public.user_is_org_admin(org_id));

create policy "members can read data sources"
  on public.data_sources for select to authenticated
  using (public.user_has_org_access(org_id));

create policy "admins can manage data sources"
  on public.data_sources for all to authenticated
  using (public.user_is_org_admin(org_id))
  with check (public.user_is_org_admin(org_id));

create index if not exists data_mappings_org_idx on public.data_mappings(org_id);
create index if not exists data_sources_org_idx on public.data_sources(org_id);



-- File layout settings for each customer data source.
alter table public.data_sources add column if not exists has_headers boolean not null default true;
alter table public.data_sources add column if not exists header_row integer not null default 1;
alter table public.data_sources add column if not exists data_start_row integer not null default 2;
