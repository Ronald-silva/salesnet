-- supabase/migrations/003_outage_reports.sql
create table if not exists outage_reports (
  id          uuid primary key default gen_random_uuid(),
  neighborhood text not null,
  customer_id  text not null,
  reported_at  timestamptz not null default now()
);

create index if not exists outage_reports_neighborhood_time
  on outage_reports (neighborhood, reported_at desc);
