-- SafeMedsQR MySQL Schema
-- Run this once to initialise the database.
-- Usage: mysql -u <user> -p <database> < schema.sql

CREATE DATABASE IF NOT EXISTS safemedsqr
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE safemedsqr;

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id       VARCHAR(50)                NOT NULL PRIMARY KEY,
  name     VARCHAR(255)               NOT NULL,
  role     ENUM('nurse', 'admin')     NOT NULL,
  password VARCHAR(255)               NOT NULL,
  active   TINYINT(1)                 NOT NULL DEFAULT 1
);

-- Seed default users (idempotent)
INSERT IGNORE INTO users (id, name, role, password) VALUES
  ('n-100', 'Nurse Alice',       'nurse', 'nurse123'),
  ('n-101', 'Nurse Bob',         'nurse', 'nurse123'),
  ('a-900', 'Admin Researcher',  'admin', 'admin123');

-- ─── Patients ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id    VARCHAR(50)  NOT NULL PRIMARY KEY,
  mrn   VARCHAR(100) NOT NULL UNIQUE,
  name  VARCHAR(255) NOT NULL,
  dob   DATE         NOT NULL,
  ward  VARCHAR(100) NOT NULL
);

INSERT IGNORE INTO patients (id, mrn, name, dob, ward) VALUES
  ('p-001', 'MRN1001', 'John Carter',  '1978-05-11', 'Ward A'),
  ('p-002', 'MRN1002', 'Fatima Noor',  '1965-09-23', 'Ward B');

-- ─── Medications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
  id    VARCHAR(50)  NOT NULL PRIMARY KEY,
  code  VARCHAR(100) NOT NULL UNIQUE,
  name  VARCHAR(255) NOT NULL,
  dose  VARCHAR(100) NOT NULL,
  route VARCHAR(50)  NOT NULL
);

INSERT IGNORE INTO medications (id, code, name, dose, route) VALUES
  ('m-001', 'MED1001', 'Paracetamol',  '500mg', 'PO'),
  ('m-002', 'MED1002', 'Ceftriaxone',  '1g',    'IV');

-- ─── Medication Orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medication_orders (
  id               VARCHAR(50)  NOT NULL PRIMARY KEY,
  patient_id       VARCHAR(50)  NOT NULL,
  medication_id    VARCHAR(50)  NOT NULL,
  prescribed_dose  VARCHAR(100) NOT NULL,
  prescribed_route VARCHAR(50)  NOT NULL,
  scheduled_time   VARCHAR(10)  NOT NULL,   -- stored as HH:mm string
  prescription_id  VARCHAR(100) NOT NULL,
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  CONSTRAINT fk_order_patient    FOREIGN KEY (patient_id)    REFERENCES patients(id)    ON DELETE CASCADE,
  CONSTRAINT fk_order_medication FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);

INSERT IGNORE INTO medication_orders
  (id, patient_id, medication_id, prescribed_dose, prescribed_route, scheduled_time, prescription_id, active)
VALUES
  ('o-001', 'p-001', 'm-001', '500mg', 'PO', '08:00', 'rx-77881', 1),
  ('o-002', 'p-002', 'm-002', '1g',    'IV', '09:00', 'rx-77882', 1);

-- ─── Scan Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_logs (
  id            VARCHAR(50)  NOT NULL PRIMARY KEY,
  nurse_id      VARCHAR(50)  NOT NULL,
  patient_id    VARCHAR(50)  NOT NULL,
  medication_id VARCHAR(50)  NOT NULL,
  order_id      VARCHAR(50)  NULL,
  timestamp     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error_types   JSON         NOT NULL  -- stored as JSON array e.g. ["Right Dose","Right Time"]
);
