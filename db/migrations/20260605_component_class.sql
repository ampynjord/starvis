ALTER TABLE game.components
  ADD COLUMN IF NOT EXISTS component_class VARCHAR(30);

CREATE INDEX IF NOT EXISTS components_component_class_idx
  ON game.components(component_class);
