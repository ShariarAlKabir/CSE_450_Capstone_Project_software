-- ============================================================================
-- Fabric + Label inspection schema (v2)
--
-- Two fully independent table families:
--   fabric_*  : fabric suppliers -> shipments -> rolls -> inspections -> defects
--   label_*   : label suppliers -> shipments -> templates -> samples
--                              -> inspections -> defects
--
-- Run order:
--   1) bulk_schema.sql   (this file)
--   2) bulk_seed.sql
--
-- This file is destructive and idempotent: it drops every table it owns
-- (including the legacy shared tables from create_table.sql / label_tables.sql)
-- and recreates them empty. Run bulk_seed.sql afterwards to load data.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- legacy drop
DROP TABLE IF EXISTS inspection_notes    CASCADE;
DROP TABLE IF EXISTS app_users           CASCADE;
DROP TABLE IF EXISTS copq_events         CASCADE;
DROP TABLE IF EXISTS supplier_contracts  CASCADE;
DROP TABLE IF EXISTS system_investments  CASCADE;
DROP TABLE IF EXISTS cost_parameters     CASCADE;
DROP TABLE IF EXISTS label_defects       CASCADE;
DROP TABLE IF EXISTS label_inspections   CASCADE;
DROP TABLE IF EXISTS label_samples       CASCADE;
DROP TABLE IF EXISTS label_templates     CASCADE;
DROP TABLE IF EXISTS label_shipments     CASCADE;
DROP TABLE IF EXISTS label_suppliers     CASCADE;
DROP TABLE IF EXISTS fabric_defects      CASCADE;
DROP TABLE IF EXISTS fabric_inspections  CASCADE;
DROP TABLE IF EXISTS fabric_rolls        CASCADE;
DROP TABLE IF EXISTS fabric_shipments    CASCADE;
DROP TABLE IF EXISTS fabric_suppliers    CASCADE;
DROP TABLE IF EXISTS defects             CASCADE;
DROP TABLE IF EXISTS inspections         CASCADE;
DROP TABLE IF EXISTS shipments           CASCADE;
DROP TABLE IF EXISTS suppliers           CASCADE;

-- ------------------------------------------------------------------- enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sampling_stage_enum') THEN
    CREATE TYPE sampling_stage_enum AS ENUM ('Initial', 'Second', 'Final');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grade_enum') THEN
    CREATE TYPE grade_enum AS ENUM ('A', 'B', 'C', 'Reject');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_status_enum') THEN
    CREATE TYPE inspection_status_enum AS ENUM ('Pending Review', 'Approved', 'Rejected');
  END IF;
END $$;

-- ============================================================ FABRIC DOMAIN

CREATE TABLE fabric_suppliers (
  supplier_id      SERIAL PRIMARY KEY,
  name             VARCHAR(150) NOT NULL,
  country          VARCHAR(100),
  city             VARCHAR(100),
  contact_person   VARCHAR(150),
  contact_email    VARCHAR(150),
  contact_phone    VARCHAR(30),
  supplier_rating  NUMERIC(5, 2) CHECK (supplier_rating BETWEEN 0 AND 100),
  supplier_tier    VARCHAR(20) CHECK (supplier_tier IN ('Preferred', 'Approved', 'Conditional')),
  fabric_specialty VARCHAR(120),
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE fabric_shipments (
  shipment_id    SERIAL PRIMARY KEY,
  supplier_id    INT NOT NULL REFERENCES fabric_suppliers(supplier_id) ON DELETE RESTRICT,
  shipment_code  VARCHAR(50) UNIQUE NOT NULL,
  shipment_date  DATE,
  promised_date  DATE,
  received_date  DATE,
  total_rolls    INT CHECK (total_rolls > 0),
  fabric_type    VARCHAR(100),
  color          VARCHAR(80),
  sampling_stage sampling_stage_enum NOT NULL DEFAULT 'Initial',
  quality_score  NUMERIC(5, 2) CHECK (quality_score BETWEEN 0 AND 100),
  notes          TEXT
);

CREATE TABLE fabric_rolls (
  roll_id             SERIAL PRIMARY KEY,
  shipment_id         INT NOT NULL REFERENCES fabric_shipments(shipment_id) ON DELETE RESTRICT,
  roll_code           VARCHAR(50) UNIQUE NOT NULL,
  roll_length_yards   NUMERIC(8, 2) CHECK (roll_length_yards > 0),
  roll_width_inches   NUMERIC(6, 2) CHECK (roll_width_inches > 0),
  weight_kg           NUMERIC(6, 2),
  inspection_date     DATE,
  inspection_time     TIME,
  inspector_notes     TEXT
);

CREATE TABLE fabric_inspections (
  inspection_id          SERIAL PRIMARY KEY,
  roll_id                INT NOT NULL UNIQUE REFERENCES fabric_rolls(roll_id) ON DELETE RESTRICT,
  total_images_processed INT DEFAULT 0,
  total_defects_found    INT DEFAULT 0,
  total_penalty_points   NUMERIC(8, 2) DEFAULT 0,
  points_per_100_yards   NUMERIC(8, 2) DEFAULT 0,
  grade                  grade_enum,
  model_version          VARCHAR(50),
  status                 inspection_status_enum DEFAULT 'Pending Review',
  inspected_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE fabric_defects (
  defect_id        SERIAL PRIMARY KEY,
  inspection_id    INT NOT NULL REFERENCES fabric_inspections(inspection_id) ON DELETE CASCADE,
  image_index      INT NOT NULL,
  defect_type      VARCHAR(100) NOT NULL,
  severity         INT CHECK (severity BETWEEN 1 AND 4),
  confidence_score NUMERIC(4, 3) CHECK (confidence_score BETWEEN 0 AND 1),
  position_x       NUMERIC(7, 4),
  position_y       NUMERIC(7, 4)
);

CREATE INDEX idx_fabric_shipments_supplier ON fabric_shipments(supplier_id);
CREATE INDEX idx_fabric_shipments_stage    ON fabric_shipments(sampling_stage);
CREATE INDEX idx_fabric_rolls_shipment     ON fabric_rolls(shipment_id);
CREATE INDEX idx_fabric_inspections_grade  ON fabric_inspections(grade);
CREATE INDEX idx_fabric_defects_inspection ON fabric_defects(inspection_id);

-- ============================================================= LABEL DOMAIN

CREATE TABLE label_suppliers (
  supplier_id     SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  country         VARCHAR(100),
  city            VARCHAR(100),
  contact_person  VARCHAR(150),
  contact_email   VARCHAR(150),
  contact_phone   VARCHAR(30),
  supplier_rating NUMERIC(5, 2) CHECK (supplier_rating BETWEEN 0 AND 100),
  supplier_tier   VARCHAR(20) CHECK (supplier_tier IN ('Preferred', 'Approved', 'Conditional')),
  label_specialty VARCHAR(120),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE label_shipments (
  shipment_id    SERIAL PRIMARY KEY,
  supplier_id    INT NOT NULL REFERENCES label_suppliers(supplier_id) ON DELETE RESTRICT,
  shipment_code  VARCHAR(50) UNIQUE NOT NULL,
  shipment_date  DATE,
  promised_date  DATE,
  received_date  DATE,
  total_labels   INT CHECK (total_labels > 0),
  label_type     VARCHAR(60),
  material       VARCHAR(60),
  sampling_stage sampling_stage_enum NOT NULL DEFAULT 'Initial',
  quality_score  NUMERIC(5, 2) CHECK (quality_score BETWEEN 0 AND 100),
  notes          TEXT
);

CREATE TABLE label_templates (
  template_id      SERIAL PRIMARY KEY,
  supplier_id      INT REFERENCES label_suppliers(supplier_id) ON DELETE SET NULL,
  template_code    VARCHAR(50) UNIQUE NOT NULL,
  brand_name       VARCHAR(120) NOT NULL,
  label_type       VARCHAR(60) NOT NULL,
  garment_category VARCHAR(80),
  revision         VARCHAR(20) NOT NULL DEFAULT 'R1',
  status           VARCHAR(30) NOT NULL DEFAULT 'Approved'
                     CHECK (status IN ('Approved', 'Draft', 'Retired')),
  artwork_uri      TEXT,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE label_samples (
  sample_id     SERIAL PRIMARY KEY,
  template_id   INT NOT NULL REFERENCES label_templates(template_id) ON DELETE RESTRICT,
  shipment_id   INT REFERENCES label_shipments(shipment_id) ON DELETE SET NULL,
  sample_code   VARCHAR(60) UNIQUE NOT NULL,
  sample_source VARCHAR(40) NOT NULL
                  CHECK (sample_source IN ('Production', 'Golden', 'Supplier')),
  captured_at   TIMESTAMP DEFAULT NOW(),
  operator_name VARCHAR(120),
  notes         TEXT
);

CREATE TABLE label_inspections (
  label_inspection_id  SERIAL PRIMARY KEY,
  report_id            UUID UNIQUE NOT NULL,
  sample_id            INT REFERENCES label_samples(sample_id) ON DELETE SET NULL,
  reference_template_id INT REFERENCES label_templates(template_id) ON DELETE SET NULL,
  inspection_mode      VARCHAR(30) NOT NULL DEFAULT 'Deterministic'
                         CHECK (inspection_mode IN ('Deterministic', 'Non-deterministic')),
  -- Canonical three-value vocabulary, enforced so a writer cannot reintroduce
  -- its own spelling. Three different ones were in use before: the seed wrote
  -- PASS/REVIEW/REJECT, the deterministic pipeline wrote REJECT_GATE1 and
  -- REJECT_GATE2, and the non-deterministic model wrote 'Pass'/'Review' -- so
  -- a passing non-deterministic label graded as Reject and raised an alert.
  -- The specific gate or reason goes in verdict_detail.
  verdict              VARCHAR(20) NOT NULL
                         CHECK (verdict IN ('PASS', 'REVIEW', 'REJECT')),
  verdict_detail       VARCHAR(50),
  ssim_score           NUMERIC(5, 4),
  hotspot_count        INT NOT NULL DEFAULT 0,
  confidence_score     NUMERIC(5, 4),
  status               VARCHAR(30) NOT NULL DEFAULT 'Completed'
                         CHECK (status IN ('Completed', 'Pending Review', 'Approved', 'Rejected')),
  inspected_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE label_defects (
  label_defect_id     SERIAL PRIMARY KEY,
  label_inspection_id INT NOT NULL REFERENCES label_inspections(label_inspection_id) ON DELETE CASCADE,
  defect_type         VARCHAR(100) NOT NULL,
  severity            INT NOT NULL CHECK (severity BETWEEN 1 AND 4),
  confidence_score    NUMERIC(5, 4),
  position_x          NUMERIC(7, 4),
  position_y          NUMERIC(7, 4),
  notes               TEXT
);

CREATE INDEX idx_label_shipments_supplier  ON label_shipments(supplier_id);
CREATE INDEX idx_label_templates_supplier  ON label_templates(supplier_id);
CREATE INDEX idx_label_samples_shipment    ON label_samples(shipment_id);
CREATE INDEX idx_label_samples_template    ON label_samples(template_id);
CREATE INDEX idx_label_inspections_sample  ON label_inspections(sample_id);
CREATE INDEX idx_label_defects_inspection  ON label_defects(label_inspection_id);

-- ======================================================== ECONOMICS DOMAIN
--
-- Everything the Reports page and the ROI / COPQ analytics show is stored
-- here. Nothing on those screens is a literal in the frontend any more: the
-- money is either a recorded amount (copq_events, system_investments,
-- supplier_contracts) or a volume from the inspection tables multiplied by a
-- rate that is itself a row in cost_parameters.

-- One row per scope per effective date. The newest row wins.
-- These are operating assumptions, not measurements; they are editable and
-- the UI labels anything derived from them as modelled.
CREATE TABLE cost_parameters (
  parameter_id            SERIAL PRIMARY KEY,
  scope                   VARCHAR(10) NOT NULL CHECK (scope IN ('Fabric', 'Label')),
  effective_from          DATE NOT NULL,
  manual_minutes_per_unit NUMERIC(6, 2) NOT NULL CHECK (manual_minutes_per_unit > 0),
  ai_minutes_per_unit     NUMERIC(6, 2) NOT NULL CHECK (ai_minutes_per_unit > 0),
  hourly_labor_cost       NUMERIC(8, 2) NOT NULL CHECK (hourly_labor_cost >= 0),
  reject_cost_per_unit    NUMERIC(10, 2) NOT NULL CHECK (reject_cost_per_unit >= 0),
  rework_cost_per_unit    NUMERIC(10, 2) NOT NULL CHECK (rework_cost_per_unit >= 0),
  manual_detection_rate   NUMERIC(5, 2) NOT NULL CHECK (manual_detection_rate BETWEEN 0 AND 100),
  quality_target          NUMERIC(5, 2) NOT NULL CHECK (quality_target BETWEEN 0 AND 100),
  -- A lot at or above this score clears at the Final sampling stage.
  clearance_score         NUMERIC(5, 2) NOT NULL CHECK (clearance_score BETWEEN 0 AND 100),
  currency                CHAR(3) NOT NULL DEFAULT 'USD',
  UNIQUE (scope, effective_from)
);

-- What the platform cost to adopt. Drives the payback / break-even tracker.
CREATE TABLE system_investments (
  investment_id SERIAL PRIMARY KEY,
  item          VARCHAR(120) NOT NULL,
  category      VARCHAR(40) NOT NULL
                  CHECK (category IN ('Hardware', 'Software', 'Integration', 'Training')),
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  incurred_on   DATE NOT NULL,
  notes         TEXT
);

-- Cost of poor quality, one row per actual loss event, tied to the inspection
-- that caused it so the breakdown is traceable rather than a fixed percentage.
CREATE TABLE copq_events (
  copq_id              SERIAL PRIMARY KEY,
  scope                VARCHAR(10) NOT NULL CHECK (scope IN ('Fabric', 'Label')),
  fabric_inspection_id INT REFERENCES fabric_inspections(inspection_id) ON DELETE CASCADE,
  label_inspection_id  INT REFERENCES label_inspections(label_inspection_id) ON DELETE CASCADE,
  category             VARCHAR(40) NOT NULL
                         CHECK (category IN ('Material scrap', 'Rework', 'Downtime', 'Chargeback')),
  amount               NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  occurred_on          DATE NOT NULL,
  notes                TEXT,
  CHECK (
    (scope = 'Fabric' AND fabric_inspection_id IS NOT NULL AND label_inspection_id IS NULL) OR
    (scope = 'Label'  AND label_inspection_id  IS NOT NULL AND fabric_inspection_id IS NULL)
  )
);

-- Commercial terms per supplier: spend coverage, unit price and renewal date.
CREATE TABLE supplier_contracts (
  contract_id        SERIAL PRIMARY KEY,
  scope              VARCHAR(10) NOT NULL CHECK (scope IN ('Fabric', 'Label')),
  fabric_supplier_id INT REFERENCES fabric_suppliers(supplier_id) ON DELETE CASCADE,
  label_supplier_id  INT REFERENCES label_suppliers(supplier_id) ON DELETE CASCADE,
  contract_code      VARCHAR(40) UNIQUE NOT NULL,
  annual_spend       NUMERIC(12, 2) NOT NULL CHECK (annual_spend >= 0),
  unit_price         NUMERIC(10, 4) NOT NULL CHECK (unit_price >= 0),
  payment_terms      VARCHAR(40),
  renewal_date       DATE,
  currency           CHAR(3) NOT NULL DEFAULT 'USD',
  CHECK (
    (scope = 'Fabric' AND fabric_supplier_id IS NOT NULL AND label_supplier_id IS NULL) OR
    (scope = 'Label'  AND label_supplier_id  IS NOT NULL AND fabric_supplier_id IS NULL)
  )
);

-- ============================================================== PEOPLE DOMAIN

CREATE TABLE app_users (
  user_id    SERIAL PRIMARY KEY,
  full_name  VARCHAR(120) NOT NULL,
  initials   VARCHAR(4) NOT NULL,
  role       VARCHAR(30) NOT NULL CHECK (role IN ('Inspector', 'Manager', 'Admin')),
  job_title  VARCHAR(80),
  location   VARCHAR(120),
  email      VARCHAR(150) UNIQUE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Free-text notes left on the inspection queue by real users.
CREATE TABLE inspection_notes (
  note_id              SERIAL PRIMARY KEY,
  user_id              INT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  scope                VARCHAR(10) CHECK (scope IN ('Fabric', 'Label')),
  fabric_inspection_id INT REFERENCES fabric_inspections(inspection_id) ON DELETE CASCADE,
  label_inspection_id  INT REFERENCES label_inspections(label_inspection_id) ON DELETE CASCADE,
  body                 TEXT NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_parameters_scope    ON cost_parameters(scope, effective_from DESC);
CREATE INDEX idx_copq_events_scope        ON copq_events(scope, occurred_on);
CREATE INDEX idx_copq_events_fabric       ON copq_events(fabric_inspection_id);
CREATE INDEX idx_copq_events_label        ON copq_events(label_inspection_id);
CREATE INDEX idx_supplier_contracts_fab   ON supplier_contracts(fabric_supplier_id);
CREATE INDEX idx_supplier_contracts_lbl   ON supplier_contracts(label_supplier_id);
CREATE INDEX idx_inspection_notes_created ON inspection_notes(created_at DESC);
-- At most one signed-in user.
CREATE UNIQUE INDEX idx_app_users_current ON app_users(is_current) WHERE is_current;

COMMIT;
