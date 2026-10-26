import { describe, expect, it } from 'vitest';
import {
  buildLoadoutTree,
  determineDetailedGroup,
  determineGroup,
  determineSpecialtyTag,
  humanizeModuleName,
  humanizePortName,
  type RawLoadoutSlot,
} from '@/lib/loadout-formatter';

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

describe('modular ships', () => {
  const retaliatorBomber: RawLoadoutSlot[] = [
    {
      id: 1,
      parent_id: null,
      port_name: 'hardpoint_front_module',
      port_type: 'Other',
      component_class_name: 'AEGS_Retaliator_Module_Front_Bomber',
    },
    { id: 2, parent_id: 1, port_name: 'hardpoint_module_oc', port_type: 'Other', component_class_name: 'AEGS_Retaliator_OC_Front_Bomber' },
    {
      id: 3,
      parent_id: 1,
      port_name: 'hardpoint_torpedo_launcher_fore',
      port_type: 'MissileRack',
      component_class_name: 'MRCK_S09_AEGS_Retaliator_Fore',
      component_type: 'MissileRack',
      component_name: 'Retaliator Torpedo Launcher',
    },
    {
      id: 4,
      parent_id: 3,
      port_name: 'missile_01_attach',
      port_type: 'MissileRack',
      component_class_name: 'MISL_S09',
      component_type: 'Missile',
      component_name: 'Argos IX',
    },
    {
      id: 5,
      parent_id: null,
      port_name: 'hardpoint_shield_left',
      port_type: 'Shield',
      component_class_name: 'SHLD_X',
      component_name: 'FullStop',
    },
  ];

  it('moves module ports to their natural category and lists the module itself under modules', () => {
    const tree = buildLoadoutTree(retaliatorBomber, 'fr', {
      moduleSlots: [{ slotName: 'hardpoint_front_module', label: 'Torpilles (Bomber)' }],
    });

    const modules = tree.find((s) => s.key === 'modules');
    expect(modules?.nodes).toHaveLength(1);
    expect(modules!.nodes[0]).toMatchObject({ humanPortName: 'Module avant', component_name: 'Torpilles (Bomber)', children: [] });

    const ordnance = tree.find((s) => s.key === 'ordnance');
    expect(ordnance?.nodes).toHaveLength(1);
    expect(ordnance!.nodes[0]).toMatchObject({
      component_name: 'Retaliator Torpedo Launcher',
      moduleSlot: 'hardpoint_front_module',
      sourceModule: 'Torpilles (Bomber)',
    });
    expect(ordnance!.nodes[0].children[0].component_name).toBe('Argos IX');

    // The module occlusion helper never shows up anywhere
    const all = tree.flatMap((s) => s.nodes);
    expect(all.some((n) => n.port_name === 'hardpoint_module_oc')).toBe(false);
  });

  it('recognises well-known module ports even without module metadata', () => {
    const tree = buildLoadoutTree(retaliatorBomber, 'en');
    expect(tree.find((s) => s.key === 'modules')!.nodes[0].component_name).toBe('Torpedo (Bomber)');
  });

  it('humanizes module class names', () => {
    expect(humanizeModuleName('AEGS_Retaliator_Module_Rear_Cargo', 'fr')).toBe('Fret');
    expect(humanizeModuleName('RSI_Apollo_Module_Left_Tier_2', 'en', 2)).toBe('Medical Bay T2');
    expect(humanizeModuleName('RSI_Aurora_Mk2_Module_Missile', 'en')).toBe('Missile Launcher');
    expect(humanizeModuleName('DRAK_Caterpillar_CargoGrid_Module', 'fr')).toBe('Fret');
  });
});

describe('interior fixtures & transparent containers', () => {
  it('drops fixture subtrees and hoists components out of anonymous containers', () => {
    const slots: RawLoadoutSlot[] = [
      // Fire extinguisher cabinet: its "weapon" must not reach the pilot weapons tab
      {
        id: 1,
        parent_id: null,
        port_name: 'hardpoint_extinguisher_bridge',
        port_type: 'Other',
        component_class_name: 'Gadget_Cabinet_kegr_fire_extinguisher_NG',
      },
      {
        id: 2,
        parent_id: 1,
        port_name: 'cabinet_attach_loc',
        port_type: 'Other',
        component_class_name: 'kegr_fire_extinguisher_01',
        component_type: 'WeaponGun',
      },
      {
        id: 3,
        parent_id: null,
        port_name: 'hardpoint_dashboard_pilot',
        port_type: 'Other',
        component_class_name: 'MISC_Hull_C_Dashboard_Pilot',
      },
      { id: 4, parent_id: null, port_name: 'hardpoint_armor', port_type: 'Other', component_class_name: 'ARMR_MISC_Hull_C' },
      // Hull C rear interior block holding real components
      { id: 5, parent_id: null, port_name: 'hardpoint_body_int_rear', port_type: 'Other', component_class_name: 'MISC_Hull_C_Int_Rear' },
      {
        id: 6,
        parent_id: 5,
        port_name: 'hardpoint_rear_cooler_01',
        port_type: 'Cooler',
        component_class_name: 'COOL_AEGS_S03_Blizzard_SCItem',
        component_name: 'Blizzard',
      },
      // Empty placeholder
      { id: 7, parent_id: null, port_name: 'hardpoint_avionics01', port_type: 'Other', component_class_name: null },
    ];
    const tree = buildLoadoutTree(slots, 'en');

    expect(tree.map((s) => s.key)).toEqual(['coolers']);
    expect(tree[0].nodes[0].component_name).toBe('Blizzard');
  });
});

describe('specialized equipment', () => {
  it('tags specialties', () => {
    expect(determineSpecialtyTag({ port_name: 'hardpoint_mining_pod_1', component_class_name: 'Cargo_ShipMining_Pod_Mole' })).toBe(
      'mining',
    );
    expect(determineSpecialtyTag({ port_name: 'hardpoint_remote_turret_salvage_left', port_type: 'Turret' })).toBe('salvage');
    expect(determineSpecialtyTag({ port_name: 'hardpoint_turret_tractor_beam_top_front', port_type: 'Turret' })).toBe('tractor');
    expect(determineSpecialtyTag({ port_name: 'hardpoint_weapon_emp', component_type: 'EMP' })).toBe('tactical');
    expect(determineSpecialtyTag({ port_name: 'hardpoint_interdiction_device', component_type: 'QuantumInterdictionGenerator' })).toBe(
      'tactical',
    );
    expect(determineSpecialtyTag({ port_name: 'hardpoint_misc', component_class_name: 'Something_Temp' })).toBe('utility');
  });

  it('labels tactical tools instead of swallowing them as weapons or quantum drives', () => {
    expect(humanizePortName('hardpoint_weapon_emp', 'EMP', 'fr')).toBe('Générateur EMP');
    expect(humanizePortName('hardpoint_quantum_interdiction_generator', 'QuantumInterdictionGenerator', 'en')).toBe(
      'Quantum Interdiction Generator (QED)',
    );
    expect(humanizePortName('hardpoint_countermeasure_left', 'Countermeasure', 'en', 'RSI_Apollo_CML_Noise_Small')).toBe(
      'Noise Launcher (Left)',
    );
  });

  it('groups specialized tools by specialty and compacts identical ore bags', () => {
    const slots: RawLoadoutSlot[] = [
      ...[1, 2, 3, 4].map((n) => ({
        id: n,
        parent_id: null,
        port_name: `hardpoint_mining_pod_${n}`,
        port_type: 'Other',
        component_class_name: 'Cargo_ShipMining_Pod_Prospector',
      })),
      {
        id: 10,
        parent_id: null,
        port_name: 'hardpoint_weapon_emp',
        port_type: 'WeaponGun',
        component_type: 'EMP',
        component_class_name: 'AEGS_EMP_Device_S4',
        component_name: 'REP-8',
      },
    ];
    const specialized = buildLoadoutTree(slots, 'en').find((s) => s.key === 'specialized')!;

    expect(specialized.subgroups!.map((g) => g.tag)).toEqual(['mining', 'tactical']);
    const bags = specialized.subgroups![0].nodes;
    expect(bags).toHaveLength(1);
    expect(bags[0]).toMatchObject({ count: 4, humanPortName: 'Ore Bag', component_name: 'Removable Ore Bag' });
  });
});
