ALTER TABLE game.shop_inventory
  ADD COLUMN IF NOT EXISTS inventory_kind VARCHAR(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS sell_price DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS current_inventory DECIMAL(14, 4),
  ADD COLUMN IF NOT EXISTS max_inventory DECIMAL(14, 4),
  ADD COLUMN IF NOT EXISTS raw_json JSONB;

CREATE INDEX IF NOT EXISTS shop_inventory_inventory_kind_idx
  ON game.shop_inventory (inventory_kind);
