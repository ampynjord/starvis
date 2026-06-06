import type { Component, ComponentListItem } from '@/types/api';

export type ComponentLike = ComponentListItem & Partial<Component>;

export interface ComponentMetric {
  label: string;
  value: string;
}

export interface ComponentMetricGroup {
  key: string;
  title: string;
  metrics: ComponentMetric[];
}

type NumericField = {
  field: keyof ComponentLike;
  label: string;
  unit?: string;
  digits?: number;
  format?: (value: number) => string;
};

const isPresent = (value: unknown) =>
  value !== null && value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) !== 0);

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatMetric(value: number, unit = '', digits = 0): string {
  const formatted = formatNumber(value, digits);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatSpeed(value: number): string {
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000)} Mm/s`;
  return `${formatNumber(value)} m/s`;
}

function formatRange(value: number): string {
  if (value >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000)} Gm`;
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000)} Mm`;
  if (value >= 1000) return `${formatNumber(value / 1000)} km`;
  return `${formatNumber(value)} m`;
}

function metric(comp: ComponentLike, spec: NumericField): ComponentMetric | null {
  const raw = comp[spec.field];
  if (!isPresent(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return {
    label: spec.label,
    value: spec.format ? spec.format(value) : formatMetric(value, spec.unit, spec.digits),
  };
}

function textMetric(label: string, value: string | number | boolean | null | undefined): ComponentMetric | null {
  if (value === null || value === undefined || value === '') return null;
  return { label, value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value) };
}

function group(
  comp: ComponentLike,
  key: string,
  title: string,
  specs: Array<NumericField | ComponentMetric | null>,
): ComponentMetricGroup | null {
  const metrics = specs
    .map((spec) => {
      if (!spec) return null;
      if ('field' in spec) return metric(comp, spec);
      return spec;
    })
    .filter((item): item is ComponentMetric => item !== null);

  if (!metrics.length) return null;
  return { key, title, metrics };
}

function damageBreakdown(comp: ComponentLike, prefix: 'weapon' | 'missile') {
  return group(comp, `${prefix}-damage-breakdown`, 'Damage Breakdown', [
    { field: `${prefix}_damage_physical` as keyof ComponentLike, label: 'Physical', digits: 1 },
    { field: `${prefix}_damage_energy` as keyof ComponentLike, label: 'Energy', digits: 1 },
    { field: `${prefix}_damage_distortion` as keyof ComponentLike, label: 'Distortion', digits: 1 },
    { field: `${prefix}_damage_thermal` as keyof ComponentLike, label: 'Thermal', digits: 1 },
    { field: `${prefix}_damage_biochemical` as keyof ComponentLike, label: 'Biochemical', digits: 1 },
    { field: `${prefix}_damage_stun` as keyof ComponentLike, label: 'Stun', digits: 1 },
  ]);
}

export function getComponentMetricGroups(comp: ComponentLike): ComponentMetricGroup[] {
  const groups: Array<ComponentMetricGroup | null> = [
    group(comp, 'identity', 'Identity', [
      comp.size != null ? { label: 'Size', value: `S${comp.size}` } : null,
      textMetric('Manufacturer', comp.manufacturer_name ?? comp.manufacturer_code),
      textMetric('Class', comp.component_class),
      textMetric('Grade', comp.grade),
      comp.is_bespoke ? { label: 'Fitment', value: 'Bespoke' } : null,
      textMetric('Subtype', comp.sub_type),
    ]),
  ];

  if (comp.type === 'Shield') {
    groups.push(
      group(comp, 'shield-characteristics', 'Shield Characteristics', [
        { field: 'shield_hp', label: 'HP Pool' },
        { field: 'shield_regen', label: 'Regen Rate', format: (v) => `${formatNumber(v, 1)}/s` },
        { field: 'shield_regen_delay', label: 'Damaged Delay', unit: 's', digits: 1 },
        { field: 'shield_downed_regen_delay', label: 'Downed Delay', unit: 's', digits: 1 },
        { field: 'shield_hardening', label: 'Hardening', format: (v) => `${formatNumber(v * 100, 1)}%` },
        { field: 'shield_faces', label: 'Faces' },
      ]),
    );
  }

  if (comp.type === 'Cooler') {
    groups.push(
      group(comp, 'cooling', 'Cooling', [
        { field: 'cooling_rate', label: 'Generation' },
        { field: 'heat_generation', label: 'Heat Generation' },
      ]),
    );
  }

  if (comp.type === 'PowerPlant') {
    groups.push(
      group(comp, 'power-generation', 'Power Generation', [
        { field: 'power_output', label: 'Output', unit: 'W' },
        { field: 'power_base', label: 'Base', unit: 'W' },
        { field: 'power_draw', label: 'Draw', unit: 'W' },
      ]),
    );
  }

  if (comp.type === 'WeaponGun') {
    groups.push(
      group(comp, 'weapon-damage', 'Weapon Damage', [
        { field: 'weapon_dps', label: 'DPS', digits: 1 },
        { field: 'weapon_burst_dps', label: 'Burst DPS', digits: 1 },
        { field: 'weapon_sustained_dps', label: 'Sustained DPS', digits: 1 },
        { field: 'weapon_alpha_damage', label: 'Alpha', digits: 1 },
        textMetric('Damage Type', comp.weapon_damage_type),
      ]),
      group(comp, 'weapon-ballistics', 'Ballistics', [
        { field: 'weapon_range', label: 'Range', unit: 'm' },
        { field: 'weapon_full_damage_range', label: 'Full Range', unit: 'm' },
        { field: 'weapon_zero_damage_range', label: 'Zero Range', unit: 'm' },
        { field: 'weapon_speed', label: 'Projectile Speed', unit: 'm/s' },
        { field: 'weapon_fire_rate', label: 'Fire Rate', unit: 'rpm' },
        { field: 'weapon_ammo_count', label: 'Ammo' },
        { field: 'weapon_pellets_per_shot', label: 'Pellets/Shot' },
        { field: 'weapon_burst_size', label: 'Burst Size' },
      ]),
      group(comp, 'weapon-thermal', 'Thermal / Beam', [
        { field: 'weapon_heat_per_second', label: 'Heat/s', digits: 2 },
        { field: 'weapon_heat_per_shot', label: 'Heat/Shot', digits: 4 },
        { field: 'weapon_charge_time', label: 'Charge Time', unit: 's', digits: 2 },
        { field: 'weapon_beam_dps', label: 'Beam DPS', digits: 1 },
        { field: 'weapon_beam_capacity', label: 'Beam Capacity' },
        { field: 'weapon_beam_regen_cooldown', label: 'Beam Regen CD', unit: 's', digits: 1 },
      ]),
      damageBreakdown(comp, 'weapon'),
    );
  }

  if (comp.type === 'QuantumDrive') {
    groups.push(
      group(comp, 'quantum-travel', 'Quantum Travel', [
        { field: 'qd_speed', label: 'Speed', format: formatSpeed },
        { field: 'qd_range', label: 'Range', format: formatRange },
        { field: 'qd_fuel_rate', label: 'Fuel Rate', digits: 4 },
        { field: 'qd_spool_time', label: 'Spool Time', unit: 's', digits: 1 },
        { field: 'qd_cooldown', label: 'Cooldown', unit: 's', digits: 1 },
      ]),
      group(comp, 'quantum-calibration', 'Calibration', [
        { field: 'qd_calibration_rate', label: 'Rate', digits: 3 },
        { field: 'qd_calibration_delay', label: 'Delay', unit: 's', digits: 1 },
        { field: 'qd_calibration_max_angle', label: 'Max Angle', unit: 'deg', digits: 1 },
        { field: 'qd_tuning_rate', label: 'Tuning Rate', digits: 4 },
        { field: 'qd_alignment_rate', label: 'Alignment Rate', digits: 4 },
        { field: 'qd_disconnect_range', label: 'Disconnect Range', unit: 'm' },
        { field: 'qd_stage1_accel', label: 'Stage 1 Accel', unit: 'm/s2', digits: 2 },
        { field: 'qd_stage2_accel', label: 'Stage 2 Accel', unit: 'm/s2', digits: 2 },
      ]),
    );
  }

  if (comp.type === 'Missile' || comp.type === 'Torpedo' || comp.type === 'Bomb') {
    groups.push(
      group(comp, 'ordnance', 'Ordnance', [
        { field: 'missile_damage', label: 'Damage' },
        textMetric('Guidance', comp.missile_guidance_mode ?? comp.missile_signal_type),
        { field: 'missile_speed', label: 'Speed', unit: 'm/s' },
        { field: 'missile_range', label: 'Range', unit: 'm' },
        { field: 'missile_lock_range', label: 'Lock Range', unit: 'm' },
        { field: 'missile_lock_time', label: 'Lock Time', unit: 's', digits: 2 },
        { field: 'missile_explosion_radius', label: 'Blast Radius', unit: 'm' },
      ]),
      damageBreakdown(comp, 'missile'),
    );
  }

  if (comp.type === 'MissileRack') {
    groups.push(
      group(comp, 'rack', 'Rack', [
        { field: 'rack_count', label: 'Slots' },
        { field: 'rack_missile_size', label: 'Ordnance Size', format: (v) => `S${v}` },
      ]),
    );
  }

  if (comp.type === 'EMP') {
    groups.push(
      group(comp, 'emp', 'EMP', [
        { field: 'emp_damage', label: 'Damage' },
        { field: 'emp_radius', label: 'Radius', unit: 'm' },
        { field: 'emp_charge_time', label: 'Charge Time', unit: 's', digits: 1 },
        { field: 'emp_cooldown', label: 'Cooldown', unit: 's', digits: 1 },
      ]),
    );
  }

  if (comp.type === 'QuantumInterdictionGenerator') {
    groups.push(
      group(comp, 'qi', 'Quantum Interdiction', [
        { field: 'qig_jammer_range', label: 'Jammer Range', unit: 'm' },
        { field: 'qig_snare_radius', label: 'Snare Radius', unit: 'm' },
        { field: 'qig_charge_time', label: 'Charge Time', unit: 's', digits: 1 },
        { field: 'qig_cooldown', label: 'Cooldown', unit: 's', digits: 1 },
      ]),
    );
  }

  if (comp.type === 'MiningLaser') {
    groups.push(
      group(comp, 'mining', 'Mining', [
        { field: 'mining_speed', label: 'Speed', digits: 2 },
        { field: 'mining_range', label: 'Range', unit: 'm' },
        { field: 'mining_resistance', label: 'Resistance', format: (v) => `${formatNumber(v * 100, 1)}%` },
        { field: 'mining_instability', label: 'Instability', format: (v) => `${formatNumber(v * 100, 1)}%` },
      ]),
    );
  }

  if (comp.type === 'SalvageHead') {
    groups.push(
      group(comp, 'salvage', 'Salvage', [
        { field: 'salvage_speed', label: 'Speed', digits: 2 },
        { field: 'salvage_radius', label: 'Radius', unit: 'm' },
        { field: 'salvage_range', label: 'Range', unit: 'm' },
      ]),
    );
  }

  if (comp.type === 'TractorBeam') {
    groups.push(
      group(comp, 'tractor', 'Tractor Beam', [
        { field: 'tractor_max_force', label: 'Max Force', format: (v) => `${formatNumber(v / 1000)} kN` },
        { field: 'tractor_max_range', label: 'Max Range', unit: 'm' },
      ]),
    );
  }

  if (comp.type === 'Radar') {
    groups.push(
      group(comp, 'radar', 'Radar', [
        { field: 'radar_range', label: 'Range', unit: 'm' },
        { field: 'radar_ping_range', label: 'Ping Range', unit: 'm' },
        { field: 'radar_ping_cooldown', label: 'Ping Cooldown', unit: 's', digits: 1 },
        { field: 'radar_tracking_signal', label: 'Tracking Signal', format: (v) => `${formatNumber(v * 100, 1)}%` },
        { field: 'radar_detection_lifetime', label: 'Detection Lifetime', unit: 's', digits: 1 },
      ]),
    );
  }

  if (comp.type === 'Countermeasure') {
    groups.push(
      group(comp, 'countermeasure', 'Countermeasure', [textMetric('Type', comp.cm_type), { field: 'cm_ammo_count', label: 'Ammo' }]),
    );
  }

  if (comp.type === 'Gimbal' || comp.type === 'Turret' || comp.type === 'TurretUnmanned') {
    groups.push(
      group(comp, 'mount', 'Mount', [
        textMetric('Gimbal Type', comp.gimbal_type),
        { field: 'gimbal_max_angle', label: 'Max Angle', unit: 'deg', digits: 1 },
        { field: 'gimbal_pitch_speed', label: 'Pitch Speed', unit: 'deg/s' },
        { field: 'gimbal_yaw_speed', label: 'Yaw Speed', unit: 'deg/s' },
        { field: 'turret_min_pitch', label: 'Min Pitch', unit: 'deg' },
        { field: 'turret_max_pitch', label: 'Max Pitch', unit: 'deg' },
        { field: 'turret_min_yaw', label: 'Min Yaw', unit: 'deg' },
        { field: 'turret_max_yaw', label: 'Max Yaw', unit: 'deg' },
      ]),
    );
  }

  if (comp.type === 'FuelTank' || comp.type === 'FuelIntake') {
    groups.push(
      group(comp, 'fuel', 'Fuel', [
        { field: 'fuel_capacity', label: 'Capacity', unit: 'L' },
        { field: 'fuel_intake_rate', label: 'Intake Rate', digits: 2 },
      ]),
    );
  }

  groups.push(
    group(comp, 'power-signatures', 'Power / Signatures', [
      { field: 'power_draw', label: 'Power Draw', unit: 'W' },
      { field: 'power_base', label: 'Power Base', unit: 'W' },
      { field: 'heat_generation', label: 'Heat' },
      { field: 'em_signature', label: 'EM' },
      { field: 'ir_signature', label: 'IR' },
      { field: 'cross_section_signature', label: 'CS' },
    ]),
    group(comp, 'durability', 'Durability', [
      { field: 'hp', label: 'Health' },
      { field: 'mass', label: 'Mass', unit: 'kg', digits: 2 },
    ]),
  );

  return groups.filter((item): item is ComponentMetricGroup => item !== null);
}

export function getComponentPrimaryMetrics(comp: ComponentLike): ComponentMetric[] {
  return getComponentMetricGroups(comp)
    .filter((group) => group.key !== 'identity')
    .flatMap((group) => group.metrics.map((metric) => ({ ...metric, label: metric.label })))
    .slice(0, 4);
}
