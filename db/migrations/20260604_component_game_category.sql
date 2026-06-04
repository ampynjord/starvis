ALTER TABLE game.components
  ADD COLUMN IF NOT EXISTS game_component_category varchar(50);

UPDATE game.components
SET game_component_category = CASE type
  WHEN 'Missile' THEN 'Ordnance'
  WHEN 'WeaponMissile' THEN 'Ordnance'
  WHEN 'Ammunition' THEN 'Ordnance'
  WHEN 'Torpedo' THEN 'Ordnance'
  WHEN 'Bomb' THEN 'Ordnance'
  WHEN 'Cooler' THEN 'Coolers'
  WHEN 'EMP' THEN 'EMP'
  WHEN 'QuantumInterdictionGenerator' THEN 'EMP'
  WHEN 'MiningLaser' THEN 'Mining'
  WHEN 'MiningArm' THEN 'Mining'
  WHEN 'SalvageHead' THEN 'Mining'
  WHEN 'TractorBeam' THEN 'Mining'
  WHEN 'RepairBeam' THEN 'Mining'
  WHEN 'MissileRack' THEN 'Missile Racks'
  WHEN 'PowerPlant' THEN 'Power Plants'
  WHEN 'QuantumDrive' THEN 'Quantum Drives'
  WHEN 'Shield' THEN 'Shields'
  WHEN 'Turret' THEN 'Turrets'
  WHEN 'TurretBase' THEN 'Turrets'
  WHEN 'TurretUnmanned' THEN 'Turrets'
  WHEN 'WeaponGun' THEN 'Weapons'
  WHEN 'Weapon' THEN 'Weapons'
  WHEN 'UtilityWeapon' THEN 'Weapons'
  WHEN 'Countermeasure' THEN 'CM Launchers'
  WHEN 'Paint' THEN 'Liveries'
  WHEN 'Livery' THEN 'Liveries'
  WHEN 'JumpModule' THEN 'Jump Modules'
  WHEN 'JumpDrive' THEN 'Jump Modules'
  WHEN 'Radar' THEN 'Radar'
  ELSE 'Other'
END
WHERE game_component_category IS NULL
   OR game_component_category = ''
   OR game_component_category = 'Other';

CREATE INDEX IF NOT EXISTS components_game_component_category_idx
  ON game.components (game_component_category);
