/**
 * Deterministic, non-production defaults loaded before every Jest test file.
 * Tests must never depend on a developer's local .env or contact live services.
 */
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'test-only';
process.env.WHATSAPP_PROVIDER = 'twilio';
process.env.SGP_BASE_URL = 'https://sgp.example.invalid';
process.env.SGP_API_TOKEN = 'test-only';
process.env.SGP_APP_NAME = 'test';
process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
