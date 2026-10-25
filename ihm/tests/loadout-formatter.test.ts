import { describe, expect, it } from 'vitest';
import { buildLoadoutTree, determineGroup, humanizePortName, type RawLoadoutSlot } from '@/lib/loadout-formatter';

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

  it('strictly distinguishes Jump Module from Quantum Drive', () => {
    expect(humanizePortName('hardpoint_jump_drive', 'QuantumDrive', 'fr')).toBe('Module de saut');
    expect(humanizePortName('hardpoint_quantum_drive', 'QuantumDrive', 'fr')).toBe('Moteur quantique');
    expect(humanizePortName('hardpoint_jump_drive', 'JumpModule', 'en')).toBe('Jump Module');
    expect(humanizePortName('hardpoint_quantum_drive', 'QuantumDrive', 'en')).toBe('Quantum Drive');
  });
});

describe('determineGroup', () => {
  it('classifies weapons into weapons group and missiles into missiles group', () => {
    expect(determineGroup({ port_name: 'hardpoint_weapon_left', port_type: 'WeaponGun' })).toBe('weapons');
    expect(determineGroup({ port_name: 'hardpoint_missile_left', port_type: 'MissileRack' })).toBe('missiles');
  });

  it('classifies shields and coolers into systems group', () => {
    expect(determineGroup({ port_name: 'hardpoint_cooler_1', port_type: 'Cooler' })).toBe('systems');
    expect(determineGroup({ port_name: 'item_port_shield', port_type: 'Shield' })).toBe('systems');
  });

  it('classifies quantum drive into propulsion and jump module into jump group', () => {
    expect(determineGroup({ port_name: 'item_port_quantum_drive', port_type: 'QuantumDrive' })).toBe('propulsion');
    expect(determineGroup({ port_name: 'hardpoint_jump_drive', component_type: 'JumpModule' })).toBe('jump');
  });
});

describe('buildLoadoutTree', () => {
  it('builds a hierarchical tree from parent_id relationships', () => {
    const slots: RawLoadoutSlot[] = [
      // Gimbal mount (parent)
      { id: 1, parent_id: null, port_name: 'hardpoint_gun_nose', port_type: 'Gimbal', component_size: 3, component_name: 'VariPuck S3' },
      // Weapon (child of gimbal)
      { id: 2, parent_id: 1, port_name: 'hardpoint_class_2', port_type: 'WeaponGun', component_size: 3, component_name: 'Panther' },
      // Quantum drive (parent)
      {
        id: 3,
        parent_id: null,
        port_name: 'hardpoint_quantum_drive',
        port_type: 'QuantumDrive',
        component_size: 1,
        component_name: 'Beacon',
      },
      // Jump module (child of quantum drive)
      {
        id: 4,
        parent_id: 3,
        port_name: 'hardpoint_jump_drive',
        component_type: 'JumpModule',
        component_size: 1,
        component_name: 'Explorer',
      },
      // Shield (root without children)
      { id: 5, parent_id: null, port_name: 'hardpoint_shield_left', port_type: 'Shield', component_size: 1, component_name: 'AllStop' },
    ];

    const tree = buildLoadoutTree(slots, 'fr');
    expect(tree.length).toBeGreaterThanOrEqual(3);

    const weaponSection = tree.find((s) => s.key === 'weapons');
    expect(weaponSection).toBeDefined();
    expect(weaponSection!.nodes.length).toBe(1);
    expect(weaponSection!.nodes[0].component_name).toBe('VariPuck S3');
    expect(weaponSection!.nodes[0].children.length).toBe(1);
    expect(weaponSection!.nodes[0].children[0].component_name).toBe('Panther');

    const propulsionSection = tree.find((s) => s.key === 'propulsion');
    expect(propulsionSection).toBeDefined();
    expect(propulsionSection!.nodes[0].component_name).toBe('Beacon');
    expect(propulsionSection!.nodes[0].children.length).toBe(1);
    expect(propulsionSection!.nodes[0].children[0].component_name).toBe('Explorer');
  });
});
