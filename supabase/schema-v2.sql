-- Flow Manager v0.2 migration
-- Run this in Supabase SQL Editor after the existing v0.1 schema.

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('admin','manager','viewer','guk_viewer','guk_admin'));

create table if not exists public.flow_modules (
  key text primary key,
  name text not null,
  sort_order integer not null default 0
);

insert into public.flow_modules(key,name,sort_order) values
 ('stock','Stock',10),
 ('pta','PTA',20),
 ('purchase_orders','Purchase Orders',30),
 ('dbr','DBR',40),
 ('production','Production',50),
 ('wip','WIP',60),
 ('lead_time','Lead Time',70),
 ('capacity','Capacity',80),
 ('otif','OTIF',90),
 ('executive_dashboard','Executive Dashboard',100)
on conflict (key) do update set name=excluded.name, sort_order=excluded.sort_order;

alter table public.flow_modules enable row level security;

create policy "authenticated users can read flow modules"
  on public.flow_modules for select to authenticated
  using (true);

create table if not exists public.organization_modules (
  org_id uuid not null references public.organizations(id) on delete cascade,
  module_key text not null references public.flow_modules(key) on delete cascade,
  enabled boolean not null default true,
  primary key (org_id,module_key)
);

create table if not exists public.membership_modules (
  org_id uuid not null,
  user_id uuid not null,
  module_key text not null references public.flow_modules(key) on delete cascade,
  enabled boolean not null default true,
  primary key (org_id,user_id,module_key),
  foreign key (org_id,user_id) references public.memberships(org_id,user_id) on delete cascade
);

alter table public.organization_modules enable row level security;
alter table public.membership_modules enable row level security;

create policy "members can read organisation modules"
  on public.organization_modules for select to authenticated
  using (public.user_has_org_access(org_id));

create policy "admins can manage organisation modules"
  on public.organization_modules for all to authenticated
  using (public.user_is_org_admin(org_id))
  with check (public.user_is_org_admin(org_id));

create policy "members can read own module permissions"
  on public.membership_modules for select to authenticated
  using (user_id = auth.uid() or public.user_is_org_admin(org_id));

create policy "admins can manage membership modules"
  on public.membership_modules for all to authenticated
  using (public.user_is_org_admin(org_id))
  with check (public.user_is_org_admin(org_id));

create index if not exists organization_modules_org_idx on public.organization_modules(org_id);
create index if not exists membership_modules_user_idx on public.membership_modules(org_id,user_id);

-- Make the original bootstrap function harmless once GUK provisioning is in place.
-- Existing data is retained; new customers should be created by the GUK back office.
