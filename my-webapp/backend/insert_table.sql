-- ============================================================================
-- SUPERSEDED: this file describes the OLD shared-schema layout.
-- The database now uses separate fabric_* / label_* tables.
-- Use bulk_schema.sql (DDL) and bulk_seed.sql (bulk data) instead.
-- Kept for historical reference only -- do not run against the current DB.
-- ============================================================================
-- =========================================
-- REALISTIC SAMPLE DATA FOR FABRIC INSPECTION DB
-- Total rows ≈ 500
-- =========================================

-- -----------------------------------------
-- 1. suppliers
-- -----------------------------------------
INSERT INTO suppliers (
  name, country, city, contact_person, contact_email, contact_phone, supplier_rating
) VALUES
('Meghna Textile Mills Ltd.', 'Bangladesh', 'Dhaka', 'Ahsan Rahman', 'ahsan.rahman@meghnatextile.com', '+8801711001001', 91.50),
('Narayanganj Knit Composite', 'Bangladesh', 'Narayanganj', 'Farzana Islam', 'farzana.islam@nkcbd.com', '+8801711001002', 88.20),
('Chittagong Fabric Sourcing', 'Bangladesh', 'Chattogram', 'Tanmoy Das', 'tanmoy.das@cfsbd.com', '+8801711001003', 84.75),
('Gazipur Spinning & Weaving', 'Bangladesh', 'Gazipur', 'Mahmudul Hasan', 'm.hasan@gswbd.com', '+8801711001004', 89.40),
('Delta Knitwear Supplies', 'Bangladesh', 'Khulna', 'Nusrat Jahan', 'nusrat.jahan@deltaknit.com', '+8801711001005', 86.90),
('Surma Apparels Raw Materials', 'Bangladesh', 'Sylhet', 'Rafiq Ahmed', 'rafiq.ahmed@surmaarm.com', '+8801711001006', 82.60),
('Ludhiana Cotton House', 'India', 'Ludhiana', 'Rohit Mehra', 'rohit.mehra@lchindia.com', '+919811001007', 87.30),
('Coimbatore Weave Source', 'India', 'Coimbatore', 'Priya Nair', 'priya.nair@cwsindia.com', '+919811001008', 90.10),
('Karachi Textile Traders', 'Pakistan', 'Karachi', 'Bilal Hussain', 'bilal.hussain@ktt.pk', '+923001001009', 81.95),
('Faisalabad Yarn & Fabric', 'Pakistan', 'Faisalabad', 'Amina Khalid', 'amina.khalid@fyf.pk', '+923001001010', 85.70),
('Suzhou Premium Textiles', 'China', 'Suzhou', 'Liu Wen', 'liu.wen@sptchina.com', '+861381001011', 92.15),
('Istanbul Fabric Link', 'Turkey', 'Istanbul', 'Emre Kaya', 'emre.kaya@ifl.com.tr', '+905301001012', 88.85);

-- -----------------------------------------
-- 2. shipments
-- 48 rows
-- -----------------------------------------
INSERT INTO shipments (
  supplier_id, shipment_code, shipment_date, received_date,
  total_rolls, fabric_type, color, sampling_stage, quality_score, notes
)
SELECT
  ((gs - 1) % 12) + 1 AS supplier_id,
  'SHP-2026-' || LPAD(gs::text, 4, '0') AS shipment_code,
  DATE '2026-01-02' + ((gs * 2) % 70),
  DATE '2026-01-04' + ((gs * 2) % 70) + (gs % 4),
  5,
  (ARRAY[
    'Single Jersey Cotton',
    'Rib Knit',
    'Interlock Knit',
    'Fleece',
    'Cotton Twill',
    'Polyester Mesh',
    'French Terry',
    'Viscose Blend'
  ])[((gs - 1) % 8) + 1],
  (ARRAY[
    'Black',
    'Navy Blue',
    'Melange Grey',
    'Optic White',
    'Charcoal',
    'Bottle Green',
    'Maroon',
    'Royal Blue',
    'Mustard',
    'Olive'
  ])[((gs - 1) % 10) + 1],
  (ARRAY['Initial','Second','Final'])[CASE WHEN gs % 3 = 1 THEN 1 WHEN gs % 3 = 2 THEN 2 ELSE 3 END]::sampling_stage_enum,
  ROUND((78 + (random() * 18))::numeric, 2),
  (ARRAY[
    'Routine bulk fabric delivery for export order.',
    'Lot received in good packing condition.',
    'Color shade to be verified against approved swatch.',
    'Urgent shipment for cutting line allocation.',
    'Requires standard four-point inspection before release.',
    'Moisture barrier wrapping observed on outer rolls.'
  ])[((gs - 1) % 6) + 1]
FROM generate_series(1, 48) AS gs;

-- -----------------------------------------
-- 3. fabric_rolls
-- 240 rows, 5 rolls per shipment
-- -----------------------------------------
INSERT INTO fabric_rolls (
  shipment_id, roll_code, roll_length_yards, roll_width_inches,
  weight_kg, inspection_date, inspection_time, inspector_notes
)
SELECT
  s.shipment_id,
  s.shipment_code || '-R' || r.roll_no,
  ROUND((65 + random() * 35)::numeric, 2),
  ROUND((58 + random() * 8)::numeric, 2),
  ROUND((18 + random() * 12)::numeric, 2),
  s.received_date + ((r.roll_no - 1) % 3),
  TIME '09:00' + ((s.shipment_id + r.roll_no) % 8) * INTERVAL '45 minutes',
  (ARRAY[
    'Roll surface clean at opening.',
    'Edges aligned properly during inspection.',
    'Minor creasing noticed near leading end.',
    'Fabric tension acceptable on inspection frame.',
    'Packing label matched shipment record.',
    'No visible contamination before scanning.'
  ])[(((s.shipment_id + r.roll_no) - 1) % 6) + 1]
FROM shipments s
CROSS JOIN generate_series(1, 5) AS r(roll_no);

-- -----------------------------------------
-- 4. inspections
-- 120 rows
-- inspect first 120 rolls
-- Realistic pattern: every roll has 10-12 minor defects and the
-- fabric point stays high (84-96) because minor defects only lower
-- it slightly. Reference example: IN-82 (12 defects, 108 penalty,
-- 85 points, grade B).
-- -----------------------------------------
INSERT INTO inspections (
  roll_id, total_images_processed, total_defects_found, total_penalty_points,
  points_per_100_yards, grade, model_version, status, inspected_at
)
SELECT
  fr.roll_id,
  12 + (fr.roll_id % 7),
  10 + ((fr.roll_id + 1) % 3) AS total_defects_found,
  (10 + ((fr.roll_id + 1) % 3)) * 9.0 AS total_penalty_points,
  CASE
    WHEN fr.roll_id = 82 THEN 85::numeric  -- keep the reference example IN-82
    WHEN fr.roll_id % 7 = 0 THEN (76 + (fr.roll_id % 4))::numeric  -- a small realistic C-grade group
    ELSE (96 - (fr.roll_id % 3) * 4 - (fr.roll_id % 5))::numeric
  END AS points_per_100_yards,
  CASE
    WHEN (
      CASE
        WHEN fr.roll_id = 82 THEN 85
        WHEN fr.roll_id % 7 = 0 THEN (76 + (fr.roll_id % 4))
        ELSE (96 - (fr.roll_id % 3) * 4 - (fr.roll_id % 5))
      END
    ) >= 90 THEN 'A'::grade_enum
    WHEN (
      CASE
        WHEN fr.roll_id = 82 THEN 85
        WHEN fr.roll_id % 7 = 0 THEN (76 + (fr.roll_id % 4))
        ELSE (96 - (fr.roll_id % 3) * 4 - (fr.roll_id % 5))
      END
    ) >= 80 THEN 'B'::grade_enum
    ELSE 'C'::grade_enum
  END,
  CASE
    WHEN fr.roll_id <= 40 THEN 'rt-detr-v1.0'
    WHEN fr.roll_id <= 80 THEN 'rt-detr-v1.1'
    ELSE 'rt-detr-v1.2'
  END,
  CASE
    WHEN fr.roll_id % 9 = 0 THEN 'Pending Review'::inspection_status_enum
    WHEN (
      CASE
        WHEN fr.roll_id = 82 THEN 85
        WHEN fr.roll_id % 7 = 0 THEN (76 + (fr.roll_id % 4))
        ELSE (96 - (fr.roll_id % 3) * 4 - (fr.roll_id % 5))
      END
    ) >= 80 THEN 'Approved'::inspection_status_enum
    ELSE 'Rejected'::inspection_status_enum
  END,
  (fr.inspection_date::timestamp + fr.inspection_time)
FROM fabric_rolls fr
WHERE fr.roll_id <= 120;

-- -----------------------------------------
-- 5. defects
-- 10-12 minor defects per roll, matching the inspection summaries.
-- -----------------------------------------
INSERT INTO defects (
  inspection_id, image_index, defect_type, severity,
  confidence_score, position_x, position_y
)
SELECT
  i.inspection_id,
  d.defect_seq,
  (ARRAY['Needle mark', 'Oil Spot', 'Miss loop', 'Setup', 'Contamination'])[((i.inspection_id + d.defect_seq - 1) % 5) + 1],
  1,
  0.900,
  ROUND((0.050 + (d.defect_seq - 1) * 0.080)::numeric, 4),
  ROUND((0.130 + ((d.defect_seq * 7) % 10) * 0.080)::numeric, 4)
FROM inspections i
JOIN LATERAL generate_series(1, i.total_defects_found) AS d(defect_seq) ON TRUE;

-- =========================================
-- OPTIONAL CHECKS
-- =========================================

-- Row counts
SELECT 'suppliers' AS table_name, COUNT(*) FROM suppliers
UNION ALL
SELECT 'shipments', COUNT(*) FROM shipments
UNION ALL
SELECT 'fabric_rolls', COUNT(*) FROM fabric_rolls
UNION ALL
SELECT 'inspections', COUNT(*) FROM inspections
UNION ALL
SELECT 'defects', COUNT(*) FROM defects;

-- Sample joined preview
SELECT
  s.name AS supplier,
  sh.shipment_code,
  sh.fabric_type,
  sh.color,
  fr.roll_code,
  i.grade,
  i.total_defects_found,
  i.points_per_100_yards
FROM inspections i
JOIN fabric_rolls fr ON i.roll_id = fr.roll_id
JOIN shipments sh ON fr.shipment_id = sh.shipment_id
JOIN suppliers s ON sh.supplier_id = s.supplier_id
LIMIT 20;
