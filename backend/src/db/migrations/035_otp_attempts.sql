-- Migration 035: contador de tentativas em otp_codes
-- Previne força bruta do código OTP de 6 dígitos via múltiplos IPs.
-- O código é invalidado após 5 tentativas incorretas.

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_expires
  ON otp_codes(phone, expires_at);

GRANT ALL ON TABLE otp_codes TO service_role;
