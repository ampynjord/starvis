-- Add missing extraction counters for item/commodity/shop visibility
ALTER TABLE extraction_log ADD COLUMN items_count INT DEFAULT 0;
ALTER TABLE extraction_log ADD COLUMN commodities_count INT DEFAULT 0;
ALTER TABLE extraction_log ADD COLUMN shops_count INT DEFAULT 0;

-- Keep null-safe defaults on existing rows
UPDATE extraction_log SET items_count = COALESCE(items_count, 0), commodities_count = COALESCE(commodities_count, 0), shops_count = COALESCE(shops_count, 0);
