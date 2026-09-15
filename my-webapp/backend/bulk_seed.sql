-- ============================================================================
-- Bulk, realistic seed data for the fabric_* and label_* table families.
--
-- Design rules encoded here:
--   * 28 fabric suppliers and 22 label suppliers.
--   * Every supplier gets at least 2 shipments; better-rated suppliers get
--     more (rating tiers drive shipment counts).
--   * Shipment quality tracks supplier rating; roll quality tracks shipment
--     quality. Better rolls therefore show higher fabric points and grades.
--   * Every inspected roll carries a healthy 5-18 defects. Minor defects
--     (severity 1) dominate on good rolls, heavier defects appear on poor ones.
--   * Label samples with high SSIM get PASS verdicts and few/no defects;
--     low SSIM samples get REVIEW/REJECT with heavier defect registers.
--
-- Run bulk_schema.sql first. Safe to re-run: it truncates before loading.
-- setseed() keeps the pseudo-random spread reproducible between runs.
-- ============================================================================

BEGIN;

SELECT setseed(0.4242);

TRUNCATE TABLE inspection_notes, app_users, copq_events, supplier_contracts,
               system_investments, cost_parameters,
               fabric_defects, fabric_inspections, fabric_rolls, fabric_shipments,
               fabric_suppliers, label_defects, label_inspections, label_samples,
               label_templates, label_shipments, label_suppliers
  RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 1. fabric_suppliers (28)
-- ---------------------------------------------------------------------------
INSERT INTO fabric_suppliers
  (name, country, city, contact_person, contact_email, contact_phone,
   supplier_rating, supplier_tier, fabric_specialty)
VALUES
 ('Meghna Textile Mills Ltd.','Bangladesh','Dhaka','Ahsan Rahman','ahsan.rahman@meghnatextile.com','+8801711001001',94.20,'Preferred','Single Jersey Cotton'),
 ('Narayanganj Knit Composite','Bangladesh','Narayanganj','Farzana Islam','farzana.islam@nkcbd.com','+8801711001002',91.50,'Preferred','Rib & Interlock Knit'),
 ('Chittagong Fabric Sourcing','Bangladesh','Chattogram','Tanmoy Das','tanmoy.das@cfsbd.com','+8801811001003',86.40,'Approved','Woven Cotton'),
 ('Gazipur Spinning & Weaving','Bangladesh','Gazipur','Mahmudul Hasan','m.hasan@gswbd.com','+8801711001004',92.80,'Preferred','Denim & Twill'),
 ('Delta Knitwear Supplies','Bangladesh','Khulna','Nusrat Jahan','nusrat.jahan@deltaknit.com','+8801711001005',88.10,'Approved','Fleece & Terry'),
 ('Surma Apparels Raw Materials','Bangladesh','Sylhet','Rafiq Ahmed','rafiq.ahmed@surmaarm.com','+8801811001006',79.60,'Conditional','Viscose Blend'),
 ('Padma Weaving Industries','Bangladesh','Rajshahi','Selina Akter','selina.akter@padmaweave.com','+8801711001007',74.30,'Conditional','Poplin & Canvas'),
 ('Ludhiana Cotton House','India','Ludhiana','Rohit Mehra','rohit.mehra@lchindia.com','+919811001008',87.90,'Approved','Cotton Twill'),
 ('Coimbatore Weave Source','India','Coimbatore','Priya Nair','priya.nair@cwsindia.com','+919811001009',93.60,'Preferred','Combed Cotton Knit'),
 ('Tiruppur Knit Fabrics','India','Tiruppur','Karthik Subramanian','karthik.s@tkfindia.com','+919811001010',90.70,'Preferred','Single Jersey'),
 ('Surat Polyester Mills','India','Surat','Nisha Patel','nisha.patel@suratpoly.com','+919811001011',82.40,'Approved','Polyester Mesh'),
 ('Kolkata Jute & Blend Co.','India','Kolkata','Arindam Bose','arindam.bose@kjbco.in','+919811001012',71.20,'Conditional','Jute & Blend'),
 ('Karachi Textile Traders','Pakistan','Karachi','Bilal Hussain','bilal.hussain@ktt.pk','+923001001013',80.50,'Approved','Cotton Poplin'),
 ('Faisalabad Yarn & Fabric','Pakistan','Faisalabad','Amina Khalid','amina.khalid@fyf.pk','+923001001014',85.90,'Approved','Yarn Dyed'),
 ('Lahore Denim Works','Pakistan','Lahore','Usman Tariq','usman.tariq@lahoredenim.pk','+923001001015',89.30,'Approved','Denim 12oz'),
 ('Suzhou Premium Textiles','China','Suzhou','Liu Wen','liu.wen@sptchina.com','+861381001016',95.10,'Preferred','Silk & Satin'),
 ('Shaoxing Weave Group','China','Shaoxing','Chen Yu','chen.yu@shaoxingweave.cn','+861381001017',91.80,'Preferred','Polyester Woven'),
 ('Guangzhou Knit Export Co.','China','Guangzhou','Zhang Min','zhang.min@gzknit.cn','+861381001018',84.60,'Approved','Knit Blend'),
 ('Istanbul Fabric Link','Turkey','Istanbul','Emre Kaya','emre.kaya@ifl.com.tr','+905301001019',90.40,'Preferred','Lycra Jersey'),
 ('Bursa Denim Tekstil','Turkey','Bursa','Zeynep Demir','zeynep.demir@bursadenim.tr','+905301001020',87.20,'Approved','Denim'),
 ('Izmir Cotton Weavers','Turkey','Izmir','Murat Aydin','murat.aydin@izmircotton.tr','+905301001021',76.80,'Conditional','Cotton Canvas'),
 ('Ho Chi Minh Textile JSC','Vietnam','Ho Chi Minh City','Nguyen Lan','lan.nguyen@hcmtextile.vn','+849011001022',92.30,'Preferred','Single Jersey'),
 ('Hanoi Knit Fabrics','Vietnam','Hanoi','Tran Minh','minh.tran@hanoiknit.vn','+849011001023',85.10,'Approved','French Terry'),
 ('Jakarta Spinning Mills','Indonesia','Jakarta','Dewi Santoso','dewi.santoso@jakartaspin.id','+628111001024',81.70,'Approved','Spun Polyester'),
 ('Bandung Weave Industries','Indonesia','Bandung','Budi Hartono','budi.hartono@bandungweave.id','+628111001025',78.40,'Conditional','Rayon Blend'),
 ('Porto Textile Group','Portugal','Porto','Joao Silva','joao.silva@portotextile.pt','+351911001026',93.90,'Preferred','Pima Cotton'),
 ('Guimaraes Knit Mills','Portugal','Guimaraes','Ana Ferreira','ana.ferreira@gknit.pt','+351911001027',88.70,'Approved','Organic Cotton Knit'),
 ('Cairo Cotton & Blend','Egypt','Cairo','Omar Hassan','omar.hassan@cairocotton.eg','+201011001028',73.50,'Conditional','Cotton Blend');

-- ---------------------------------------------------------------------------
-- 2. label_suppliers (22)
-- ---------------------------------------------------------------------------
INSERT INTO label_suppliers
  (name, country, city, contact_person, contact_email, contact_phone,
   supplier_rating, supplier_tier, label_specialty)
VALUES
 ('Avery Dennison Bangladesh','Bangladesh','Dhaka','Shahriar Kabir','shahriar.kabir@averybd.com','+8801712001001',93.50,'Preferred','Woven brand labels'),
 ('Dhaka Label & Trim Ltd.','Bangladesh','Dhaka','Rumana Haque','rumana.haque@dhakalabel.com','+8801712001002',87.20,'Approved','Printed labels'),
 ('Chittagong Woven Labels','Bangladesh','Chattogram','Imtiaz Uddin','imtiaz.uddin@ctgwoven.com','+8801812001003',80.60,'Approved','Woven labels'),
 ('Tiruppur Label Craft','India','Tiruppur','Divya Raman','divya.raman@tlcindia.com','+919811002004',89.40,'Approved','Care labels'),
 ('Delhi Trim Solutions','India','New Delhi','Varun Kapoor','varun.kapoor@delhitrim.in','+919811002005',84.80,'Approved','Hangtags'),
 ('Mumbai Woven Label Co.','India','Mumbai','Sneha Joshi','sneha.joshi@mumbaiwoven.in','+919811002006',91.10,'Preferred','Woven labels'),
 ('Karachi Label Printers','Pakistan','Karachi','Fahad Iqbal','fahad.iqbal@klprinters.pk','+923001002007',78.30,'Conditional','Printed labels'),
 ('Lahore Trim & Tag','Pakistan','Lahore','Hira Nawaz','hira.nawaz@lahoretrim.pk','+923001002008',82.90,'Approved','Hangtags'),
 ('Ningbo Label Manufacturing','China','Ningbo','Wang Lei','wang.lei@ningbolabel.cn','+861381002009',92.70,'Preferred','Woven labels'),
 ('Dongguan Printed Labels','China','Dongguan','Li Jing','li.jing@dgprinted.cn','+861381002010',86.50,'Approved','Printed labels'),
 ('Shenzhen Barcode Solutions','China','Shenzhen','Huang Tao','huang.tao@szbarcode.cn','+861381002011',90.20,'Preferred','Barcode labels'),
 ('Istanbul Label House','Turkey','Istanbul','Cem Yilmaz','cem.yilmaz@istanbullabel.tr','+905301002012',88.60,'Approved','Woven labels'),
 ('Izmir Care Label Co.','Turkey','Izmir','Elif Kaya','elif.kaya@izmircare.tr','+905301002013',76.40,'Conditional','Care labels'),
 ('Hanoi Printed Trim','Vietnam','Hanoi','Pham Thu','thu.pham@hanoitrim.vn','+849011002014',85.30,'Approved','Printed labels'),
 ('Ho Chi Minh Woven Labels','Vietnam','Ho Chi Minh City','Vo Hai','hai.vo@hcmwoven.vn','+849011002015',90.90,'Preferred','Woven labels'),
 ('Jakarta Label Industries','Indonesia','Jakarta','Rina Wijaya','rina.wijaya@jakartalabel.id','+628111002016',79.80,'Conditional','Printed labels'),
 ('Bangkok Trim & Tag','Thailand','Bangkok','Somchai Prasert','somchai.p@bangkoktrim.th','+668111002017',88.00,'Approved','Hangtags'),
 ('Colombo Label Works','Sri Lanka','Colombo','Nuwan Perera','nuwan.perera@colombolabel.lk','+947111002018',83.40,'Approved','Care labels'),
 ('Porto Care Labels','Portugal','Porto','Marta Costa','marta.costa@portocare.pt','+351911002019',92.00,'Preferred','Care labels'),
 ('Milan Trim Fashion','Italy','Milan','Giulia Rossi','giulia.rossi@milanotrim.it','+393311002020',94.30,'Preferred','Woven brand labels'),
 ('Casablanca Label Print','Morocco','Casablanca','Youssef Amrani','youssef.amrani@casalabel.ma','+212611002021',74.90,'Conditional','Printed labels'),
 ('Seoul Woven Label Inc.','South Korea','Seoul','Kim Ji-ho','jiho.kim@seoulwoven.kr','+821011002022',91.60,'Preferred','Woven labels');

-- ---------------------------------------------------------------------------
-- 3. fabric_shipments: 2-6 per supplier, weighted by rating.
--    total_rolls is provisional (1) and corrected after rolls are generated.
-- ---------------------------------------------------------------------------
INSERT INTO fabric_shipments
  (supplier_id, shipment_code, shipment_date, promised_date, received_date, total_rolls,
   fabric_type, color, sampling_stage, quality_score, notes)
WITH ship_counts AS (
  SELECT supplier_id, supplier_rating,
    CASE
      WHEN supplier_rating >= 93 THEN 6
      WHEN supplier_rating >= 90 THEN 5
      WHEN supplier_rating >= 85 THEN 4
      ELSE 3
    END AS n_shipments
  FROM fabric_suppliers
),
ranked AS (
  SELECT c.supplier_id, c.supplier_rating, g.n,
         ROW_NUMBER() OVER (ORDER BY ((c.supplier_id * 37 + g.n * 101) % 997), c.supplier_id, g.n) AS rn
  FROM ship_counts c
  CROSS JOIN LATERAL generate_series(1, c.n_shipments) AS g(n)
),
planned AS (
  SELECT r.supplier_id, r.supplier_rating, r.n,
         ((r.rn - 1) % 11) AS month_index,
         (DATE '2025-10-01'
            + (((r.rn - 1) % 11) || ' months')::interval
            + (((r.rn * 13) % 20) || ' days')::interval
         )::date AS shipment_date
  FROM ranked r
)
SELECT
  p.supplier_id,
  'FSH-' || to_char(p.shipment_date, 'YYYY') || '-' ||
    lpad(p.supplier_id::text, 3, '0') || lpad(p.n::text, 2, '0'),
  p.shipment_date,
  -- contractual lead time: every fabric lot is promised 5 days after dispatch
  p.shipment_date + 5,
  -- actual arrival. Better-rated mills land inside the promised window more
  -- often, so on-time delivery is a real measurement rather than a guess.
  p.shipment_date + (
    CASE
      WHEN p.supplier_rating >= 90 THEN 3 + ((p.supplier_id + p.n) % 2)
      WHEN p.supplier_rating >= 85 THEN 4 + ((p.supplier_id + p.n) % 2)
      WHEN p.supplier_rating >= 80 THEN 4 + ((p.supplier_id + p.n) % 3)
      ELSE 5 + ((p.supplier_id + p.n) % 4)
    END
  ),
  1,
  (ARRAY['Single Jersey Cotton','Rib Knit 1x1','Interlock Knit','French Terry',
         'Fleece Brushed','Cotton Twill','Denim 12oz','Polyester Mesh',
         'Viscose Blend','Lycra Jersey','Poplin','Canvas 10oz'])[1 + ((p.supplier_id * 3 + p.n) % 12)],
  (ARRAY['Black','Navy Blue','Melange Grey','Optic White','Charcoal','Bottle Green',
         'Maroon','Royal Blue','Mustard','Olive','Sand Beige','Dusty Rose','Teal','Burgundy'])[1 + ((p.supplier_id + p.n * 5) % 14)],
  (ARRAY['Initial','Second','Final'])[1 + ((p.supplier_id + p.n) % 3)]::sampling_stage_enum,
  ROUND(GREATEST(62, LEAST(99,
    p.supplier_rating + (random() * 8 - 4) + ((p.month_index::numeric / 10) * 6 - 3)
  ))::numeric, 2),
  (ARRAY['Routine bulk delivery for export order.',
         'Lot received in good packing condition.',
         'Shade to be verified against approved swatch.',
         'Urgent allocation for cutting line.',
         'Requires standard four-point inspection before release.',
         'Moisture barrier wrapping observed on outer rolls.',
         'Rolls re-palletised at port; check edge damage.',
         'Partial lot; balance arriving on next vessel.'])[1 + ((p.supplier_id * 7 + p.n) % 8)]
FROM planned p;

-- ---------------------------------------------------------------------------
-- 4. fabric_rolls: 8-20 rolls per shipment, more rolls on better shipments.
-- ---------------------------------------------------------------------------
INSERT INTO fabric_rolls
  (shipment_id, roll_code, roll_length_yards, roll_width_inches, weight_kg,
   inspection_date, inspection_time, inspector_notes)
SELECT
  sh.shipment_id,
  sh.shipment_code || '-R' || lpad(g.n::text, 2, '0'),
  ROUND((60 + random() * 60)::numeric, 2),
  ROUND((58 + random() * 14)::numeric, 2),
  ROUND((18 + random() * 14)::numeric, 2),
  sh.received_date + ((g.n - 1) % 4),
  (TIME '08:00' + ((g.n % 10) * INTERVAL '42 minutes')),
  (ARRAY['Surface clean at opening.',
         'Selvedge aligned during inspection.',
         'Minor creasing near leading end.',
         'Tension acceptable on inspection frame.',
         'Packing label matched shipment record.',
         'No visible contamination before scanning.',
         'Slight shade variation between roll ends.',
         'Roll core slightly compressed.'])[1 + ((sh.shipment_id + g.n) % 8)]
FROM fabric_shipments sh
CROSS JOIN LATERAL generate_series(
  1,
  CASE
    WHEN sh.quality_score >= 92 THEN 18 + (random() * 3)::int
    WHEN sh.quality_score >= 85 THEN 14 + (random() * 5)::int
    WHEN sh.quality_score >= 78 THEN 11 + (random() * 5)::int
    ELSE 8 + (random() * 5)::int
  END
) AS g(n);

UPDATE fabric_shipments sh
SET total_rolls = r.cnt
FROM (SELECT shipment_id, COUNT(*) AS cnt FROM fabric_rolls GROUP BY shipment_id) r
WHERE r.shipment_id = sh.shipment_id;

-- ---------------------------------------------------------------------------
-- 5. fabric_inspections: one per roll.
--
--    points_per_100_yards is the standard textile four-point score:
--        total_penalty_points  = SUM(severity of each defect)   (1..4 each)
--        points_per_100_yards  = total_penalty_points * 100 / roll_length_yards
--        grade                 = A <=10, B <=20, C <=30, else Reject
--
--    LOWER IS BETTER. This is exactly what app/routes/fabric.py computes for a
--    live inspection, so seeded rows and freshly inspected rows mean the same
--    thing and can sit in the same average.
--
--    Only the defect COUNT is planned here; the points, grade and status are
--    filled in by the UPDATE in step 6b, from the defect rows that actually
--    exist. Nothing is asserted that the defect register does not support.
-- ---------------------------------------------------------------------------
INSERT INTO fabric_inspections
  (roll_id, total_images_processed, total_defects_found, total_penalty_points,
   points_per_100_yards, grade, model_version, status, inspected_at)
WITH roll_quality AS (
  SELECT fr.roll_id, fr.inspection_date, fr.inspection_time,
         GREATEST(58, LEAST(99, sh.quality_score + (random() * 12 - 6))) AS rq
  FROM fabric_rolls fr
  JOIN fabric_shipments sh ON sh.shipment_id = fr.shipment_id
),
scored AS (
  SELECT roll_id, inspection_date, inspection_time, rq,
    -- Cleaner rolls carry fewer defects AND lighter ones (step 6 picks the
    -- defect classes), so both the count and the severity mix follow quality.
    CASE
      WHEN rq >= 95 THEN 2 + (random() * 2)::int
      WHEN rq >= 90 THEN 3 + (random() * 3)::int
      WHEN rq >= 85 THEN 4 + (random() * 4)::int
      WHEN rq >= 78 THEN 6 + (random() * 4)::int
      WHEN rq >= 72 THEN 7 + (random() * 5)::int
      ELSE 9 + (random() * 5)::int
    END AS n_defects
  FROM roll_quality
)
SELECT
  roll_id,
  8 + (random() * 8)::int,
  n_defects,
  0,                       -- set in step 6b from the real defect rows
  0,                       -- set in step 6b
  'A'::grade_enum,         -- set in step 6b
  (ARRAY['rt-detr-v1.0','rt-detr-v1.1','rt-detr-v1.2','rt-detr-v1.3'])[1 + (roll_id % 4)],
  'Pending Review'::inspection_status_enum,   -- set in step 6b
  (inspection_date + inspection_time)::timestamp
FROM scored;

-- ---------------------------------------------------------------------------
-- 6. fabric_defects: exactly as many defects as the inspection records.
--
--    The defect vocabulary is the SEVEN classes the RT-DETR model actually
--    emits (app/routes/fabric.py CLASS_NAMES), and severity is that file's
--    SEVERITY_MAP. A seeded defect is therefore indistinguishable in kind from
--    a detected one, and the frontend only ever has seven classes to describe.
--
--      Hole 4 | Yarn missing 4 | Oil Spot 3 | Contamination 3
--      Needle mark 2 | Setup 2 | Miss loop 1
--
--    Good rolls draw from the light end of that list, poor rolls from the
--    heavy end, which is what makes their four-point score differ.
-- ---------------------------------------------------------------------------
INSERT INTO fabric_defects
  (inspection_id, image_index, defect_type, severity, confidence_score, position_x, position_y)
WITH picked AS (
  SELECT
    i.inspection_id,
    g.n,
    sh.quality_score AS rq,
    CASE
      WHEN sh.quality_score >= 92 THEN     -- avg severity 1.2
        (ARRAY['Miss loop','Miss loop','Miss loop','Needle mark','Miss loop'
              ])[1 + ((i.inspection_id * 5 + g.n * 3) % 5)]
      WHEN sh.quality_score >= 85 THEN     -- avg severity 1.5
        (ARRAY['Miss loop','Needle mark','Miss loop','Setup','Miss loop','Needle mark'
              ])[1 + ((i.inspection_id * 5 + g.n * 3) % 6)]
      WHEN sh.quality_score >= 78 THEN     -- avg severity 1.9
        (ARRAY['Miss loop','Needle mark','Setup','Needle mark','Miss loop','Oil Spot','Setup'
              ])[1 + ((i.inspection_id * 5 + g.n * 3) % 7)]
      ELSE                                  -- avg severity 2.3, holes are rare
        (ARRAY['Needle mark','Oil Spot','Setup','Contamination','Needle mark','Oil Spot','Hole'
              ])[1 + ((i.inspection_id * 5 + g.n * 3) % 7)]
    END AS defect_type
  FROM fabric_inspections i
  JOIN fabric_rolls fr     ON fr.roll_id     = i.roll_id
  JOIN fabric_shipments sh ON sh.shipment_id = fr.shipment_id
  CROSS JOIN LATERAL generate_series(1, GREATEST(i.total_defects_found, 0)) AS g(n)
)
SELECT
  inspection_id,
  n,
  defect_type,
  CASE defect_type
    WHEN 'Hole'          THEN 4
    WHEN 'Yarn missing'  THEN 4
    WHEN 'Oil Spot'      THEN 3
    WHEN 'Contamination' THEN 3
    WHEN 'Needle mark'   THEN 2
    WHEN 'Setup'         THEN 2
    ELSE 1                      -- Miss loop
  END,
  ROUND((0.86 + random() * 0.09)::numeric, 3),
  -- normalised 0-1 coordinates, the same convention the live pipeline writes
  ROUND((0.03 + random() * 0.94)::numeric, 4),
  ROUND((0.03 + random() * 0.94)::numeric, 4)
FROM picked;

-- ---------------------------------------------------------------------------
-- 6b. Score every inspection FROM its own defect rows.
--     After this statement the following always holds for every row:
--       total_defects_found  = COUNT(fabric_defects)
--       total_penalty_points = SUM(severity)
--       points_per_100_yards = total_penalty_points * 100 / roll_length_yards
--       grade                = four-point banding of points_per_100_yards
-- ---------------------------------------------------------------------------
UPDATE fabric_inspections i
SET total_defects_found  = d.n_defects,
    total_penalty_points = d.penalty,
    points_per_100_yards = ROUND((d.penalty * 100.0 / fr.roll_length_yards)::numeric, 2),
    grade = (
      CASE
        WHEN (d.penalty * 100.0 / fr.roll_length_yards) <= 10 THEN 'A'
        WHEN (d.penalty * 100.0 / fr.roll_length_yards) <= 20 THEN 'B'
        WHEN (d.penalty * 100.0 / fr.roll_length_yards) <= 30 THEN 'C'
        ELSE 'Reject'
      END
    )::grade_enum,
    status = (
      CASE
        -- clean rolls clear automatically; borderline rolls wait for an
        -- inspector; anything off the four-point scale is held.
        WHEN (d.penalty * 100.0 / fr.roll_length_yards) <= 10 THEN 'Approved'
        WHEN (d.penalty * 100.0 / fr.roll_length_yards) <= 20 THEN
          (CASE WHEN i.inspection_id % 6 = 0 THEN 'Pending Review' ELSE 'Approved' END)
        WHEN (d.penalty * 100.0 / fr.roll_length_yards) <= 30 THEN
          (CASE WHEN i.inspection_id % 3 = 0 THEN 'Rejected' ELSE 'Pending Review' END)
        ELSE 'Rejected'
      END
    )::inspection_status_enum
FROM (
  SELECT inspection_id, COUNT(*) AS n_defects, SUM(severity)::numeric AS penalty
  FROM fabric_defects
  GROUP BY inspection_id
) d,
     fabric_rolls fr
WHERE d.inspection_id = i.inspection_id
  AND fr.roll_id = i.roll_id;

-- rolls that ended up with no defects at all score a clean zero
UPDATE fabric_inspections
SET total_defects_found = 0, total_penalty_points = 0, points_per_100_yards = 0,
    grade = 'A'::grade_enum, status = 'Approved'::inspection_status_enum
WHERE inspection_id NOT IN (SELECT DISTINCT inspection_id FROM fabric_defects);

-- ---------------------------------------------------------------------------
-- 7. label_shipments: 3-6 per label supplier, weighted by rating.
-- ---------------------------------------------------------------------------
INSERT INTO label_shipments
  (supplier_id, shipment_code, shipment_date, promised_date, received_date, total_labels,
   label_type, material, sampling_stage, quality_score, notes)
WITH ship_counts AS (
  SELECT supplier_id, supplier_rating,
    CASE
      WHEN supplier_rating >= 92 THEN 6
      WHEN supplier_rating >= 87 THEN 5
      WHEN supplier_rating >= 82 THEN 4
      ELSE 3
    END AS n_shipments
  FROM label_suppliers
),
ranked AS (
  SELECT c.supplier_id, c.supplier_rating, g.n,
         ROW_NUMBER() OVER (ORDER BY ((c.supplier_id * 53 + g.n * 97) % 991), c.supplier_id, g.n) AS rn
  FROM ship_counts c
  CROSS JOIN LATERAL generate_series(1, c.n_shipments) AS g(n)
),
planned AS (
  SELECT r.supplier_id, r.supplier_rating, r.n,
         ((r.rn - 1) % 11) AS month_index,
         (DATE '2025-10-01'
            + (((r.rn - 1) % 11) || ' months')::interval
            + (((r.rn * 17) % 20) || ' days')::interval
         )::date AS shipment_date
  FROM ranked r
)
SELECT
  p.supplier_id,
  'LSH-' || to_char(p.shipment_date, 'YYYY') || '-' ||
    lpad(p.supplier_id::text, 3, '0') || lpad(p.n::text, 2, '0'),
  p.shipment_date,
  -- trim orders are promised 6 days after dispatch
  p.shipment_date + 6,
  p.shipment_date + (
    CASE
      WHEN p.supplier_rating >= 90 THEN 4 + ((p.supplier_id + p.n) % 2)
      WHEN p.supplier_rating >= 85 THEN 5 + ((p.supplier_id + p.n) % 2)
      WHEN p.supplier_rating >= 80 THEN 5 + ((p.supplier_id + p.n) % 3)
      ELSE 6 + ((p.supplier_id + p.n) % 4)
    END
  ),
  5000 + ((p.supplier_id * 1307 + p.n * 911) % 35000),
  (ARRAY['Woven brand label','Care label','Size label','Composition label',
         'Barcode hangtag','Heat transfer label','Wash care tape'])[1 + ((p.supplier_id + p.n) % 7)],
  (ARRAY['Woven polyester','Printed satin','Thermal transfer','Cotton twill tape',
         'Recycled PET','Nylon taffeta'])[1 + ((p.supplier_id * 2 + p.n) % 6)],
  (ARRAY['Initial','Second','Final'])[1 + ((p.supplier_id + p.n) % 3)]::sampling_stage_enum,
  ROUND(GREATEST(65, LEAST(99,
    p.supplier_rating + (random() * 8 - 4) + ((p.month_index::numeric / 10) * 6 - 3)
  ))::numeric, 2),
  (ARRAY['Standard trim replenishment order.',
         'Barcode verification required before release.',
         'Artwork revision attached to packing list.',
         'Colour match against approved lab dip.',
         'Rush order for finishing line.',
         'Partial delivery; balance next week.'])[1 + ((p.supplier_id * 3 + p.n) % 6)]
FROM planned p;

-- ---------------------------------------------------------------------------
-- 8. label_templates: 3 per supplier.
-- ---------------------------------------------------------------------------
INSERT INTO label_templates
  (supplier_id, template_code, brand_name, label_type, garment_category,
   revision, status, artwork_uri)
SELECT
  ls.supplier_id,
  'LBL-' || lpad(ls.supplier_id::text, 2, '0') || '-' || lpad(g.n::text, 2, '0'),
  (ARRAY['Acme Apparel','Northstar Denim','Evergreen Outerwear','Orbit Kids',
         'Legacy Basics','Vantage Sport','Meadow Home','Ironclad Workwear',
         'Solstice Swim','Urban Thread','Harbor & Co.','Trailhead Outdoor'])[1 + ((ls.supplier_id + g.n) % 12)],
  (ARRAY['Care label','Woven brand label','Size label','Composition label',
         'Barcode hangtag','Heat transfer label'])[1 + ((ls.supplier_id * 2 + g.n) % 6)],
  (ARRAY['T-shirt','Denim','Outerwear','Kidswear','Knitwear','Activewear',
         'Home textile','Workwear','Swimwear','Woven shirt'])[1 + ((ls.supplier_id + g.n * 3) % 10)],
  'R' || (1 + ((ls.supplier_id + g.n) % 4)),
  (CASE WHEN (ls.supplier_id + g.n) % 11 = 0 THEN 'Draft'
        WHEN (ls.supplier_id + g.n) % 17 = 0 THEN 'Retired'
        ELSE 'Approved' END),
  '/artwork/lbl-' || lpad(ls.supplier_id::text, 2, '0') || '-' || lpad(g.n::text, 2, '0') || '.pdf'
FROM label_suppliers ls
CROSS JOIN generate_series(1, 3) AS g(n);

-- ---------------------------------------------------------------------------
-- 9. label_samples: 4-8 per label shipment, drawn from that supplier's
--    templates.
-- ---------------------------------------------------------------------------
INSERT INTO label_samples
  (template_id, shipment_id, sample_code, sample_source, captured_at, operator_name, notes)
SELECT
  t.template_id,
  sh.shipment_id,
  'SMP-' || lpad(sh.shipment_id::text, 4, '0') || '-' || lpad(g.n::text, 2, '0'),
  (ARRAY['Production','Production','Production','Golden','Supplier'])[1 + ((sh.shipment_id + g.n) % 5)],
  (sh.received_date + (g.n % 3))::timestamp
    + (TIME '09:00' + ((g.n % 8) * INTERVAL '50 minutes')),
  (ARRAY['Nadia Karim','Imran Chowdhury','Sadia Ahmed','Rafi Hasan',
         'Moumita Das','Tanvir Alam','Shreya Roy','Kamal Uddin'])[1 + ((sh.shipment_id + g.n) % 8)],
  (ARRAY['Standard production pull.',
         'Golden reference retained for audit.',
         'Supplier pre-shipment sample.',
         'Re-sample after artwork revision.',
         'Sample pulled from finished goods.',
         'Colour match pending approval.'])[1 + ((sh.shipment_id * 2 + g.n) % 6)]
FROM label_shipments sh
CROSS JOIN LATERAL generate_series(1, 7 + ((sh.shipment_id * 7) % 6)) AS g(n)
JOIN LATERAL (
  SELECT tl.template_id
  FROM label_templates tl
  WHERE tl.supplier_id = sh.supplier_id
  ORDER BY tl.template_id
  OFFSET ((sh.shipment_id + g.n) % 3) LIMIT 1
) t ON TRUE;

-- ---------------------------------------------------------------------------
-- 10. label_inspections: 1-2 per sample. SSIM tracks shipment quality, and
--     verdict/status follow SSIM.
-- ---------------------------------------------------------------------------
INSERT INTO label_inspections
  (report_id, sample_id, reference_template_id, inspection_mode, verdict,
   ssim_score, hotspot_count, confidence_score, status, inspected_at)
WITH base AS (
  SELECT s.sample_id, s.template_id, s.captured_at, sh.quality_score,
         GREATEST(0.55, LEAST(0.9999,
           CASE
             WHEN sh.quality_score >= 92 THEN 0.960 + random() * 0.039
             WHEN sh.quality_score >= 87 THEN 0.945 + random() * 0.050
             WHEN sh.quality_score >= 82 THEN 0.885 + random() * 0.075
             ELSE 0.775 + random() * 0.145
           END)) AS ssim
  FROM label_samples s
  JOIN label_shipments sh ON sh.shipment_id = s.shipment_id
)
SELECT
  gen_random_uuid(),
  b.sample_id,
  b.template_id,
  (ARRAY['Deterministic','Deterministic','Deterministic','Non-deterministic'])[1 + ((b.sample_id + g.n) % 4)],
  (CASE WHEN b.ssim >= 0.95 THEN 'PASS'
        WHEN b.ssim >= 0.88 THEN 'REVIEW'
        ELSE 'REJECT' END),
  ROUND(b.ssim::numeric, 4),
  (CASE WHEN b.ssim >= 0.97 THEN 0
        WHEN b.ssim >= 0.93 THEN (b.sample_id + g.n) % 3
        WHEN b.ssim >= 0.88 THEN 2 + (b.sample_id + g.n) % 4
        ELSE 5 + (b.sample_id + g.n) % 6 END),
  ROUND((0.80 + random() * 0.19)::numeric, 4),
  (CASE WHEN b.ssim >= 0.95 THEN 'Approved'
        WHEN b.ssim >= 0.88 THEN 'Pending Review'
        ELSE 'Rejected' END),
  b.captured_at + ((g.n * 2) || ' days')::interval
FROM base b
CROSS JOIN LATERAL generate_series(1, 1 + (b.sample_id % 2)) AS g(n);

-- ---------------------------------------------------------------------------
-- 11. label_defects: 0-6 per inspection, more defects as SSIM drops.
-- ---------------------------------------------------------------------------
INSERT INTO label_defects
  (label_inspection_id, defect_type, severity, confidence_score,
   position_x, position_y, notes)
SELECT
  li.label_inspection_id,
  (ARRAY['Print misregistration','Skewed artwork','Colour deviation','Missing character',
         'Barcode unreadable','Wrong size text','Low contrast print','Font mismatch',
         'Ink smudge','Cut offset','Missing care symbol','Wash symbol error',
         'Spelling error','Artwork bleed','Registration drift','Thread fray'])[1 + ((li.label_inspection_id * 7 + g.n * 5) % 16)],
  (CASE
     WHEN li.ssim_score >= 0.95 THEN 1
     WHEN li.ssim_score >= 0.88 THEN (CASE WHEN g.n % 3 = 0 THEN 2 ELSE 1 END)
     WHEN li.ssim_score >= 0.80 THEN (CASE WHEN g.n % 2 = 0 THEN 3 ELSE 2 END)
     ELSE (CASE WHEN g.n % 3 = 0 THEN 4 ELSE 3 END)
   END),
  ROUND((0.80 + random() * 0.19)::numeric, 4),
  ROUND((0.02 + random() * 0.96)::numeric, 4),
  ROUND((0.02 + random() * 0.96)::numeric, 4),
  (ARRAY['Within review tolerance','Registration drift','Manual confirmation needed',
         'Does not match template','Low contrast','Re-check after reprint'])[1 + ((li.label_inspection_id + g.n) % 6)]
FROM label_inspections li
CROSS JOIN LATERAL generate_series(
  1,
  CASE
    WHEN li.ssim_score >= 0.97 THEN 0
    WHEN li.ssim_score >= 0.93 THEN 1 + (li.label_inspection_id % 2)
    WHEN li.ssim_score >= 0.88 THEN 2 + (li.label_inspection_id % 3)
    WHEN li.ssim_score >= 0.80 THEN 3 + (li.label_inspection_id % 3)
    ELSE 4 + (li.label_inspection_id % 3)
  END
) AS g(n);


-- ===========================================================================
-- 12. ECONOMICS
--
-- Every currency figure the UI shows resolves to one of these four tables.
-- Rates live in cost_parameters and are labelled in the UI as assumptions;
-- amounts in copq_events / system_investments / supplier_contracts are
-- recorded facts. No money is hard-coded in the frontend.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 12a. cost_parameters: the operating rates the ROI model multiplies by.
-- ---------------------------------------------------------------------------
INSERT INTO cost_parameters
  (scope, effective_from, manual_minutes_per_unit, ai_minutes_per_unit,
   hourly_labor_cost, reject_cost_per_unit, rework_cost_per_unit,
   manual_detection_rate, quality_target, clearance_score, currency)
VALUES
  ('Fabric', DATE '2025-10-01', 18.00, 4.00, 25.00, 320.00, 95.00, 82.00, 92.00, 80.00, 'USD'),
  ('Label',  DATE '2025-10-01', 12.00, 3.00, 25.00, 140.00, 45.00, 84.00, 95.00, 80.00, 'USD');

-- ---------------------------------------------------------------------------
-- 12b. system_investments: what adopting the platform cost. Drives payback.
-- ---------------------------------------------------------------------------
INSERT INTO system_investments (item, category, amount, incurred_on, notes)
VALUES
  ('Line-scan inspection cameras (x4)', 'Hardware',    8600.00, DATE '2025-10-06', 'Mounted on inspection frames 1-4.'),
  ('Edge inference workstation',        'Hardware',    4200.00, DATE '2025-10-06', 'GPU node running the RT-DETR detector.'),
  ('Raspberry Pi capture units (x6)',   'Hardware',     900.00, DATE '2025-10-13', 'Portable capture for the label bench.'),
  ('Detection model licence (annual)',  'Software',    3600.00, DATE '2025-10-20', 'Covers model updates and retraining.'),
  ('PostgreSQL + reporting stack',      'Software',    1200.00, DATE '2025-10-20', 'Managed database and backups.'),
  ('ERP and lot-tracking integration',  'Integration', 3900.00, DATE '2025-11-03', 'Shipment and supplier master sync.'),
  ('Inspector training programme',      'Training',    1600.00, DATE '2025-11-17', 'Two cohorts, four-point grading refresh.');

-- ---------------------------------------------------------------------------
-- 12c. supplier_contracts: one live contract per supplier.
--      annual_spend is computed from the volume that supplier actually
--      delivered, so spend agrees with the shipment tables instead of being
--      an arbitrary number per supplier.
-- ---------------------------------------------------------------------------
INSERT INTO supplier_contracts
  (scope, fabric_supplier_id, label_supplier_id, contract_code,
   annual_spend, unit_price, payment_terms, renewal_date, currency)
SELECT
  'Fabric',
  s.supplier_id,
  NULL,
  'CTR-FAB-' || lpad(s.supplier_id::text, 3, '0'),
  ROUND((COALESCE(v.total_yards, 0) * (2.80 + ((s.supplier_id % 7) * 0.22)))::numeric, 2),
  ROUND((2.80 + ((s.supplier_id % 7) * 0.22))::numeric, 4),
  (ARRAY['Net 30','Net 45','Net 60','LC at sight'])[1 + (s.supplier_id % 4)],
  DATE '2026-10-01' + ((s.supplier_id * 29) % 365),
  'USD'
FROM fabric_suppliers s
LEFT JOIN (
  SELECT sh.supplier_id, SUM(fr.roll_length_yards) AS total_yards
  FROM fabric_shipments sh
  JOIN fabric_rolls fr ON fr.shipment_id = sh.shipment_id
  GROUP BY sh.supplier_id
) v ON v.supplier_id = s.supplier_id;

INSERT INTO supplier_contracts
  (scope, fabric_supplier_id, label_supplier_id, contract_code,
   annual_spend, unit_price, payment_terms, renewal_date, currency)
SELECT
  'Label',
  NULL,
  s.supplier_id,
  'CTR-LBL-' || lpad(s.supplier_id::text, 3, '0'),
  ROUND((COALESCE(v.total_labels, 0) * (0.018 + ((s.supplier_id % 5) * 0.004)))::numeric, 2),
  ROUND((0.018 + ((s.supplier_id % 5) * 0.004))::numeric, 4),
  (ARRAY['Net 30','Net 45','Net 60','LC at sight'])[1 + (s.supplier_id % 4)],
  DATE '2026-10-01' + ((s.supplier_id * 41) % 365),
  'USD'
FROM label_suppliers s
LEFT JOIN (
  SELECT supplier_id, SUM(total_labels) AS total_labels
  FROM label_shipments GROUP BY supplier_id
) v ON v.supplier_id = s.supplier_id;

-- ---------------------------------------------------------------------------
-- 12d. copq_events: a recorded loss for every inspection that actually went
--      wrong. Scrap is priced off the roll length and the contract unit price,
--      so the COPQ breakdown traces back to a specific roll and a real rate.
-- ---------------------------------------------------------------------------
INSERT INTO copq_events
  (scope, fabric_inspection_id, label_inspection_id, category, amount, occurred_on, notes)
SELECT
  'Fabric',
  i.inspection_id,
  NULL,
  'Material scrap',
  ROUND((fr.roll_length_yards * c.unit_price *
         CASE WHEN i.grade = 'Reject' THEN 0.55 ELSE 0.18 END)::numeric, 2),
  i.inspected_at::date,
  'Unusable yardage written off after four-point grading.'
FROM fabric_inspections i
JOIN fabric_rolls fr     ON fr.roll_id     = i.roll_id
JOIN fabric_shipments sh ON sh.shipment_id = fr.shipment_id
JOIN supplier_contracts c ON c.fabric_supplier_id = sh.supplier_id AND c.scope = 'Fabric'
WHERE i.grade IN ('C', 'Reject');

INSERT INTO copq_events
  (scope, fabric_inspection_id, label_inspection_id, category, amount, occurred_on, notes)
SELECT
  'Fabric', i.inspection_id, NULL, 'Rework',
  ROUND((p.rework_cost_per_unit * (1 + (i.inspection_id % 3)))::numeric, 2),
  i.inspected_at::date,
  'Manual re-inspection and re-rolling after a failed lot.'
FROM fabric_inspections i
CROSS JOIN (SELECT rework_cost_per_unit FROM cost_parameters WHERE scope = 'Fabric') p
WHERE i.grade IN ('C', 'Reject') AND i.inspection_id % 2 = 0;

INSERT INTO copq_events
  (scope, fabric_inspection_id, label_inspection_id, category, amount, occurred_on, notes)
SELECT
  'Fabric', i.inspection_id, NULL, 'Downtime',
  ROUND((180 + (i.inspection_id % 7) * 45)::numeric, 2),
  i.inspected_at::date,
  'Cutting line held while the lot was re-graded.'
FROM fabric_inspections i
WHERE i.grade = 'Reject' AND i.inspection_id % 3 = 0;

INSERT INTO copq_events
  (scope, fabric_inspection_id, label_inspection_id, category, amount, occurred_on, notes)
SELECT
  'Fabric', i.inspection_id, NULL, 'Chargeback',
  ROUND((p.reject_cost_per_unit * 0.6)::numeric, 2),
  i.inspected_at::date,
  'Customer claim raised against the delivered lot.'
FROM fabric_inspections i
CROSS JOIN (SELECT reject_cost_per_unit FROM cost_parameters WHERE scope = 'Fabric') p
WHERE i.grade = 'Reject' AND i.inspection_id % 5 = 0;

INSERT INTO copq_events
  (scope, fabric_inspection_id, label_inspection_id, category, amount, occurred_on, notes)
SELECT
  'Label', NULL, li.label_inspection_id, 'Material scrap',
  ROUND((p.reject_cost_per_unit * CASE WHEN li.verdict = 'REJECT' THEN 0.8 ELSE 0.25 END)::numeric, 2),
  li.inspected_at::date,
  'Trim batch scrapped after golden-reference comparison.'
FROM label_inspections li
CROSS JOIN (SELECT reject_cost_per_unit FROM cost_parameters WHERE scope = 'Label') p
WHERE li.verdict IN ('REVIEW', 'REJECT');

INSERT INTO copq_events
  (scope, fabric_inspection_id, label_inspection_id, category, amount, occurred_on, notes)
SELECT
  'Label', NULL, li.label_inspection_id, 'Rework',
  ROUND((p.rework_cost_per_unit * (1 + (li.label_inspection_id % 2)))::numeric, 2),
  li.inspected_at::date,
  'Reprint and re-verification of the affected label run.'
FROM label_inspections li
CROSS JOIN (SELECT rework_cost_per_unit FROM cost_parameters WHERE scope = 'Label') p
WHERE li.verdict = 'REJECT' AND li.label_inspection_id % 2 = 0;

INSERT INTO copq_events
  (scope, fabric_inspection_id, label_inspection_id, category, amount, occurred_on, notes)
SELECT
  'Label', NULL, li.label_inspection_id, 'Chargeback',
  ROUND((p.reject_cost_per_unit * 0.5)::numeric, 2),
  li.inspected_at::date,
  'Brand compliance claim on mislabelled cartons.'
FROM label_inspections li
CROSS JOIN (SELECT reject_cost_per_unit FROM cost_parameters WHERE scope = 'Label') p
WHERE li.verdict = 'REJECT' AND li.label_inspection_id % 4 = 0;

-- ===========================================================================
-- 13. PEOPLE
-- ===========================================================================
INSERT INTO app_users (full_name, initials, role, job_title, location, email, is_current)
VALUES
  ('Shariar Al Kabir', 'SK', 'Manager',   'Quality manager',     'Dhaka, Bangladesh', 's.kabir@textilequality.example',  TRUE),
  ('Amina Rahman',     'AR', 'Admin',     'Head of quality',     'Dhaka, Bangladesh', 'a.rahman@textilequality.example', FALSE),
  ('Tanvir Hossain',   'TH', 'Inspector', 'Senior roll inspector','Gazipur, Bangladesh','t.hossain@textilequality.example', FALSE);

-- Notes are attached to inspections that genuinely need attention, so the
-- thread on the inspection queue refers to rolls that really exist.
INSERT INTO inspection_notes (user_id, scope, fabric_inspection_id, body, created_at)
SELECT
  u.user_id,
  'Fabric',
  i.inspection_id,
  CASE u.role
    WHEN 'Inspector' THEN 'Repeat oil spots near the selvedge on this lot - flagging for the next delivery from the same mill.'
    WHEN 'Manager'   THEN 'Holding release until the mill confirms the corrective action on this roll.'
    ELSE 'Manager sign-off required before any reject of this size is written off.'
  END,
  i.inspected_at + INTERVAL '2 hours'
FROM app_users u
JOIN LATERAL (
  SELECT inspection_id, inspected_at
  FROM fabric_inspections
  WHERE grade = 'Reject'
  ORDER BY inspected_at DESC
  OFFSET (u.user_id - 1) LIMIT 1
) i ON TRUE;

COMMIT;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
SELECT 'fabric_suppliers' AS table_name, COUNT(*) AS rows FROM fabric_suppliers
UNION ALL SELECT 'fabric_shipments',     COUNT(*) FROM fabric_shipments
UNION ALL SELECT 'fabric_rolls',         COUNT(*) FROM fabric_rolls
UNION ALL SELECT 'fabric_inspections',   COUNT(*) FROM fabric_inspections
UNION ALL SELECT 'fabric_defects',       COUNT(*) FROM fabric_defects
UNION ALL SELECT 'label_suppliers',      COUNT(*) FROM label_suppliers
UNION ALL SELECT 'label_shipments',      COUNT(*) FROM label_shipments
UNION ALL SELECT 'label_templates',      COUNT(*) FROM label_templates
UNION ALL SELECT 'label_samples',        COUNT(*) FROM label_samples
UNION ALL SELECT 'label_inspections',    COUNT(*) FROM label_inspections
UNION ALL SELECT 'label_defects',        COUNT(*) FROM label_defects
ORDER BY table_name;
