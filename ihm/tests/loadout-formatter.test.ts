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

  it('prunes internal components of parasite docked snubs and attaches docked_ship_uuid', () => {
    const slots: RawLoadoutSlot[] = [
      // Docking bay
      {
        id: 10,
        parent_id: null,
        port_name: 'hardpoint_docking_collar_merlin',
        port_type: 'Other',
        component_class_name: 'RSI_Constellation_Rear_DockingTube',
      },
      // Docked parasite vehicle
      {
        id: 11,
        parent_id: 10,
        port_name: 'itemport_vehicle_attach',
        port_type: 'Other',
        component_class_name: 'KRIG_P52_Merlin',
        component_name: 'Kruger P-52 Merlin',
      },
      // Merlin internal thruster (child of id 11) - MUST BE PRUNED
      {
        id: 12,
        parent_id: 11,
        port_name: 'hardpoint_thruster_merlin_main',
        port_type: 'Thruster',
        component_class_name: 'KRIG_P52_Merlin_Thruster_Main',
        component_name: 'Merlin Thruster',
      },
      // Merlin internal fuel tank (child of id 11) - MUST BE PRUNED
      {
        id: 13,
        parent_id: 11,
        port_name: 'hardpoint_fuel_tank_merlin',
        port_type: 'FuelTank',
        component_class_name: 'HTNK_KRIG_P52_Merlin',
        component_name: 'Merlin Tank',
      },
      // Carrier ship thruster (root) - MUST BE KEPT
      {
        id: 20,
        parent_id: null,
        port_name: 'hardpoint_thruster_main_01',
        port_type: 'Thruster',
        component_class_name: 'RSI_Constellation_Thruster_Main',
        component_name: 'Constellation Main Thruster',
        thruster_max_thrust: 500000,
      },
    ];

    const tree = buildLoadoutTree(slots, 'fr');
    const dockedSection = tree.find((s) => s.key === 'docked_vehicles');
    expect(dockedSection).toBeDefined();

    // The docked vehicle should have its canonical UUID resolved and NO children
    const collar = dockedSection!.nodes.find((n) => n.id === 10);
    expect(collar).toBeDefined();
    expect(collar!.children.length).toBe(1);
    const snubNode = collar!.children[0];
    expect(snubNode.id).toBe(11);
    expect(snubNode.docked_ship_uuid).toBe('939c4f7b-e4e5-a5a8-a4d5-56b57d5f48ab');
    expect(snubNode.children.length).toBe(0);

    // Merlin internal thrusters and tanks must NOT appear in thruster or fuel sections
    const thrusterSection = tree.find((s) => s.key === 'thrusters');
    expect(thrusterSection).toBeDefined();
    expect(thrusterSection!.nodes.length).toBe(1);
    expect(thrusterSection!.nodes[0].component_name).toBe('Constellation Main Thruster');

    const fuelSection = tree.find((s) => s.key === 'fuel');
    expect(fuelSection).toBeUndefined(); // No fuel tanks other than the pruned Merlin one
  });

  it('classifies countermeasures and includes telemetry in countermeasures section', () => {
    const slots: RawLoadoutSlot[] = [
      {
        id: 50,
        parent_id: null,
        port_name: 'hardpoint_cm_launcher_right_top',
        port_type: 'Other',
        component_class_name: 'RSI_Constellation_CML_Decoy',
        component_name: 'Constellation CML Decoy',
        cm_ammo_count: 48,
      },
      {
        id: 51,
        parent_id: null,
        port_name: 'hardpoint_cm_launcher_left_top',
        port_type: 'Other',
        component_class_name: 'RSI_Constellation_CML_Noise',
        component_name: 'Constellation CML Noise',
        cm_ammo_count: 5,
      },
    ];

    const tree = buildLoadoutTree(slots, 'fr');
    const cmSection = tree.find((s) => s.key === 'countermeasures');
    expect(cmSection).toBeDefined();
    expect(cmSection!.iconName).toBe('sparkles');
    expect(cmSection!.nodes.length).toBe(2);
    expect(cmSection!.nodes[0].cm_ammo_count).toBe(48);
  });
});
