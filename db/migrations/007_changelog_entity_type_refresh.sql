-- Ensure changelog.entity_type supports all current extractor values
ALTER TABLE changelog
  MODIFY COLUMN entity_type ENUM('ship', 'component', 'item', 'commodity', 'shop', 'module') NOT NULL;
