-- Migration 027 — Complete RLS policies for tables added in 016, 024, 025, 026
-- Those migrations enabled RLS + REVOKE FROM anon/authenticated but omitted
-- the service_role_only policy. The backend uses service_role (bypasses RLS),
-- but explicit policies + grants keep behavior consistent with migration 002.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'nps_responses',
    'scheduled_messages',
    'sofia_tickets',
    'conversation_quality',
    'knowledge_base',
    'operational_alerts'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_only" ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY "service_role_only" ON %I USING (auth.role() = ''service_role'')',
      tbl
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', tbl);
  END LOOP;
END $$;
