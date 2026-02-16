-- ============================================================
-- STARVIS — Audit findings data fixes
-- Adds missing module options (Retaliator, Apollo)
-- Run after extraction or import
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- RETALIATOR: add Cargo and Torpedo module options
-- Currently only has "Module Front Base" and "Module Rear Base" (default)
-- ──────────────────────────────────────────────────────────

-- Front Cargo Module
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_front_module', 'Front Module', 'AEGS_Retaliator_Module_Front_Cargo', 'Module Front Cargo', 0
FROM ships WHERE class_name = 'AEGS_Retaliator';

-- Front Torpedo Module
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_front_module', 'Front Module', 'AEGS_Retaliator_Module_Front_Torpedo', 'Module Front Torpedo', 0
FROM ships WHERE class_name = 'AEGS_Retaliator';

-- Rear Cargo Module
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_rear_module', 'Rear Module', 'AEGS_Retaliator_Module_Rear_Cargo', 'Module Rear Cargo', 0
FROM ships WHERE class_name = 'AEGS_Retaliator';

-- Rear Torpedo Module
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_rear_module', 'Rear Module', 'AEGS_Retaliator_Module_Rear_Torpedo', 'Module Rear Torpedo', 0
FROM ships WHERE class_name = 'AEGS_Retaliator';

-- ──────────────────────────────────────────────────────────
-- APOLLO: add Tier 1 and Tier 2 room module options
-- Currently only has Tier 3 modules (default)
-- Both Apollo Medivac and Apollo Triage
-- ──────────────────────────────────────────────────────────

-- Apollo Medivac — Left Room Tier 1
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_left', 'Left Room', 'RSI_Apollo_Module_Left_Tier_1', 'Apollo Module Left Tier 1', 0
FROM ships WHERE class_name = 'RSI_Apollo_Medivac';

-- Apollo Medivac — Left Room Tier 2
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_left', 'Left Room', 'RSI_Apollo_Module_Left_Tier_2', 'Apollo Module Left Tier 2', 0
FROM ships WHERE class_name = 'RSI_Apollo_Medivac';

-- Apollo Medivac — Right Room Tier 1
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_right', 'Right Room', 'RSI_Apollo_Module_Right_Tier_1', 'Apollo Module Right Tier 1', 0
FROM ships WHERE class_name = 'RSI_Apollo_Medivac';

-- Apollo Medivac — Right Room Tier 2
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_right', 'Right Room', 'RSI_Apollo_Module_Right_Tier_2', 'Apollo Module Right Tier 2', 0
FROM ships WHERE class_name = 'RSI_Apollo_Medivac';

-- Apollo Triage — Left Room Tier 1
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_left', 'Left Room', 'RSI_Apollo_Module_Left_Tier_1', 'Apollo Module Left Tier 1', 0
FROM ships WHERE class_name = 'RSI_Apollo_Triage';

-- Apollo Triage — Left Room Tier 2
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_left', 'Left Room', 'RSI_Apollo_Module_Left_Tier_2', 'Apollo Module Left Tier 2', 0
FROM ships WHERE class_name = 'RSI_Apollo_Triage';

-- Apollo Triage — Right Room Tier 1
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_right', 'Right Room', 'RSI_Apollo_Module_Right_Tier_1', 'Apollo Module Right Tier 1', 0
FROM ships WHERE class_name = 'RSI_Apollo_Triage';

-- Apollo Triage — Right Room Tier 2
INSERT IGNORE INTO ship_modules (ship_uuid, slot_name, slot_display_name, module_class_name, module_name, is_default)
SELECT uuid, 'hardpoint_modular_room_right', 'Right Room', 'RSI_Apollo_Module_Right_Tier_2', 'Apollo Module Right Tier 2', 0
FROM ships WHERE class_name = 'RSI_Apollo_Triage';

-- ──────────────────────────────────────────────────────────
-- Update existing module display names if missing
-- ──────────────────────────────────────────────────────────
UPDATE ship_modules SET slot_display_name = 'Front Module'
WHERE slot_name = 'hardpoint_front_module' AND slot_display_name IS NULL;

UPDATE ship_modules SET slot_display_name = 'Rear Module'
WHERE slot_name = 'hardpoint_rear_module' AND slot_display_name IS NULL;

UPDATE ship_modules SET slot_display_name = 'Left Room'
WHERE slot_name = 'hardpoint_modular_room_left' AND slot_display_name IS NULL;

UPDATE ship_modules SET slot_display_name = 'Right Room'
WHERE slot_name = 'hardpoint_modular_room_right' AND slot_display_name IS NULL;
