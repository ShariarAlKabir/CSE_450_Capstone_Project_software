CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(100),
  city VARCHAR(100),
  contact_person VARCHAR(150),
  contact_email VARCHAR(150),
  contact_phone VARCHAR(30),
  supplier_rating NUMERIC(5,2) CHECK (supplier_rating BETWEEN 0 AND 100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id SERIAL PRIMARY KEY,
  supplier_id INT NOT NULL REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
  shipment_code VARCHAR(50) UNIQUE NOT NULL,
  shipment_date DATE,
  received_date DATE,
  total_rolls INT CHECK (total_rolls > 0),
  fabric_type VARCHAR(100),
  color VARCHAR(80),
  sampling_stage VARCHAR(20) NOT NULL DEFAULT 'Initial',
  quality_score NUMERIC(5,2) CHECK (quality_score BETWEEN 0 AND 100),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS fabric_rolls (
  roll_id SERIAL PRIMARY KEY,
  shipment_id INT NOT NULL REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
  roll_code VARCHAR(50) UNIQUE NOT NULL,
  roll_length_yards NUMERIC(8,2) CHECK (roll_length_yards > 0),
  roll_width_inches NUMERIC(6,2) CHECK (roll_width_inches > 0),
  weight_kg NUMERIC(6,2),
  inspection_date DATE,
  inspection_time TIME,
  inspector_notes TEXT
);

CREATE TABLE IF NOT EXISTS inspections (
  inspection_id SERIAL PRIMARY KEY,
  roll_id INT NOT NULL UNIQUE REFERENCES fabric_rolls(roll_id) ON DELETE RESTRICT,
  total_images_processed INT DEFAULT 0,
  total_defects_found INT DEFAULT 0,
  total_penalty_points NUMERIC(8,2) DEFAULT 0,
  points_per_100_yards NUMERIC(8,2) DEFAULT 0,
  grade VARCHAR(10),
  model_version VARCHAR(50),
  status VARCHAR(30) DEFAULT 'Pending Review',
  inspected_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS defects (
  defect_id SERIAL PRIMARY KEY,
  inspection_id INT NOT NULL REFERENCES inspections(inspection_id) ON DELETE CASCADE,
  image_index INT NOT NULL,
  defect_type VARCHAR(100) NOT NULL,
  severity INT CHECK (severity BETWEEN 1 AND 4),
  confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
  position_x NUMERIC(7,4),
  position_y NUMERIC(7,4)
);

INSERT INTO suppliers (name, country, city, contact_person, contact_email, contact_phone, supplier_rating)
VALUES
  ('Bangladesh Textile Co.', 'Bangladesh', 'Dhaka', 'Rahman', 'rahman@btc.com', '+8801700001', 92.00),
  ('Apex Fabric Ltd.', 'Bangladesh', 'Chattogram', 'Karim', 'karim@apex.com', '+8801700002', 86.00)
ON CONFLICT DO NOTHING;

INSERT INTO shipments (supplier_id, shipment_code, shipment_date, received_date, total_rolls, fabric_type, color, sampling_stage, quality_score, notes)
VALUES
  (1, 'BT-2025-001', '2025-07-10', '2025-07-12', 25, 'Denim', 'Indigo', 'Initial', 94.00, 'Bulk shipment'),
  (2, 'AF-2025-210', '2025-07-11', '2025-07-13', 30, 'Cotton', 'White', 'Initial', 88.00, 'Final checks pending')
ON CONFLICT (shipment_code) DO NOTHING;
