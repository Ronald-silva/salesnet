-- Skill overrides por tenant em tenants.settings (JSONB).
-- Exemplo de update:
-- UPDATE tenants SET settings = jsonb_set(
--   COALESCE(settings, '{}'::jsonb),
--   '{skill}',
--   '{"toneOverride":"Tom acolhedor.","business":{"hiringPageUrl":"https://exemplo.com/vagas"}}'::jsonb
-- ) WHERE id = 'salesnet-default';

COMMENT ON COLUMN tenants.settings IS
  'Configurações do tenant. Chave opcional "skill": partial ISPSkillConfig (merge com defaults do código).';
