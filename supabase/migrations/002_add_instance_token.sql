-- Adiciona coluna instance_token na tabela whatsapp_instances
-- Necessário para Evolution Go (autenticação por-instância)
alter table whatsapp_instances
  add column if not exists instance_token text;
