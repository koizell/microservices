-- Ejecutar en PostgreSQL antes de levantar los servicios (opcional si usas synchronize=true)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  account_type VARCHAR(40) NOT NULL DEFAULT 'standard'
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON users (email_verification_token);

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON users (password_reset_token);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  date TIMESTAMP NOT NULL,
  location VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(120) NOT NULL,
  ticket_id UUID NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  payment_intent_id VARCHAR(160) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'paid',
  recipient_email VARCHAR(255) NOT NULL DEFAULT 'attendee@example.com'
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message TEXT NOT NULL,
  recipient VARCHAR(200) NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id VARCHAR(120) NOT NULL,
  ticket_type_id VARCHAR(120) NOT NULL,
  attendee_name VARCHAR(200) NOT NULL,
  qr_code_hash VARCHAR(255) NOT NULL UNIQUE,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMP NULL,
  used_by VARCHAR(120) NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id VARCHAR(120) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  room VARCHAR(120) NOT NULL,
  capacity INT NOT NULL DEFAULT 0,
  speaker_name VARCHAR(200) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(120) NOT NULL,
  session_id VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day DATE NOT NULL UNIQUE,
  total_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_tickets INT NOT NULL DEFAULT 0
);
