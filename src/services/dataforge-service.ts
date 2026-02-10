/**
 * DataForge Service - Parses Star Citizen Game2.dcb binary DataForge files
 * Handles: binary parsing, struct/property resolution, GUID indexing, instance reading
 */
import { P4KProvider } from "../providers/p4k-provider.js";
import { CryXmlNode, isCryXmlB, parseCryXml } from "../utils/cryxml-parser.js";

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

/** RSI Ship Matrix names → P4K className aliases (for name mismatches) */
export const RSI_TO_P4K_ALIASES: Record<string, string> = {
  // Add entries when RSI name ≠ DataForge className
};

export class DataForgeService {
  private provider: P4KProvider | null = null;
  private dcbBuffer: Buffer | null = null;
  private dfData: any = null;
  private vehicleIndex = new Map<string, { uuid: string; name: string; className: string }>();
  private guidIndex = new Map<string, string>();

  constructor(private p4kPath: string) {}

  async init(): Promise<void> {
    console.log("🚀 Init P4K service...");
    this.provider = new P4KProvider(this.p4kPath);
    await this.provider.open();
    console.log("✅ P4K ready");
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
    this.dfData = this.parseDataForge(this.dcbBuffer);
    this.buildVehicleIndex();
    return {
      version: this.dfData.header.version,
      structCount: this.dfData.header.structDefinitionCount,
      recordCount: this.dfData.header.recordDefinitionCount,
      vehicleCount: this.vehicleIndex.size
    };
  }

  isDataForgeLoaded() { return this.dfData !== null; }

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
    let entry = this.vehicleIndex.get(lowerName);
    if (entry) return entry.uuid;
    const aliasKey = Object.keys(RSI_TO_P4K_ALIASES).find(k => k.toLowerCase() === lowerName);
    if (aliasKey) {
      const p4kName = RSI_TO_P4K_ALIASES[aliasKey];
      entry = this.vehicleIndex.get(p4kName.toLowerCase());
      if (entry) return entry.uuid;
    }
    return undefined;
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

  // ============ DataForge Instance Reader ============

  private static readonly DT_BOOLEAN       = 0x0001;
  private static readonly DT_INT8          = 0x0002;
  private static readonly DT_INT16         = 0x0003;
  private static readonly DT_INT32         = 0x0004;
  private static readonly DT_INT64         = 0x0005;
  private static readonly DT_UINT8         = 0x0006;
  private static readonly DT_UINT16        = 0x0007;
  private static readonly DT_UINT32        = 0x0008;
  private static readonly DT_UINT64        = 0x0009;
  private static readonly DT_STRING        = 0x000A;
  private static readonly DT_SINGLE        = 0x000B;
  private static readonly DT_DOUBLE        = 0x000C;
  private static readonly DT_LOCALE        = 0x000D;
  private static readonly DT_GUID          = 0x000E;
  private static readonly DT_ENUM          = 0x000F;
  private static readonly DT_CLASS         = 0x0010;
  private static readonly DT_STRONG_PTR    = 0x0110;
  private static readonly DT_WEAK_PTR      = 0x0210;
  private static readonly DT_REFERENCE     = 0x0310;

  private getStructProperties(structIndex: number): any[] {
    if (!this.dfData) return [];
    const { structDefs, propertyDefs } = this.dfData;
    const sd = structDefs[structIndex];
    if (!sd) return [];
    const hierarchy: any[] = [];
    const visited = new Set<number>();
    const buildHierarchy = (idx: number) => {
      if (visited.has(idx)) return;
      visited.add(idx);
      const s = structDefs[idx];
      if (!s) return;
      if (s.parentTypeIndex !== -1 && s.parentTypeIndex !== 0xFFFFFFFF) buildHierarchy(s.parentTypeIndex);
      hierarchy.push(s);
    };
    buildHierarchy(structIndex);
    const props: any[] = [];
    for (const h of hierarchy) {
      for (let pi = h.firstAttributeIndex; pi < h.firstAttributeIndex + h.attributeCount; pi++) {
        if (propertyDefs[pi]) props.push(propertyDefs[pi]);
      }
    }
    return props;
  }

  readInstance(structIndex: number, variantIndex: number, depth = 0, maxDepth = 3): Record<string, any> | null {
    if (!this.dfData || !this.dcbBuffer) return null;
    if (depth > maxDepth) return null;
    const buf = this.dcbBuffer;
    const { structDefs, structToDataOffsetMap, dataOffset } = this.dfData;
    const mapOffset = structToDataOffsetMap.get(structIndex);
    if (mapOffset === undefined) return null;
    const sd = structDefs[structIndex];
    if (!sd) return null;
    const instancePos = dataOffset + mapOffset + variantIndex * sd.structSize;
    if (instancePos + sd.structSize > buf.length) return null;
    const allProps = this.getStructProperties(structIndex);
    const result: Record<string, any> = { __type: sd.name };
    let pos = instancePos;
    for (const prop of allProps) {
      if (prop.conversionType === 0) {
        const [val, newPos] = this.readValueInline(buf, pos, prop, depth, maxDepth);
        result[prop.name] = val;
        pos = newPos;
      } else {
        if (pos + 8 > buf.length) break;
        const count = buf.readUInt32LE(pos); pos += 4;
        const firstIndex = buf.readUInt32LE(pos); pos += 4;
        const arr: any[] = [];
        const limit = Math.min(count, 200);
        for (let i = 0; i < limit; i++) arr.push(this.readValueAtIndex(firstIndex + i, prop, depth, maxDepth));
        result[prop.name] = arr;
      }
    }
    return result;
  }

  private readValueInline(buf: Buffer, pos: number, prop: any, depth: number, maxDepth: number): [any, number] {
    if (pos >= buf.length) return [null, pos];
    const dt = prop.dataType;
    switch (dt) {
      case DataForgeService.DT_BOOLEAN: return [buf.readUInt8(pos) !== 0, pos + 1];
      case DataForgeService.DT_INT8:    return [buf.readInt8(pos), pos + 1];
      case DataForgeService.DT_INT16:   return [buf.readInt16LE(pos), pos + 2];
      case DataForgeService.DT_INT32:   return [buf.readInt32LE(pos), pos + 4];
      case DataForgeService.DT_INT64:   return [Number(buf.readBigInt64LE(pos)), pos + 8];
      case DataForgeService.DT_UINT8:   return [buf.readUInt8(pos), pos + 1];
      case DataForgeService.DT_UINT16:  return [buf.readUInt16LE(pos), pos + 2];
      case DataForgeService.DT_UINT32:  return [buf.readUInt32LE(pos), pos + 4];
      case DataForgeService.DT_UINT64:  return [Number(buf.readBigUInt64LE(pos)), pos + 8];
      case DataForgeService.DT_STRING: {
        const strOff = buf.readUInt32LE(pos);
        return [this.dfData!.stringTable1.get(strOff) ?? `STR_${strOff}`, pos + 4];
      }
      case DataForgeService.DT_SINGLE:  return [Math.round(buf.readFloatLE(pos) * 1e6) / 1e6, pos + 4];
      case DataForgeService.DT_DOUBLE:  return [buf.readDoubleLE(pos), pos + 8];
      case DataForgeService.DT_LOCALE: {
        const locOff = buf.readUInt32LE(pos);
        return [this.dfData!.stringTable1.get(locOff) ?? `LOC_${locOff}`, pos + 4];
      }
      case DataForgeService.DT_GUID:    return [this.readGuidAt(buf, pos), pos + 16];
      case DataForgeService.DT_ENUM: {
        const enumOff = buf.readUInt32LE(pos);
        return [this.dfData!.stringTable1.get(enumOff) ?? `ENUM_${enumOff}`, pos + 4];
      }
      case DataForgeService.DT_CLASS: {
        const nestedIdx = prop.structIndex;
        const nestedProps = this.getStructProperties(nestedIdx);
        const nestedResult: Record<string, any> = {};
        const sd = this.dfData!.structDefs[nestedIdx];
        if (sd) nestedResult.__type = sd.name;
        let curPos = pos;
        if (depth < maxDepth) {
          for (const np of nestedProps) {
            if (np.conversionType === 0) {
              const [v, np2] = this.readValueInline(buf, curPos, np, depth + 1, maxDepth);
              nestedResult[np.name] = v;
              curPos = np2;
            } else {
              if (curPos + 8 > buf.length) break;
              const cnt = buf.readUInt32LE(curPos); curPos += 4;
              const fi = buf.readUInt32LE(curPos); curPos += 4;
              const arr: any[] = [];
              for (let j = 0; j < Math.min(cnt, 200); j++) arr.push(this.readValueAtIndex(fi + j, np, depth + 1, maxDepth));
              nestedResult[np.name] = arr;
            }
          }
          return [nestedResult, curPos];
        }
        return [{ __type: sd?.name, __skipped: true }, pos + (sd?.structSize || 0)];
      }
      case DataForgeService.DT_STRONG_PTR: {
        const sIdx = buf.readUInt32LE(pos);
        const vIdx = buf.readUInt16LE(pos + 4);
        if (sIdx === 0xFFFFFFFF) return [null, pos + 8];
        if (depth < maxDepth) return [this.readInstance(sIdx, vIdx, depth + 1, maxDepth), pos + 8];
        return [{ __strongPtr: `${this.dfData!.structDefs[sIdx]?.name || `S${sIdx}`}[${vIdx}]` }, pos + 8];
      }
      case DataForgeService.DT_WEAK_PTR: {
        const sIdx = buf.readUInt32LE(pos);
        const vIdx = buf.readUInt16LE(pos + 4);
        if (sIdx === 0xFFFFFFFF) return [null, pos + 8];
        return [{ __weakPtr: `${this.dfData!.structDefs[sIdx]?.name || `S${sIdx}`}[${vIdx}]` }, pos + 8];
      }
      case DataForgeService.DT_REFERENCE: {
        const rGuid = this.readGuidAt(buf, pos + 4);
        return [{ __ref: rGuid }, pos + 20];
      }
      default:
        console.warn(`[DF] Unknown dataType: 0x${dt.toString(16)} for prop ${prop.name}`);
        return [null, pos];
    }
  }

  private readValueAtIndex(index: number, prop: any, depth: number, maxDepth: number): any {
    if (!this.dfData || !this.dcbBuffer) return null;
    const buf = this.dcbBuffer;
    const va = this.dfData.valueArrayOffsets;
    const dt = prop.dataType;
    switch (dt) {
      case DataForgeService.DT_BOOLEAN: return buf.readUInt8(va.boolean + index) !== 0;
      case DataForgeService.DT_INT8:    return buf.readInt8(va.int8 + index);
      case DataForgeService.DT_INT16:   return buf.readInt16LE(va.int16 + index * 2);
      case DataForgeService.DT_INT32:   return buf.readInt32LE(va.int32 + index * 4);
      case DataForgeService.DT_INT64:   return Number(buf.readBigInt64LE(va.int64 + index * 8));
      case DataForgeService.DT_UINT8:   return buf.readUInt8(va.uint8 + index);
      case DataForgeService.DT_UINT16:  return buf.readUInt16LE(va.uint16 + index * 2);
      case DataForgeService.DT_UINT32:  return buf.readUInt32LE(va.uint32 + index * 4);
      case DataForgeService.DT_UINT64:  return Number(buf.readBigUInt64LE(va.uint64 + index * 8));
      case DataForgeService.DT_STRING: {
        const strOff = buf.readUInt32LE(va.stringId + index * 4);
        return this.dfData.stringTable1.get(strOff) ?? '';
      }
      case DataForgeService.DT_SINGLE:  return Math.round(buf.readFloatLE(va.single + index * 4) * 1e6) / 1e6;
      case DataForgeService.DT_DOUBLE:  return buf.readDoubleLE(va.double + index * 8);
      case DataForgeService.DT_LOCALE: {
        const locOff = buf.readUInt32LE(va.locale + index * 4);
        return this.dfData.stringTable1.get(locOff) ?? '';
      }
      case DataForgeService.DT_GUID:    return this.readGuidAt(buf, va.guid + index * 16);
      case DataForgeService.DT_ENUM: {
        const enumOff = buf.readUInt32LE(va.enum + index * 4);
        return this.dfData.stringTable1.get(enumOff) ?? '';
      }
      case DataForgeService.DT_STRONG_PTR: {
        const off = va.strong + index * 8;
        const sIdx = buf.readUInt32LE(off);
        const vIdx = buf.readUInt16LE(off + 4);
        if (sIdx === 0xFFFFFFFF) return null;
        if (depth < maxDepth) return this.readInstance(sIdx, vIdx, depth + 1, maxDepth);
        return { __strongPtr: `${this.dfData.structDefs[sIdx]?.name}[${vIdx}]` };
      }
      case DataForgeService.DT_WEAK_PTR: {
        const off = va.weak + index * 8;
        const sIdx = buf.readUInt32LE(off);
        const vIdx = buf.readUInt16LE(off + 4);
        if (sIdx === 0xFFFFFFFF) return null;
        return { __weakPtr: `${this.dfData.structDefs[sIdx]?.name}[${vIdx}]` };
      }
      case DataForgeService.DT_REFERENCE: {
        const off = va.reference + index * 20;
        const rGuid = this.readGuidAt(buf, off + 4);
        return { __ref: rGuid };
      }
      case DataForgeService.DT_CLASS: {
        const nestedIdx = prop.structIndex;
        if (depth < maxDepth) return this.readInstance(nestedIdx, index, depth + 1, maxDepth);
        return { __class: this.dfData.structDefs[nestedIdx]?.name };
      }
      default: return null;
    }
  }

  private readGuidAt(buf: Buffer, pos: number): string {
    const d1 = buf.readUInt32LE(pos);
    const d2 = buf.readUInt16LE(pos + 4);
    const d3 = buf.readUInt16LE(pos + 6);
    const d4 = buf.slice(pos + 8, pos + 16).toString("hex");
    return `${d1.toString(16).padStart(8, "0")}-${d2.toString(16).padStart(4, "0")}-${d3.toString(16).padStart(4, "0")}-${d4.substring(0, 4)}-${d4.substring(4)}`;
  }

  // ============ DataForge Binary Parser ============

  private parseDataForge(buf: Buffer) {
    let off = 0;
    const i32 = () => { const v = buf.readInt32LE(off); off += 4; return v; };
    const u16 = () => { const v = buf.readUInt16LE(off); off += 2; return v; };
    const u32 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
    const readGuid = () => {
      const d1 = buf.readUInt32LE(off); const d2 = buf.readUInt16LE(off + 4);
      const d3 = buf.readUInt16LE(off + 6); const d4 = buf.slice(off + 8, off + 16).toString("hex");
      off += 16;
      return `${d1.toString(16).padStart(8, "0")}-${d2.toString(16).padStart(4, "0")}-${d3.toString(16).padStart(4, "0")}-${d4.substring(0, 4)}-${d4.substring(4)}`;
    };

    off += 4; // skip signature
    const version = u32();
    off += 8; // skip unknown fields

    const header = {
      version,
      structDefinitionCount: i32(), propertyDefinitionCount: i32(), enumDefinitionCount: i32(),
      dataMappingCount: i32(), recordDefinitionCount: i32(),
      booleanValueCount: i32(), int8ValueCount: i32(), int16ValueCount: i32(),
      int32ValueCount: i32(), int64ValueCount: i32(),
      uint8ValueCount: i32(), uint16ValueCount: i32(), uint32ValueCount: i32(), uint64ValueCount: i32(),
      singleValueCount: i32(), doubleValueCount: i32(),
      guidValueCount: i32(), stringIdValueCount: i32(), localeValueCount: i32(), enumValueCount: i32(),
      strongValueCount: i32(), weakValueCount: i32(), referenceValueCount: i32(), enumOptionCount: i32(),
      textLength: u32(), textLength2: 0 as number
    };
    header.textLength2 = version >= 6 ? u32() : 0;

    const structDefs: any[] = [];
    for (let i = 0; i < header.structDefinitionCount; i++) {
      structDefs.push({ nameOffset: i32(), parentTypeIndex: i32(), attributeCount: u16(), firstAttributeIndex: u16(), structSize: u32() });
    }

    const propertyDefs: any[] = [];
    for (let i = 0; i < header.propertyDefinitionCount; i++) {
      propertyDefs.push({ nameOffset: u32(), structIndex: u16(), dataType: u16(), conversionType: u16() & 0xFF, padding: u16() });
    }

    off += header.enumDefinitionCount * 8; // skip enums

    const dataMappings: { structCount: number; structIndex: number }[] = [];
    for (let i = 0; i < header.dataMappingCount; i++) {
      dataMappings.push(version >= 5 ? { structCount: u32(), structIndex: u32() } : { structCount: u16(), structIndex: u16() });
    }

    const records: any[] = [];
    for (let i = 0; i < header.recordDefinitionCount; i++) {
      const nameOffset = i32(); const fileNameOffset = i32(); const structIndex = i32();
      const id = readGuid(); const instanceIndex = u16(); const structSize = u16();
      records.push({ nameOffset, fileNameOffset, structIndex, id, instanceIndex, structSize });
    }

    // Value array offsets
    const vaBase = off;
    const valueArrayOffsets: Record<string, number> = { int8: vaBase };
    valueArrayOffsets.int16     = valueArrayOffsets.int8    + header.int8ValueCount * 1;
    valueArrayOffsets.int32     = valueArrayOffsets.int16   + header.int16ValueCount * 2;
    valueArrayOffsets.int64     = valueArrayOffsets.int32   + header.int32ValueCount * 4;
    valueArrayOffsets.uint8     = valueArrayOffsets.int64   + header.int64ValueCount * 8;
    valueArrayOffsets.uint16    = valueArrayOffsets.uint8   + header.uint8ValueCount * 1;
    valueArrayOffsets.uint32    = valueArrayOffsets.uint16  + header.uint16ValueCount * 2;
    valueArrayOffsets.uint64    = valueArrayOffsets.uint32  + header.uint32ValueCount * 4;
    valueArrayOffsets.boolean   = valueArrayOffsets.uint64  + header.uint64ValueCount * 8;
    valueArrayOffsets.single    = valueArrayOffsets.boolean + header.booleanValueCount * 1;
    valueArrayOffsets.double    = valueArrayOffsets.single  + header.singleValueCount * 4;
    valueArrayOffsets.guid      = valueArrayOffsets.double  + header.doubleValueCount * 8;
    valueArrayOffsets.stringId  = valueArrayOffsets.guid    + header.guidValueCount * 16;
    valueArrayOffsets.locale    = valueArrayOffsets.stringId + header.stringIdValueCount * 4;
    valueArrayOffsets.enum      = valueArrayOffsets.locale  + header.localeValueCount * 4;
    valueArrayOffsets.strong    = valueArrayOffsets.enum    + header.enumValueCount * 4;
    valueArrayOffsets.weak      = valueArrayOffsets.strong  + header.strongValueCount * 8;
    valueArrayOffsets.reference = valueArrayOffsets.weak    + header.weakValueCount * 8;
    valueArrayOffsets.enumOption= valueArrayOffsets.reference + header.referenceValueCount * 20;
    off = valueArrayOffsets.enumOption + header.enumOptionCount * 4;

    console.log(`[DF] Value arrays: ${vaBase} -> ${off} (${off - vaBase} bytes)`);

    // String tables
    const st1Start = off;
    const st1 = new Map<number, string>();
    let sOff = 0, s = "";
    while (off < st1Start + header.textLength) {
      const b = buf[off++];
      if (b === 0) { st1.set(sOff, s); sOff = off - st1Start; s = ""; }
      else s += String.fromCharCode(b);
    }

    const st2 = new Map<number, string>();
    if (header.version >= 6 && header.textLength2 > 0) {
      const st2Start = off;
      sOff = 0; s = "";
      while (off < st2Start + header.textLength2) {
        const b = buf[off++];
        if (b === 0) { st2.set(sOff, s); sOff = off - st2Start; s = ""; }
        else s += String.fromCharCode(b);
      }
    }

    const dataOffset = off;

    // StructToDataOffsetMap
    const structToDataOffsetMap = new Map<number, number>();
    let lastOff = 0;
    for (let i = 0; i < dataMappings.length; i++) {
      const dm = dataMappings[i];
      const sd = structDefs[i];
      if (!structToDataOffsetMap.has(dm.structIndex)) structToDataOffsetMap.set(dm.structIndex, lastOff);
      lastOff += dm.structCount * (sd?.structSize || 0);
    }

    console.log(`[DF] Data section: offset=${dataOffset}, size=${lastOff}, endCheck=${dataOffset + lastOff === buf.length ? 'OK' : 'MISMATCH'}`);

    // Resolve names
    const nameTable = header.version >= 6 ? st2 : st1;
    for (const sd of structDefs) sd.name = nameTable.get(sd.nameOffset) || `STRUCT_${sd.nameOffset}`;
    for (const pd of propertyDefs) pd.name = nameTable.get(pd.nameOffset) || `PROP_${pd.nameOffset}`;
    for (const r of records) {
      r.name = nameTable.get(r.nameOffset) || `RECORD_${r.nameOffset}`;
      r.fileName = st1.get(r.fileNameOffset) || `FILE_${r.fileNameOffset}`;
    }

    return { header, structDefs, propertyDefs, dataMappings, records, stringTable1: st1, stringTable2: st2, valueArrayOffsets, dataOffset, structToDataOffsetMap };
  }

  // ============ Index builders ============

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
      this.vehicleIndex.set(className.toLowerCase(), { uuid: r.id, name: r.name, className });
    }
    console.log(`[DF] Built vehicle index: ${this.vehicleIndex.size} vehicles`);

    // GUID index for ALL records (weapons, ammo, gimbals, etc.)
    const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
    for (let i = 0; i < this.dfData.records.length; i++) {
      const r = this.dfData.records[i];
      if (r.id && r.id !== ZERO_GUID) {
        const className = r.structIndex === entityClassDefIndex ? (r.name?.replace('EntityClassDefinition.', '') || '') : '';
        this.guidIndex.set(r.id, className || r.name || `RECORD_${i}`);
      }
    }
    console.log(`[DF] Built GUID index: ${this.guidIndex.size} record GUIDs`);
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
      'MissileRack':   /missile_?rack[s]?[\/\\]|missile_launcher/i,
      'Turret':        /turret[s]?[\/\\]/i,
      'Missile':       /missile[s]?[\/\\](?!rack|launcher|_rack)/i,
      'Radar':         /radar[s]?[\/\\]/i,
    };

    let scanned = 0;
    for (const r of this.dfData.records) {
      if (r.structIndex !== entityClassIdx) continue;
      const fn = (r.fileName || '').toLowerCase();
      if (!fn.includes('scitem') && !fn.includes('/weapon/') && !fn.includes('/missile/')) continue;
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
        if (lcName.includes('_test') || lcName.includes('_debug') || lcName.includes('_template') || lcName.includes('_indestructible') || lcName.includes('_npc_only')) continue;

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
              if (loc?.Name && typeof loc.Name === 'string' && !loc.Name.startsWith('LOC_') && !loc.Name.startsWith('@')) comp.name = loc.Name;
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
                  const pp = ammoData.projectileParams;
                  if (pp && typeof pp === 'object') {
                    const dmg = pp.damage;
                    if (dmg && typeof dmg === 'object') {
                      const physical = typeof dmg.DamagePhysical === 'number' ? dmg.DamagePhysical : 0;
                      const energy = typeof dmg.DamageEnergy === 'number' ? dmg.DamageEnergy : 0;
                      const distortion = typeof dmg.DamageDistortion === 'number' ? dmg.DamageDistortion : 0;
                      const thermal = typeof dmg.DamageThermal === 'number' ? dmg.DamageThermal : 0;
                      const biochemical = typeof dmg.DamageBiochemical === 'number' ? dmg.DamageBiochemical : 0;
                      const stun = typeof dmg.DamageStun === 'number' ? dmg.DamageStun : 0;
                      const totalDmg = physical + energy + distortion + thermal + biochemical + stun;
                      if (totalDmg > 0) {
                        comp.weaponDamage = Math.round(totalDmg * 10000) / 10000;
                        const dt: [string, number][] = [['physical', physical], ['energy', energy], ['distortion', distortion], ['thermal', thermal], ['biochemical', biochemical], ['stun', stun]];
                        comp.weaponDamageType = dt.sort((a, b) => b[1] - a[1])[0][0];
                      }
                    }
                    if (typeof pp.speed === 'number' && !comp.weaponSpeed) comp.weaponSpeed = Math.round(pp.speed * 100) / 100;
                    if (typeof pp.lifetime === 'number' && comp.weaponSpeed) comp.weaponRange = Math.round(pp.lifetime * comp.weaponSpeed * 100) / 100;
                  }
                }
              } catch { /* skip ammo errors */ }
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
            if (typeof c.driveSpeed === 'number') comp.qdSpeed = Math.round(c.driveSpeed * 100) / 100;
            if (typeof c.spoolUpTime === 'number') comp.qdSpoolTime = Math.round(c.spoolUpTime * 100) / 100;
            if (typeof c.cooldownTime === 'number') comp.qdCooldown = Math.round(c.cooldownTime * 100) / 100;
            if (typeof c.quantumFuelRequirement === 'number') comp.qdFuelRate = c.quantumFuelRequirement;
            if (typeof c.maxJumpRange === 'number') comp.qdRange = Math.round(c.maxJumpRange * 100) / 100;
            const params = c.params;
            if (params && typeof params === 'object') {
              if (typeof params.driveSpeed === 'number' && !comp.qdSpeed) comp.qdSpeed = Math.round(params.driveSpeed * 100) / 100;
              if (typeof params.spoolUpTime === 'number' && !comp.qdSpoolTime) comp.qdSpoolTime = Math.round(params.spoolUpTime * 100) / 100;
              if (typeof params.cooldownTime === 'number' && !comp.qdCooldown) comp.qdCooldown = Math.round(params.cooldownTime * 100) / 100;
            }
            const jp = c.jumpParams || c.JumpParams;
            if (jp && typeof jp === 'object') {
              if (typeof jp.Stage1AccelerationRate === 'number') comp.qdStage1Accel = Math.round(jp.Stage1AccelerationRate * 100) / 100;
              if (typeof jp.Stage2AccelerationRate === 'number') comp.qdStage2Accel = Math.round(jp.Stage2AccelerationRate * 100) / 100;
            }
          }

          // Missile
          if (cType === 'SCItemMissileParams') {
            const d = c.explosionParams || c.damage;
            if (d && typeof d === 'object') {
              const total = (typeof d.physical === 'number' ? d.physical : 0) + (typeof d.energy === 'number' ? d.energy : 0) + (typeof d.distortion === 'number' ? d.distortion : 0);
              if (total > 0) comp.missileDamage = Math.round(total * 100) / 100;
            }
            if (typeof c.damage === 'number') comp.missileDamage = Math.round(c.damage * 100) / 100;
          }
          if (cType === 'SCItemMissileGuidanceParams' || cType === 'MissileGuidanceParams') {
            if (typeof c.lockTime === 'number') comp.missileLockTime = Math.round(c.lockTime * 100) / 100;
            if (typeof c.trackingSignalType === 'string') comp.missileSignalType = c.trackingSignalType;
            if (typeof c.lockRangeMax === 'number') comp.missileLockRange = Math.round(c.lockRangeMax * 100) / 100;
            if (typeof c.trackingDistanceMax === 'number') comp.missileRange = Math.round(c.trackingDistanceMax * 100) / 100;
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
        }

        // Derived stats
        if (comp.weaponDamage && comp.weaponFireRate) {
          const pellets = comp.weaponPelletsPerShot || 1;
          comp.weaponAlphaDamage = Math.round(comp.weaponDamage * pellets * 10000) / 10000;
          comp.weaponDps = Math.round(comp.weaponAlphaDamage * (comp.weaponFireRate / 60) * 10000) / 10000;
        }

        // Manufacturer from className prefix
        if (!comp.manufacturerCode) {
          const mfgMatch = className.match(/^([A-Z]{3,5})_/);
          if (mfgMatch) { comp.manufacturerCode = mfgMatch[1]; comp.manufacturer = MANUFACTURER_CODES[mfgMatch[1]] || mfgMatch[1]; }
        }

        components.push(comp);
      } catch { /* skip */ }
    }
    console.log(`[DF] Extracted ${components.length} components from ${scanned} SCItem records`);
    return components;
  }

  // ============ Vehicle loadout extraction ============

  extractVehicleLoadout(className: string): Array<{
    portName: string; portType?: string; componentClassName?: string;
    children?: Array<{ portName: string; componentClassName?: string }>;
  }> | null {
    if (!this.dfData || !this.dcbBuffer) return null;
    const record = this.findEntityRecord(className);
    if (!record) return null;
    const data = this.readInstance(record.structIndex, record.instanceIndex, 0, 6);
    if (!data || !Array.isArray(data.Components)) return null;

    const mainEntries = this.extractLoadoutEntries(data);
    const emptyPorts = mainEntries.filter(e => !e.entityClassName && e.portName);
    let variantMap: Map<string, string> | null = null;
    if (emptyPorts.length > 0) variantMap = this.findVariantLoadoutMap(className);

    const loadoutItems: any[] = [];
    const processedPorts = new Set<string>();

    const processEntry = (portName: string, entClassName: string, inlineChildren?: Array<{ portName: string; entityClassName: string }>): any => {
      const item: any = { portName, componentClassName: entClassName || null, portType: classifyPort(portName, entClassName) };
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
      } catch { continue; }
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
      console.error(`[DF] Error extracting stats for ${className}:`, err);
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
    // Try variant-specific XML first, then base class
    const xmlNamesToTry = [entities.vehicleXmlName];
    if (entities.vehicleXmlName !== className) xmlNamesToTry.push(className);
    
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
   * Returns the tree of parts with hp (damageMax) and the sum total.
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

      // Only count AnimatedJoint parts as hull parts (not ItemPort)
      if (pClass === 'AnimatedJoint' || pClass === 'Animated') {
        if (dmgMax > 0) {
          totalHp += dmgMax;
          // First major damageMax part is the body
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
    if (typeof vp.career === 'string') vehicle.career = vp.career;
    if (typeof vp.role === 'string') vehicle.role = vp.role;
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
  if (lp.includes('quantum') || lp.includes('qd') || lp.includes('quantum_drive')) return 'QuantumDrive';
  if (lp.includes('missile') || lp.includes('pylon')) return 'MissileRack';
  if (lp.includes('radar')) return 'Radar';
  if (lp.includes('countermeasure')) return 'Countermeasure';
  if (lp.includes('controller_flight')) return 'FlightController';
  if (lp.includes('thruster')) return 'Thruster';
  if (lp.includes('weapon_rack') || lp.includes('weaponrack') || lp.includes('weapon_locker') || lp.includes('weaponlocker') || lp.includes('weapon_cabinet')) return 'WeaponRack';
  if (lp.includes('weapon') && (lp.includes('controller') || lp.includes('cockpit') || lp.includes('locker'))) return 'Other';
  if (lp.includes('weapon') && !lp.includes('rack')) return 'Weapon';
  return 'Other';
}
