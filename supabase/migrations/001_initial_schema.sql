-- ============================================================
-- SalesNet — Schema inicial
-- Execute no Supabase SQL Editor (projeto SalesNet)
-- ============================================================

-- ── conversation_threads ─────────────────────────────────────
create table if not exists conversation_threads (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,
  messages    jsonb not null default '[]',
  human_mode  boolean not null default false,
  churn_risk  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_conversation_threads_phone      on conversation_threads (phone);
create index if not exists idx_conversation_threads_updated_at on conversation_threads (updated_at desc);
create index if not exists idx_conversation_threads_human_mode on conversation_threads (human_mode);
create index if not exists idx_conversation_threads_churn_risk on conversation_threads (churn_risk);

-- ── interaction_logs ─────────────────────────────────────────
create table if not exists interaction_logs (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  tool_calls  jsonb,
  response    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_interaction_logs_phone      on interaction_logs (phone);
create index if not exists idx_interaction_logs_created_at on interaction_logs (created_at desc);

-- ── whatsapp_instances ───────────────────────────────────────
create table if not exists whatsapp_instances (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null,
  instance_name       text not null unique,
  provider            text not null default 'evolution-go',
  phone_number        text,
  status              text not null default 'disconnected'
                        check (status in ('connected', 'disconnected', 'connecting')),
  webhook_url         text,
  last_connected_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_whatsapp_instances_tenant_id     on whatsapp_instances (tenant_id);
create index if not exists idx_whatsapp_instances_instance_name on whatsapp_instances (instance_name);
create index if not exists idx_whatsapp_instances_status        on whatsapp_instances (status);

-- ── otp_codes ────────────────────────────────────────────────
create table if not exists otp_codes (
  phone       text primary key,
  code        text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ── client_sessions ──────────────────────────────────────────
create table if not exists client_sessions (
  token        uuid primary key default gen_random_uuid(),
  customer_id  text not null,
  phone        text not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_client_sessions_customer_id on client_sessions (customer_id);
create index if not exists idx_client_sessions_phone       on client_sessions (phone);

-- ── billing_notifications ────────────────────────────────────
create table if not exists billing_notifications (
  id           uuid primary key default gen_random_uuid(),
  customer_id  text not null,
  phone        text not null,
  type         text not null
                 check (type in ('d3', 'd0', 'overdue_d3', 'suspended_d5')),
  status       text not null default 'sent',
  sent_at      timestamptz not null default now()
);

create index if not exists idx_billing_notifications_customer_id on billing_notifications (customer_id);
create index if not exists idx_billing_notifications_type        on billing_notifications (type);
create index if not exists idx_billing_notifications_sent_at     on billing_notifications (sent_at desc);

-- ── campaign_sends ───────────────────────────────────────────
create table if not exists campaign_sends (
  id           uuid primary key default gen_random_uuid(),
  customer_id  text not null,
  type         text not null,
  sent_at      timestamptz not null default now()
);

create index if not exists idx_campaign_sends_customer_id on campaign_sends (customer_id);
create index if not exists idx_campaign_sends_type        on campaign_sends (type);
create index if not exists idx_campaign_sends_sent_at     on campaign_sends (sent_at desc);

-- ── churn_risks ──────────────────────────────────────────────
create table if not exists churn_risks (
  id           uuid primary key default gen_random_uuid(),
  customer_id  text not null,
  reason       text not null
                 check (reason in ('too_many_tickets', 'recurring_overdue', 'cancellation_ticket')),
  level        text not null
                 check (level in ('low', 'medium', 'high')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_churn_risks_customer_id on churn_risks (customer_id);
create index if not exists idx_churn_risks_level       on churn_risks (level);
create index if not exists idx_churn_risks_created_at  on churn_risks (created_at desc);

-- ── referral_links ───────────────────────────────────────────
create table if not exists referral_links (
  customer_id  text primary key,
  code         text not null unique,
  created_at   timestamptz not null default now()
);

create index if not exists idx_referral_links_code on referral_links (code);

-- ── Row Level Security (desabilitado — acesso via service_role) ──
-- O backend usa SUPABASE_SERVICE_ROLE_KEY que bypassa RLS.
-- Habilite RLS por tabela apenas se adicionar acesso direto do frontend.
