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
-- -----------------------------------------
INSERT INTO inspections (
  roll_id, total_images_processed, total_defects_found, total_penalty_points,
  points_per_100_yards, grade, model_version, status, inspected_at
)
SELECT
  fr.roll_id,
  12 + (fr.roll_id % 7),
  CASE
    WHEN fr.roll_id % 10 IN (1,2,3,4) THEN 0
    WHEN fr.roll_id % 10 IN (5,6,7) THEN 1
    WHEN fr.roll_id % 10 IN (8,9) THEN 2
    ELSE 3
  END AS total_defects_found,
  CASE
    WHEN fr.roll_id % 10 IN (1,2,3,4) THEN 0
    WHEN fr.roll_id % 10 IN (5,6,7) THEN 2
    WHEN fr.roll_id % 10 IN (8,9) THEN 5
    ELSE 9
  END AS total_penalty_points,
  ROUND((
    CASE
      WHEN fr.roll_id % 10 IN (1,2,3,4) THEN 0
      WHEN fr.roll_id % 10 IN (5,6,7) THEN 2
      WHEN fr.roll_id % 10 IN (8,9) THEN 5
      ELSE 9
    END * 100.0 / fr.roll_length_yards
  )::numeric, 2),
  CASE
    WHEN (
      CASE
        WHEN fr.roll_id % 10 IN (1,2,3,4) THEN 0
        WHEN fr.roll_id % 10 IN (5,6,7) THEN 2
        WHEN fr.roll_id % 10 IN (8,9) THEN 5
        ELSE 9
      END * 100.0 / fr.roll_length_yards
    ) <= 10 THEN 'A'::grade_enum
    WHEN (
      CASE
        WHEN fr.roll_id % 10 IN (1,2,3,4) THEN 0
        WHEN fr.roll_id % 10 IN (5,6,7) THEN 2
        WHEN fr.roll_id % 10 IN (8,9) THEN 5
        ELSE 9
      END * 100.0 / fr.roll_length_yards
    ) <= 20 THEN 'B'::grade_enum
    WHEN (
      CASE
        WHEN fr.roll_id % 10 IN (1,2,3,4) THEN 0
        WHEN fr.roll_id % 10 IN (5,6,7) THEN 2
        WHEN fr.roll_id % 10 IN (8,9) THEN 5
        ELSE 9
      END * 100.0 / fr.roll_length_yards
    ) <= 30 THEN 'C'::grade_enum
    ELSE 'Reject'::grade_enum
  END,
  CASE
    WHEN fr.roll_id <= 40 THEN 'rt-detr-v1.0'
    WHEN fr.roll_id <= 80 THEN 'rt-detr-v1.1'
    ELSE 'rt-detr-v1.2'
  END,
  CASE
    WHEN fr.roll_id % 9 = 0 THEN 'Pending Review'::inspection_status_enum
    WHEN fr.roll_id % 13 = 0 THEN 'Rejected'::inspection_status_enum
    ELSE 'Approved'::inspection_status_enum
  END,
  (fr.inspection_date::timestamp + fr.inspection_time)
FROM fabric_rolls fr
WHERE fr.roll_id <= 120;

-- -----------------------------------------
-- 5. defects
-- around 80 realistic rows
-- create defects only for inspections that have defects
-- -----------------------------------------
INSERT INTO defects (
  inspection_id, image_index, defect_type, severity,
  confidence_score, position_x, position_y
)
SELECT
  i.inspection_id,
  d.defect_seq,
  CASE ((i.inspection_id + d.defect_seq) % 7)
    WHEN 0 THEN 'Hole'
    WHEN 1 THEN 'Oil Spot'
    WHEN 2 THEN 'Needle mark'
    WHEN 3 THEN 'Miss loop'
    WHEN 4 THEN 'Contamination'
    WHEN 5 THEN 'Yarn missing'
    ELSE 'Setup'
  END,
  CASE
    WHEN ((i.inspection_id + d.defect_seq) % 7) IN (0,5) THEN 4
    WHEN ((i.inspection_id + d.defect_seq) % 7) IN (1,4) THEN 3
    WHEN ((i.inspection_id + d.defect_seq) % 7) IN (2,6) THEN 2
    ELSE 1
  END,
  ROUND((0.780 + random() * 0.210)::numeric, 3),
  ROUND((0.050 + random() * 0.900)::numeric, 4),
  ROUND((0.050 + random() * 0.900)::numeric, 4)
FROM inspections i
JOIN LATERAL generate_series(
  1,
  CASE
    WHEN i.total_defects_found = 0 THEN 0
    WHEN i.total_defects_found = 1 THEN 1
    WHEN i.total_defects_found = 2 THEN 2
    ELSE 3
  END
) AS d(defect_seq) ON TRUE;

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