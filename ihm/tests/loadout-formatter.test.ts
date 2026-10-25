import { describe, expect, it } from 'vitest';
import { buildLoadoutTree, determineDetailedGroup, determineGroup, humanizePortName, type RawLoadoutSlot } from '@/lib/loadout-formatter';

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

describe('determineGroup (backward compatibility)', () => {
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

describe('determineDetailedGroup (fine-grained categories)', () => {
  it('distinguishes fixed weapons, turrets, and point defense systems (PDS)', () => {
    expect(determineDetailedGroup({ port_name: 'hardpoint_weapon_nose', port_type: 'WeaponGun' })).toBe('fixed_weapons');
    expect(determineDetailedGroup({ port_name: 'turret_manned_top', port_type: 'Turret' })).toBe('turrets');
    expect(determineDetailedGroup({ port_name: 'hardpoint_pdc_top', component_class_name: 'Turret_PDC_BEHR_A' })).toBe('pds');
  });

  it('distinguishes ordnance, thrusters, and fuel tanks', () => {
    expect(determineDetailedGroup({ port_name: 'hardpoint_missile_rack_01', port_type: 'MissileRack' })).toBe('ordnance');
    expect(determineDetailedGroup({ port_name: 'hardpoint_thruster_main', port_type: 'ManneuverThruster' })).toBe('thrusters');
    expect(determineDetailedGroup({ port_name: 'hardpoint_fuel_tank_qt', port_type: 'FuelTank' })).toBe('fuel');
  });

  it('identifies docked vehicles and specialized equipment (mining, salvage, EMP, tractor)', () => {
    expect(determineDetailedGroup({ port_name: 'hardpoint_docking_collar_merlin', component_class_name: 'KRIG_P52_Merlin' })).toBe(
      'docked_vehicles',
    );
    expect(determineDetailedGroup({ port_name: 'hardpoint_mining_arm', component_class_name: 'Mining_Laser_GRIN' })).toBe('specialized');
    expect(determineDetailedGroup({ port_name: 'hardpoint_salvage_arm_left', component_class_name: 'Salvage_Head_standard' })).toBe(
      'specialized',
    );
    expect(determineDetailedGroup({ port_name: 'hardpoint_emp_device', component_type: 'EMP' })).toBe('specialized');
    expect(determineDetailedGroup({ port_name: 'hardpoint_mining_pod_1', component_class_name: 'Cargo_ShipMining_Pod_Prospector' })).toBe(
      'specialized',
    );
  });
});

describe('buildLoadoutTree', () => {
  it('builds a hierarchical tree and assigns fine-grained categories', () => {
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
      // Docked parasite vehicle
      {
        id: 6,
        parent_id: null,
        port_name: 'hardpoint_docking_collar_merlin',
        port_type: 'DockingCollar',
        component_class_name: 'KRIG_P52_Merlin',
        component_name: 'Kruger P-52 Merlin',
      },
    ];

    const tree = buildLoadoutTree(slots, 'fr');
    expect(tree.length).toBeGreaterThanOrEqual(4);

    const weaponSection = tree.find((s) => s.key === 'fixed_weapons');
    expect(weaponSection).toBeDefined();
    expect(weaponSection!.nodes.length).toBe(1);
    expect(weaponSection!.nodes[0].component_name).toBe('VariPuck S3');
    expect(weaponSection!.nodes[0].children.length).toBe(1);
    expect(weaponSection!.nodes[0].children[0].component_name).toBe('Panther');

    const quantumSection = tree.find((s) => s.key === 'quantum');
    expect(quantumSection).toBeDefined();
    expect(quantumSection!.nodes[0].component_name).toBe('Beacon');
    expect(quantumSection!.nodes[0].children.length).toBe(1);
    expect(quantumSection!.nodes[0].children[0].component_name).toBe('Explorer');

    const dockedSection = tree.find((s) => s.key === 'docked_vehicles');
    expect(dockedSection).toBeDefined();
    expect(dockedSection!.nodes[0].component_name).toBe('Kruger P-52 Merlin');
  });
});
