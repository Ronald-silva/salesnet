-- Migration 016 — RLS on tables added in 011, 013, 015

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sofia_tickets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE nps_responses FROM anon, authenticated;
REVOKE ALL ON TABLE scheduled_messages FROM anon, authenticated;
REVOKE ALL ON TABLE sofia_tickets FROM anon, authenticated;
