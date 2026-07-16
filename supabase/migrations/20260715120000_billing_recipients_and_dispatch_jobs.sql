-- supabase/migrations/20260715120000_billing_recipients_and_dispatch_jobs.sql
-- Régua de cobrança administrável pelo painel — substitui BILLING_ALLOWLIST_CPFS fixa.
-- Ver docs/superpowers/specs/2026-07-15-billing-recipients-admin-design.md

create table if not exists billing_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'salesnet-default',
  contract_id text not null,
  sgp_cliente_id text,
  cpf text not null,
  customer_name text not null,
  phone text not null,
  active boolean not null default true,
  paused boolean not null default false,
  stages_enabled text[] not null default array['d5_habitual','d3','d2_habitual','d2_regular','d0','overdue_d3','suspended_d5'],
  channel text not null default 'whatsapp',
  cadence_start_date date not null default current_date,
  next_dispatch_at timestamptz,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paused_at timestamptz,
  paused_by text,
  removed_at timestamptz,
  removed_by text,
  last_synced_at timestamptz
);

create unique index if not exists billing_recipients_active_contract_uidx
  on billing_recipients (tenant_id, contract_id) where removed_at is null;

create index if not exists billing_recipients_active_idx
  on billing_recipients (tenant_id, active, paused) where removed_at is null;

alter table billing_recipients enable row level security;

drop policy if exists billing_recipients_service_role_only on billing_recipients;
create policy billing_recipients_service_role_only on billing_recipients
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant all on table billing_recipients to service_role;

create table if not exists billing_dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  billing_recipient_id uuid not null references billing_recipients(id),
  contract_id text not null,
  stage text not null,
  scheduled_for date not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  message text,
  phone text not null,
  provider_message_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_dispatch_jobs_idempotency_uidx
  on billing_dispatch_jobs (idempotency_key);

create index if not exists billing_dispatch_jobs_recipient_idx
  on billing_dispatch_jobs (billing_recipient_id, created_at desc);

create index if not exists billing_dispatch_jobs_habitual_lookup_idx
  on billing_dispatch_jobs (contract_id, stage, status);

alter table billing_dispatch_jobs enable row level security;

drop policy if exists billing_dispatch_jobs_service_role_only on billing_dispatch_jobs;
create policy billing_dispatch_jobs_service_role_only on billing_dispatch_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant all on table billing_dispatch_jobs to service_role;
