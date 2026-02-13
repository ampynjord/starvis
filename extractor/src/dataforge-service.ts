/**
 * DataForge Service - Parses Star Citizen Game2.dcb binary DataForge files
 * Handles: binary parsing, struct/property resolution, GUID indexing, instance reading
 */
import { CryXmlNode, isCryXmlB, parseCryXml } from "./cryxml-parser.js";
import {
  type DataForgeData, DT_NAMES,
  getStructProperties, parseDataForge, readGuidAt,
  readInstance as readInstancePure,
} from "./dataforge-parser.js";
import logger from "./logger.js";
import { P4KProvider } from "./p4k-provider.js";

/** Manufacturer code → full name mapping (from SC game data prefixes) */
export const MANUFACTURER_CODES: Record<string, string> = {
  // Vehicle manufacturers (ship_matrix + P4K)
  AEGS: "Aegis Dynamics",
  ANVL: "Anvil Aerospace",
  ARGO: "ARGO Astronautics",
  BANU: "Banu",
  CNOU: "Consolidated Outland",
  CRUS: "Crusader Industries",
  DRAK: "Drake Interplanetary",
  ESPR: "Esperia",
  GAMA: "Gatac Manufacture",
  GLSN: "Grey's Market",
  GREY: "Grey's Market",
  GRIN: "Greycat Industrial",
  KRIG: "Kruger Intergalactic",
  MISC: "Musashi Industrial & Starflight Concern",
  MRAI: "Mirai",
  ORIG: "Origin Jumpworks",
  RSI:  "Roberts Space Industries",
  TMBL: "Tumbril Land Systems",
  VNCL: "Vanduul",
  XIAN: "Aopoa",
  XNAA: "Aopoa",
  // Component manufacturers (P4K only)
  AMRS: "Amon & Reese Co.",
  APAR: "Apocalypse Arms",
  BEHR: "Behring Applied Technology",
  BRRA: "Basilisk",
  GATS: "Gallenson Tactical Systems",
  HRST: "Hurston Dynamics",
  JOKR: "Joker Engineering",
  KBAR: "KnightBridge Arms",
  KLWE: "Klaus & Werner",
  KRON: "Kroneg",
  MXOX: "MaxOx",
  NOVP: "Nova Pyrotechnik",
  PRAR: "Preacher Armaments",
  TALN: "Talon",
  TOAG: "Thermyte Concern",
};

export class DataForgeService {
  private provider: P4KProvider | null = null;
  private dcbBuffer: Buffer | null = null;
  private dfData: DataForgeData | null = null;
  private vehicleIndex = new Map<string, { uuid: string; name: string; className: string }>();
  private guidIndex = new Map<string, string>();

  constructor(private p4kPath: string) {}

  async init(): Promise<void> {
    logger.info('Init P4K service...', { module: 'dataforge' });
    this.provider = new P4KProvider(this.p4kPath);
    await this.provider.open();
    logger.info('P4K ready', { module: 'dataforge' });
  }

  async close(): Promise<void> {
    if (this.provider) { await this.provider.close(); this.provider = null; }
  }

  async loadDataForge(onProgress?: (m: string) => void) {
    if (!this.provider) throw new Error("Service not init");
    onProgress?.("Loading Game2.dcb...");
    await this.provider.loadAllEntries((c, t) => { if (c % 100000 === 0) onProgress?.(`Loading: ${c.toLocaleString()}/${t.toLocaleString()}`); });
    const dcbEntry = await this.provider.getEntry("Data\\Game2.dcb");
    if (!dcbEntry) throw new Error("Game2.dcb not found");
    onProgress?.(`Game2.dcb found (${(dcbEntry.uncompressedSize / 1024 / 1024).toFixed(1)} MB)`);
    this.dcbBuffer = await this.provider.readFileFromEntry(dcbEntry);
    onProgress?.("Parsing DataForge...");
    this.dfData = parseDataForge(this.dcbBuffer);
    this.buildVehicleIndex();
    return {
      version: this.dfData.header.version,
      structCount: this.dfData.header.structDefinitionCount,
      recordCount: this.dfData.header.recordDefinitionCount,
      vehicleCount: this.vehicleIndex.size
    };
  }

  isDataForgeLoaded() { return this.dfData !== null; }

  getVersion(): string {
    return this.dfData?.header?.version?.toString() || 'unknown';
  }

  // ============ P4K file access ============

  async findFiles(pattern: string, limit = 100) {
    if (!this.provider) throw new Error("Not init");
    return this.provider.findFiles(new RegExp(pattern, "i"), limit);
  }

  async getP4KStats() {
    if (!this.provider) throw new Error("Not init");
    const s = await this.provider.getStats();
    return { ...s, compressionRatio: 1 - s.compressedSize / s.totalSize };
  }

  async readFile(path: string): Promise<Buffer | null> {
    if (!this.provider) throw new Error("Not init");
    const entry = await this.provider.getEntry(path);
    if (!entry) return null;
    return this.provider.readFileFromEntry(entry);
  }

  // ============ Vehicle & GUID lookups ============

  getVehicleUUID(className: string): string | undefined {
    const lowerName = className.toLowerCase();
    return this.vehicleIndex.get(lowerName)?.uuid;
  }

  getVehicleDefinitions(): Map<string, { uuid: string; name: string; className: string }> {
    return this.vehicleIndex;
  }

  resolveGuid(guid: string): string | undefined {
    if (!guid || guid === '00000000-0000-0000-0000-000000000000') return undefined;
    return this.guidIndex.get(guid);
  }

  readRecordByGuid(guid: string, maxDepth = 4): Record<string, any> | null {
    if (!this.dfData || !this.dcbBuffer || !guid || guid === '00000000-0000-0000-0000-000000000000') return null;
    const record = this.dfData.records.find((r: any) => r.id === guid);
    if (!record) return null;
    return this.readInstance(record.structIndex, record.instanceIndex, 0, maxDepth);
  }

  searchRecords(pattern: string, limit = 100) {
    if (!this.dfData) throw new Error("DataForge not loaded");
    const rx = new RegExp(pattern, "i"), res: any[] = [];
    for (const r of this.dfData.records) {
      if (rx.test(r.fileName) || rx.test(r.name)) {
        res.push({
          name: r.name, fileName: r.fileName, uuid: r.id,
          structType: this.dfData.structDefs[r.structIndex]?.name || "Unknown",
          structIndex: r.structIndex, instanceIndex: r.instanceIndex
        });
        if (res.length >= limit) break;
      }
    }
    return res;
  }

  searchByStructType(type: string, limit = 100) {
    if (!this.dfData) throw new Error("DataForge not loaded");
    const rx = new RegExp(type, "i"), res: any[] = [];
    for (let i = 0; i < this.dfData.structDefs.length; i++) {
      if (rx.test(this.dfData.structDefs[i].name)) {
        for (const r of this.dfData.records) {
          if (r.structIndex === i) {
            res.push({ name: r.name, fileName: r.fileName, uuid: r.id, structType: this.dfData.structDefs[i].name });
            if (res.length >= limit) break;
          }
        }
      }
    }
    return res;
  }

  getStructTypes(): string[] {
    if (!this.dfData) throw new Error("DataForge not loaded");
    return this.dfData.structDefs.map((s: any) => s.name);
  }

  /** Debug: inspect struct property definitions with data types */
  debugStructProperties(structName: string): any[] {
    if (!this.dfData) throw new Error("DataForge not loaded");
    const idx = this.dfData.structDefs.findIndex((s: any) => s.name === structName);
    if (idx === -1) return [];
    const props = getStructProperties(this.dfData, idx);
    return props.map((p: any) => ({
      name: p.name,
      dataType: DT_NAMES[p.dataType] || `0x${p.dataType.toString(16)}`,
      conversionType: p.conversionType,
      structIndex: p.structIndex,
    }));
  }

  /** Debug: inspect a single entity's VehicleComponentParams */
  debugVehicleParams(className: string): any {
    if (!this.dfData || !this.dcbBuffer) return null;
    const record = this.findEntityRecord(className);
    if (!record) return { error: 'Entity not found' };
    const data = this.readInstance(record.structIndex, record.instanceIndex, 0, 8);
    if (!data?.Components) return { error: 'No Components' };
    for (const comp of data.Components) {
      if (comp?.__type === 'VehicleComponentParams') {
        return { vehicleParams: comp, keys: Object.keys(comp) };
      }
    }
    return { error: 'VehicleComponentParams not found', componentTypes: data.Components.map((c: any) => c?.__type).filter(Boolean) };
  }

  /** Debug: inspect a record by GUID at high depth */
  debugRecordByGuid(guid: string): any {
    return this.readRecordByGuid(guid, 8);
  }

  /** Debug: inspect a component SCItem by class_name */
  debugComponent(className: string): any {
    if (!this.dfData || !this.dcbBuffer) return null;
    const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
    for (const r of this.dfData.records) {
      if (r.structIndex !== entityClassIdx) continue;
      const name = r.name?.replace('EntityClassDefinition.', '') || '';
      if (name.toLowerCase() === className.toLowerCase()) {
        return this.readInstance(r.structIndex, r.instanceIndex, 0, 8);
      }
    }
    return { error: 'Not found' };
  }

  findEntityRecord(entityClassName: string): any | null {
    if (!this.dfData) return null;
    const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
    if (entityClassIdx === -1) return null;
    for (const r of this.dfData.records) {
      if (r.structIndex === entityClassIdx) {
        const name = r.name?.replace('EntityClassDefinition.', '') || '';
        if (name === entityClassName) return r;
      }
    }
    const lc = entityClassName.toLowerCase();
    for (const r of this.dfData.records) {
      if (r.structIndex === entityClassIdx) {
        const name = (r.name || '').toLowerCase();
        if (name.includes(lc)) return r;
      }
    }
    return null;
  }

  /**
   * Find all variant _PU entities for a given base class name.
   * Entity names in DataForge use pattern: {className}_{variant}_PU_AI_{faction}
   * E.g. "RSI_Aurora_MR_PU_AI_CIV", "DRAK_Cutlass_Black_PU_AI_CIV"
   * Returns deduplicated list of full entity names, one per variant base.
   * Prefers _PU_AI_CIV > _PU_AI_UEE > any other _PU variant.
   */
  findVariantPUEntities(className: string): string[] {
    if (!this.dfData) return [];
    const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
    if (entityClassIdx === -1) return [];
    const prefix = className + '_';
    // Regex to find _PU as a segment: _PU at end or _PU_ followed by more
    const puSegmentRegex = /_PU($|_)/;
    
    // Collect all matching entities, grouped by variant base (part before _PU)
    const variantMap = new Map<string, string[]>(); // variantBase → [fullNames]
    for (const r of this.dfData.records) {
      if (r.structIndex === entityClassIdx) {
        const name = r.name?.replace('EntityClassDefinition.', '') || '';
        if (name.startsWith(prefix) && puSegmentRegex.test(name)) {
          // Extract variant base: everything between className_ and _PU
          const puIdx = name.indexOf('_PU');
          const variantBase = name.slice(0, puIdx + 3); // e.g. "RSI_Aurora_MR_PU"
          if (!variantMap.has(variantBase)) variantMap.set(variantBase, []);
          variantMap.get(variantBase)!.push(name);
        }
      }
    }
    
    // For each variant base, pick the best entity (prefer _PU exact, then _PU_AI_CIV, then first)
    const results: string[] = [];
    for (const [base, names] of variantMap) {
      const exact = names.find(n => n === base);
      const civ = names.find(n => n.endsWith('_AI_CIV'));
      const uee = names.find(n => n.endsWith('_AI_UEE'));
      results.push(exact || civ || uee || names[0]);
    }
    return results;
  }

  /**
   * Resolve the best entity name for a ship, trying variant _PU entities if needed.
   * Returns { baseEntity, loadoutEntity, vehicleXmlName }
   */
  resolveShipEntities(className: string, shipName?: string): { baseEntity: string; loadoutEntity: string; vehicleXmlName: string } {
    const result = { baseEntity: className, loadoutEntity: className, vehicleXmlName: className };

    // Check if base entity has a meaningful loadout (not just a few entries)
    const baseRecord = this.findEntityRecord(className);
    let baseLoadoutCount = 0;
    if (baseRecord) {
      const baseData = this.readInstance(baseRecord.structIndex, baseRecord.instanceIndex, 0, 3);
      if (baseData?.Components) {
        const loadoutComp = baseData.Components.find((c: any) => c?.__type === 'SEntityComponentDefaultLoadoutParams');
        baseLoadoutCount = loadoutComp?.loadout?.entries?.length ?? 0;
        // A real ship loadout has 20+ entries (flight controller, armor, shield, weapons, etc.)
        // Some base entities have 1-5 entries that are just seat/cargo/misc items
        const hasMeaningfulLoadout = baseLoadoutCount >= 20;
        if (hasMeaningfulLoadout) return result;
      }
    } else {
    }

    // Try className_PU (exact or fuzzy via findEntityRecord which handles AI suffixes)
    const puName = className + '_PU';
    const puRecord = this.findEntityRecord(puName);
    if (puRecord) {
      // findEntityRecord may have found className_PU_AI_CIV via fuzzy match - that's OK
      const puData = this.readInstance(puRecord.structIndex, puRecord.instanceIndex, 0, 3);
      if (puData?.Components) {
        const loadoutComp = puData.Components.find((c: any) => c?.__type === 'SEntityComponentDefaultLoadoutParams');
        const hasLoadout = loadoutComp && loadoutComp.loadout?.entries?.length > 0;
        if (hasLoadout) {
          result.loadoutEntity = puName;
          return result;
        }
      }
    } else {
      // Try className_PU_AI_CIV explicitly
      const civName = className + '_PU_AI_CIV';
      const civRecord = this.findEntityRecord(civName);
      if (civRecord) {
        const civData = this.readInstance(civRecord.structIndex, civRecord.instanceIndex, 0, 3);
        if (civData?.Components) {
          const loadoutComp = civData.Components.find((c: any) => c?.__type === 'SEntityComponentDefaultLoadoutParams');
          const hasLoadout = loadoutComp && loadoutComp.loadout?.entries?.length > 0;
          if (hasLoadout) {
            result.loadoutEntity = civName;
            return result;
          }
        }
      }
    }

    // Search variant _PU entities and score against ship name
    if (shipName) {
      const variants = this.findVariantPUEntities(className);
      if (variants.length > 0) {
        // Score each variant against the ship name
        const shipWords = shipName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
        let bestVariant = '';
        let bestScore = 0;

        for (const variant of variants) {
          // Extract the variant-specific part between className_ and _PU
          // e.g. "RSI_Aurora_MR_PU_AI_CIV" → "MR"
          const puIdx = variant.indexOf('_PU');
          const variantPart = variant.slice(className.length + 1, puIdx); // "MR" from "RSI_Aurora_MR_PU_AI_CIV"
          if (!variantPart) continue; // Skip if no variant part (it's just className_PU_...)
          const variantWords = variantPart.toLowerCase().split('_').filter(w => w.length > 0);

          let score = 0;
          for (const vw of variantWords) {
            for (const sw of shipWords) {
              if (sw === vw) { score += 3; break; }
              if (sw.includes(vw) || vw.includes(sw)) { score += 1; break; }
              // Handle variants like "F7CM" matching "f7c-m" → "f7cm"
              const swClean = sw.replace(/[^a-z0-9]/g, '');
              if (swClean === vw || vw === swClean) { score += 2; break; }
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestVariant = variant;
          }
        }

        if (bestVariant) {
          result.loadoutEntity = bestVariant;
          // Vehicle XML name: extract base variant (strip AI suffix)
          const puIdx = bestVariant.indexOf('_PU');
          result.vehicleXmlName = bestVariant.slice(0, puIdx);
          return result;
        }

        // If no scoring match (e.g. no variant-specific word in ship name),
        // check if there's only one unique variant base - use it
        const uniqueBases = new Set(variants.map(v => {
          const pi = v.indexOf('_PU');
          return v.slice(className.length + 1, pi);
        }).filter(v => v.length > 0));
        
        if (uniqueBases.size === 1) {
          result.loadoutEntity = variants[0];
          const puIdx = variants[0].indexOf('_PU');
          result.vehicleXmlName = variants[0].slice(0, puIdx);
          return result;
        }
      }
    }

    return result;
  }

  readRecordInstance(recordIndex: number, maxDepth = 3): Record<string, any> | null {
    if (!this.dfData) return null;
    const rec = this.dfData.records[recordIndex];
    if (!rec) return null;
    return this.readInstance(rec.structIndex, rec.instanceIndex, 0, maxDepth);
  }

  // ============ DataForge Instance Reader (delegated to dataforge-parser.ts) ============

  readInstance(structIndex: number, variantIndex: number, depth = 0, maxDepth = 3): Record<string, any> | null {
    if (!this.dfData || !this.dcbBuffer) return null;
    return readInstancePure(this.dfData, this.dcbBuffer, structIndex, variantIndex, depth, maxDepth);
  }

  // ============ Index builders ============

  /** Known manufacturer prefixes for ships/vehicles (all legit vehicles start with one of these) */
  private static readonly KNOWN_VEHICLE_PREFIXES = new Set([
    'AEGS', 'ANVL', 'ARGO', 'BANU', 'CNOU', 'CRUS', 'DRAK', 'ESPR',
    'GAMA', 'GLSN', 'GREY', 'GRIN', 'KRIG', 'MISC', 'MRAI', 'ORIG', 'RSI', 'TMBL',
    'VNCL', 'XIAN', 'XNAA',
  ]);

  /** Explicit non-vehicle entity patterns to reject from the vehicle index */
  private static readonly NON_VEHICLE_PATTERNS = [
    /^ammobox/i, /^rotationsimple/i, /^storall/i, /^probe_/i,
    /^vehicleitemdebris/i, /^eaobjectivedestructable/i, /^orbital_sentry/i,
    /^softlock/i, /^npc\s/i, /^npc_/i, /^ammocrate/i,
  ];

  private buildVehicleIndex() {
    if (!this.dfData) return;
    const entityClassDefIndex = this.dfData.structDefs.findIndex((s: any) => s.name === "EntityClassDefinition");

    for (const r of this.dfData.records) {
      if (r.structIndex !== entityClassDefIndex) continue;
      const isVehicle = r.fileName?.includes('/spaceships/') || r.fileName?.includes('/groundvehicles/') ||
        (r.fileName?.includes('/actor/actors/') && r.name?.includes('ARGO_ATLS'));
      if (!isVehicle) continue;
      const className = r.name?.replace('EntityClassDefinition.', '') || '';
      if (!className) continue;
      const lowerName = className.toLowerCase();
      if (lowerName.includes('_ai_') || lowerName.includes('_test') || lowerName.includes('_template') ||
          lowerName.includes('_unmanned') || lowerName.includes('_indestructible') || lowerName.includes('_prison')) continue;

      // Reject non-vehicle entities (debris, probes, ammo boxes, storage, etc.)
      if (DataForgeService.NON_VEHICLE_PATTERNS.some(rx => rx.test(className))) continue;

      // Require a known manufacturer prefix (all real ships/vehicles have one)
      const prefixMatch = className.match(/^([A-Z]{2,5})_/);
      if (!prefixMatch || !DataForgeService.KNOWN_VEHICLE_PREFIXES.has(prefixMatch[1])) continue;

      this.vehicleIndex.set(className.toLowerCase(), { uuid: r.id, name: r.name, className });
    }
    logger.info(`Built vehicle index: ${this.vehicleIndex.size} vehicles`, { module: 'dataforge' });

    // GUID index for ALL records (weapons, ammo, gimbals, etc.)
    const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
    for (let i = 0; i < this.dfData.records.length; i++) {
      const r = this.dfData.records[i];
      if (r.id && r.id !== ZERO_GUID) {
        const className = r.structIndex === entityClassDefIndex ? (r.name?.replace('EntityClassDefinition.', '') || '') : '';
        this.guidIndex.set(r.id, className || r.name || `RECORD_${i}`);
      }
    }
    logger.info(`Built GUID index: ${this.guidIndex.size} record GUIDs`, { module: 'dataforge' });
  }

  // ============ Component extraction (from DataForge SCItem records) ============

  extractAllComponents(): any[] {
    if (!this.dfData || !this.dcbBuffer) return [];
    const components: any[] = [];
    const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
    if (entityClassIdx === -1) return [];

    const componentPaths: Record<string, RegExp> = {
      'WeaponGun':     /scitem.*weapons\/[^\/\\]+$/i,
      'Shield':        /shield_?generator[s]?[\/\\]|shield[s]?[\/\\]/i,
      'PowerPlant':    /power_?plant[s]?[\/\\]|powerplant/i,
      'Cooler':        /cooler[s]?[\/\\]/i,
      'QuantumDrive':  /quantum_?drive[s]?[\/\\]|quantumdrive/i,
      'Missile':       /missile[s]?[\/\\](?!rack|launcher|_rack)/i,
      'Thruster':      /thruster[s]?[\/\\]/i,
      'Radar':         /radar[s]?[\/\\]/i,
      'Countermeasure': /countermeasure[s]?[\/\\]|flare[s]?[\/\\]|noise[\/\\]/i,
      'FuelIntake':    /fuel_?intake[s]?[\/\\]/i,
      'FuelTank':      /fuel_?tank[s]?[\/\\](?!quantum)/i,
      'LifeSupport':   /life_?support[s]?[\/\\]/i,
      'EMP':           /emp[\/\\]|distortion_?charge[\/\\]|emp_?generator/i,
      'QuantumInterdictionGenerator': /quantum_?interdiction[\/\\]|qig[\/\\]|quantum_?enforcement/i,
    };

    let scanned = 0;
    for (const r of this.dfData.records) {
      if (r.structIndex !== entityClassIdx) continue;
      const fn = (r.fileName || '').toLowerCase();
      if (!fn.includes('scitem') && !fn.includes('/weapon/') && !fn.includes('/missile/') && !fn.includes('/systems/')) continue;
      let type: string | null = null;
      for (const [t, rx] of Object.entries(componentPaths)) { if (rx.test(fn)) { type = t; break; } }
      if (!type) continue;
      scanned++;
      try {
        const data = this.readInstance(r.structIndex, r.instanceIndex, 0, 4);
        if (!data) continue;
        const className = r.name?.replace('EntityClassDefinition.', '') || '';
        if (!className) continue;
        const lcName = className.toLowerCase();
        if (lcName.includes('_test') || lcName.startsWith('test_') ||
            lcName.includes('_debug') || lcName.includes('_template') ||
            lcName.includes('_indestructible') || lcName.includes('_npc_only') ||
            lcName.includes('_placeholder') || lcName.includes('contestedzonereward') ||
            lcName.startsWith('display_')) continue;

        // Skip FPS weapons (personal weapons, not ship components)
        if (type === 'WeaponGun') {
          const isFpsWeapon = /(?:^|\b|_)(rifles?|pistols?|smg|shotgun|sniper|multitool|lmg|grenade_launcher)(?:_|\b|$)/i.test(lcName);
          if (isFpsWeapon) continue;
        }

        const comp: any = { uuid: r.id, className, name: className.replace(/_/g, ' '), type };
        const comps = data.Components;
        if (!Array.isArray(comps)) continue;

        for (const c of comps) {
          if (!c || typeof c !== 'object' || !c.__type) continue;
          const cType = c.__type as string;

          if (cType === 'SAttachableComponentParams') {
            const ad = c.AttachDef;
            if (ad && typeof ad === 'object') {
              if (typeof ad.Size === 'number') comp.size = ad.Size;
              if (typeof ad.Grade === 'number') comp.grade = String.fromCharCode(65 + ad.Grade);
              const loc = ad.Localization;
              if (loc?.Name && typeof loc.Name === 'string') {
                if (!loc.Name.startsWith('LOC_') && !loc.Name.startsWith('@')) {
                  comp.name = loc.Name;
                } else {
                  // LOC key: resolve to a readable name from className
                  comp.name = DataForgeService.resolveComponentName(className);
                }
              }
              if (typeof ad.Manufacturer === 'string' && ad.Manufacturer) comp.manufacturer = ad.Manufacturer;
            }
          }
          if (cType === 'EntityComponentPowerConnection') {
            if (typeof c.PowerBase === 'number') comp.powerBase = Math.round(c.PowerBase * 100) / 100;
            if (typeof c.PowerDraw === 'number') {
              if (type === 'PowerPlant') comp.powerOutput = Math.round(c.PowerDraw * 100) / 100;
              comp.powerDraw = Math.round(c.PowerDraw * 100) / 100;
            }
          }
          if (cType === 'EntityComponentHeatConnection') {
            if (typeof c.ThermalEnergyBase === 'number') comp.heatGeneration = Math.round(c.ThermalEnergyBase * 100) / 100;
            if (typeof c.ThermalEnergyDraw === 'number') comp.heatGeneration = Math.round(c.ThermalEnergyDraw * 100) / 100;
          }
          if (cType === 'SHealthComponentParams') {
            if (typeof c.Health === 'number' && c.Health > 0) comp.hp = Math.round(c.Health);
          }

          // Weapon fire rate
          if (cType === 'SCItemWeaponComponentParams') {
            const fireActions = c.fireActions;
            if (Array.isArray(fireActions) && fireActions.length > 0) {
              const pa = fireActions[0];
              if (pa && typeof pa === 'object') {
                if (typeof pa.fireRate === 'number') comp.weaponFireRate = Math.round(pa.fireRate * 100) / 100;
                if (typeof pa.heatPerShot === 'number') comp.weaponHeatPerShot = Math.round(pa.heatPerShot * 100000) / 100000;
                const lp = pa.launchParams;
                if (lp && typeof lp === 'object') {
                  if (typeof lp.pelletCount === 'number') comp.weaponPelletsPerShot = lp.pelletCount;
                }
                // Sequence fire actions
                if (!comp.weaponFireRate && Array.isArray(pa.sequenceEntries)) {
                  let totalFR = 0;
                  for (const se of pa.sequenceEntries) {
                    const wa = se?.weaponAction;
                    if (wa && typeof wa.fireRate === 'number') totalFR += wa.fireRate;
                    if (!comp.weaponHeatPerShot && typeof wa?.heatPerShot === 'number') comp.weaponHeatPerShot = Math.round(wa.heatPerShot * 100000) / 100000;
                    if (!comp.weaponPelletsPerShot && wa?.launchParams?.pelletCount) comp.weaponPelletsPerShot = wa.launchParams.pelletCount;
                  }
                  if (totalFR > 0) comp.weaponFireRate = Math.round(totalFR * 100) / 100;
                }
              }
            }
            // Legacy
            if (c.weaponAction && typeof c.weaponAction === 'object' && !comp.weaponFireRate) {
              if (typeof c.weaponAction.fireRate === 'number') comp.weaponFireRate = Math.round(c.weaponAction.fireRate * 100) / 100;
            }
          }

          if (cType === 'SCItemWeaponGunParams' || cType === 'SCItemGunParams') {
            if (typeof c.ammoContainerRecord === 'string') {
              if (c.ammoContainerRecord.toLowerCase().includes('ballistic')) comp.subType = 'Ballistic';
              else if (c.ammoContainerRecord.toLowerCase().includes('energy')) comp.subType = 'Energy';
              else if (c.ammoContainerRecord.toLowerCase().includes('distortion')) comp.subType = 'Distortion';
            }
          }

          // Ammo damage resolution via GUID
          if (cType === 'SAmmoContainerComponentParams') {
            if (typeof c.maxAmmoCount === 'number') comp.weaponAmmoCount = c.maxAmmoCount;
            if (typeof c.initialAmmoCount === 'number' && !comp.weaponAmmoCount) comp.weaponAmmoCount = c.initialAmmoCount;
            const ammoGuid = c.ammoParamsRecord?.__ref;
            if (ammoGuid) {
              try {
                const ammoData = this.readRecordByGuid(ammoGuid, 5);
                if (ammoData) {
                  // SC 4.x: speed and lifetime are TOP-LEVEL on ammoData, not inside projectileParams
                  if (typeof ammoData.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(ammoData.speed * 100) / 100;
                  if (typeof ammoData.lifetime === 'number' && comp.weaponSpeed) comp.weaponRange = Math.round(ammoData.lifetime * comp.weaponSpeed * 100) / 100;

                  const pp = ammoData.projectileParams;
                  if (pp && typeof pp === 'object') {
                    // Direct hit damage from projectileParams.damage
                    const dmg = pp.damage;
                    let physical = 0, energy = 0, distortion = 0, thermal = 0, biochemical = 0, stun = 0;
                    if (dmg && typeof dmg === 'object') {
                      physical = typeof dmg.DamagePhysical === 'number' ? dmg.DamagePhysical : 0;
                      energy = typeof dmg.DamageEnergy === 'number' ? dmg.DamageEnergy : 0;
                      distortion = typeof dmg.DamageDistortion === 'number' ? dmg.DamageDistortion : 0;
                      thermal = typeof dmg.DamageThermal === 'number' ? dmg.DamageThermal : 0;
                      biochemical = typeof dmg.DamageBiochemical === 'number' ? dmg.DamageBiochemical : 0;
                      stun = typeof dmg.DamageStun === 'number' ? dmg.DamageStun : 0;
                    }

                    // SC 4.x: Distortion/explosive weapons store real damage in detonationParams.explosionParams.damage
                    // (direct hit damage is often 0 or 0.0001 placeholder)
                    const detDmg = pp.detonationParams?.explosionParams?.damage;
                    if (detDmg && typeof detDmg === 'object') {
                      const dp = typeof detDmg.DamagePhysical === 'number' ? detDmg.DamagePhysical : 0;
                      const de = typeof detDmg.DamageEnergy === 'number' ? detDmg.DamageEnergy : 0;
                      const dd = typeof detDmg.DamageDistortion === 'number' ? detDmg.DamageDistortion : 0;
                      const dt = typeof detDmg.DamageThermal === 'number' ? detDmg.DamageThermal : 0;
                      const db = typeof detDmg.DamageBiochemical === 'number' ? detDmg.DamageBiochemical : 0;
                      const ds = typeof detDmg.DamageStun === 'number' ? detDmg.DamageStun : 0;
                      // Use the higher value for each damage type (detonation replaces placeholder direct hit)
                      physical = Math.max(physical, dp);
                      energy = Math.max(energy, de);
                      distortion = Math.max(distortion, dd);
                      thermal = Math.max(thermal, dt);
                      biochemical = Math.max(biochemical, db);
                      stun = Math.max(stun, ds);
                    }

                    const totalDmg = physical + energy + distortion + thermal + biochemical + stun;
                    if (totalDmg > 0) {
                      comp.weaponDamage = Math.round(totalDmg * 10000) / 10000;
                      comp.weaponDamagePhysical = Math.round(physical * 10000) / 10000;
                      comp.weaponDamageEnergy = Math.round(energy * 10000) / 10000;
                      comp.weaponDamageDistortion = Math.round(distortion * 10000) / 10000;
                      comp.weaponDamageThermal = Math.round(thermal * 10000) / 10000;
                      comp.weaponDamageBiochemical = Math.round(biochemical * 10000) / 10000;
                      comp.weaponDamageStun = Math.round(stun * 10000) / 10000;
                      const dtypes: [string, number][] = [['physical', physical], ['energy', energy], ['distortion', distortion], ['thermal', thermal], ['biochemical', biochemical], ['stun', stun]];
                      comp.weaponDamageType = dtypes.sort((a, b) => b[1] - a[1])[0][0];
                    }

                    // Fallback: speed/lifetime from projectileParams (older format)
                    if (typeof pp.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(pp.speed * 100) / 100;
                    if (typeof pp.lifetime === 'number' && comp.weaponSpeed && !comp.weaponRange) comp.weaponRange = Math.round(pp.lifetime * comp.weaponSpeed * 100) / 100;
                  }
                }
              } catch (e) { /* ammo resolution — non-critical */ }
            }
          }

          // Shield
          if (cType === 'SCItemShieldGeneratorParams') {
            if (typeof c.MaxShieldHealth === 'number') comp.shieldHp = Math.round(c.MaxShieldHealth * 100) / 100;
            if (typeof c.MaxShieldRegen === 'number') comp.shieldRegen = Math.round(c.MaxShieldRegen * 10000) / 10000;
            if (typeof c.DamagedRegenDelay === 'number') comp.shieldRegenDelay = Math.round(c.DamagedRegenDelay * 100) / 100;
            if (typeof c.Hardening === 'number') comp.shieldHardening = Math.round(c.Hardening * 10000) / 10000;
            if (typeof c.MaxReallocation === 'number') comp.shieldFaces = c.MaxReallocation > 0 ? 6 : 2;
            if (typeof c.ShieldMaxHealth === 'number' && !comp.shieldHp) comp.shieldHp = Math.round(c.ShieldMaxHealth * 100) / 100;
            if (typeof c.ShieldRegenRate === 'number' && !comp.shieldRegen) comp.shieldRegen = Math.round(c.ShieldRegenRate * 10000) / 10000;
          }

          // Power plant
          if (cType === 'SCItemPowerPlantParams') {
            if (typeof c.MaxPower === 'number') comp.powerOutput = Math.round(c.MaxPower * 100) / 100;
            if (typeof c.PowerOutput === 'number' && !comp.powerOutput) comp.powerOutput = Math.round(c.PowerOutput * 100) / 100;
          }

          // Cooler
          if (cType === 'SCItemCoolerParams') {
            if (typeof c.CoolingRate === 'number') comp.coolingRate = Math.round(c.CoolingRate * 100) / 100;
            if (typeof c.MaxCoolingRate === 'number' && !comp.coolingRate) comp.coolingRate = Math.round(c.MaxCoolingRate * 100) / 100;
          }

          // Quantum drive
          if (cType === 'SCItemQuantumDriveParams') {
            // Top-level properties (SC 4.x structure: params nested under c.params)
            if (typeof c.quantumFuelRequirement === 'number') comp.qdFuelRate = c.quantumFuelRequirement;
            if (typeof c.disconnectRange === 'number') comp.qdDisconnectRange = Math.round(c.disconnectRange * 100) / 100;
            // jumpRange is often Float.MAX (3.4e38) = unlimited, skip if too large
            if (typeof c.jumpRange === 'number' && c.jumpRange < 1e30) comp.qdRange = Math.round(c.jumpRange * 100) / 100;

            // Main drive params are nested under c.params (SQuantumDriveParams)
            const params = c.params;
            if (params && typeof params === 'object') {
              if (typeof params.driveSpeed === 'number') comp.qdSpeed = Math.round(params.driveSpeed * 100) / 100;
              if (typeof params.spoolUpTime === 'number') comp.qdSpoolTime = Math.round(params.spoolUpTime * 100) / 100;
              if (typeof params.cooldownTime === 'number') comp.qdCooldown = Math.round(params.cooldownTime * 100) / 100;
              if (typeof params.stageOneAccelRate === 'number') comp.qdStage1Accel = Math.round(params.stageOneAccelRate * 100) / 100;
              if (typeof params.stageTwoAccelRate === 'number') comp.qdStage2Accel = Math.round(params.stageTwoAccelRate * 100) / 100;
            }
            // Fallback: flat properties (older DataForge format)
            if (typeof c.driveSpeed === 'number' && !comp.qdSpeed) comp.qdSpeed = Math.round(c.driveSpeed * 100) / 100;
            if (typeof c.spoolUpTime === 'number' && !comp.qdSpoolTime) comp.qdSpoolTime = Math.round(c.spoolUpTime * 100) / 100;
            if (typeof c.cooldownTime === 'number' && !comp.qdCooldown) comp.qdCooldown = Math.round(c.cooldownTime * 100) / 100;

            // Jump params (alternate structure)
            const jp = c.jumpParams || c.JumpParams;
            if (jp && typeof jp === 'object') {
              if (typeof jp.Stage1AccelerationRate === 'number' && !comp.qdStage1Accel) comp.qdStage1Accel = Math.round(jp.Stage1AccelerationRate * 100) / 100;
              if (typeof jp.Stage2AccelerationRate === 'number' && !comp.qdStage2Accel) comp.qdStage2Accel = Math.round(jp.Stage2AccelerationRate * 100) / 100;
            }
            // Spline jump params (separate drive params for spline travel mode)
            // Note: tuningRate/alignmentRate don't exist in current DataForge; splineJumpParams is just another SQuantumDriveParams
            const sjp = c.splineJumpParams || c.SplineJumpParams;
            if (sjp && typeof sjp === 'object') {
              // splineJumpParams.driveSpeed = spline mode speed (lower than main QD speed)
              if (typeof sjp.driveSpeed === 'number') comp.qdTuningRate = Math.round(sjp.driveSpeed * 100) / 100;
              if (typeof sjp.stageOneAccelRate === 'number') comp.qdAlignmentRate = Math.round(sjp.stageOneAccelRate * 100) / 100;
            }
          }

          // Missile - extract from SCItemMissileParams (explosionParams.damage, GCSParams, targetingParams)
          if (cType === 'SCItemMissileParams') {
            // Damage from explosionParams.damage (DamageInfo struct)
            const ep = c.explosionParams;
            if (ep && typeof ep === 'object') {
              const dmg = ep.damage;
              if (dmg && typeof dmg === 'object') {
                const physical = typeof dmg.DamagePhysical === 'number' ? dmg.DamagePhysical : 0;
                const energy = typeof dmg.DamageEnergy === 'number' ? dmg.DamageEnergy : 0;
                const distortion = typeof dmg.DamageDistortion === 'number' ? dmg.DamageDistortion : 0;
                const thermal = typeof dmg.DamageThermal === 'number' ? dmg.DamageThermal : 0;
                const biochemical = typeof dmg.DamageBiochemical === 'number' ? dmg.DamageBiochemical : 0;
                const stun = typeof dmg.DamageStun === 'number' ? dmg.DamageStun : 0;
                const total = physical + energy + distortion + thermal + biochemical + stun;
                if (total > 0) {
                  comp.missileDamage = Math.round(total * 100) / 100;
                  comp.missileDamagePhysical = Math.round(physical * 100) / 100;
                  comp.missileDamageEnergy = Math.round(energy * 100) / 100;
                  comp.missileDamageDistortion = Math.round(distortion * 100) / 100;
                }
              }
            }
            // Speed from GCSParams
            const gcs = c.GCSParams;
            if (gcs && typeof gcs === 'object') {
              if (typeof gcs.linearSpeed === 'number') comp.missileSpeed = Math.round(gcs.linearSpeed * 100) / 100;
            }
            // Targeting from targetingParams
            const tp = c.targetingParams;
            if (tp && typeof tp === 'object') {
              if (typeof tp.lockTime === 'number') comp.missileLockTime = Math.round(tp.lockTime * 100) / 100;
              if (typeof tp.trackingSignalType === 'string') comp.missileSignalType = tp.trackingSignalType;
              if (typeof tp.lockRangeMax === 'number') comp.missileLockRange = Math.round(tp.lockRangeMax * 100) / 100;
              if (typeof tp.lockRangeMin === 'number') comp.missileRange = Math.round(tp.lockRangeMin * 100) / 100;
            }
          }

          // Projectile params
          if (cType === 'SProjectile' || cType === 'SCItemProjectileParams') {
            const bDmg = c.bulletImpactDamage || c.damage;
            if (bDmg && typeof bDmg === 'object') {
              const dt = Object.entries(bDmg).find(([k, v]) => typeof v === 'number' && (v as number) > 0);
              if (dt) { comp.weaponDamage = Math.round(dt[1] as number * 10000) / 10000; comp.weaponDamageType = dt[0]; }
            }
            if (typeof c.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(c.speed * 100) / 100;
            if (typeof c.lifetime === 'number' && comp.weaponSpeed) comp.weaponRange = Math.round(c.lifetime * comp.weaponSpeed * 100) / 100;
          }

          // Thruster
          if (cType === 'SCItemThrusterParams' || cType === 'SItemThrusterParams') {
            if (typeof c.thrustCapacity === 'number') comp.thrusterMaxThrust = Math.round(c.thrustCapacity * 100) / 100;
            if (typeof c.ThrustCapacity === 'number' && !comp.thrusterMaxThrust) comp.thrusterMaxThrust = Math.round(c.ThrustCapacity * 100) / 100;
            if (typeof c.maxThrustForce === 'number' && !comp.thrusterMaxThrust) comp.thrusterMaxThrust = Math.round(c.maxThrustForce * 100) / 100;
            // Determine sub-type from port name pattern in fileName
            const thrusterType = fn.includes('main') || fn.includes('retro') ? (fn.includes('retro') ? 'Retro' : 'Main') :
              fn.includes('vtol') ? 'VTOL' : fn.includes('mav') || fn.includes('maneuver') ? 'Maneuvering' : 'Main';
            comp.thrusterType = thrusterType;
          }

          // Radar — SC 4.x structure: signatureDetection[] with sensitivity/piercing per signal type
          if (cType === 'SCItemRadarComponentParams' || cType === 'SRadarComponentParams') {
            // signatureDetection array: entries for different signal types (EM, IR, CS, etc.)
            // Use the first entry's sensitivity as the general radar sensitivity metric
            const sigDet = c.signatureDetection;
            if (Array.isArray(sigDet) && sigDet.length > 0) {
              // Average sensitivity across active detection modes
              const activeSensitivities = sigDet.filter((s: any) => s?.permitPassiveDetection === true && typeof s?.sensitivity === 'number');
              if (activeSensitivities.length > 0) {
                const avgSensitivity = activeSensitivities.reduce((sum: number, s: any) => sum + s.sensitivity, 0) / activeSensitivities.length;
                comp.radarTrackingSignal = Math.round(avgSensitivity * 10000) / 10000;
              }
              // Max piercing value (ability to detect stealthy targets)
              const piercingValues = sigDet.filter((s: any) => typeof s?.piercing === 'number').map((s: any) => s.piercing);
              if (piercingValues.length > 0) {
                comp.radarDetectionLifetime = Math.round(Math.max(...piercingValues) * 10000) / 10000;
              }
            }
            // Ping cooldown
            if (c.pingProperties && typeof c.pingProperties.cooldownTime === 'number') {
              comp.radarRange = c.pingProperties.cooldownTime;
            }
          }

          // Countermeasure
          if (cType === 'SCItemCountermeasureParams' || cType === 'SCountermeasureParams') {
            if (typeof c.ammoCount === 'number') comp.cmAmmoCount = c.ammoCount;
          }
          if (type === 'Countermeasure' && cType === 'SAmmoContainerComponentParams') {
            if (typeof c.maxAmmoCount === 'number') comp.cmAmmoCount = c.maxAmmoCount;
            if (typeof c.initialAmmoCount === 'number' && !comp.cmAmmoCount) comp.cmAmmoCount = c.initialAmmoCount;
          }

          // Fuel Tank
          if (cType === 'SCItemFuelTankParams') {
            if (typeof c.capacity === 'number') comp.fuelCapacity = Math.round(c.capacity * 100) / 100;
          }
          if (type === 'FuelTank' && cType === 'ResourceContainer') {
            const cap = typeof c.capacity === 'object' ? (c.capacity?.standardCargoUnits || 0) : (typeof c.capacity === 'number' ? c.capacity : 0);
            if (cap > 0) comp.fuelCapacity = Math.round(cap * 100) / 100;
          }

          // Fuel Intake
          if (cType === 'SCItemFuelIntakeParams' || cType === 'SFuelIntakeParams') {
            if (typeof c.fuelPushRate === 'number') comp.fuelIntakeRate = Math.round(c.fuelPushRate * 10000) / 10000;
            if (typeof c.FuelPushRate === 'number' && !comp.fuelIntakeRate) comp.fuelIntakeRate = Math.round(c.FuelPushRate * 10000) / 10000;
          }

          // EMP — SCItemEMPParams
          if (cType === 'SCItemEMPParams' || cType === 'SEMPParams') {
            if (typeof c.distortionDamage === 'number') comp.empDamage = Math.round(c.distortionDamage * 100) / 100;
            if (typeof c.DistortionDamage === 'number' && !comp.empDamage) comp.empDamage = Math.round(c.DistortionDamage * 100) / 100;
            // empRadius is the actual DataForge property name
            if (typeof c.empRadius === 'number') comp.empRadius = Math.round(c.empRadius * 100) / 100;
            if (typeof c.maximumRadius === 'number' && !comp.empRadius) comp.empRadius = Math.round(c.maximumRadius * 100) / 100;
            if (typeof c.chargeTime === 'number') comp.empChargeTime = Math.round(c.chargeTime * 100) / 100;
            if (typeof c.ChargeTime === 'number' && !comp.empChargeTime) comp.empChargeTime = Math.round(c.ChargeTime * 100) / 100;
            // cooldownTime is the actual cooldown; unleashTime is the burst duration
            if (typeof c.cooldownTime === 'number') comp.empCooldown = Math.round(c.cooldownTime * 100) / 100;
            if (typeof c.CooldownTime === 'number' && !comp.empCooldown) comp.empCooldown = Math.round(c.CooldownTime * 100) / 100;
            // Also try damage from nested damageInfo/damage struct
            const empDmg = c.damage || c.damageInfo;
            if (empDmg && typeof empDmg === 'object') {
              const dist = typeof empDmg.DamageDistortion === 'number' ? empDmg.DamageDistortion : 0;
              if (dist > 0 && !comp.empDamage) comp.empDamage = Math.round(dist * 100) / 100;
            }
          }

          // Quantum Interdiction Generator — SCItemQuantumInterdictionGeneratorParams
          // Data is nested: jammerSettings.jammerRange, quantumInterdictionPulseSettings.{chargeTimeSecs, cooldownTimeSecs, radiusMeters}
          if (cType === 'SCItemQuantumInterdictionGeneratorParams' || cType === 'SQuantumInterdictionGeneratorParams') {
            // Jammer range from nested jammerSettings
            const js = c.jammerSettings;
            if (js && typeof js === 'object') {
              if (typeof js.jammerRange === 'number') comp.qigJammerRange = Math.round(js.jammerRange * 100) / 100;
            }
            // Fallback flat properties
            if (typeof c.jammerRange === 'number' && !comp.qigJammerRange) comp.qigJammerRange = Math.round(c.jammerRange * 100) / 100;

            // Pulse settings (snare radius, charge time, cooldown) from nested quantumInterdictionPulseSettings
            const ps = c.quantumInterdictionPulseSettings;
            if (ps && typeof ps === 'object') {
              if (typeof ps.radiusMeters === 'number') comp.qigSnareRadius = Math.round(ps.radiusMeters * 100) / 100;
              if (typeof ps.chargeTimeSecs === 'number') comp.qigChargeTime = Math.round(ps.chargeTimeSecs * 100) / 100;
              if (typeof ps.cooldownTimeSecs === 'number') comp.qigCooldown = Math.round(ps.cooldownTimeSecs * 100) / 100;
            }
            // Fallback flat properties
            if (typeof c.chargeTime === 'number' && !comp.qigChargeTime) comp.qigChargeTime = Math.round(c.chargeTime * 100) / 100;
            if (typeof c.cooldownTime === 'number' && !comp.qigCooldown) comp.qigCooldown = Math.round(c.cooldownTime * 100) / 100;
          }
        }

        // Derived stats
        if (comp.weaponDamage && comp.weaponFireRate) {
          const pellets = comp.weaponPelletsPerShot || 1;
          comp.weaponAlphaDamage = Math.round(comp.weaponDamage * pellets * 10000) / 10000;
          comp.weaponDps = Math.round(comp.weaponAlphaDamage * (comp.weaponFireRate / 60) * 10000) / 10000;

          // Burst DPS = DPS during the burst window (before overheat)
          // Sustained DPS = average DPS over full fire+cooldown cycle
          if (comp.weaponHeatPerShot && comp.weaponHeatPerShot > 0) {
            // Shots until overheat: threshold is normalized to 1.0
            const shotsToOverheat = Math.max(1, Math.floor(1.0 / comp.weaponHeatPerShot));
            const timeToOverheat = shotsToOverheat / (comp.weaponFireRate / 60);
            const burstDamage = comp.weaponAlphaDamage * shotsToOverheat;

            if (timeToOverheat > 0) {
              comp.weaponBurstDps = Math.round((burstDamage / timeToOverheat) * 10000) / 10000;
            }

            // Sustained DPS: use thermal-based cooldown estimation
            // Heat generated per second at full fire = heatPerShot * (fireRate/60)
            // When overheated, cooling takes ~(1.0 / coolingRate) seconds
            // Average weapon cooling rate is ~0.15-0.3 /s → ~3-7s cooldown
            // We use the heat generation rate to estimate more accurately
            const heatPerSecond = comp.weaponHeatPerShot * (comp.weaponFireRate / 60);
            // Effective cooling rate during cooldown: weapons typically cool 2-3x faster when overheated
            // Conservative estimate: cooldownTime = overheatThreshold(1.0) / (heatPerSecond * 0.5)
            // This gives a cycle-aware sustained DPS
            const estimatedCooldown = Math.max(1.0, 1.0 / (heatPerSecond * 0.4));
            const cycleTime = timeToOverheat + estimatedCooldown;
            if (cycleTime > 0) {
              comp.weaponSustainedDps = Math.round((burstDamage / cycleTime) * 10000) / 10000;
            }
          } else {
            // No heat data = no overheat = burst DPS = sustained DPS = DPS
            comp.weaponBurstDps = comp.weaponDps;
            comp.weaponSustainedDps = comp.weaponDps;
          }
        }

        // Manufacturer from className prefix
        if (!comp.manufacturerCode) {
          const mfgMatch = className.match(/^([A-Z]{3,5})_/);
          if (mfgMatch) { comp.manufacturerCode = mfgMatch[1]; comp.manufacturer = MANUFACTURER_CODES[mfgMatch[1]] || mfgMatch[1]; }
        }

        components.push(comp);
      } catch (e) {
        // Log to detect format changes from CIG patches
        if (scanned % 500 === 0) logger.warn(`Component extraction error at ${scanned}: ${(e as Error).message}`, { module: 'dataforge' });
      }
    }
    logger.info(`Extracted ${components.length} components from ${scanned} SCItem records`, { module: 'dataforge' });
    return components;
  }

  // ============ Vehicle loadout extraction ============

  extractVehicleLoadout(className: string): Array<{
    portName: string; portType?: string; componentClassName?: string;
    minSize?: number; maxSize?: number;
    children?: Array<{ portName: string; componentClassName?: string }>;
  }> | null {
    if (!this.dfData || !this.dcbBuffer) return null;
    const record = this.findEntityRecord(className);
    if (!record) return null;
    const data = this.readInstance(record.structIndex, record.instanceIndex, 0, 6);
    if (!data || !Array.isArray(data.Components)) return null;

    // Build port metadata map for min/max size from SItemPortContainerComponentParams
    const portMetaMap = new Map<string, { minSize: number; maxSize: number }>();
    for (const comp of data.Components) {
      if (!comp || (comp.__type !== 'SItemPortContainerComponentParams' && comp.__type !== 'VehicleComponentParams')) continue;
      const ports = comp.Ports || comp.ports;
      if (!Array.isArray(ports)) continue;
      for (const portDef of ports) {
        if (!portDef || typeof portDef !== 'object') continue;
        const pName = (portDef.Name || portDef.name || '').toLowerCase();
        if (!pName) continue;
        portMetaMap.set(pName, {
          minSize: typeof portDef.MinSize === 'number' ? portDef.MinSize : 0,
          maxSize: typeof portDef.MaxSize === 'number' ? portDef.MaxSize : 0,
        });
      }
    }

    const mainEntries = this.extractLoadoutEntries(data);
    const emptyPorts = mainEntries.filter(e => !e.entityClassName && e.portName);
    let variantMap: Map<string, string> | null = null;
    if (emptyPorts.length > 0) variantMap = this.findVariantLoadoutMap(className);

    const loadoutItems: any[] = [];
    const processedPorts = new Set<string>();

    const processEntry = (portName: string, entClassName: string, inlineChildren?: Array<{ portName: string; entityClassName: string }>): any => {
      const item: any = { portName, componentClassName: entClassName || null, portType: classifyPort(portName, entClassName) };
      // Attach port size constraints
      const meta = portMetaMap.get(portName.toLowerCase());
      if (meta) {
        item.minSize = meta.minSize;
        item.maxSize = meta.maxSize;
      }
      const children: any[] = [];
      if (inlineChildren && inlineChildren.length > 0) {
        for (const child of inlineChildren) {
          if (child.portName && child.entityClassName) children.push({ portName: child.portName, componentClassName: child.entityClassName });
        }
      }
      if (children.length === 0 && entClassName) {
        const subRecord = this.findEntityRecord(entClassName);
        if (subRecord) {
          const subData = this.readInstance(subRecord.structIndex, subRecord.instanceIndex, 0, 5);
          if (subData && Array.isArray(subData.Components)) {
            for (const subComp of subData.Components) {
              if (!subComp || subComp.__type !== 'SEntityComponentDefaultLoadoutParams') continue;
              const subEntries = subComp.loadout?.entries;
              if (!Array.isArray(subEntries)) continue;
              for (const se of subEntries) {
                let subEntClassName = se.entityClassName || '';
                if (!subEntClassName && se.entityClassReference?.__ref) subEntClassName = this.resolveGuid(se.entityClassReference.__ref) || '';
                if (!subEntClassName && variantMap) subEntClassName = variantMap.get(`${portName}/${se.itemPortName}`) || '';
                if (se.itemPortName && subEntClassName) children.push({ portName: se.itemPortName, componentClassName: subEntClassName });
              }
            }
          }
        }
      }
      if (children.length > 0) item.children = children;
      return item;
    };

    for (const entry of mainEntries) {
      const portName = entry.portName;
      let entClassName = entry.entityClassName || '';
      if (!portName) continue;
      if (!entClassName && variantMap) entClassName = variantMap.get(portName) || '';
      loadoutItems.push(processEntry(portName, entClassName, entry.children));
      processedPorts.add(portName);
    }

    if (variantMap) {
      for (const [portName, entClassName] of variantMap) {
        if (portName.includes('/') || processedPorts.has(portName)) continue;
        const portType = classifyPort(portName, entClassName);
        if (['WeaponGun', 'Turret', 'MissileRack', 'Gimbal', 'Weapon'].includes(portType)) {
          loadoutItems.push(processEntry(portName, entClassName));
          processedPorts.add(portName);
        }
      }
    }

    return loadoutItems.length > 0 ? loadoutItems : null;
  }

  private extractLoadoutEntries(data: any): Array<{ portName: string; entityClassName: string; children?: Array<{ portName: string; entityClassName: string }> }> {
    const entries: any[] = [];
    if (!data || !Array.isArray(data.Components)) return entries;
    for (const comp of data.Components) {
      if (!comp || comp.__type !== 'SEntityComponentDefaultLoadoutParams') continue;
      const items = comp.loadout?.entries;
      if (!Array.isArray(items)) continue;
      for (const e of items) {
        let className = e.entityClassName || '';
        if (!className && e.entityClassReference?.__ref) className = this.resolveGuid(e.entityClassReference.__ref) || '';
        const entry: any = { portName: e.itemPortName || '', entityClassName: className };
        if (e.loadout?.entries && Array.isArray(e.loadout.entries)) {
          const children: any[] = [];
          for (const sub of e.loadout.entries) {
            let subCN = sub.entityClassName || '';
            if (!subCN && sub.entityClassReference?.__ref) subCN = this.resolveGuid(sub.entityClassReference.__ref) || '';
            if (sub.itemPortName) children.push({ portName: sub.itemPortName, entityClassName: subCN });
          }
          if (children.length > 0) entry.children = children;
        }
        entries.push(entry);
      }
    }
    return entries;
  }

  private findVariantLoadoutMap(className: string): Map<string, string> | null {
    if (!this.dfData || !this.dcbBuffer) return null;
    const suffixes = ['_PU_AI_UEE', '_PU_AI_SEC', '_PU_AI_CIV', '_PU_AI', '_PU', '_Template'];
    const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
    if (entityClassIdx === -1) return null;
    for (const suffix of suffixes) {
      const variantName = className + suffix;
      let varRecord: any = null;
      for (const r of this.dfData.records) {
        if (r.structIndex === entityClassIdx) {
          const name = r.name?.replace('EntityClassDefinition.', '') || '';
          if (name === variantName) { varRecord = r; break; }
        }
      }
      if (!varRecord) continue;
      try {
        const varData = this.readInstance(varRecord.structIndex, varRecord.instanceIndex, 0, 6);
        if (!varData || !Array.isArray(varData.Components)) continue;
        const map = new Map<string, string>();
        for (const comp of varData.Components) {
          if (!comp || comp.__type !== 'SEntityComponentDefaultLoadoutParams') continue;
          const entries = comp.loadout?.entries;
          if (!Array.isArray(entries)) continue;
          for (const e of entries) {
            const portName = e.itemPortName || '';
            let entityName = e.entityClassName || '';
            if (!entityName && e.entityClassReference?.__ref) entityName = this.resolveGuid(e.entityClassReference.__ref) || '';
            if (portName && entityName) {
              map.set(portName, entityName);
              if (Array.isArray(e.loadout?.entries)) {
                for (const sub of e.loadout.entries) {
                  let subName = sub.entityClassName || '';
                  if (!subName && sub.entityClassReference?.__ref) subName = this.resolveGuid(sub.entityClassReference.__ref) || '';
                  if (sub.itemPortName && subName) map.set(`${portName}/${sub.itemPortName}`, subName);
                }
              }
            }
          }
        }
        if (map.size > 0) {
          return map;
        }
      } catch { continue; /* variant loadout not readable — non-critical */ }
    }
    return null;
  }

  // ============ Vehicle stats extraction ============

  async extractVehicleStats(className: string): Promise<Record<string, number> | null> {
    if (!this.dfData || !this.dcbBuffer) return null;
    try {
      const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
      if (entityClassIdx === -1) return null;
      let record = this.dfData.records.find((r: any) => r.structIndex === entityClassIdx && (r.name?.replace('EntityClassDefinition.', '') === className || r.name === className));
      if (!record) {
        const lc = className.toLowerCase();
        record = this.dfData.records.find((r: any) => r.structIndex === entityClassIdx && r.name?.toLowerCase().includes(lc));
      }
      if (!record) return null;
      return this.extractStatsFromRecord(record);
    } catch (err) {
      logger.error(`Error extracting stats for ${className}:`, err as Record<string, unknown>);
      return null;
    }
  }

  private extractStatsFromRecord(record: any): Record<string, number> | null {
    const data = this.readInstance(record.structIndex, record.instanceIndex, 0, 5);
    if (!data) return null;
    const stats: Record<string, number> = {};

    const components = data.Components;
    if (Array.isArray(components)) {
      for (const comp of components) {
        if (!comp || typeof comp !== 'object' || !comp.__type) continue;
        const type = comp.__type as string;

        if (type === 'VehicleComponentParams') {
          if (typeof comp.crewSize === 'number' && comp.crewSize > 0) stats.crew_size = comp.crewSize;
          if (typeof comp.vehicleHullDamageNormalizationValue === 'number' && comp.vehicleHullDamageNormalizationValue > 0) stats.hull_hp = Math.round(comp.vehicleHullDamageNormalizationValue);
          const bbox = comp.maxBoundingBoxSize;
          if (bbox && typeof bbox === 'object') {
            if (typeof bbox.x === 'number') stats.length = Math.round(bbox.x * 100) / 100;
            if (typeof bbox.y === 'number') stats.beam = Math.round(bbox.y * 100) / 100;
            if (typeof bbox.z === 'number') stats.height = Math.round(bbox.z * 100) / 100;
          }
        }

        if (type === 'SEntityComponentDefaultLoadoutParams') {
          const entries = comp.loadout?.entries;
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              const portName = (entry.itemPortName || '').toLowerCase();
              const entCN = entry.entityClassName || '';
              if (portName === 'hardpoint_controller_flight' && entCN && this.dfData) {
                const fcRecord = this.findEntityRecord(entCN);
                if (fcRecord) {
                  const fcData = this.readInstance(fcRecord.structIndex, fcRecord.instanceIndex, 0, 5);
                  if (fcData && Array.isArray(fcData.Components)) {
                    for (const fc of fcData.Components) {
                      if (!fc?.__type) continue;
                      if (fc.__type === 'IFCSParams') {
                        if (typeof fc.scmSpeed === 'number' && fc.scmSpeed > 0) stats.scm_speed = Math.round(fc.scmSpeed);
                        if (typeof fc.boostSpeedForward === 'number' && fc.boostSpeedForward > 0) stats.afterburner_speed = Math.round(fc.boostSpeedForward);
                        if (typeof fc.maxSpeed === 'number' && fc.maxSpeed > 0) stats.max_speed = Math.round(fc.maxSpeed);
                        const maxAV = fc.maxAngularVelocity;
                        if (maxAV && typeof maxAV === 'object') {
                          if (typeof maxAV.x === 'number') stats.pitch_max = Math.round(maxAV.x * 100) / 100;
                          if (typeof maxAV.y === 'number') stats.yaw_max = Math.round(maxAV.y * 100) / 100;
                          if (typeof maxAV.z === 'number') stats.roll_max = Math.round(maxAV.z * 100) / 100;
                        }
                      }
                      if (fc.__type === 'SEntitySpaceShipPhysicsControllerParams') {
                        if (typeof fc.Mass === 'number' && fc.Mass > 0) stats.actual_mass = Math.round(fc.Mass * 100) / 100;
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (!stats.actual_mass) {
          const mass = typeof comp.mass === 'number' ? comp.mass : (typeof comp.Mass === 'number' ? comp.Mass : undefined);
          if (mass && mass > 10) stats.actual_mass = Math.round(mass * 100) / 100;
        }
      }
    }
    return Object.keys(stats).length > 0 ? stats : null;
  }

  // ============ FULL ERKUL-COMPATIBLE SHIP DATA EXTRACTION ============

  /**
   * Extract complete erkul-compatible game data for a ship.
   * Returns a full JSON structure matching erkul.games /live/ships format.
   */
  async extractFullShipData(className: string, shipName?: string): Promise<Record<string, any> | null> {
    if (!this.dfData || !this.dcbBuffer) return null;

    // Resolve which entities to use for base data vs loadout
    const entities = this.resolveShipEntities(className, shipName);

    const record = this.findEntityRecord(entities.baseEntity);
    if (!record) return null;

    // Read base entity at high depth for metadata, vehicle params, insurance
    const data = this.readInstance(record.structIndex, record.instanceIndex, 0, 6);
    if (!data || !Array.isArray(data.Components)) return null;

    const result: Record<string, any> = {
      ref: record.id,
      name: className.replace(/^[A-Z]{3,5}_/, '').replace(/_/g, ' '),
      shortName: '',
      type: 'NOITEM_Vehicle',
      subType: 'Vehicle_Spaceship',
      size: 0,
      grade: '',
      description: '',
      maxLifetimeHours: 0,
    };

    // Extract metadata + loadout from base entity components
    let loadoutEntries: any[] = [];
    let vehicleParams: any = null;
    let itemPortContainer: any = null;

    for (const comp of data.Components) {
      if (!comp || typeof comp !== 'object' || !comp.__type) continue;
      const cType = comp.__type as string;

      if (cType === 'VehicleComponentParams') {
        vehicleParams = comp;
      }
      if (cType === 'SItemPortContainerComponentParams') {
        itemPortContainer = comp;
      }
      if (cType === 'SEntityComponentDefaultLoadoutParams') {
        const entries = comp.loadout?.entries;
        if (Array.isArray(entries)) loadoutEntries.push(...entries);
      }
      if (cType === 'SAttachableComponentParams') {
        const ad = comp.AttachDef;
        if (ad) {
          if (typeof ad.Size === 'number') result.size = ad.Size;
          if (typeof ad.Grade === 'number' && ad.Grade >= 0) result.grade = String.fromCharCode(65 + ad.Grade);
          if (typeof ad.SubType === 'string') result.subType = ad.SubType;
          if (typeof ad.Type === 'string') result.type = ad.Type;
          const loc = ad.Localization;
          if (loc) {
            if (typeof loc.Name === 'string' && !loc.Name.startsWith('@') && !loc.Name.startsWith('LOC_')) result.name = loc.Name;
            if (typeof loc.ShortName === 'string' && !loc.ShortName.startsWith('@')) result.shortName = loc.ShortName;
            if (typeof loc.Description === 'string' && !loc.Description.startsWith('@')) result.description = loc.Description;
          }
          if (typeof ad.Manufacturer === 'string' && ad.Manufacturer) {
            const mfgRef = ad.Manufacturer;
            // Try to resolve manufacturer GUID
            const mfgData = this.readRecordByGuid(mfgRef, 3);
            if (mfgData) {
              result.manufacturerData = {
                calculatorType: 'ManufacturerData',
                data: {
                  nameSmall: mfgData.NameSmall || mfgData.nameSmall || '',
                  name: mfgData.Name || mfgData.name || '',
                  description: mfgData.Description || mfgData.description || '',
                  ref: mfgRef,
                  calculatorName: mfgData.CalculatorName || mfgData.calculatorName || '',
                }
              };
            }
          }
        }
      }
      if (cType === 'SHealthComponentParams') {
        if (typeof comp.Health === 'number') {
          result.health = {
            hp: comp.Health,
            damageResistanceMultiplier: this.extractDamageResistance(comp)
          };
        }
      }
    }

    // === Extract insurance from base entity's StaticEntityClassData ===
    const secd = data.StaticEntityClassData;
    if (Array.isArray(secd)) {
      for (const entry of secd) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.__type === 'SEntityInsuranceProperties' && entry.shipInsuranceParams) {
          const sip = entry.shipInsuranceParams;
          result._insurance = {
            baseExpeditingFee: typeof sip.baseExpeditingFee === 'number' ? Math.round(sip.baseExpeditingFee * 100) / 100 : 0,
            baseWaitTimeMinutes: typeof sip.baseWaitTimeMinutes === 'number' ? Math.round(sip.baseWaitTimeMinutes * 100) / 100 : 0,
            mandatoryWaitTimeMinutes: typeof sip.mandatoryWaitTimeMinutes === 'number' ? Math.round(sip.mandatoryWaitTimeMinutes * 100) / 100 : 0,
            shipEntityClassName: className,
          };
        }
      }
    }

    // === If resolveShipEntities chose a variant, ALWAYS use variant loadout ===
    if (entities.loadoutEntity !== entities.baseEntity) {
      loadoutEntries = []; // Clear any trivial base loadout entries
      const variantRecord = this.findEntityRecord(entities.loadoutEntity);
      if (variantRecord) {
        const variantData = this.readInstance(variantRecord.structIndex, variantRecord.instanceIndex, 0, 6);
        if (variantData?.Components) {
          let variantLoadoutCount = 0;
          for (const comp of variantData.Components) {
            if (!comp || typeof comp !== 'object' || !comp.__type) continue;
            const cType = comp.__type as string;
            if (cType === 'SEntityComponentDefaultLoadoutParams') {
              const entries = comp.loadout?.entries;
              if (Array.isArray(entries)) loadoutEntries.push(...entries);
            }
            // Also get vehicle params from variant if base doesn't have any
            if (!vehicleParams && cType === 'VehicleComponentParams') {
              vehicleParams = comp;
            }
            if (!itemPortContainer && cType === 'SItemPortContainerComponentParams') {
              itemPortContainer = comp;
            }
            // Get insurance from variant entity if not found in base
            if (cType === 'SHealthComponentParams' && !result.health) {
              if (typeof comp.Health === 'number') {
                result.health = {
                  hp: comp.Health,
                  damageResistanceMultiplier: this.extractDamageResistance(comp)
                };
              }
            }
          }
          // Also check variant's StaticEntityClassData for insurance
          if (!result._insurance) {
            const variantSecd = variantData.StaticEntityClassData;
            if (Array.isArray(variantSecd)) {
              for (const entry of variantSecd) {
                if (!entry || typeof entry !== 'object') continue;
                if (entry.__type === 'SEntityInsuranceProperties' && entry.shipInsuranceParams) {
                  const sip = entry.shipInsuranceParams;
                  result._insurance = {
                    baseExpeditingFee: typeof sip.baseExpeditingFee === 'number' ? Math.round(sip.baseExpeditingFee * 100) / 100 : 0,
                    baseWaitTimeMinutes: typeof sip.baseWaitTimeMinutes === 'number' ? Math.round(sip.baseWaitTimeMinutes * 100) / 100 : 0,
                    mandatoryWaitTimeMinutes: typeof sip.mandatoryWaitTimeMinutes === 'number' ? Math.round(sip.mandatoryWaitTimeMinutes * 100) / 100 : 0,
                    shipEntityClassName: entities.loadoutEntity,
                  };
                }
              }
            }
          }
        }
      }
    }

    // Vehicle block
    result.vehicle = this.extractVehicleBlock(vehicleParams, className);

    // Hull block (initial from DataForge, will be enriched from XML below)
    result.hull = this.extractHullBlock(vehicleParams, data);

    // CrossSection from bbox (basic approximation)
    result.crossSection = this.extractCrossSection(vehicleParams);

    // Walk loadout to extract IFCS, shield, armor, items, and full port list
    const extracted = this.extractFromLoadout(loadoutEntries, itemPortContainer);
    result.ifcs = extracted.ifcs;
    result.shield = extracted.shield;
    result.armor = extracted.armor;
    // Prefer insurance from StaticEntityClassData, fall back to loadout-extracted one
    result.insurance = result._insurance || extracted.insurance;
    delete result._insurance;
    result.rnPowerPools = extracted.powerPools;
    result.capacitor = extracted.capacitor;
    result.cargo = extracted.cargo;
    result.fuelCapacity = extracted.fuelCapacity;
    result.qtFuelCapacity = extracted.qtFuelCapacity;
    result.items = extracted.items;
    result.loadout = extracted.loadout;

    // === Read Vehicle Implementation XML for mass & hull parts ===
    // Try variant-specific XML first, then base class, then vehicleDefinition path
    const xmlNamesToTry = [entities.vehicleXmlName];
    if (entities.vehicleXmlName !== className) xmlNamesToTry.push(className);
    // Also try the name from vehicleDefinition (e.g., "aegs_avenger" from "...aegs_avenger.xml")
    if (result.vehicle?.vehicleDefinition) {
      const vdMatch = result.vehicle.vehicleDefinition.match(/([^/\\]+)\.xml$/i);
      if (vdMatch && !xmlNamesToTry.includes(vdMatch[1])) {
        xmlNamesToTry.push(vdMatch[1]);
      }
    }
    
    let xmlUsedWasVariantSpecific = false;
    for (const xmlName of xmlNamesToTry) {
      try {
        const vehicleXml = await this.readVehicleImplementationXml(xmlName);
        if (vehicleXml) {
          if (vehicleXml.mass > 0) result.hull.mass = vehicleXml.mass;
          if (vehicleXml.totalHp > 0) result.hull.totalHp = vehicleXml.totalHp;
          if (vehicleXml.hullParts?.length > 0) result.hull.hp.body.parts = vehicleXml.hullParts;
          if (vehicleXml.bodyHp > 0) result.hull.hp.body.hp = vehicleXml.bodyHp;
          xmlUsedWasVariantSpecific = (xmlName === entities.vehicleXmlName && xmlName !== className);
          break; // Found XML, stop trying
        }
      } catch (e) { /* XML not found, try next */ }
    }

    // Mass from flight controller physics params:
    // - Always use if no XML mass found
    // - Also prefer over base XML mass when using a variant entity (variant mass is more accurate)
    if (extracted._mass && extracted._mass > 0) {
      if (!result.hull.mass || result.hull.mass === 0 || (!xmlUsedWasVariantSpecific && entities.loadoutEntity !== entities.baseEntity)) {
        result.hull.mass = extracted._mass;
      }
    }

    return result;
  }

  /**
   * Read vehicle implementation XML from P4K to extract mass, hull parts, and totalHp.
   * File path: Data\Scripts\Entities\Vehicles\Implementations\Xml\{className}.xml
   */
  private async readVehicleImplementationXml(className: string): Promise<{ mass: number; totalHp: number; bodyHp: number; hullParts: any[] } | null> {
    if (!this.provider) return null;
    const xmlPath = `Data\\Scripts\\Entities\\Vehicles\\Implementations\\Xml\\${className}.xml`;
    try {
      const buf = await this.readFile(xmlPath);
      if (!buf) return null;

      let rootNode: CryXmlNode;
      if (isCryXmlB(buf)) {
        rootNode = parseCryXml(buf);
      } else {
        // Plain text XML - not expected but handle
        return null;
      }

      // Navigate: <Vehicle> -> <Parts> -> <Part name="..." mass="..." ...>
      const partsNode = rootNode.children?.find(c => c.tag === 'Parts');
      if (!partsNode || !partsNode.children?.length) return null;

      const mainPart = partsNode.children[0]; // Root Part element
      const mass = parseFloat(mainPart.attributes?.mass || '0');

      // Extract hull parts tree and sum damageMax
      const { totalHp, bodyHp, parts } = this.extractVehicleXmlParts(mainPart);

      return { mass, totalHp, bodyHp, hullParts: parts };
    } catch (e) {
      return null;
    }
  }

  /**
   * Recursively extract hull parts from vehicle implementation XML.
   * Returns the tree of ALL parts with hp (damageMax) and the sum total.
   * Counts all Part elements (not just AnimatedJoint) to match Erkul's total HP calculation.
   */
  private extractVehicleXmlParts(partNode: CryXmlNode): { totalHp: number; bodyHp: number; parts: any[] } {
    let totalHp = 0;
    let bodyHp = 0;
    const parts: any[] = [];

    // The root part may have sub-Parts elements
    const subPartsNode = partNode.children?.find(c => c.tag === 'Parts');
    const childParts = subPartsNode?.children || partNode.children?.filter(c => c.tag === 'Part') || [];

    for (const child of childParts) {
      if (child.tag !== 'Part') continue;
      const pClass = child.attributes?.class || '';
      const dmgMax = parseFloat(child.attributes?.damageMax || '0');
      const name = child.attributes?.name || '';

      // Count ALL part types with damageMax > 0 (AnimatedJoint, Animated, SubPart, etc.)
      // Skip only ItemPort class parts (these are component mount points, not hull)
      if (pClass === 'ItemPort') continue;

      if (dmgMax > 0) {
        totalHp += dmgMax;
        if (name === 'Body' && bodyHp === 0) {
          bodyHp = dmgMax;
        }
      }
      // Recurse into sub-parts
      const sub = this.extractVehicleXmlParts(child);
      totalHp += sub.totalHp;
      const part: any = { hp: dmgMax, name };
      if (sub.parts.length > 0) part.parts = sub.parts;
      if (dmgMax > 0 || sub.parts.length > 0) parts.push(part);
    }

    return { totalHp, bodyHp, parts };
  }

  private extractDamageResistance(comp: any): Record<string, number> {
    const result: Record<string, number> = {};
    if (!comp) return result;
    const drm = comp.DamageResistance || comp.damageResistance;
    if (drm && typeof drm === 'object') {
      for (const [k, v] of Object.entries(drm)) {
        if (typeof v === 'number') result[k] = Math.round(v * 1e6) / 1e6;
      }
    }
    return result;
  }

  private extractVehicleBlock(vp: any, className: string): Record<string, any> {
    const vehicle: Record<string, any> = {
      vehicleDefinition: className,
      dogfightEnabled: true,
      crewSize: 1,
      career: '',
      role: '',
      size: { x: 0, y: 0, z: 0 },
      inventory: 0,
    };
    if (!vp) return vehicle;
    if (typeof vp.crewSize === 'number') vehicle.crewSize = vp.crewSize;
    if (typeof vp.dogfightEnabled === 'boolean') vehicle.dogfightEnabled = vp.dogfightEnabled;
    if (typeof vp.vehicleDefinition === 'string' && vp.vehicleDefinition.length > 0) {
      vehicle.vehicleDefinition = vp.vehicleDefinition;
    }

    // Career/Role: stored as vehicleCareer/vehicleRole LOC keys like "@vehicle_focus_combat"
    if (typeof vp.vehicleCareer === 'string') vehicle.career = DataForgeService.resolveLocKey(vp.vehicleCareer, 'career');
    if (typeof vp.vehicleRole === 'string') vehicle.role = DataForgeService.resolveLocKey(vp.vehicleRole, 'role');

    const bbox = vp.maxBoundingBoxSize;
    if (bbox && typeof bbox === 'object') {
      vehicle.size = {
        x: Math.round((bbox.x || 0) * 100) / 100,
        y: Math.round((bbox.y || 0) * 100) / 100,
        z: Math.round((bbox.z || 0) * 100) / 100,
      };
    }
    if (typeof vp.inventoryContainerSize === 'number') vehicle.inventory = vp.inventoryContainerSize;
    if (typeof vp.fusePenetrationDamageMultiplier === 'number') vehicle.fusePenetrationDamageMultiplier = vp.fusePenetrationDamageMultiplier;
    if (typeof vp.componentPenetrationDamageMultiplier === 'number') vehicle.componentPenetrationDamageMultiplier = vp.componentPenetrationDamageMultiplier;
    return vehicle;
  }

  /** Resolve SC localization keys to display strings */
  static resolveLocKey(locKey: string, type: 'career' | 'role'): string {
    if (!locKey || !locKey.startsWith('@')) return locKey || '';

    // Known career LOC keys → display names (matching Erkul)
    const CAREER_MAP: Record<string, string> = {
      '@vehicle_focus_combat': 'Combat',
      '@vehicle_focus_transporter': 'Transporter',
      '@vehicle_focus_industrial': 'Industrial',
      '@vehicle_focus_competition': 'Competition',
      '@vehicle_focus_exploration': 'Exploration',
      '@vehicle_focus_support': 'Support',
      '@vehicle_focus_gunship': 'Gunship',
      '@vehicle_focus_multirole': 'Multi-Role',
      '@vehicle_focus_starter': 'Starter',
      '@vehicle_focus_ground': 'Ground',
      '@vehicle_focus_groundcombat': 'Ground Combat',
    };

    // Known role LOC keys → display names (matching Erkul)
    const ROLE_MAP: Record<string, string> = {
      '@vehicle_class_lightfighter': 'Light Fighter',
      '@vehicle_class_mediumfighter': 'Medium Fighter',
      '@vehicle_class_heavyfighter': 'Heavy Fighter',
      '@vehicle_class_heavyfighter_bomber': 'Heavy Fighter / Bomber',
      '@vehicle_class_interceptor': 'Interceptor',
      '@vehicle_class_stealthfighter': 'Stealth Fighter',
      '@vehicle_class_stealthbomber': 'Stealth Bomber',
      '@vehicle_class_bomber': 'Bomber',
      '@vehicle_class_heavybomber': 'Heavy Bomber',
      '@vehicle_class_snubfighter': 'Snub Fighter',
      '@vehicle_class_gunship': 'Gunship',
      '@vehicle_class_heavygunship': 'Heavy Gunship',
      '@vehicle_class_dropship': 'Dropship',
      '@vehicle_class_lightfreight': 'Light Freight',
      '@vehicle_class_mediumfreight': 'Medium Freight',
      '@vehicle_class_heavyfreight': 'Heavy Freight',
      '@vehicle_class_lightfreight_mediumfighter': 'Light Freight / Medium Fighter',
      '@vehicle_class_mediumfreight_gunship': 'Medium Freight / Gun Ship',
      '@vehicle_class_mediumfreightgunshio': 'Medium Freight / Gun Ship', // CIG typo in data
      '@vehicle_class_mediumfreightgunship': 'Medium Freight / Gun Ship',
      '@vehicle_class_starter_lightfreight': 'Starter / Light Freight',
      '@vehicle_class_starterlightfreight': 'Starter / Light Freight',
      '@vehicle_class_starter_pathfinder': 'Starter / Pathfinder',
      '@vehicle_class_starterpathfinder': 'Starter / Pathfinder',
      '@vehicle_class_starter_lightmining': 'Starter / Light Mining',
      '@vehicle_class_startermining': 'Starter / Mining',
      '@vehicle_class_starter_lightsalvage': 'Starter / Light Salvage',
      '@vehicle_class_startersalvage': 'Starter / Salvage',
      '@vehicle_class_heavyfighterbomber': 'Heavy Fighter / Bomber',
      '@vehicle_class_expedition': 'Expedition',
      '@vehicle_class_pathfinder': 'Pathfinder',
      '@vehicle_class_touring': 'Touring',
      '@vehicle_class_luxurytouring': 'Luxury Touring',
      '@vehicle_class_passenger': 'Passenger',
      '@vehicle_class_modular': 'Modular',
      '@vehicle_class_generalist': 'Generalist',
      '@vehicle_class_racing': 'Racing',
      '@vehicle_class_medical': 'Medical',
      '@vehicle_class_recovery': 'Recovery',
      '@vehicle_class_reporting': 'Reporting',
      '@vehicle_class_combat': 'Combat',
      '@vehicle_class_interdiction': 'Interdiction',
      '@vehicle_class_lightsalvage': 'Light Salvage',
      '@vehicle_class_heavysalvage': 'Heavy Salvage',
      '@vehicle_class_lightmining': 'Light Mining',
      '@vehicle_class_mediummining': 'Medium Mining',
      '@vehicle_class_lightscience': 'Light Science',
      '@vehicle_class_mediumdata': 'Medium Data',
      '@vehicle_class_heavyrefuelling': 'Heavy Refuelling',
      '@vehicle_class_frigate': 'Frigate',
      '@vehicle_class_corvette': 'Corvette',
      '@vehicle_class_antivehicle': 'Anti-Vehicle',
      '@vehicle_class_antiair': 'Anti-Air',
      '@vehicle_class_heavytank': 'Heavy Tank',
      '@vehicle_class_lighttank': 'Light Tank',
      // Also handle @item_ShipFocus_ prefix
      '@item_shipfocus_heavygunship': 'Heavy Gunship',
      '@item_shipfocus_lightfighter': 'Light Fighter',
    };

    const key = locKey.toLowerCase();
    if (type === 'career' && CAREER_MAP[key]) return CAREER_MAP[key];
    if (type === 'role' && ROLE_MAP[key]) return ROLE_MAP[key];

    // Fallback: try to parse from key pattern
    let raw = locKey;
    // Strip common prefixes
    for (const prefix of ['@vehicle_focus_', '@vehicle_class_', '@item_ShipFocus_', '@item_shipfocus_']) {
      if (raw.toLowerCase().startsWith(prefix)) { raw = raw.substring(prefix.length); break; }
    }
    // Convert underscored/camel to spaced and capitalize
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Convert a component className like "KLWE_LaserRepeater_S1" to a readable
   * display name like "CF-117 Bulldog Repeater". Uses the className structure when
   * localization data is unavailable.
   * Format: strips _SCItem suffix, manufacturer prefix, and converts to spaced words.
   */
  static resolveComponentName(className: string): string {
    let name = className;
    // Strip common suffixes: _SCItem, _PIR, etc.
    name = name.replace(/_SCItem$/i, '');
    // Strip item category prefixes (POWR_, COOL_, SHLD_, QDRV_, MISL_, RADR_)
    name = name.replace(/^(POWR|COOL|SHLD|QDRV|MISL|RADR|WEPN|TURR)_/i, '');
    // Strip manufacturer code prefix (4-letter codes)
    name = name.replace(/^[A-Z]{3,5}_/, '');
    // Convert underscores to spaces
    name = name.replace(/_/g, ' ');
    // Insert spaces between camelCase: "LaserRepeater" → "Laser Repeater"
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    return name.trim();
  }

  private extractHullBlock(vp: any, entityData: any): Record<string, any> {
    const hull: Record<string, any> = {
      hp: { body: { hp: 0, name: 'Body', parts: [] } },
      mass: 0,
      totalHp: 0,
    };
    if (!vp) return hull;

    // Body HP from vehicleHullDamageNormalizationValue
    const bodyHp = typeof vp.vehicleHullDamageNormalizationValue === 'number' ? Math.round(vp.vehicleHullDamageNormalizationValue) : 0;
    hull.hp.body.hp = bodyHp;

    // Try to get hull parts from vehicleParts or damageBehaviorGroup
    let totalHpFromParts = bodyHp;
    const hullParts = vp.HullParts || vp.hullParts || vp.damageResistanceParts || vp.parts;
    if (Array.isArray(hullParts)) {
      hull.hp.body.parts = this.extractHullParts(hullParts);
      totalHpFromParts = this.sumHullParts(hull.hp.body);
    }

    // Try to extract parts from SHealthComponentParams in entity
    if (entityData && Array.isArray(entityData.Components)) {
      for (const comp of entityData.Components) {
        if (!comp || comp.__type !== 'SHealthComponentParams') continue;
        if (typeof comp.Health === 'number' && comp.Health > bodyHp) {
          totalHpFromParts = Math.round(comp.Health);
        }
      }
    }

    hull.totalHp = totalHpFromParts;
    return hull;
  }

  private extractHullParts(parts: any[]): any[] {
    const result: any[] = [];
    for (const p of parts) {
      if (!p || typeof p !== 'object') continue;
      const part: any = {
        hp: typeof p.hp === 'number' ? Math.round(p.hp) : (typeof p.Health === 'number' ? Math.round(p.Health) : 0),
        name: p.name || p.Name || 'Part',
      };
      const subParts = p.parts || p.Parts || p.children;
      if (Array.isArray(subParts) && subParts.length > 0) {
        part.parts = this.extractHullParts(subParts);
      }
      result.push(part);
    }
    return result;
  }

  private sumHullParts(part: any): number {
    let total = typeof part.hp === 'number' ? part.hp : 0;
    if (Array.isArray(part.parts)) {
      for (const p of part.parts) total += this.sumHullParts(p);
    }
    return total;
  }

  private extractCrossSection(vp: any): Record<string, number> {
    if (!vp) return { x: 0, y: 0, z: 0 };
    const bbox = vp.maxBoundingBoxSize;
    if (bbox && typeof bbox === 'object') {
      // CrossSection approximation from bounding box (in cm²)
      const x = typeof bbox.x === 'number' ? bbox.x : 0;
      const y = typeof bbox.y === 'number' ? bbox.y : 0;
      const z = typeof bbox.z === 'number' ? bbox.z : 0;
      return {
        x: Math.round(y * z * 100) / 100,  // Front profile (y*z)
        y: Math.round(x * z * 100) / 100,  // Side profile (x*z)
        z: Math.round(x * y * 100) / 100,  // Top profile (x*y)
      };
    }
    return { x: 0, y: 0, z: 0 };
  }

  /**
   * Walk the full loadout tree and extract all erkul data blocks:
   * ifcs, shield, armor, insurance, powerPools, capacitor, cargo, fuel, items, loadout ports
   */
  private extractFromLoadout(loadoutEntries: any[], itemPortContainer: any): Record<string, any> {
    const result: Record<string, any> = {
      ifcs: {},
      shield: { faceType: 'Bubble', maxReallocation: 0, reconfigurationCooldown: 0 },
      armor: { calculatorType: 'ArmorData', data: null },
      insurance: null,
      powerPools: {},
      capacitor: { minAssignment: 0, maxAssignment: 0 },
      cargo: 0,
      fuelCapacity: 0,
      qtFuelCapacity: 0,
      _mass: 0,
      items: {
        cargos: [], controllers: [], countermeasures: [], dashboards: [],
        fuelIntakes: [], fuelTanks: [], lifeSupports: [], personalStorage: [],
        radars: [], seats: [], seatAccess: [], thrusters: [], utilities: []
      },
      loadout: [],
    };

    // Build port metadata map from SItemPortContainerComponentParams
    const portMetaMap = new Map<string, any>();
    if (itemPortContainer && Array.isArray(itemPortContainer.Ports)) {
      for (const portDef of itemPortContainer.Ports) {
        if (!portDef || typeof portDef !== 'object') continue;
        const portName = portDef.Name || portDef.name || '';
        if (!portName) continue;
        const meta: any = {
          localName: portDef.DisplayName || portDef.displayName || portName,
          editable: portDef.Flags?.includes?.('intEditablePort') ?? true,
          editableChildren: true,
          minSize: typeof portDef.MinSize === 'number' ? portDef.MinSize : 0,
          maxSize: typeof portDef.MaxSize === 'number' ? portDef.MaxSize : 0,
          requiredTags: portDef.RequiredTags || '',
          itemTypes: [],
        };
        const types = portDef.Types || portDef.types || portDef.AcceptedTypes || portDef.acceptedTypes;
        if (Array.isArray(types)) {
          for (const t of types) {
            if (t && typeof t === 'object') {
              meta.itemTypes.push({ type: t.Type || t.type || '', subType: t.SubType || t.subType || '' });
            }
          }
        }
        portMetaMap.set(portName.toLowerCase(), meta);
      }
    }

    // Get all ships' variant loadout for fallback
    const variantMap = this.findVariantLoadoutMap(loadoutEntries[0]?.__parentClassName || '');

    // Process each loadout entry
    for (const entry of loadoutEntries) {
      const portName = entry.itemPortName || '';
      if (!portName) continue;

      let entClassName = entry.entityClassName || '';
      if (!entClassName && entry.entityClassReference?.__ref) {
        entClassName = this.resolveGuid(entry.entityClassReference.__ref) || '';
      }

      // Build port for loadout array
      const portMeta = portMetaMap.get(portName.toLowerCase()) || {};
      const portObj: any = {
        itemPortName: portName,
        localName: portMeta.localName || portName,
        editable: portMeta.editable ?? true,
        editableChildren: portMeta.editableChildren ?? true,
        itemTypes: portMeta.itemTypes || [],
        maxSize: portMeta.maxSize || 0,
        minSize: portMeta.minSize || 0,
        requiredTags: portMeta.requiredTags || '',
        loadout: [],
      };

      // If there's a component in this port, read it
      if (entClassName) {
        const compRecord = this.findEntityRecord(entClassName);
        if (compRecord) {
          const compData = this.readInstance(compRecord.structIndex, compRecord.instanceIndex, 0, 5);
          if (compData && Array.isArray(compData.Components)) {
            this.processLoadoutComponent(portName, entClassName, compData, result);

            // Read sub-loadout from this component
            for (const subComp of compData.Components) {
              if (!subComp || subComp.__type !== 'SEntityComponentDefaultLoadoutParams') continue;
              const subEntries = subComp.loadout?.entries;
              if (!Array.isArray(subEntries)) continue;
              for (const se of subEntries) {
                let subCN = se.entityClassName || '';
                if (!subCN && se.entityClassReference?.__ref) subCN = this.resolveGuid(se.entityClassReference.__ref) || '';
                const subPort: any = {
                  itemPortName: se.itemPortName || '',
                  localName: se.itemPortName || '',
                  editable: true,
                  editableChildren: true,
                  itemTypes: [],
                  maxSize: 0,
                  minSize: 0,
                  requiredTags: '',
                  loadout: [],
                };
                // Read sub-component stats
                if (subCN) {
                  const subRecord = this.findEntityRecord(subCN);
                  if (subRecord) {
                    const subData = this.readInstance(subRecord.structIndex, subRecord.instanceIndex, 0, 4);
                    if (subData && Array.isArray(subData.Components)) {
                      this.processLoadoutComponent(se.itemPortName || '', subCN, subData, result);
                    }
                  }
                }
                portObj.loadout.push(subPort);
              }
            }
          }
        }
      }
      result.loadout.push(portObj);
    }

    return result;
  }

  /**
   * Process a single component entity to extract game data into the result object.
   * Handles: IFCS, shield, armor, power plants, coolers, QD, thrusters, fuel tanks, etc.
   */
  private processLoadoutComponent(portName: string, className: string, compData: any, result: Record<string, any>): void {
    const lp = portName.toLowerCase();
    let itemCategorized = false;

    for (const comp of compData.Components) {
      if (!comp || typeof comp !== 'object' || !comp.__type) continue;
      const cType = comp.__type as string;

      // === IFCS (Flight Controller) ===
      if (cType === 'IFCSParams') {
        const ifcs: Record<string, any> = {};
        if (typeof comp.scmSpeed === 'number') ifcs.scmSpeed = Math.round(comp.scmSpeed * 100) / 100;
        if (typeof comp.maxSpeed === 'number') ifcs.maxSpeed = Math.round(comp.maxSpeed * 100) / 100;
        if (typeof comp.boostSpeedForward === 'number') ifcs.boostSpeedForward = Math.round(comp.boostSpeedForward * 100) / 100;
        if (typeof comp.boostSpeedBackward === 'number') ifcs.boostSpeedBackward = Math.round(comp.boostSpeedBackward * 100) / 100;
        if (typeof comp.maxAfterburnSpeed === 'number') ifcs.maxAfterburnSpeed = Math.round(comp.maxAfterburnSpeed * 100) / 100;
        if (typeof comp.linearAccelDecay === 'number') ifcs.linearAccelDecay = Math.round(comp.linearAccelDecay * 1e6) / 1e6;
        if (typeof comp.angularAccelDecay === 'number') ifcs.angularAccelDecay = Math.round(comp.angularAccelDecay * 1e6) / 1e6;
        // Angular velocity
        const maxAV = comp.maxAngularVelocity;
        if (maxAV && typeof maxAV === 'object') {
          ifcs.angularVelocity = {
            x: Math.round((maxAV.x || 0) * 100) / 100,
            y: Math.round((maxAV.y || 0) * 100) / 100,
            z: Math.round((maxAV.z || 0) * 100) / 100,
          };
        }
        // Afterburner block
        const ab = comp.afterburner || comp.Afterburner;
        if (ab && typeof ab === 'object') {
          ifcs.afterburner = {};
          for (const [k, v] of Object.entries(ab)) {
            if (k === '__type') continue;
            if (typeof v === 'number') ifcs.afterburner[k] = Math.round(v * 1e6) / 1e6;
            else if (v && typeof v === 'object') {
              ifcs.afterburner[k] = {};
              for (const [k2, v2] of Object.entries(v as any)) {
                if (k2 === '__type') continue;
                if (typeof v2 === 'number') ifcs.afterburner[k][k2] = Math.round(v2 * 1e6) / 1e6;
              }
            }
          }
        }
        // Resource block
        const res = comp.resource || comp.Resource;
        if (res && typeof res === 'object') {
          ifcs.resource = {};
          for (const [k, v] of Object.entries(res)) {
            if (k === '__type') continue;
            if (typeof v === 'number') ifcs.resource[k] = Math.round(v * 1e6) / 1e6;
            else if (v && typeof v === 'object') {
              ifcs.resource[k] = {};
              for (const [k2, v2] of Object.entries(v as any)) {
                if (k2 === '__type') continue;
                if (typeof v2 === 'number') ifcs.resource[k][k2] = Math.round(v2 * 1e6) / 1e6;
              }
            }
          }
        }
        result.ifcs = ifcs;
      }

      // === Physics (mass) ===
      if (cType === 'SEntitySpaceShipPhysicsControllerParams') {
        if (typeof comp.Mass === 'number' && comp.Mass > 0) {
          result._mass = Math.round(comp.Mass * 100) / 100;
        }
      }

      // === Shield Generator ===
      if (cType === 'SCItemShieldGeneratorParams') {
        const shield: Record<string, any> = result.shield || {};
        if (typeof comp.MaxShieldHealth === 'number') shield.maxShieldHealth = Math.round(comp.MaxShieldHealth * 100) / 100;
        if (typeof comp.ShieldMaxHealth === 'number' && !shield.maxShieldHealth) shield.maxShieldHealth = Math.round(comp.ShieldMaxHealth * 100) / 100;
        if (typeof comp.MaxShieldRegen === 'number') shield.maxShieldRegen = Math.round(comp.MaxShieldRegen * 1e4) / 1e4;
        if (typeof comp.ShieldRegenRate === 'number' && !shield.maxShieldRegen) shield.maxShieldRegen = Math.round(comp.ShieldRegenRate * 1e4) / 1e4;
        if (typeof comp.DamagedRegenDelay === 'number') shield.damagedRegenDelay = Math.round(comp.DamagedRegenDelay * 100) / 100;
        if (typeof comp.DownedRegenDelay === 'number') shield.downedRegenDelay = Math.round(comp.DownedRegenDelay * 100) / 100;
        if (typeof comp.Hardening === 'number') shield.hardening = Math.round(comp.Hardening * 1e4) / 1e4;
        if (typeof comp.MaxReallocation === 'number') {
          shield.maxReallocation = comp.MaxReallocation;
          shield.faceType = comp.MaxReallocation > 0 ? 'Quadrant' : 'Bubble';
        }
        if (typeof comp.ReconfigurationCooldown === 'number') shield.reconfigurationCooldown = Math.round(comp.ReconfigurationCooldown * 100) / 100;
        if (typeof comp.reconfigurationCooldown === 'number') shield.reconfigurationCooldown = Math.round(comp.reconfigurationCooldown * 100) / 100;
        // Capacitor assignments
        if (typeof comp.CapacitorAssignmentInputMax === 'number') shield.capacitorAssignmentInputMax = comp.CapacitorAssignmentInputMax;
        if (typeof comp.CapacitorAssignmentOutputMax === 'number') shield.capacitorAssignmentOutputMax = comp.CapacitorAssignmentOutputMax;
        result.shield = shield;
      }

      // === Armor (SCItemVehicleArmorParams) - damage multipliers, signals ===
      if (cType === 'SCItemVehicleArmorParams' || cType === 'ArmorParams') {
        // Get or create armor data container
        if (!result.armor || !result.armor.data) {
          result.armor = { calculatorType: 'ArmorData', data: {
            type: 'Armor', subType: '', size: 0, grade: '',
            health: { hp: 0, damageResistanceMultiplier: {} },
            armor: {
              damageMultiplier: { damagePhysical: 1, damageEnergy: 1, damageDistortion: 1, damageThermal: 1, damageBiochemical: 1, damageStun: 1 },
              signalIR: 1, signalEM: 1, signalCS: 1, armorPenetrationResistance: 0,
            },
          }};
        }
        const armorData = result.armor.data;
        // Extract damage multipliers (normalize PascalCase -> camelCase)
        const dm = comp.DamageMultiplier || comp.damageMultiplier;
        if (dm && typeof dm === 'object') {
          for (const [k, v] of Object.entries(dm)) {
            if (typeof v === 'number' && k !== '__type') {
              const normalizedKey = k.charAt(0).toLowerCase() + k.slice(1);
              armorData.armor.damageMultiplier[normalizedKey] = Math.round(v * 1e6) / 1e6;
            }
          }
        }
        // Signal multipliers
        if (typeof comp.signalInfrared === 'number') armorData.armor.signalIR = Math.round(comp.signalInfrared * 1e6) / 1e6;
        if (typeof comp.signalElectromagnetic === 'number') armorData.armor.signalEM = Math.round(comp.signalElectromagnetic * 1e6) / 1e6;
        if (typeof comp.signalCrossSection === 'number') armorData.armor.signalCS = Math.round(comp.signalCrossSection * 1e6) / 1e6;
        if (typeof comp.SignalInfrared === 'number') armorData.armor.signalIR = Math.round(comp.SignalInfrared * 1e6) / 1e6;
        if (typeof comp.SignalElectroMagnetic === 'number') armorData.armor.signalEM = Math.round(comp.SignalElectroMagnetic * 1e6) / 1e6;
        if (typeof comp.SignalCrossSectionReduction === 'number') armorData.armor.signalCS = Math.round(comp.SignalCrossSectionReduction * 1e6) / 1e6;
        // ArmorPenetrationResistance (can be number or object)
        if (typeof comp.armorPenetrationResistance === 'number') armorData.armor.armorPenetrationResistance = comp.armorPenetrationResistance;
        if (comp.armorPenetrationResistance && typeof comp.armorPenetrationResistance === 'object' && typeof comp.armorPenetrationResistance.basePenetrationReduction === 'number') {
          armorData.armor.armorPenetrationResistance = comp.armorPenetrationResistance.basePenetrationReduction;
        }
      }

      // === Armor Health (SHealthComponentParams on armor port) ===
      if (lp.includes('armor') && cType === 'SHealthComponentParams') {
        // Get or create armor data container
        if (!result.armor || !result.armor.data) {
          result.armor = { calculatorType: 'ArmorData', data: {
            type: 'Armor', subType: '', size: 0, grade: '',
            health: { hp: 0, damageResistanceMultiplier: {} },
            armor: {
              damageMultiplier: { damagePhysical: 1, damageEnergy: 1, damageDistortion: 1, damageThermal: 1, damageBiochemical: 1, damageStun: 1 },
              signalIR: 1, signalEM: 1, signalCS: 1, armorPenetrationResistance: 0,
            },
          }};
        }
        const armorData = result.armor.data;
        if (typeof comp.Health === 'number') armorData.health.hp = Math.round(comp.Health);
        const healthDr = comp.DamageResistances || comp.DamageResistance || comp.damageResistance;
        if (healthDr && typeof healthDr === 'object') {
          for (const [k, v] of Object.entries(healthDr)) {
            if (k === '__type' || k === 'IgnoreMeleeDamage') continue;
            if (v && typeof v === 'object' && typeof (v as any).Multiplier === 'number') {
              // Structured resistance: { Multiplier, Threshold, DamageCap }
              const normalizedKey = k.replace('Resistance', '').charAt(0).toLowerCase() + k.replace('Resistance', '').slice(1);
              armorData.health.damageResistanceMultiplier[normalizedKey] = Math.round((v as any).Multiplier * 1e6) / 1e6;
            } else if (typeof v === 'number') {
              armorData.health.damageResistanceMultiplier[k] = Math.round(v * 1e6) / 1e6;
            }
          }
        }
      }

      // === Power Plant ===
      if (cType === 'SCItemPowerPlantParams') {
        if (!result.rnPowerPools) result.rnPowerPools = {};
        const output = typeof comp.MaxPower === 'number' ? comp.MaxPower : (typeof comp.PowerOutput === 'number' ? comp.PowerOutput : 0);
        if (output > 0) {
          // Track total power output
          result._totalPowerOutput = (result._totalPowerOutput || 0) + output;
        }
      }

      // === Quantum Drive (fuel capacity) ===
      if (cType === 'SCItemQuantumDriveParams') {
        if (typeof comp.quantumFuelRequirement === 'number') result._qtFuelRate = comp.quantumFuelRequirement;
      }

      // === Fuel Tank (from ResourceContainer, not SCItemFuelTankParams) ===
      if (cType === 'ResourceContainer') {
        const cap = comp.capacity;
        if (cap && typeof cap === 'object') {
          const scu = typeof cap.standardCargoUnits === 'number' ? cap.standardCargoUnits : 0;
          if (scu > 0) {
            if (lp.includes('quantum') || lp.includes('qt')) {
              result.qtFuelCapacity = (result.qtFuelCapacity || 0) + Math.round(scu * 100) / 100;
            } else if (lp.includes('fuel_tank') || lp.includes('hydrogen_fuel') || lp.includes('htnk')) {
              result.fuelCapacity = (result.fuelCapacity || 0) + Math.round(scu * 100) / 100;
            }
          }
        } else if (typeof comp.capacity === 'number' && comp.capacity > 0) {
          if (lp.includes('quantum') || lp.includes('qt')) {
            result.qtFuelCapacity = (result.qtFuelCapacity || 0) + Math.round(comp.capacity * 100) / 100;
          } else {
            result.fuelCapacity = (result.fuelCapacity || 0) + Math.round(comp.capacity * 100) / 100;
          }
        }
      }

      // === Fuel Tank (legacy SCItemFuelTankParams) ===
      if (cType === 'SCItemFuelTankParams') {
        if (typeof comp.capacity === 'number') {
          if (lp.includes('quantum') || lp.includes('qt')) {
            result.qtFuelCapacity = (result.qtFuelCapacity || 0) + Math.round(comp.capacity * 100) / 100;
          } else {
            result.fuelCapacity = (result.fuelCapacity || 0) + Math.round(comp.capacity * 100) / 100;
          }
        }
      }

      // === Cargo ===
      if (cType === 'SCItemCargoGridParams' || cType === 'SCargoGridParams') {
        if (typeof comp.SCU === 'number') result.cargo = (result.cargo || 0) + Math.round(comp.SCU * 100) / 100;
      }
      // === Cargo from InventoryContainer (v6 DataForge) ===
      if (cType === 'SCItemInventoryContainerComponentParams' || cType === 'SInventoryContainerComponentParams') {
        // Only count cargo ports, not personal storage or other containers
        if (lp.includes('cargo')) {
          const containerRef = comp.containerParams?.__ref;
          if (containerRef && containerRef !== '00000000-0000-0000-0000-000000000000') {
            const container = this.readRecordByGuid(containerRef, 4);
            if (container && container.__type === 'InventoryContainer') {
              const invType = container.inventoryType;
              if (invType) {
                if (invType.__type === 'InventoryClosedContainerType') {
                  // Closed containers have direct SCU value
                  const scu = invType.capacity?.standardCargoUnits;
                  if (typeof scu === 'number' && scu > 0) {
                    result.cargo = (result.cargo || 0) + Math.round(scu * 100) / 100;
                  }
                } else if (invType.__type === 'InventoryOpenContainerType') {
                  // Open containers: calculate SCU from interior dimensions
                  // 1 SCU = 1.25m × 1.25m × 1.25m cube
                  const dim = container.interiorDimensions;
                  if (dim && typeof dim.x === 'number' && typeof dim.y === 'number' && typeof dim.z === 'number') {
                    const scuX = Math.floor(dim.x / 1.25);
                    const scuY = Math.floor(dim.y / 1.25);
                    const scuZ = Math.floor(dim.z / 1.25);
                    const scu = scuX * scuY * scuZ;
                    if (scu > 0) {
                      result.cargo = (result.cargo || 0) + scu;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // === Insurance ===
      if (cType === 'SInsuranceParams' || cType === 'VehicleInsuranceParams') {
        result.insurance = {
          baseExpeditingFee: typeof comp.baseExpeditingFee === 'number' ? Math.round(comp.baseExpeditingFee * 100) / 100 : 0,
          baseWaitTimeMinutes: typeof comp.baseWaitTimeMinutes === 'number' ? Math.round(comp.baseWaitTimeMinutes * 100) / 100 : 0,
          mandatoryWaitTimeMinutes: typeof comp.mandatoryWaitTimeMinutes === 'number' ? Math.round(comp.mandatoryWaitTimeMinutes * 100) / 100 : 0,
          shipEntityClassName: className,
        };
      }

      // === Capacitor ===
      if (cType === 'SCItemCapacitorParams' || cType === 'CapacitorAssignment') {
        if (typeof comp.minAssignment === 'number') result.capacitor.minAssignment = comp.minAssignment;
        if (typeof comp.maxAssignment === 'number') result.capacitor.maxAssignment = comp.maxAssignment;
        if (typeof comp.MinAssignment === 'number') result.capacitor.minAssignment = comp.MinAssignment;
        if (typeof comp.MaxAssignment === 'number') result.capacitor.maxAssignment = comp.MaxAssignment;
      }

      // === Track items by category (only one entry per port) ===
      if (!itemCategorized) {
        const itemCategory = this.categorizeItem(portName, cType, className);
        if (itemCategory && result.items[itemCategory]) {
          result.items[itemCategory].push({ portName, className });
          itemCategorized = true;
        }
      }
    }
  }

  private categorizeItem(portName: string, compType: string, className: string): string | null {
    const lp = portName.toLowerCase();
    const lc = className.toLowerCase();
    if (lp.includes('thruster') || lc.includes('thruster')) return 'thrusters';
    if (lp.includes('fuel_intake') || lc.includes('fuelintake')) return 'fuelIntakes';
    if (lp.includes('fuel_tank') || lp.includes('hydrogen_fuel') || (lc.includes('fueltank') && !lp.includes('quantum'))) return 'fuelTanks';
    if (lp.includes('life_support') || lc.includes('lifesupport')) return 'lifeSupports';
    if (lp.includes('radar') || lc.includes('radar')) return 'radars';
    if (lp.includes('seat') || lc.includes('seat')) return 'seats';
    if (lp.includes('countermeasure') || lc.includes('countermeasure') || lc.includes('flare') || lc.includes('noise')) return 'countermeasures';
    if (lp.includes('cargo') || lc.includes('cargo')) return 'cargos';
    if (lp.includes('controller') || lc.includes('controller')) return 'controllers';
    if (lp.includes('dashboard') || lc.includes('dashboard')) return 'dashboards';
    if (lp.includes('personal_storage') || lc.includes('personalstorage') || lc.includes('inventory')) return 'personalStorage';
    if (lp.includes('utility') || lc.includes('utility') || lc.includes('tractor') || lc.includes('salvage')) return 'utilities';
    return null;
  }

  // ============================================================
  //  SHOPS & PRICES EXTRACTION
  // ============================================================

  /** Known shop names (LOC keys → readable names) */
  private static readonly SHOP_LOC_NAMES: Record<string, string> = {
    '@item_NameShop_CenterMass': 'CenterMass',
    '@item_NameShop_CasabaOutlet': 'Casaba Outlet',
    '@item_NameShop_DumpersDepot': "Dumper's Depot",
    '@item_NameShop_AstroArmada': 'Astro Armada',
    '@item_NameShop_NewDeal': 'New Deal',
    '@item_NameShop_TeachsShipShop': "Teach's Ship Shop",
    '@item_NameShop_CubbyBlast': 'Cubby Blast',
    '@item_NameShop_PortOlisar': 'Port Olisar',
    '@item_NameShop_GrimHex': 'GrimHEX',
    '@item_NameShop_Regal': 'Regal Luxury Rentals',
    '@item_NameShop_Cordrys': "Cordry's",
    '@item_NameShop_Vantage': 'Vantage Rentals',
    '@item_NameShop_FTL': 'FTL Transports',
    '@item_NameShop_Shubin': 'Shubin Interstellar',
    '@item_NameShop_TDD': 'Trade & Development Division',
    '@item_NameShop_KCTrading': 'KC Trending',
    '@item_NameShop_Traveler': 'Traveler Rentals',
    '@item_NameShop_Aparelli': 'Aparelli',
    '@item_NameShop_FactoryLine': 'Factory Line',
    '@item_NameShop_TammanyAndSons': 'Tammany and Sons',
    '@item_NameShop_Skutters': 'Skutters',
    '@item_NameShop_ConscientiousObjects': 'Conscientious Objects',
    '@item_NameShop_HurstonDynamics': 'Hurston Dynamics Showroom',
    '@item_NameShop_Microtech': 'mTech',
    '@item_NameShop_ArcCorp': 'ArcCorp',
    '@item_NameShop_OmegaPro': 'Omega Pro',
    '@item_NameShop_GarrityDefense': 'Garrity Defense',
    '@item_NameShop_PlatinumBay': 'Platinum Bay',
    '@item_NameShop_CousinCrows': "Cousin Crow's Custom Crafts",
    '@item_NameShop_LiveFire': 'Live Fire Weapons',
    '@item_NameShop_Refinery': 'Refinery',
    '@item_NameShop_CrusaderIndustries': 'Crusader Industries',
    '@item_NameShop_ProcyonCDF': 'Procyon CDF',
    '@item_NameShop_MakauDefense': 'Makau Defense',
    '@item_NameShop_KelTo': 'Kel-To',
    '@item_NameShop_CrusaderProvidenceSurplus': 'Crusader Providence Surplus',
    '@item_NameShop_FTA': 'Federal Trade Alliance',
  };

  /**
   * Extract shop/vendor data from DataForge.
   * Real shops are SCItemManufacturer records in shopkiosk/ paths.
   * Note: Per-shop inventory (what each shop sells) is server-managed
   * and NOT available from P4K/DataForge data. shop_inventory will remain empty.
   */
  extractShops(): { shops: any[]; inventory: any[] } {
    if (!this.dfData || !this.dcbBuffer) return { shops: [], inventory: [] };

    const shops: any[] = [];
    const inventory: any[] = [];

    // Find SCItemManufacturer struct type (shop kiosk definitions)
    const mfgStructIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'SCItemManufacturer');
    if (mfgStructIdx === -1) {
      logger.info('SCItemManufacturer struct not found — skipping shop extraction', { module: 'dataforge' });
      return { shops: [], inventory: [] };
    }

    // Extract SCItemManufacturer records in shop kiosk paths
    for (const r of this.dfData.records) {
      if (r.structIndex !== mfgStructIdx) continue;
      const fn = (r.fileName || '').toLowerCase();
      // Only keep records in the shopkiosk path (real shop brands)
      if (!fn.includes('shop/shopkiosk/') && !fn.includes('shop\\shopkiosk\\')) continue;

      try {
        const data = this.readInstance(r.structIndex, r.instanceIndex, 0, 3);
        if (!data) continue;

        const className = r.name?.replace('SCItemManufacturer.', '') || '';
        if (!className) continue;
        // Skip test/debug entries
        if (className.toLowerCase().includes('_test') || className.toLowerCase().includes('_debug')) continue;

        // Resolve shop name from localization
        const locKey = data.Localization?.Name || '';
        let shopName = DataForgeService.SHOP_LOC_NAMES[locKey]
          || (locKey.startsWith('@') ? className.replace(/_/g, ' ').replace('Shop ', '') : locKey)
          || className.replace(/_/g, ' ');

        // Extract shop code
        const shopCode = data.Code || '';

        // Determine shop type from className
        const shopType = this.inferShopType(className);

        shops.push({
          className,
          name: shopName,
          location: null, // Location data is not available from DataForge
          parentLocation: null,
          shopType,
          shopCode,
        });
      } catch (e) {
        // Skip problematic records
      }
    }

    // Deduplicate shops by name + shopType (multiple kiosk instances per brand)
    const shopMap = new Map<string, any>();
    for (const s of shops) {
      const key = `${s.name}::${s.shopType}`;
      if (!shopMap.has(key)) shopMap.set(key, s);
    }
    const uniqueShops = Array.from(shopMap.values());
    logger.info(`Extracted ${uniqueShops.length} unique shops from ${shops.length} kiosk instances`, { module: 'dataforge' });
    return { shops: uniqueShops, inventory };
  }

  // ============ PAINT / LIVERY EXTRACTION ============

  /**
   * Extract all ship paint/livery records from DataForge.
   * Paints are EntityClassDefinition records in scitem paths with "paint" in the filename.
   * Returns { shipClassName, paintClassName, paintName, paintUuid }[]
   */
  extractPaints(): Array<{ shipShortName: string; paintClassName: string; paintName: string; paintUuid: string }> {
    if (!this.dfData || !this.dcbBuffer) return [];
    const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
    if (entityClassIdx === -1) return [];

    const paints: Array<{ shipShortName: string; paintClassName: string; paintName: string; paintUuid: string }> = [];

    for (const r of this.dfData.records) {
      if (r.structIndex !== entityClassIdx) continue;
      const fn = (r.fileName || '').toLowerCase();
      if (!fn.includes('paint') && !fn.includes('skin')) continue;
      if (!fn.includes('scitem') && !fn.includes('entities')) continue;

      const className = r.name?.replace('EntityClassDefinition.', '') || '';
      if (!className) continue;
      const lcName = className.toLowerCase();
      if (lcName.includes('_test') || lcName.includes('_debug') || lcName.includes('_template')) continue;

      let paintDisplayName = className.replace(/_/g, ' ');
      let shipShortName = '';

      // Try to read entity for localization name
      try {
        const data = this.readInstance(r.structIndex, r.instanceIndex, 0, 3);
        if (data?.Components) {
          for (const comp of data.Components) {
            if (!comp || typeof comp !== 'object') continue;
            if (comp.__type === 'SAttachableComponentParams') {
              const loc = comp.AttachDef?.Localization;
              if (loc?.Name && typeof loc.Name === 'string' && !loc.Name.startsWith('@') && !loc.Name.startsWith('LOC_')) {
                paintDisplayName = loc.Name;
              }
            }
          }
        }
      } catch { /* non-critical */ }

      // Paint classNames follow "Paint_<ShipName>_<Event/Color>" pattern
      // Strip "Paint_" prefix and extract the ship part
      if (className.startsWith('Paint_')) {
        const afterPaint = className.substring(6); // Remove "Paint_"
        // The ship name is everything before the event/color suffix
        // Known event/color patterns to split on
        const eventPattern = /_(BIS\d{4}|IAE|ILW|Invictus|PirateWeek|Pirate|Holiday|Penumbra|Showdown|Citizencon|Star_Kitten|Stormbringer|Timberline|Ghoulish|Metallic|Black|White|Grey|Red|Blue|Green|Orange|Purple|Tan|Crimson|Gold|Silver|Carbon|Camo|Digital|Paint|Skin|Livery|Pack|FreeWeekend|FW\d+|NovemberAnniversary|FleetWeek|StarKitten|ValentinesDay|LunarNewYear|JumpTown)/i;
        const match = afterPaint.match(eventPattern);
        if (match && match.index && match.index > 0) {
          shipShortName = afterPaint.substring(0, match.index);
        } else {
          // No event pattern found — use the whole afterPaint as ship name
          // (some paints might be "Paint_ShipName" with no suffix)
          shipShortName = afterPaint;
        }
      } else {
        // Non-Paint_ prefix: try to extract from known patterns like MNFR_Ship_Skin_Name
        const skinMatch = className.match(/^([A-Z]{2,5}_[A-Za-z0-9_]+?)_(Paint|Skin|Livery)/i);
        if (skinMatch) shipShortName = skinMatch[1];
      }

      if (shipShortName) {
        paints.push({
          shipShortName,
          paintClassName: className,
          paintName: paintDisplayName,
          paintUuid: r.id,
        });
      }
    }

    logger.info(`Extracted ${paints.length} paint/livery records`, { module: 'dataforge' });
    return paints;
  }

  private inferShopType(className: string): string {
    const lc = className.toLowerCase();
    if (lc.includes('weapon') || lc.includes('gun')) return 'Weapons';
    if (lc.includes('armor') || lc.includes('clothing')) return 'Armor';
    if (lc.includes('ship') || lc.includes('vehicle')) return 'Ships';
    if (lc.includes('component') || lc.includes('part')) return 'Components';
    if (lc.includes('commodity') || lc.includes('cargo') || lc.includes('trade')) return 'Commodities';
    if (lc.includes('food') || lc.includes('drink') || lc.includes('bar')) return 'Food & Drink';
    return 'General';
  }
}

// ============ Port type classifier (standalone function) ============

export function classifyPort(portName: string, compClassName: string): string {
  const lp = portName.toLowerCase();
  const cc = (compClassName || '').toLowerCase();

  // Component-based classification
  if (cc) {
    if (cc.includes('cannon_s') || cc.includes('repeater_s') || cc.includes('gatling_s') ||
        cc.includes('scattergun_s') || cc.includes('machinegun_s') || cc.includes('neutrongun_s') ||
        cc.includes('laser_beak_') || cc.includes('tarantula') ||
        (cc.includes('weapon') && cc.match(/_s\d/) && !cc.includes('rack') && !cc.includes('turret') && !cc.includes('mount'))) return 'WeaponGun';
    if (cc.includes('mount_gimbal_') || cc.includes('mount_fixed_')) return 'Gimbal';
    if (cc.includes('turret_') || cc.startsWith('vtol_')) return 'Turret';
    if (cc.includes('mrck_') || cc.includes('missilerack')) return 'MissileRack';
  }

  if ((lp.includes('_gun_') || lp.includes('weapon_gun')) && !lp.includes('gunner') && !lp.includes('gunrack') && !lp.includes('seat') && !lp.includes('inventory')) return 'WeaponGun';
  if (lp.match(/hardpoint_weapon(_|$)/) && !lp.includes('locker') && !lp.includes('cabinet') && !lp.includes('controller') && !lp.includes('missile') && !lp.includes('rack') && !lp.includes('mount') && !lp.includes('cockpit') && !lp.includes('salvage') && !lp.includes('tractor')) return 'WeaponGun';
  if (lp.match(/hardpoint_weapon_wing/)) return 'WeaponGun';
  if (lp.includes('turret')) return 'Turret';
  if (lp.includes('shield')) return 'Shield';
  if (lp.includes('power_plant') || lp.includes('powerplant')) return 'PowerPlant';
  if (lp.includes('cooler')) return 'Cooler';
  if (lp.includes('quantum') && !lp.includes('interdiction') && !lp.includes('qed') || lp.includes('quantum_drive')) return 'QuantumDrive';
  if (lp.includes('missile') || lp.includes('pylon')) return 'MissileRack';
  if (lp.includes('radar')) return 'Radar';
  if (lp.includes('countermeasure')) return 'Countermeasure';
  if (lp.includes('controller_flight')) return 'FlightController';
  if (lp.includes('thruster')) return 'Thruster';
  // EMP: match port name containing 'emp' OR component class containing 'emp_device' / 'emp_generator'
  // Avoid false positives: only match EMP when port or component clearly indicates EMP device
  if (lp.includes('emp_device') || lp.includes('emp_generator') || (lp.includes('emp') && !lp.includes('temp') && !lp.match(/seat|access|dashboard|hud|inventory|weapon_?port/i))) return 'EMP';
  if (cc.includes('emp_device') || cc.includes('emp_generator') || cc.includes('emp_s')) return 'EMP';
  // QIG/QED: match interdiction ports (not just quantum_interdiction) and QED/QIG component classnames
  if (lp.includes('interdiction') || lp.includes('qig') || lp.includes('qed')) return 'QuantumInterdictionGenerator';
  if (cc.includes('quantuminterdiction') || cc.includes('qig_') || cc.includes('qed_') || cc.includes('qdmp_')) return 'QuantumInterdictionGenerator';
  if (lp.includes('weapon_rack') || lp.includes('weaponrack') || lp.includes('weapon_locker') || lp.includes('weaponlocker') || lp.includes('weapon_cabinet')) return 'WeaponRack';
  if (lp.includes('weapon') && (lp.includes('controller') || lp.includes('cockpit') || lp.includes('locker'))) return 'Other';
  if (lp.includes('weapon') && !lp.includes('rack')) return 'Weapon';
  return 'Other';
}
