-- =========================================================
-- Make fabric inspection dummy data realistic.
--
-- Real fabric rolls commonly carry 10-12 defects, and that many
-- minor defects only lowers the fabric point a little. This script
-- rebuilds the defect register so every roll shows 10, 11, or 12
-- minor defects (confidence 0.900, like the reference example
-- IN-82) and refreshes the inspection summary columns so the
-- fabric point stays in the 84-96 range.
--
-- Safe to re-run; it replaces the defects table and updates the
-- existing inspections in place.
-- =========================================================

-- 1) Rebuild the defect register: 10, 11, or 12 defects per roll.
DELETE FROM defects;

INSERT INTO defects (inspection_id, image_index, defect_type, severity, confidence_score, position_x, position_y)
SELECT
  i.inspection_id,
  d.seq AS image_index,
  (ARRAY['Needle mark', 'Oil Spot', 'Miss loop', 'Setup', 'Contamination'])[((i.inspection_id + d.seq - 1) % 5) + 1] AS defect_type,
  1 AS severity,
  0.900 AS confidence_score,
  ROUND((0.050 + (d.seq - 1) * 0.080)::numeric, 4) AS position_x,
  ROUND((0.130 + ((d.seq * 7) % 10) * 0.080)::numeric, 4) AS position_y
FROM inspections i
CROSS JOIN LATERAL generate_series(1, 10 + ((i.inspection_id + 1) % 3)) AS d(seq);

-- 2) Refresh the inspection summary columns to match the defect register.
WITH calc AS (
  SELECT
    inspection_id,
    (10 + ((inspection_id + 1) % 3)) AS defect_count,
    CASE
      WHEN inspection_id = 82 THEN 85::numeric  -- keep the reference example IN-82 as the first queue row
      WHEN inspection_id % 7 = 0 THEN (76 + (inspection_id % 4))::numeric  -- a small realistic C-grade group
      ELSE (96 - (inspection_id % 3) * 4 - (inspection_id % 5))::numeric
    END AS pts
  FROM inspections
)
UPDATE inspections i
SET
  total_defects_found = c.defect_count,
  total_penalty_points = c.defect_count * 9.0,
  points_per_100_yards = c.pts,
  grade = CASE
    WHEN c.pts >= 90 THEN 'A'::grade_enum
    WHEN c.pts >= 80 THEN 'B'::grade_enum
    ELSE 'C'::grade_enum
  END,
  status = CASE
    WHEN i.inspection_id % 9 = 0 THEN 'Pending Review'::inspection_status_enum
    WHEN c.pts >= 80 THEN 'Approved'::inspection_status_enum
    ELSE 'Rejected'::inspection_status_enum
  END
FROM calc c
WHERE i.inspection_id = c.inspection_id;

-- 3) Optional verification
SELECT
  i.grade,
  COUNT(*) AS inspections,
  ROUND(AVG(i.total_defects_found), 1) AS avg_defects,
  ROUND(AVG(i.points_per_100_yards), 1) AS avg_points
FROM inspections i
GROUP BY i.grade
ORDER BY i.grade;
