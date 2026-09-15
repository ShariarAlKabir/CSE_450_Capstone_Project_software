-- ============================================================================
-- SUPERSEDED: this file describes the OLD shared-schema layout.
-- The database now uses separate fabric_* / label_* tables.
-- Use bulk_schema.sql (DDL) and bulk_seed.sql (bulk data) instead.
-- Kept for historical reference only -- do not run against the current DB.
-- ============================================================================
-- Label-domain schema and representative seed data.
-- Safe to re-run against an existing Docker database.

CREATE TABLE IF NOT EXISTS label_templates (
    template_id SERIAL PRIMARY KEY,
    template_code VARCHAR(50) UNIQUE NOT NULL,
    brand_name VARCHAR(120) NOT NULL,
    label_type VARCHAR(60) NOT NULL,
    garment_category VARCHAR(80),
    revision VARCHAR(20) NOT NULL DEFAULT 'R1',
    status VARCHAR(30) NOT NULL DEFAULT 'Approved' CHECK (status IN ('Approved', 'Draft', 'Retired')),
    artwork_uri TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS label_samples (
    sample_id SERIAL PRIMARY KEY,
    template_id INT NOT NULL REFERENCES label_templates(template_id) ON DELETE RESTRICT,
    shipment_id INT REFERENCES shipments(shipment_id) ON DELETE SET NULL,
    sample_code VARCHAR(60) UNIQUE NOT NULL,
    sample_source VARCHAR(40) NOT NULL CHECK (sample_source IN ('Production', 'Golden', 'Supplier')),
    captured_at TIMESTAMP DEFAULT NOW(),
    operator_name VARCHAR(120),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS label_inspections (
    label_inspection_id SERIAL PRIMARY KEY,
    report_id UUID UNIQUE NOT NULL,
    sample_id INT REFERENCES label_samples(sample_id) ON DELETE SET NULL,
    reference_template_id INT REFERENCES label_templates(template_id) ON DELETE SET NULL,
    inspection_mode VARCHAR(30) NOT NULL DEFAULT 'Deterministic' CHECK (inspection_mode IN ('Deterministic', 'Non-deterministic')),
    verdict VARCHAR(50) NOT NULL,
    ssim_score NUMERIC(5,4),
    hotspot_count INT NOT NULL DEFAULT 0,
    confidence_score NUMERIC(5,4),
    status VARCHAR(30) NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Pending Review', 'Approved', 'Rejected')),
    inspected_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS label_defects (
    label_defect_id SERIAL PRIMARY KEY,
    label_inspection_id INT NOT NULL REFERENCES label_inspections(label_inspection_id) ON DELETE CASCADE,
    defect_type VARCHAR(100) NOT NULL,
    severity INT NOT NULL CHECK (severity BETWEEN 1 AND 4),
    confidence_score NUMERIC(5,4),
    position_x NUMERIC(7,4),
    position_y NUMERIC(7,4),
    notes TEXT
);

ALTER TABLE label_inspections ADD COLUMN IF NOT EXISTS sample_id INT REFERENCES label_samples(sample_id) ON DELETE SET NULL;
ALTER TABLE label_inspections ADD COLUMN IF NOT EXISTS reference_template_id INT REFERENCES label_templates(template_id) ON DELETE SET NULL;
ALTER TABLE label_inspections ADD COLUMN IF NOT EXISTS inspection_mode VARCHAR(30) NOT NULL DEFAULT 'Deterministic';
ALTER TABLE label_inspections ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4);
ALTER TABLE label_inspections ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Completed';

INSERT INTO label_templates (template_code, brand_name, label_type, garment_category, revision, status)
VALUES
 ('LBL-ACME-CARE-R3','Acme Apparel','Care label','T-shirt','R3','Approved'),
 ('LBL-NORTH-WOVEN-R2','Northstar','Woven brand label','Denim','R2','Approved'),
 ('LBL-EVERGREEN-SIZE-R1','Evergreen','Size label','Outerwear','R1','Approved'),
 ('LBL-ORBIT-COMP-R4','Orbit Kids','Composition label','Kidswear','R4','Approved'),
 ('LBL-LEGACY-CARE-R1','Legacy Basics','Care label','Knitwear','R1','Retired')
ON CONFLICT (template_code) DO NOTHING;

INSERT INTO label_samples (template_id, shipment_id, sample_code, sample_source, operator_name, notes)
SELECT t.template_id, s.shipment_id, v.sample_code, v.sample_source, v.operator_name, v.notes
FROM (VALUES
 ('LBL-ACME-CARE-R3','SH-2025-001','ACME-CARE-001','Golden','Nadia Karim','Approved golden reference'),
 ('LBL-ACME-CARE-R3','SH-2025-009','ACME-CARE-042','Production','Imran Chowdhury','Clean production sample'),
 ('LBL-NORTH-WOVEN-R2','SH-2025-018','NORTH-WOVEN-017','Production','Sadia Ahmed','Slight skew expected'),
 ('LBL-EVERGREEN-SIZE-R1','SH-2025-026','EVERGREEN-SIZE-008','Supplier','Rafi Hasan','Awaiting artwork confirmation'),
 ('LBL-ORBIT-COMP-R4','SH-2025-034','ORBIT-COMP-031','Production','Moumita Das','Low contrast print')
) AS v(template_code, shipment_code, sample_code, sample_source, operator_name, notes)
JOIN label_templates t ON t.template_code = v.template_code
LEFT JOIN shipments s ON s.shipment_code = v.shipment_code
ON CONFLICT (sample_code) DO NOTHING;

INSERT INTO label_inspections (report_id, sample_id, reference_template_id, inspection_mode, verdict, ssim_score, hotspot_count, confidence_score, status)
SELECT v.report_id::uuid, ls.sample_id, lt.template_id, v.inspection_mode, v.verdict, v.ssim_score, v.hotspot_count, v.confidence_score, v.status
FROM (VALUES
 ('11111111-1111-4111-8111-111111111111','ACME-CARE-001','LBL-ACME-CARE-R3','Deterministic','PASS',0.9980,0,0.9970,'Approved'),
 ('22222222-2222-4222-8222-222222222222','ACME-CARE-042','LBL-ACME-CARE-R3','Deterministic','PASS',0.9810,1,0.9610,'Approved'),
 ('33333333-3333-4333-8333-333333333333','NORTH-WOVEN-017','LBL-NORTH-WOVEN-R2','Deterministic','REVIEW',0.9140,4,0.8820,'Pending Review'),
 ('44444444-4444-4444-8444-444444444444','EVERGREEN-SIZE-008','LBL-EVERGREEN-SIZE-R1','Non-deterministic','REJECT',0.7210,9,0.9450,'Rejected'),
 ('55555555-5555-4555-8555-555555555555','ORBIT-COMP-031','LBL-ORBIT-COMP-R4','Non-deterministic','REVIEW',0.8420,6,0.9030,'Pending Review')
) AS v(report_id, sample_code, template_code, inspection_mode, verdict, ssim_score, hotspot_count, confidence_score, status)
JOIN label_samples ls ON ls.sample_code = v.sample_code
JOIN label_templates lt ON lt.template_code = v.template_code
ON CONFLICT (report_id) DO NOTHING;

INSERT INTO label_defects (label_inspection_id, defect_type, severity, confidence_score, position_x, position_y, notes)
SELECT li.label_inspection_id, v.defect_type, v.severity, v.confidence_score, v.position_x, v.position_y, v.notes
FROM (VALUES
 ('22222222-2222-4222-8222-222222222222','Minor print shift',1,0.9610,0.62,0.41,'Within review tolerance'),
 ('33333333-3333-4333-8333-333333333333','Skewed artwork',2,0.8820,0.48,0.50,'Registration drift'),
 ('33333333-3333-4333-8333-333333333333','Missing character',3,0.8440,0.73,0.28,'Care instruction incomplete'),
 ('44444444-4444-4444-8444-444444444444','Wrong size text',4,0.9450,0.51,0.34,'Does not match template'),
 ('44444444-4444-4444-8444-444444444444','Barcode unreadable',3,0.9010,0.70,0.76,'Low contrast'),
 ('55555555-5555-4555-8555-555555555555','Low contrast print',2,0.9030,0.43,0.57,'Manual confirmation needed')
) AS v(report_id, defect_type, severity, confidence_score, position_x, position_y, notes)
JOIN label_inspections li ON li.report_id = v.report_id::uuid;
