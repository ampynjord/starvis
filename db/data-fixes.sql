-- ============================================================
-- STARVIS Data Fixes — Corrections manuelles issues de l'audit
-- Run after each extraction to fix known data issues
-- ============================================================

-- 1. Fix ATLS categorization: it's a ground mech, not a ship
UPDATE ships SET vehicle_category = 'ground'
WHERE class_name LIKE 'ARGO_ATLS%' AND (vehicle_category IS NULL OR vehicle_category = 'ship');

-- 2. Fix duplicate Aopoa manufacturer (XNAA and XIAN both named "Aopoa")
UPDATE manufacturers SET name = "Xi'an (Aopoa)" WHERE code = 'XNAA' AND name = 'Aopoa';

-- 3. Clean orphan manufacturers with 0 ships and 0 components
DELETE FROM manufacturers
WHERE code IN (
  SELECT m.code FROM (
    SELECT m2.code
    FROM manufacturers m2
    LEFT JOIN ships s ON m2.code = s.manufacturer_code
    LEFT JOIN components c ON m2.code = c.manufacturer_code
    GROUP BY m2.code
    HAVING COUNT(DISTINCT s.uuid) = 0 AND COUNT(DISTINCT c.uuid) = 0
  ) m
);

-- 4. Mark fake PowerPlant components (shop stands, door decals, control panels)
--    These are items incorrectly typed as PowerPlant in DataForge
UPDATE components SET type = 'Prop', sub_type = 'fake_powerplant'
WHERE type = 'PowerPlant'
  AND (
    class_name LIKE '%shopstand%'
    OR class_name LIKE '%door_decal%'
    OR class_name LIKE '%control_panel%'
    OR class_name LIKE '%display%'
    OR (power_output IS NULL OR power_output = 0)
       AND (name LIKE '%Stand%' OR name LIKE '%Panel%' OR name LIKE '%Decal%' OR name LIKE '%Display%')
  );

-- 5. Verify fixes
SELECT 'ATLS category' as fix, class_name, vehicle_category FROM ships WHERE class_name LIKE 'ARGO_ATLS%';
SELECT 'Aopoa fix' as fix, code, name FROM manufacturers WHERE code IN ('XNAA', 'XIAN');
SELECT 'Orphan manufacturers' as fix, COUNT(*) as remaining FROM (
  SELECT m.code FROM manufacturers m
  LEFT JOIN ships s ON m.code = s.manufacturer_code
  LEFT JOIN components c ON m.code = c.manufacturer_code
  GROUP BY m.code HAVING COUNT(DISTINCT s.uuid) = 0 AND COUNT(DISTINCT c.uuid) = 0
) t;
SELECT 'Fake PowerPlants' as fix, COUNT(*) as count FROM components WHERE type = 'Prop' AND sub_type = 'fake_powerplant';
