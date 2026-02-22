-- Migration 002: Add indexes for common filter/sort columns

CREATE INDEX IF NOT EXISTS idx_role ON ships(role);
CREATE INDEX IF NOT EXISTS idx_career ON ships(career);
CREATE INDEX IF NOT EXISTS idx_vehicle_category ON ships(vehicle_category);
