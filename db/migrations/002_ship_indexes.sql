-- Migration 002: Add indexes for common filter/sort columns

CREATE INDEX idx_role ON ships(role);
CREATE INDEX idx_career ON ships(career);
CREATE INDEX idx_vehicle_category ON ships(vehicle_category);
