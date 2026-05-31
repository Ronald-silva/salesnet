-- Migration 028 — GRANT explícito para service_role nas tabelas do painel/Sofia
-- A 027 cobre só tabelas 016/024/025/026. O health e o admin usam também
-- whatsapp_instances, conversation_threads, scheduled_visits, etc.
-- Com RLS + REVOKE em anon/authenticated, alguns projetos exigem GRANT explícito.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'conversation_threads',
    'interaction_logs',
    'whatsapp_instances',
    'leads',
    'scheduled_visits',
    'outage_reports',
    'billing_notifications',
    'otp_codes',
    'client_sessions',
    'tenants',
    'whatsapp_send_log',
    'whatsapp_sessions',
    'campaign_sends',
    'referral_links',
    'churn_risks',
    'processed_message_ids',
    'nps_responses',
    'scheduled_messages',
    'sofia_tickets',
    'conversation_quality',
    'knowledge_base',
    'operational_alerts'
  ]
  LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('GRANT ALL ON TABLE %I TO service_role', tbl);
    END IF;
  END LOOP;
END $$;
