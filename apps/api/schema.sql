-- SafeMedQR PostgreSQL Schema (Neon / Vercel Postgres)
-- Run once to initialise the database.
-- Usage: psql $DATABASE_URL -f schema.sql
--   or paste into the Neon SQL Editor.

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id       VARCHAR(50)  NOT NULL PRIMARY KEY,
  name     VARCHAR(255) NOT NULL,
  role     VARCHAR(20)  NOT NULL,
  password VARCHAR(255) NOT NULL,
  active   BOOLEAN      NOT NULL DEFAULT true
);

INSERT INTO users (id, name, role, password) VALUES
  ('n-100',  'Nurse Alice',      'nurse',      'nurse123'),
  ('n-101',  'Nurse Bob',        'nurse',      'nurse123'),
  ('d-100',  'Dr. Sarah Chen',   'doctor',     'doctor123'),
  ('cn-100', 'Chief Nurse Dana', 'chief_nurse','chief123'),
  ('ph-100', 'Pharm. Leo Cruz',  'pharmacist', 'pharm123'),
  ('a-900',  'Admin Researcher', 'admin',      'admin123')
ON CONFLICT (id) DO NOTHING;

-- ─── Patients ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id                     VARCHAR(50)  NOT NULL PRIMARY KEY,
  mrn                    VARCHAR(100) NOT NULL UNIQUE,
  name                   VARCHAR(255) NOT NULL,
  dob                    DATE         NOT NULL,
  ward                   VARCHAR(100) NOT NULL,
  bed                    VARCHAR(100) NULL,
  allergy_status         VARCHAR(20)  NOT NULL DEFAULT 'none',
  allergies              TEXT         NULL,
  patient_status         VARCHAR(20)  NOT NULL DEFAULT 'active',
  attending_physician_id VARCHAR(50)  NULL,
  admission_date         DATE         NULL
);

INSERT INTO patients (id, mrn, name, dob, ward, attending_physician_id, admission_date) VALUES
  ('p-001', 'MRN1001', 'John Carter', '1978-05-11', 'Ward A', 'd-100', '2026-04-20'),
  ('p-002', 'MRN1002', 'Fatima Noor', '1965-09-23', 'Ward B', 'd-100', '2026-04-21')
ON CONFLICT (id) DO NOTHING;

-- ─── Medications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
  id    VARCHAR(50)  NOT NULL PRIMARY KEY,
  code  VARCHAR(100) NOT NULL UNIQUE,
  name  VARCHAR(255) NOT NULL,
  dose  VARCHAR(100) NOT NULL,
  route VARCHAR(50)  NOT NULL
);

INSERT INTO medications (id, code, name, dose, route) VALUES
  ('m-001', 'MED1001', 'Paracetamol', '500mg', 'PO'),
  ('m-002', 'MED1002', 'Ceftriaxone', '1g',    'IV')
ON CONFLICT (id) DO NOTHING;

-- ─── Medication Orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medication_orders (
  id               VARCHAR(50)  NOT NULL PRIMARY KEY,
  patient_id       VARCHAR(50)  NOT NULL,
  medication_id    VARCHAR(50)  NOT NULL,
  prescribed_dose  VARCHAR(100) NOT NULL,
  prescribed_route VARCHAR(50)  NOT NULL,
  scheduled_time   VARCHAR(20)  NOT NULL,
  prescription_id  VARCHAR(100) NOT NULL,
  active           BOOLEAN      NOT NULL DEFAULT true,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_order_patient    FOREIGN KEY (patient_id)    REFERENCES patients(id)    ON DELETE CASCADE,
  CONSTRAINT fk_order_medication FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_patient_id    ON medication_orders (patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_medication_id ON medication_orders (medication_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON medication_orders (status);

INSERT INTO medication_orders
  (id, patient_id, medication_id, prescribed_dose, prescribed_route, scheduled_time, prescription_id, active, status)
VALUES
  ('o-001', 'p-001', 'm-001', '500mg', 'PO', '08:00', 'rx-77881', true, 'pending'),
  ('o-002', 'p-002', 'm-002', '1g',    'IV', '09:00', 'rx-77882', true, 'pending')
ON CONFLICT (id) DO NOTHING;

-- ─── Scan Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_logs (
  id               VARCHAR(50) NOT NULL PRIMARY KEY,
  nurse_id         VARCHAR(50) NOT NULL,
  patient_id       VARCHAR(50) NOT NULL,
  medication_id    VARCHAR(50) NOT NULL,
  order_id         VARCHAR(50) NULL,
  timestamp        TIMESTAMP   NOT NULL DEFAULT NOW(),
  error_types      JSONB       NOT NULL DEFAULT '[]',
  adverse_reaction BOOLEAN     NULL,
  eval_notes       TEXT        NULL,
  eval_time        TIMESTAMP   NULL,
  CONSTRAINT fk_log_nurse      FOREIGN KEY (nurse_id)      REFERENCES users(id),
  CONSTRAINT fk_log_patient    FOREIGN KEY (patient_id)    REFERENCES patients(id),
  CONSTRAINT fk_log_medication FOREIGN KEY (medication_id) REFERENCES medications(id),
  CONSTRAINT fk_log_order      FOREIGN KEY (order_id)      REFERENCES medication_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_logs_nurse_id     ON scan_logs (nurse_id);
CREATE INDEX IF NOT EXISTS idx_logs_patient_id   ON scan_logs (patient_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp    ON scan_logs (timestamp DESC);

-- ─── Alert Thresholds ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id              VARCHAR(50)       NOT NULL PRIMARY KEY,
  metric          VARCHAR(255)      NOT NULL,
  threshold_value DOUBLE PRECISION  NOT NULL,
  updated_at      TIMESTAMP         NOT NULL DEFAULT NOW()
);

INSERT INTO alert_thresholds (id, metric, threshold_value) VALUES
  ('at-001', 'error_rate',            10.0),
  ('at-002', 'adverse_reaction_rate',  5.0),
  ('at-003', 'compliance_rate',       90.0)
ON CONFLICT (id) DO NOTHING;
