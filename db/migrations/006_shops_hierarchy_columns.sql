-- Add missing shop hierarchy/type columns required by extractor upsert
ALTER TABLE shops ADD COLUMN `system` VARCHAR(50) COMMENT 'Star system (Stanton, Pyro, Nyx)' AFTER parent_location;
ALTER TABLE shops ADD COLUMN planet_moon VARCHAR(100) COMMENT 'Planet or moon name' AFTER `system`;
ALTER TABLE shops ADD COLUMN city VARCHAR(100) COMMENT 'City or station name' AFTER planet_moon;
ALTER TABLE shops ADD COLUMN shop_type VARCHAR(50) COMMENT 'Weapon, Ship, Component, etc.' AFTER city;
ALTER TABLE shops ADD COLUMN class_name VARCHAR(255) COMMENT 'Original DataForge className' AFTER shop_type;
