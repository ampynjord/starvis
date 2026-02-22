-- Add missing extended component stats required by extractor writes
ALTER TABLE components ADD COLUMN mining_speed DECIMAL(10,4) COMMENT 'Mining extraction rate';
ALTER TABLE components ADD COLUMN mining_range DECIMAL(10,2) COMMENT 'Mining optimal range (m)';
ALTER TABLE components ADD COLUMN mining_resistance DECIMAL(10,4) COMMENT 'Mining resistance modifier';
ALTER TABLE components ADD COLUMN mining_instability DECIMAL(10,4) COMMENT 'Mining instability modifier';

ALTER TABLE components ADD COLUMN tractor_max_force DECIMAL(15,2) COMMENT 'Max tractor beam force (N)';
ALTER TABLE components ADD COLUMN tractor_max_range DECIMAL(10,2) COMMENT 'Max tractor beam range (m)';

ALTER TABLE components ADD COLUMN salvage_speed DECIMAL(10,4) COMMENT 'Salvage extraction rate';
ALTER TABLE components ADD COLUMN salvage_radius DECIMAL(10,2) COMMENT 'Salvage extraction radius';

ALTER TABLE components ADD COLUMN gimbal_type VARCHAR(20) COMMENT 'Fixed, Gimbal';

ALTER TABLE components ADD COLUMN rack_count TINYINT UNSIGNED COMMENT 'Number of missile slots on rack';
ALTER TABLE components ADD COLUMN rack_missile_size TINYINT UNSIGNED COMMENT 'Size of missiles the rack holds';
