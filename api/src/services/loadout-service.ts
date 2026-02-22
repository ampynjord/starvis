/**
 * LoadoutService — Loadout calculator, hardpoint builder, stat aggregation
 */
import type { Pool } from 'mysql2/promise';
import {
  cleanName,
  detectUtilityType,
  int,
  num,
  type PaginatedResult,
  RELEVANT_TYPES,
  type Row,
  r1,
  r2,
  r4,
  r6,
  UTILITY_WEAPON_RX,
} from './shared.js';

export class LoadoutService {
  constructor(private pool: Pool) {}

  // ── Read loadout / modules / paints ─────────────────────

  async getShipLoadout(shipUuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute(
      `SELECT sl.id, sl.port_name, sl.port_type, sl.component_class_name, sl.component_uuid,
              sl.port_min_size, sl.port_max_size, sl.parent_id,
              c.name as component_name, c.type as component_type, c.sub_type,
              c.size as component_size, c.grade, c.manufacturer_code,
              c.weapon_dps, c.weapon_damage, c.weapon_fire_rate, c.weapon_range,
              c.shield_hp, c.shield_regen, c.shield_regen_delay,
              c.qd_speed, c.qd_spool_time,
              c.power_output, c.cooling_rate,
              c.missile_damage, c.missile_signal_type
       FROM ships_loadouts sl LEFT JOIN components c ON sl.component_uuid = c.uuid
       WHERE sl.ship_uuid = ? ORDER BY sl.port_type, sl.port_name`,
      [shipUuid],
    );
    return rows as Row[];
  }

  async getShipModules(shipUuid: string): Promise<Row[]> {
    const NOISE_PATTERNS = [
      'cargogrid_module',
      'pdc_aimodule',
      'module_dashboard',
      'module_seat',
      'thruster_module',
      'power_plant_commandmodule',
      'cargo_module',
      'modular_bed',
    ];
    const noiseClauses = NOISE_PATTERNS.map((p) => `slot_name NOT LIKE '%${p}%'`).join(' AND ');
    const [rows] = await this.pool.execute<Row[]>(`SELECT * FROM ship_modules WHERE ship_uuid = ? AND ${noiseClauses} ORDER BY slot_name`, [
      shipUuid,
    ]);
    return rows;
  }

  async getShipPaints(shipUuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      'SELECT paint_class_name, paint_name, paint_uuid FROM ship_paints WHERE ship_uuid = ? ORDER BY paint_name',
      [shipUuid],
    );
    return rows;
  }

  // ── Paints (global listing) ─────────────────────────────

  async getAllPaints(opts: { search?: string; ship_uuid?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.search) {
      where.push('(sp.paint_name LIKE ? OR sp.paint_class_name LIKE ? OR s.name LIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t);
    }
    if (opts.ship_uuid) {
      where.push('sp.ship_uuid = ?');
      params.push(opts.ship_uuid);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const baseSql = `SELECT sp.id, sp.ship_uuid, sp.paint_class_name, sp.paint_name, sp.paint_uuid, s.name as ship_name, s.class_name as ship_class_name, m.name as manufacturer_name, m.code as manufacturer_code FROM ship_paints sp LEFT JOIN ships s ON sp.ship_uuid = s.uuid LEFT JOIN manufacturers m ON s.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM ship_paints sp LEFT JOIN ships s ON sp.ship_uuid = s.uuid${w}`;

    const [countRows] = await this.pool.execute<Row[]>(countSql, params);
    const total = Number(countRows[0]?.total) || 0;

    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    const sql = `${baseSql} ORDER BY s.name, sp.paint_name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const [rows] = await this.pool.execute<Row[]>(sql, params);
    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── Loadout Calculator ──────────────────────────────────

  async calculateLoadout(
    shipUuid: string,
    swaps: { portId?: number; portName?: string; componentUuid: string }[],
  ): Promise<Record<string, unknown>> {
    // 1. Load ship
    const [shipRows] = await this.pool.execute<Row[]>(
      'SELECT s.*, COALESCE(sm.name, s.name) as display_name FROM ships s LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id WHERE s.uuid = ?',
      [shipUuid],
    );
    if (!shipRows.length) throw new Error('Ship not found');
    const ship = shipRows[0];

    // 2. Cross-section fallback
    let crossX = num(ship.cross_section_x),
      crossY = num(ship.cross_section_y),
      crossZ = num(ship.cross_section_z);
    if (crossX === 0 && crossY === 0 && crossZ === 0 && ship.ship_matrix_id) {
      const [smRows] = await this.pool.execute<Row[]>('SELECT length, beam, height FROM ship_matrix WHERE id = ?', [ship.ship_matrix_id]);
      if (smRows.length) {
        crossX = num(smRows[0].length);
        crossY = num(smRows[0].beam);
        crossZ = num(smRows[0].height);
      }
    }

    // 3. Load ALL loadout ports
    const [loadoutRows] = await this.pool.execute<Row[]>(
      `SELECT sl.id, sl.port_name, sl.port_type, sl.port_min_size, sl.port_max_size,
              sl.parent_id, sl.component_uuid, sl.component_class_name, sl.port_editable,
              c.*
       FROM ships_loadouts sl LEFT JOIN components c ON sl.component_uuid = c.uuid
       WHERE sl.ship_uuid = ?`,
      [shipUuid],
    );
    const loadout: Row[] = loadoutRows.map((row) => ({ ...row }) as Row);

    // 4. Apply swaps
    if (swaps.length) {
      const swapByIdMap = new Map(swaps.filter((s) => s.portId).map((s) => [s.portId!, s.componentUuid]));
      const swapByNameMap = new Map(swaps.filter((s) => s.portName && !s.portId).map((s) => [s.portName!, s.componentUuid]));
      const swapUuids = [...new Set(swaps.map((s) => s.componentUuid))];
      const swapComponents = new Map<string, Row>();

      if (swapUuids.length) {
        const ph = swapUuids.map(() => '?').join(',');
        const [compRows] = await this.pool.execute<Row[]>(`SELECT * FROM components WHERE uuid IN (${ph})`, swapUuids);
        for (const c of compRows) swapComponents.set(c.uuid, c);
      }

      for (const l of loadout) {
        const newUuid = swapByIdMap.get(l.id as number) || swapByNameMap.get(l.port_name as string);
        if (!newUuid) continue;
        const comp = swapComponents.get(newUuid);
        if (!comp) continue;
        l._swapped = true;
        for (const key of Object.keys(comp)) {
          if (key !== 'uuid' && key !== 'created_at' && key !== 'updated_at') l[key] = comp[key];
        }
        l.component_uuid = comp.uuid;
      }
    }

    // 5. Aggregate stats
    const stats = this.aggregateLoadoutStats(loadout, ship, crossX, crossY, crossZ);

    // 6. Build hierarchical hardpoints (Erkul-style)
    const hardpoints = this.buildHardpoints(loadout);

    // 7. Build legacy filtered loadout
    const filteredLoadout = loadout
      .filter((l) => {
        if (!l.component_uuid || !l.type) return false;
        if (!RELEVANT_TYPES.has(String(l.type))) return false;
        if (String(l.port_name)?.includes('controller') || l.port_name === 'Radar' || String(l.port_name)?.endsWith('_helper'))
          return false;
        const isUtility = l.type === 'WeaponGun' && UTILITY_WEAPON_RX.test(String(l.name || l.class_name || ''));
        if (l.type === 'WeaponGun' && !isUtility && !(num(l.weapon_dps) > 0)) return false;
        return true;
      })
      .map((l) => {
        const isUtility = l.type === 'WeaponGun' && UTILITY_WEAPON_RX.test(String(l.name || l.class_name || ''));
        const effectiveType = isUtility ? detectUtilityType(l.name || '', l.class_name || '') : l.type;
        return {
          port_id: l.id,
          port_name: l.port_name,
          port_type: l.port_type,
          component_uuid: l.component_uuid,
          component_name: l.name,
          display_name: cleanName(l.name, l.type),
          component_type: effectiveType,
          component_size: int(l.size) || null,
          grade: l.grade || null,
          manufacturer_code: l.manufacturer_code || null,
          port_min_size: l.port_min_size || null,
          port_max_size: l.port_max_size || null,
          ...(l.type === 'WeaponGun' && !isUtility && { weapon_dps: num(l.weapon_dps) || null, weapon_range: num(l.weapon_range) || null }),
          ...(isUtility && {
            weapon_dps: num(l.weapon_dps) || null,
            weapon_damage: num(l.weapon_damage) || null,
            weapon_range: num(l.weapon_range) || null,
          }),
          ...(l.type === 'Shield' && { shield_hp: num(l.shield_hp) || null, shield_regen: num(l.shield_regen) || null }),
          ...(l.type === 'PowerPlant' && { power_output: num(l.power_output) || null }),
          ...(l.type === 'Cooler' && { cooling_rate: num(l.cooling_rate) || null }),
          ...(l.type === 'QuantumDrive' && { qd_speed: num(l.qd_speed) || null }),
          ...(l.type === 'Countermeasure' && { cm_ammo: int(l.cm_ammo_count) || null }),
          ...(l.type === 'Radar' && { radar_range: num(l.radar_range) || null }),
          ...(l.type === 'EMP' && { emp_damage: num(l.emp_damage) || null, emp_radius: num(l.emp_radius) || null }),
          ...(l.type === 'QuantumInterdictionGenerator' && {
            qig_jammer_range: num(l.qig_jammer_range) || null,
            qig_snare_radius: num(l.qig_snare_radius) || null,
          }),
          swapped: !!l._swapped,
        };
      });

    // 8. Load modules & paints
    const modules = await this.getShipModules(shipUuid);
    const paints = await this.getShipPaints(shipUuid);

    return {
      ship: { uuid: ship.uuid, name: ship.display_name || ship.name, class_name: ship.class_name },
      swaps: swaps.length,
      stats,
      hardpoints,
      loadout: filteredLoadout,
      modules,
      paints,
    };
  }

  // ── Ship Stats (standalone, without loadout calculator overhead) ──

  async getShipStats(shipUuid: string): Promise<Record<string, unknown> | null> {
    const [shipRows] = await this.pool.execute<Row[]>(
      'SELECT s.*, COALESCE(sm.name, s.name) as display_name FROM ships s LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id WHERE s.uuid = ?',
      [shipUuid],
    );
    if (!shipRows.length) return null;
    const ship = shipRows[0];

    let crossX = num(ship.cross_section_x),
      crossY = num(ship.cross_section_y),
      crossZ = num(ship.cross_section_z);
    if (crossX === 0 && crossY === 0 && crossZ === 0 && ship.ship_matrix_id) {
      const [smRows] = await this.pool.execute<Row[]>('SELECT length, beam, height FROM ship_matrix WHERE id = ?', [ship.ship_matrix_id]);
      if (smRows.length) {
        crossX = num(smRows[0].length);
        crossY = num(smRows[0].beam);
        crossZ = num(smRows[0].height);
      }
    }

    const [loadoutRows] = await this.pool.execute<Row[]>(
      `SELECT sl.id, sl.port_name, sl.port_type, sl.port_min_size, sl.port_max_size,
              sl.parent_id, sl.component_uuid, sl.component_class_name, sl.port_editable,
              c.*
       FROM ships_loadouts sl LEFT JOIN components c ON sl.component_uuid = c.uuid
       WHERE sl.ship_uuid = ?`,
      [shipUuid],
    );

    return {
      ship: { uuid: ship.uuid, name: ship.display_name || ship.name, class_name: ship.class_name },
      stats: this.aggregateLoadoutStats(loadoutRows as Row[], ship, crossX, crossY, crossZ),
    };
  }

  // ── Ship Hardpoints (standalone, no stat aggregation) ───

  async getShipHardpoints(shipUuid: string): Promise<Record<string, unknown>[] | null> {
    const [shipRows] = await this.pool.execute<Row[]>('SELECT uuid FROM ships WHERE uuid = ?', [shipUuid]);
    if (!shipRows.length) return null;

    const [loadoutRows] = await this.pool.execute<Row[]>(
      `SELECT sl.id, sl.port_name, sl.port_type, sl.port_min_size, sl.port_max_size,
              sl.parent_id, sl.component_uuid, sl.component_class_name, sl.port_editable,
              c.*
       FROM ships_loadouts sl LEFT JOIN components c ON sl.component_uuid = c.uuid
       WHERE sl.ship_uuid = ?`,
      [shipUuid],
    );

    return this.buildHardpoints(loadoutRows as Row[]);
  }

  // ── Hardpoint category mapping ──────────────────────────

  private portCategory(portType: string): string {
    const map: Record<string, string> = {
      WeaponGun: 'Weapons',
      Weapon: 'Weapons',
      Gimbal: 'Weapons',
      Turret: 'Turrets',
      TurretBase: 'Turrets',
      MissileRack: 'Missiles',
      Missile: 'Missiles',
      MissileLauncher: 'Missiles',
      Shield: 'Shields',
      ShieldGenerator: 'Shields',
      PowerPlant: 'Power Plants',
      Cooler: 'Coolers',
      QuantumDrive: 'Quantum Drive',
      Radar: 'Radar',
      EMP: 'EMP',
      QuantumInterdictionGenerator: 'QED',
      Countermeasure: 'Countermeasures',
      MiningLaser: 'Mining',
      SalvageHead: 'Salvage',
      TractorBeam: 'Tractor',
      RepairBeam: 'Repair',
    };
    return map[portType] || 'Other';
  }

  private static readonly CAT_ORDER: Record<string, number> = {
    Weapons: 1,
    Turrets: 2,
    Missiles: 3,
    Shields: 4,
    'Power Plants': 5,
    Coolers: 6,
    'Quantum Drive': 7,
    Radar: 8,
    EMP: 9,
    QED: 10,
    Countermeasures: 11,
    Mining: 12,
    Salvage: 13,
    Tractor: 14,
    Repair: 15,
  };

  // ── Build Erkul-style hierarchical hardpoints ───────────

  private buildHardpoints(loadout: Row[]): Record<string, unknown>[] {
    const childMap = new Map<number, Row[]>();
    const rootPorts: Row[] = [];

    for (const port of loadout) {
      if (port.parent_id) {
        if (!childMap.has(port.parent_id as number)) childMap.set(port.parent_id as number, []);
        childMap.get(port.parent_id as number)!.push(port);
      } else {
        rootPorts.push(port);
      }
    }

    const RELEVANT_ROOT = new Set([
      'Gimbal',
      'Turret',
      'TurretBase',
      'MissileRack',
      'WeaponGun',
      'Weapon',
      'Shield',
      'PowerPlant',
      'Cooler',
      'QuantumDrive',
      'Radar',
      'Countermeasure',
      'EMP',
      'QuantumInterdictionGenerator',
      'WeaponRack',
    ]);
    const MOUNT_PORT_TYPES = new Set(['Gimbal', 'Turret', 'TurretBase', 'MissileRack', 'WeaponRack']);
    const SKIP_TYPES = new Set(['FuelTank', 'FuelIntake', 'FlightController', 'HydrogenFuelTank', 'QuantumFuelTank']);

    const hardpoints: Record<string, unknown>[] = [];

    for (const root of rootPorts) {
      const portType = String(root.port_type || '');
      const portName = String(root.port_name || '');
      const allChildren = childMap.get(root.id as number) || [];

      if (portName.includes('controller') || portName.endsWith('_helper')) continue;
      if (portName.includes('seat') || portName.includes('dashboard')) continue;
      if (portName.includes('paint') || portName.includes('self_destruct')) continue;
      if (portName.includes('landing') || portName.includes('relay')) continue;

      const children = allChildren.filter((c) => {
        const cn = String(c.port_name || '');
        if (cn.startsWith('Screen_') || cn.startsWith('Display_') || cn.startsWith('Annunciator')) return false;
        if (cn.includes('_MFD') || cn.includes('dashboard') || cn.includes('HUD')) return false;
        const cpt = String(c.port_type || '');
        return (c.component_uuid && c.type) || RELEVANT_ROOT.has(cpt) || c.component_class_name;
      });

      const hasRelevantChildren = children.length > 0;
      if (!RELEVANT_ROOT.has(portType) && !hasRelevantChildren) continue;

      let mountType: string | null = null;
      let mountSize: number | null = null;
      const compCls = String(root.component_class_name || '');

      if (MOUNT_PORT_TYPES.has(portType)) {
        if (/turret/i.test(compCls) || portType === 'Turret' || portType === 'TurretBase') mountType = 'Turret';
        else if (/gimbal/i.test(compCls)) mountType = 'Gimbal';
        else if (/fixed/i.test(compCls)) mountType = 'Fixed';
        else if (/mrck|missilerack/i.test(compCls) || portType === 'MissileRack') mountType = 'Rack';
        else mountType = portType === 'Turret' || portType === 'TurretBase' ? 'Turret' : portType === 'MissileRack' ? 'Rack' : 'Gimbal';

        const sizeMatch = compCls.match(/[Ss](\d+)/);
        if (sizeMatch) mountSize = parseInt(sizeMatch[1], 10);
      }

      const componentType = String(root.type || '');
      if (SKIP_TYPES.has(componentType)) continue;

      let category: string;
      if (componentType && this.portCategory(componentType) !== 'Other') {
        category = this.portCategory(componentType);
      } else {
        category = this.portCategory(portType);
      }

      if (hasRelevantChildren && MOUNT_PORT_TYPES.has(portType)) {
        const childCompTypes = children.map((c) => String(c.type || '')).filter(Boolean);
        if (childCompTypes.length > 0) {
          const childCat = this.portCategory(childCompTypes[0]);
          if (childCat !== 'Other') {
            if (childCompTypes.every((t) => t === 'EMP')) category = 'EMP';
          }
        }
      }

      if (category === 'Other' && hasRelevantChildren) {
        const firstChildType = String(children.find((c) => c.type)?.type || children.find((c) => c.port_type)?.port_type || '');
        category = this.portCategory(firstChildType);
      }
      if (category === 'Other') continue;

      const componentTypeStr = componentType || String(root.type || '');
      const isRootUtility =
        (componentTypeStr === 'WeaponGun' || root.type === 'WeaponGun') &&
        UTILITY_WEAPON_RX.test(String(root.name || root.class_name || ''));
      if (isRootUtility) {
        category = this.portCategory(detectUtilityType(root.name || '', root.class_name || ''));
      }

      const effectiveMaxSize = int(root.port_max_size) || mountSize || int(root.size) || null;
      const items = children.map((c) => this.buildComponentInfo(c, childMap));

      if (hasRelevantChildren || (mountType && children.length > 0)) {
        hardpoints.push({
          port_id: root.id,
          port_name: portName,
          display_name: this.cleanPortName(portName),
          category,
          port_min_size: int(root.port_min_size) || null,
          port_max_size: effectiveMaxSize,
          mount_type: mountType,
          mount_class_name: compCls || null,
          mount_size: mountSize,
          component: null,
          items,
          swapped: !!root._swapped,
        });
      } else if (root.component_uuid && (root.type || componentType)) {
        hardpoints.push({
          port_id: root.id,
          port_name: portName,
          display_name: this.cleanPortName(portName),
          category,
          port_min_size: int(root.port_min_size) || null,
          port_max_size: effectiveMaxSize,
          mount_type: null,
          mount_class_name: null,
          mount_size: null,
          component: this.buildComponentInfo(root, childMap),
          items: [],
          swapped: !!root._swapped,
        });
      }
    }

    hardpoints.sort((a, b) => {
      const orderA = LoadoutService.CAT_ORDER[a.category as string] || 99;
      const orderB = LoadoutService.CAT_ORDER[b.category as string] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.port_name as string).localeCompare(b.port_name as string);
    });

    return hardpoints;
  }

  /** Parse mount display name from component_class_name */
  private cleanMountName(className: string): string {
    if (!className) return '';
    let name = className
      .replace(/^(Mount_|MRCK_|SCItem_|Vehicle_)/i, '')
      .replace(/_SCItem_.*/i, '')
      .replace(/^[A-Z]{3,4}_\w+_/, '');
    const sizeMatch = name.match(/[Ss](\d+)/);
    const size = sizeMatch ? ` S${sizeMatch[1]}` : '';
    name = name
      .replace(/[Ss]\d+/g, '')
      .replace(/_+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) {
      const parts = className.split('_');
      name = parts.length > 1 ? parts[1] : parts[0];
    }
    return `${name}${size}`.trim();
  }

  /** Build component info for a single loadout row */
  private buildComponentInfo(row: Row, childMap: Map<number, Row[]>): Record<string, unknown> {
    const type = String(row.type || row.port_type || '');
    const isUtility = type === 'WeaponGun' && UTILITY_WEAPON_RX.test(String(row.name || row.class_name || ''));
    const effectiveType = isUtility ? detectUtilityType(row.name || '', row.class_name || '') : type;

    const isMountItem = !row.component_uuid && row.component_class_name;
    const mountDisplayName = isMountItem ? this.cleanMountName(String(row.component_class_name)) : '';
    const mountSize = isMountItem ? (String(row.component_class_name).match(/[Ss](\d+)/) || [])[1] : null;

    const subChildren = childMap.get(row.id as number) || [];
    const relevantSubChildren = subChildren.filter((c) => {
      const cn = String(c.port_name || '');
      if (cn.startsWith('Screen_') || cn.startsWith('Display_') || cn.startsWith('Annunciator')) return false;
      if (cn.includes('_MFD') || cn.includes('dashboard') || cn.includes('HUD')) return false;
      return c.component_uuid || c.type || c.component_class_name;
    });
    const subItems = relevantSubChildren.map((c) => {
      const cIsMountItem = !c.component_uuid && c.component_class_name;
      const cMountName = cIsMountItem ? this.cleanMountName(String(c.component_class_name)) : '';
      const cMountSize = cIsMountItem ? (String(c.component_class_name).match(/[Ss](\d+)/) || [])[1] : null;
      const cType = String(c.type || c.port_type || '');
      return {
        port_id: c.id,
        port_name: c.port_name,
        port_max_size: int(c.port_max_size) || null,
        port_min_size: int(c.port_min_size) || null,
        uuid: c.component_uuid || null,
        name: c.name || (cIsMountItem ? c.component_class_name : null),
        display_name: c.name ? cleanName(c.name || '', cType) : cMountName,
        type: cType,
        sub_type: c.sub_type || null,
        size: int(c.size) || (cMountSize ? parseInt(cMountSize, 10) : null),
        grade: c.grade || null,
        manufacturer_code: c.manufacturer_code || null,
        hp: r2(num(c.hp)) || null,
        ...(cType === 'WeaponGun' && {
          weapon_dps: r2(num(c.weapon_dps)) || null,
          weapon_burst_dps: r2(num(c.weapon_burst_dps)) || null,
          weapon_sustained_dps: r2(num(c.weapon_sustained_dps)) || null,
          weapon_fire_rate: r2(num(c.weapon_fire_rate)) || null,
          weapon_range: Math.round(num(c.weapon_range)) || null,
          power_draw: r2(num(c.power_draw)) || null,
        }),
        ...(cType === 'Missile' && {
          missile_damage: r2(num(c.missile_damage)) || null,
          missile_signal_type: c.missile_signal_type || null,
          missile_speed: r2(num(c.missile_speed)) || null,
          missile_range: Math.round(num(c.missile_range)) || null,
        }),
        ...(cType !== 'WeaponGun' &&
          cType !== 'Missile' && {
            weapon_dps: num(c.weapon_dps) || null,
            weapon_range: num(c.weapon_range) || null,
            missile_damage: num(c.missile_damage) || null,
          }),
        swapped: !!c._swapped,
      };
    });

    return {
      port_id: row.id,
      port_name: row.port_name,
      uuid: row.component_uuid || null,
      name: row.name || (isMountItem ? row.component_class_name : null),
      display_name: row.name ? cleanName(row.name || '', type) : mountDisplayName,
      type: effectiveType,
      size: int(row.size) || (mountSize ? parseInt(mountSize, 10) : null),
      port_max_size: int(row.port_max_size) || null,
      port_min_size: int(row.port_min_size) || null,
      grade: row.grade || null,
      manufacturer_code: row.manufacturer_code || null,
      hp: r2(num(row.hp)) || null,
      power_draw: r2(num(row.power_draw)) || null,
      heat_generation: r2(num(row.heat_generation)) || null,
      ...(type === 'WeaponGun' &&
        !isUtility && {
          weapon_dps: r2(num(row.weapon_dps)) || null,
          weapon_burst_dps: r2(num(row.weapon_burst_dps)) || null,
          weapon_sustained_dps: r2(num(row.weapon_sustained_dps)) || null,
          weapon_fire_rate: r2(num(row.weapon_fire_rate)) || null,
          weapon_range: Math.round(num(row.weapon_range)) || null,
          weapon_damage_physical: r2(num(row.weapon_damage_physical)) || null,
          weapon_damage_energy: r2(num(row.weapon_damage_energy)) || null,
          weapon_damage_distortion: r2(num(row.weapon_damage_distortion)) || null,
        }),
      ...(isUtility && { weapon_dps: r2(num(row.weapon_dps)) || null, weapon_range: Math.round(num(row.weapon_range)) || null }),
      ...(type === 'Shield' && { shield_hp: r2(num(row.shield_hp)) || null, shield_regen: r2(num(row.shield_regen)) || null }),
      ...(type === 'PowerPlant' && { power_output: r2(num(row.power_output)) || null }),
      ...(type === 'Cooler' && { cooling_rate: r2(num(row.cooling_rate)) || null }),
      ...(type === 'QuantumDrive' && {
        qd_speed: r2(num(row.qd_speed)) || null,
        qd_spool_time: r2(num(row.qd_spool_time)) || null,
        qd_cooldown: r2(num(row.qd_cooldown)) || null,
        qd_fuel_rate: r2(num(row.qd_fuel_rate)) || null,
        qd_range: r2(num(row.qd_range)) || null,
      }),
      ...(type === 'Missile' && {
        missile_damage: r2(num(row.missile_damage)) || null,
        missile_signal_type: row.missile_signal_type || null,
        missile_speed: r2(num(row.missile_speed)) || null,
        missile_range: Math.round(num(row.missile_range)) || null,
        missile_lock_time: r2(num(row.missile_lock_time)) || null,
      }),
      ...(type === 'Countermeasure' && { cm_ammo: int(row.cm_ammo_count) || null }),
      ...(type === 'Radar' && { radar_range: r2(num(row.radar_range)) || null }),
      ...(type === 'EMP' && { emp_damage: r2(num(row.emp_damage)) || null, emp_radius: r2(num(row.emp_radius)) || null }),
      ...(type === 'QuantumInterdictionGenerator' && {
        qig_jammer_range: r2(num(row.qig_jammer_range)) || null,
        qig_snare_radius: r2(num(row.qig_snare_radius)) || null,
      }),
      sub_items: subItems.length ? subItems : undefined,
      swapped: !!row._swapped,
    };
  }

  /** Clean port name for display */
  private cleanPortName(name: string): string {
    return name
      .replace(/^hardpoint_/i, '')
      .replace(/^Hardpoint_/i, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Aggregate stats from a loadout array */
  aggregateLoadoutStats(loadout: Row[], ship: Row, crossX: number, crossY: number, crossZ: number): Record<string, unknown> {
    let totalDps = 0,
      totalBurstDps = 0,
      totalSustainedDps = 0;
    let totalShieldHp = 0,
      totalShieldRegen = 0;
    let totalPowerDraw = 0,
      totalPowerOutput = 0;
    let totalHeatGen = 0,
      totalCoolingRate = 0;
    let totalMissileDmg = 0;
    let weaponCount = 0,
      shieldCount = 0,
      missileCount = 0;
    let qdSpeed = 0,
      qdSpoolTime = 0,
      qdCooldown = 0,
      qdFuelRate = 0;
    let qdRange = 0,
      qdTuningRate = 0,
      qdAlignmentRate = 0,
      qdDisconnectRange = 0,
      qdName = '';

    const weapons: Record<string, unknown>[] = [],
      shields: Record<string, unknown>[] = [],
      missiles: Record<string, unknown>[] = [];
    const powerPlants: Record<string, unknown>[] = [],
      coolers: Record<string, unknown>[] = [];
    const cms: Record<string, unknown>[] = [],
      emps: Record<string, unknown>[] = [],
      qigs: Record<string, unknown>[] = [];
    const utilityWeapons: Record<string, unknown>[] = [];
    let cmFlare = 0,
      cmChaff = 0;

    for (const l of loadout) {
      if (!l.component_uuid) continue;

      if (l.type === 'WeaponGun') {
        if (UTILITY_WEAPON_RX.test(l.name || '') || UTILITY_WEAPON_RX.test(l.class_name || '')) {
          const uType = detectUtilityType(l.name || '', l.class_name || '');
          utilityWeapons.push({
            port_name: l.port_name,
            name: l.name || '—',
            size: int(l.size),
            utility_type: uType,
            dps: r2(num(l.weapon_dps)),
            damage: r2(num(l.weapon_damage)),
            fire_rate: r2(num(l.weapon_fire_rate)),
            range: Math.round(num(l.weapon_range)),
          });
          continue;
        }
        const dps = num(l.weapon_dps);
        if (dps === 0) continue;
        totalDps += dps;
        totalBurstDps += num(l.weapon_burst_dps);
        totalSustainedDps += num(l.weapon_sustained_dps);
        weaponCount++;
        weapons.push({
          port_name: l.port_name,
          name: l.name || '—',
          size: int(l.size),
          grade: l.grade || '—',
          manufacturer: l.manufacturer_code || '',
          dps: r2(dps),
          alpha: r2(num(l.weapon_damage)),
          fire_rate: r2(num(l.weapon_fire_rate)),
          range: Math.round(num(l.weapon_range)),
          dmg_physical: r2(num(l.weapon_damage_physical)),
          dmg_energy: r2(num(l.weapon_damage_energy)),
          dmg_distortion: r2(num(l.weapon_damage_distortion)),
        });
      }
      if (l.type === 'Shield') {
        const hp = num(l.shield_hp),
          regen = num(l.shield_regen);
        totalShieldHp += hp;
        totalShieldRegen += regen;
        shieldCount++;
        shields.push({
          port_name: l.port_name,
          name: cleanName(l.name, 'Shield'),
          size: int(l.size),
          grade: l.grade || '—',
          manufacturer: l.manufacturer_code || '',
          hp: r2(hp),
          regen: r2(regen),
          regen_delay: r2(num(l.shield_regen_delay)),
          hardening: r4(num(l.shield_hardening)),
          time_to_charge: regen > 0 ? r1(hp / regen) : 0,
        });
      }
      if (l.type === 'Missile' || l.type === 'WeaponMissile') {
        const dmg = num(l.missile_damage);
        totalMissileDmg += dmg;
        missileCount++;
        missiles.push({
          port_name: l.port_name,
          name: cleanName(l.name, 'Missile'),
          size: int(l.size),
          damage: r2(dmg),
          speed: r2(num(l.missile_speed)),
          range: r2(num(l.missile_range)),
          lock_time: r2(num(l.missile_lock_time)),
          lock_signal: l.missile_signal_type || '',
          dmg_physical: r2(num(l.missile_damage_physical)),
          dmg_energy: r2(num(l.missile_damage_energy)),
          dmg_distortion: r2(num(l.missile_damage_distortion)),
        });
      }
      if (l.type === 'QuantumDrive') {
        qdSpeed = num(l.qd_speed);
        qdSpoolTime = num(l.qd_spool_time);
        qdCooldown = num(l.qd_cooldown);
        qdFuelRate = num(l.qd_fuel_rate);
        qdRange = num(l.qd_range);
        qdTuningRate = num(l.qd_tuning_rate);
        qdAlignmentRate = num(l.qd_alignment_rate);
        qdDisconnectRange = num(l.qd_disconnect_range);
        qdName = l.name || '';
      }
      if (l.type === 'EMP') {
        emps.push({
          port_name: l.port_name,
          name: cleanName(l.name, 'EMP'),
          size: int(l.size),
          damage: r2(num(l.emp_damage)),
          radius: r2(num(l.emp_radius)),
          charge_time: r2(num(l.emp_charge_time)),
          cooldown: r2(num(l.emp_cooldown)),
        });
      }
      if (l.type === 'QuantumInterdictionGenerator') {
        qigs.push({
          port_name: l.port_name,
          name: cleanName(l.name, 'QuantumInterdictionGenerator'),
          size: int(l.size),
          jammer_range: r2(num(l.qig_jammer_range)),
          snare_radius: r2(num(l.qig_snare_radius)),
          charge_time: r2(num(l.qig_charge_time)),
          cooldown: r2(num(l.qig_cooldown)),
        });
      }
      if (l.type === 'PowerPlant') {
        const o = num(l.power_output);
        totalPowerOutput += o;
        powerPlants.push({
          port_name: l.port_name,
          name: cleanName(l.name, 'PowerPlant'),
          size: int(l.size),
          grade: l.grade || '—',
          manufacturer: l.manufacturer_code || '',
          output: r2(o),
        });
      }
      if (l.type === 'Cooler') {
        const c = num(l.cooling_rate);
        totalCoolingRate += c;
        coolers.push({
          port_name: l.port_name,
          name: cleanName(l.name, 'Cooler'),
          size: int(l.size),
          grade: l.grade || '—',
          manufacturer: l.manufacturer_code || '',
          cooling_rate: r2(c),
        });
      }
      if (l.type === 'Countermeasure') {
        const ammo = int(l.cm_ammo_count);
        const isFlare = /flare|decoy/i.test(l.name || ''),
          isChaff = /chaff|noise/i.test(l.name || '');
        if (isFlare) cmFlare += ammo;
        if (isChaff) cmChaff += ammo;
        cms.push({
          port_name: l.port_name,
          name: cleanName(l.name, 'Countermeasure'),
          type: isFlare ? 'Flare' : isChaff ? 'Chaff' : 'Other',
          ammo_count: ammo,
        });
      }
      totalPowerDraw += num(l.power_draw);
      totalHeatGen += num(l.heat_generation);
    }

    const hullHp = num(ship.total_hp);
    const armorPhys = num(ship.armor_physical) || 1;
    const armorEnergy = num(ship.armor_energy) || 1;
    const avgArmor = (armorPhys + armorEnergy) / 2;
    const ehp = avgArmor > 0 ? r2(totalShieldHp + hullHp / avgArmor) : totalShieldHp + hullHp;

    return {
      weapons: {
        count: weaponCount,
        total_dps: r2(totalDps),
        total_burst_dps: r2(totalBurstDps),
        total_sustained_dps: r2(totalSustainedDps),
        details: weapons,
      },
      shields: {
        count: shieldCount,
        total_hp: r2(totalShieldHp),
        total_regen: r2(totalShieldRegen),
        time_to_charge: totalShieldRegen > 0 ? r1(totalShieldHp / totalShieldRegen) : 0,
        details: shields,
      },
      missiles: { count: missileCount, total_damage: r2(totalMissileDmg), details: missiles },
      power: {
        total_draw: r2(totalPowerDraw),
        total_output: r2(totalPowerOutput),
        balance: r2(totalPowerOutput - totalPowerDraw),
        details: powerPlants,
      },
      thermal: {
        total_heat_generation: r2(totalHeatGen),
        total_cooling_rate: r2(totalCoolingRate),
        balance: r2(totalCoolingRate - totalHeatGen),
        details: coolers,
      },
      quantum: {
        drive_name: cleanName(qdName, 'QuantumDrive'),
        speed: r2(qdSpeed),
        spool_time: r2(qdSpoolTime),
        cooldown: r2(qdCooldown),
        fuel_rate: r6(qdFuelRate),
        range: r2(qdRange),
        tuning_rate: r4(qdTuningRate),
        alignment_rate: r4(qdAlignmentRate),
        disconnect_range: r2(qdDisconnectRange),
        fuel_capacity: num(ship.quantum_fuel_capacity),
      },
      countermeasures: { flare_count: cmFlare, chaff_count: cmChaff, details: cms },
      emp: { count: emps.length, details: emps },
      quantum_interdiction: { count: qigs.length, details: qigs },
      utility: { count: utilityWeapons.length, details: utilityWeapons },
      signatures: { ir: num(ship.armor_signal_ir), em: num(ship.armor_signal_em), cs: num(ship.armor_signal_cs) },
      armor: {
        physical: num(ship.armor_physical),
        energy: num(ship.armor_energy),
        distortion: num(ship.armor_distortion),
        thermal: num(ship.armor_thermal),
      },
      mobility: {
        scm_speed: num(ship.scm_speed),
        max_speed: num(ship.max_speed),
        boost_forward: num(ship.boost_speed_forward),
        boost_backward: num(ship.boost_speed_backward),
        pitch: num(ship.pitch_max),
        yaw: num(ship.yaw_max),
        roll: num(ship.roll_max),
        mass: num(ship.mass),
      },
      fuel: { hydrogen: num(ship.hydrogen_fuel_capacity), quantum: num(ship.quantum_fuel_capacity) },
      hull: { total_hp: hullHp, ehp, cross_section_x: crossX, cross_section_y: crossY, cross_section_z: crossZ },
    };
  }
}
