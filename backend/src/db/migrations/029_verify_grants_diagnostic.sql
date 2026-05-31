-- Rode no SQL Editor após 028 para confirmar grants e existência da tabela.
-- Copie o resultado e compare SUPABASE_URL do Railway (deve ser *.supabase.co com o mesmo project ref).

SELECT
  to_regclass('public.whatsapp_instances') IS NOT NULL AS table_exists,
  has_table_privilege('service_role', 'public.whatsapp_instances', 'SELECT') AS service_role_select,
  has_table_privilege('anon', 'public.whatsapp_instances', 'SELECT') AS anon_select;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'whatsapp_instances'
  AND grantee IN ('service_role', 'anon', 'authenticated')
ORDER BY grantee, privilege_type;
