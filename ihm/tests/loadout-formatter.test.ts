import { describe, expect, it } from 'vitest';
import { determineGroup, groupLoadoutSlots, humanizePortName, type RawLoadoutSlot } from '@/lib/loadout-formatter';

describe('humanizePortName', () => {
  it('humanizes technical hardpoint weapon identifiers', () => {
    expect(humanizePortName('hardpoint_weapon_pilot_s4_left', 'WeaponGun', 'fr')).toBe('Point d’arme (pilote, gauche)');
    expect(humanizePortName('hardpoint_weapon_pilot_s4_right', 'WeaponGun', 'en')).toBe('Weapon Hardpoint (Pilot, Right)');
    expect(humanizePortName('hardpoint_weapon_nose', 'WeaponGun', 'fr')).toBe('Point d’arme (de nez)');
  });

  it('humanizes cooler and shield hardpoints with numbers', () => {
    expect(humanizePortName('hardpoint_cooler_left', 'Cooler', 'fr')).toBe('Refroidisseur (gauche)');
    expect(humanizePortName('item_port_shield_01', 'Shield', 'fr')).toBe('Bouclier #1');
    expect(humanizePortName('item_port_power_plant_02', 'PowerPlant', 'en')).toBe('Power Plant #2');
  });

  it('humanizes missile racks and turrets', () => {
    expect(humanizePortName('hardpoint_missile_wing_left_inner', 'MissileRack', 'fr')).toBe(
      'Râtelier de missiles (d’aile, gauche, intérieur)',
    );
    expect(humanizePortName('turret_manned_top', 'Turret', 'fr')).toBe('Tourelle (habitée, dorsal)');
  });
});

describe('determineGroup', () => {
  it('classifies weapons into weapons group', () => {
    expect(determineGroup({ port_name: 'hardpoint_weapon_left', port_type: 'WeaponGun' })).toBe('weapons');
    expect(determineGroup({ port_name: 'hardpoint_missile_left', port_type: 'MissileRack' })).toBe('weapons');
  });

  it('classifies shields and coolers into systems group', () => {
    expect(determineGroup({ port_name: 'hardpoint_cooler_1', port_type: 'Cooler' })).toBe('systems');
    expect(determineGroup({ port_name: 'item_port_shield', port_type: 'Shield' })).toBe('systems');
  });

  it('classifies quantum drive into propulsion group', () => {
    expect(determineGroup({ port_name: 'item_port_quantum_drive', port_type: 'QuantumDrive' })).toBe('propulsion');
  });
});

describe('groupLoadoutSlots', () => {
  it('groups and sorts slots logically by system', () => {
    const slots: RawLoadoutSlot[] = [
      { port_name: 'hardpoint_cooler_left', port_type: 'Cooler', component_size: 1, component_name: 'Bracer' },
      { port_name: 'hardpoint_weapon_left', port_type: 'WeaponGun', component_size: 3, component_name: 'Panther' },
      { port_name: 'item_port_quantum_drive', port_type: 'QuantumDrive', component_size: 1, component_name: 'Atlas' },
    ];

    const grouped = groupLoadoutSlots(slots, 'fr');
    expect(grouped.length).toBe(3);
    expect(grouped.some((g) => g.key === 'weapons')).toBe(true);
    expect(grouped.some((g) => g.key === 'systems')).toBe(true);
    expect(grouped.some((g) => g.key === 'propulsion')).toBe(true);
  });
});
