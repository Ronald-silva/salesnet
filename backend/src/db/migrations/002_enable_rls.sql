-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 002 — Enable Row Level Security on all tables
--
-- ACCESS MODEL: All database access goes exclusively through the backend
-- (service_role key). The Supabase anon/authenticated keys are NOT used by
-- this application. The admin panel and client portal authenticate via the
-- backend API, which then uses the service_role client to query Supabase.
--
-- Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend. Never instantiate
-- a Supabase client with the anon key on any server-side code.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── conversation_threads ─────────────────────────────────────────────────────

ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON conversation_threads;
CREATE POLICY "service_role_only" ON conversation_threads
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE conversation_threads FROM anon;
REVOKE ALL ON TABLE conversation_threads FROM authenticated;


-- ── interaction_logs ─────────────────────────────────────────────────────────

ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON interaction_logs;
CREATE POLICY "service_role_only" ON interaction_logs
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE interaction_logs FROM anon;
REVOKE ALL ON TABLE interaction_logs FROM authenticated;


-- ── whatsapp_instances ───────────────────────────────────────────────────────

ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON whatsapp_instances;
CREATE POLICY "service_role_only" ON whatsapp_instances
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE whatsapp_instances FROM anon;
REVOKE ALL ON TABLE whatsapp_instances FROM authenticated;


-- ── leads ────────────────────────────────────────────────────────────────────

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON leads;
CREATE POLICY "service_role_only" ON leads
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE leads FROM anon;
REVOKE ALL ON TABLE leads FROM authenticated;


-- ── scheduled_visits ─────────────────────────────────────────────────────────

ALTER TABLE scheduled_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON scheduled_visits;
CREATE POLICY "service_role_only" ON scheduled_visits
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE scheduled_visits FROM anon;
REVOKE ALL ON TABLE scheduled_visits FROM authenticated;


-- ── outage_reports ───────────────────────────────────────────────────────────

ALTER TABLE outage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON outage_reports;
CREATE POLICY "service_role_only" ON outage_reports
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE outage_reports FROM anon;
REVOKE ALL ON TABLE outage_reports FROM authenticated;


-- ── billing_notifications ────────────────────────────────────────────────────

ALTER TABLE billing_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON billing_notifications;
CREATE POLICY "service_role_only" ON billing_notifications
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE billing_notifications FROM anon;
REVOKE ALL ON TABLE billing_notifications FROM authenticated;


-- ── otp_codes ────────────────────────────────────────────────────────────────
-- Short-lived OTP codes — especially sensitive, must never be readable client-side

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON otp_codes;
CREATE POLICY "service_role_only" ON otp_codes
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE otp_codes FROM anon;
REVOKE ALL ON TABLE otp_codes FROM authenticated;


-- ── client_sessions ──────────────────────────────────────────────────────────

ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON client_sessions;
CREATE POLICY "service_role_only" ON client_sessions
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE client_sessions FROM anon;
REVOKE ALL ON TABLE client_sessions FROM authenticated;


-- ── tenants ──────────────────────────────────────────────────────────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON tenants;
CREATE POLICY "service_role_only" ON tenants
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE tenants FROM anon;
REVOKE ALL ON TABLE tenants FROM authenticated;


-- ── whatsapp_send_log ────────────────────────────────────────────────────────

ALTER TABLE whatsapp_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON whatsapp_send_log;
CREATE POLICY "service_role_only" ON whatsapp_send_log
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE whatsapp_send_log FROM anon;
REVOKE ALL ON TABLE whatsapp_send_log FROM authenticated;


-- ── whatsapp_sessions ────────────────────────────────────────────────────────

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON whatsapp_sessions;
CREATE POLICY "service_role_only" ON whatsapp_sessions
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE whatsapp_sessions FROM anon;
REVOKE ALL ON TABLE whatsapp_sessions FROM authenticated;


-- ── campaign_sends ───────────────────────────────────────────────────────────

ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON campaign_sends;
CREATE POLICY "service_role_only" ON campaign_sends
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE campaign_sends FROM anon;
REVOKE ALL ON TABLE campaign_sends FROM authenticated;


-- ── referral_links ───────────────────────────────────────────────────────────

ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON referral_links;
CREATE POLICY "service_role_only" ON referral_links
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE referral_links FROM anon;
REVOKE ALL ON TABLE referral_links FROM authenticated;


-- ── churn_risks ──────────────────────────────────────────────────────────────

ALTER TABLE churn_risks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON churn_risks;
CREATE POLICY "service_role_only" ON churn_risks
  USING (auth.role() = 'service_role');

REVOKE ALL ON TABLE churn_risks FROM anon;
REVOKE ALL ON TABLE churn_risks FROM authenticated;
