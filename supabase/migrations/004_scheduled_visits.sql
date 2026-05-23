-- supabase/migrations/004_scheduled_visits.sql
create table if not exists scheduled_visits (
  id             uuid primary key default gen_random_uuid(),
  customer_id    text not null,
  phone          text not null,
  visit_date     date not null,
  period         text not null check (period in ('morning', 'afternoon')),
  status         text not null default 'scheduled',
  reminder_sent  boolean not null default false,
  followup_sent  boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists scheduled_visits_date
  on scheduled_visits (visit_date, reminder_sent, followup_sent);
