-- ============================================================================
-- SUPERSEDED: this file describes the OLD shared-schema layout.
-- The database now uses separate fabric_* / label_* tables.
-- Use bulk_schema.sql (DDL) and bulk_seed.sql (bulk data) instead.
-- Kept for historical reference only -- do not run against the current DB.
-- ============================================================================
CREATE TYPE sampling_stage_enum AS ENUM (
  'Initial',
  'Second',
  'Final'
);

CREATE TYPE grade_enum AS ENUM (
  'A',
  'B',
  'C',
  'Reject'
);

CREATE TYPE inspection_status_enum AS ENUM (
  'Pending Review',
  'Approved',
  'Rejected'
);


CREATE TABLE suppliers (
  supplier_id     SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  country         VARCHAR(100),
  city            VARCHAR(100),
  contact_person  VARCHAR(150),
  contact_email   VARCHAR(150),
  contact_phone   VARCHAR(30),
  supplier_rating NUMERIC(5, 2) CHECK (supplier_rating BETWEEN 0 AND 100),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE shipments (
  shipment_id    SERIAL PRIMARY KEY,
  supplier_id    INT NOT NULL REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
  shipment_code  VARCHAR(50) UNIQUE NOT NULL,
  shipment_date  DATE,
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
  shipment_id         INT NOT NULL REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
  roll_code           VARCHAR(50) UNIQUE NOT NULL,
  roll_length_yards   NUMERIC(8, 2) CHECK (roll_length_yards > 0),
  roll_width_inches   NUMERIC(6, 2) CHECK (roll_width_inches > 0),
  weight_kg           NUMERIC(6, 2),
  inspection_date     DATE,
  inspection_time     TIME,
  inspector_notes     TEXT
);

CREATE TABLE inspections (
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

CREATE TABLE defects (
  defect_id        SERIAL PRIMARY KEY,
  inspection_id    INT NOT NULL REFERENCES inspections(inspection_id) ON DELETE CASCADE,
  image_index      INT NOT NULL,
  defect_type      VARCHAR(100) NOT NULL,
  severity         INT CHECK (severity BETWEEN 1 AND 4),
  confidence_score NUMERIC(4, 3) CHECK (confidence_score BETWEEN 0 AND 1),
  position_x       NUMERIC(7, 4),
  position_y       NUMERIC(7, 4)
);

CREATE INDEX idx_shipments_supplier ON shipments(supplier_id);

CREATE INDEX idx_rolls_shipment ON fabric_rolls(shipment_id);

CREATE INDEX idx_defects_inspection ON defects(inspection_id);

CREATE INDEX idx_shipments_stage ON shipments(sampling_stage);

CREATE INDEX idx_inspections_grade ON inspections(grade);