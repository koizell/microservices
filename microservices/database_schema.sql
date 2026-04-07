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

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS end_date DATE NULL,
  ADD COLUMN IF NOT EXISTS start_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS end_time VARCHAR(5) NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS active_weekdays TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE events
SET
  end_date = COALESCE(end_date, date::date),
  start_time = COALESCE(NULLIF(start_time, ''), '09:00'),
  end_time = COALESCE(NULLIF(end_time, ''), '18:00'),
  active_weekdays = COALESCE(NULLIF(active_weekdays, ''), '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'),
  is_archived = COALESCE(is_archived, FALSE),
  created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
  updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
WHERE end_date IS NULL
  OR start_time IS NULL
  OR start_time = ''
  OR end_time IS NULL
  OR end_time = ''
  OR active_weekdays IS NULL
  OR active_weekdays = ''
  OR is_archived IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL;

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(40) NOT NULL
);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE tickets
SET
  description = COALESCE(description, ''),
  status = COALESCE(NULLIF(status, ''), 'paid'),
  created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
WHERE description IS NULL
  OR status IS NULL
  OR status = ''
  OR created_at IS NULL;

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

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ticket_type_id VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS ticket_type_name VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE orders
SET
  quantity = COALESCE(quantity, 1),
  unit_price = COALESCE(unit_price, total_amount, 0),
  total_amount = COALESCE(total_amount, unit_price, 0),
  provider = COALESCE(NULLIF(provider, ''), 'manual'),
  payment_intent_id = COALESCE(NULLIF(payment_intent_id, ''), 'manual'),
  status = COALESCE(NULLIF(status, ''), 'paid'),
  recipient_email = COALESCE(NULLIF(recipient_email, ''), 'attendee@example.com'),
  created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
WHERE quantity IS NULL
  OR unit_price IS NULL
  OR total_amount IS NULL
  OR provider IS NULL
  OR provider = ''
  OR payment_intent_id IS NULL
  OR payment_intent_id = ''
  OR status IS NULL
  OR status = ''
  OR recipient_email IS NULL
  OR recipient_email = ''
  OR created_at IS NULL;

CREATE TABLE IF NOT EXISTS ticket_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  price NUMERIC(14,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  quantity_sold INT NOT NULL DEFAULT 0,
  max_per_person INT NOT NULL DEFAULT 0,
  event_id VARCHAR(120) NULL,
  category VARCHAR(120) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE ticket_types
SET
  quantity_sold = COALESCE(quantity_sold, 0),
  max_per_person = COALESCE(max_per_person, 0),
  is_active = COALESCE(is_active, TRUE),
  created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
  updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
WHERE quantity_sold IS NULL
  OR max_per_person IS NULL
  OR is_active IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL;

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

CREATE TABLE IF NOT EXISTS daily_sales_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day DATE NOT NULL,
  ticket_type_id VARCHAR(120) NOT NULL,
  ticket_type_name VARCHAR(200) NULL,
  total_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_tickets INT NOT NULL DEFAULT 0,
  UNIQUE (day, ticket_type_id)
);
