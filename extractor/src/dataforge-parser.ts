/**
 * DataForge Binary Parser — Parses Star Citizen Game2.dcb DataForge binary format
 *
 * Extracted from DataForgeService for modularity.
 * Pure functions: no side effects, no state — only buffer parsing.
 */
import logger from "./logger.js";

// ── Data type constants ──────────────────────────────────

export const DT_BOOLEAN    = 0x0001;
export const DT_INT8       = 0x0002;
export const DT_INT16      = 0x0003;
export const DT_INT32      = 0x0004;
export const DT_INT64      = 0x0005;
export const DT_UINT8      = 0x0006;
export const DT_UINT16     = 0x0007;
export const DT_UINT32     = 0x0008;
export const DT_UINT64     = 0x0009;
export const DT_STRING     = 0x000A;
export const DT_SINGLE     = 0x000B;
export const DT_DOUBLE     = 0x000C;
export const DT_LOCALE     = 0x000D;
export const DT_GUID       = 0x000E;
export const DT_ENUM       = 0x000F;
export const DT_CLASS      = 0x0010;
export const DT_STRONG_PTR = 0x0110;
export const DT_WEAK_PTR   = 0x0210;
export const DT_REFERENCE  = 0x0310;

/** Human-readable names for data types (used in debug output) */
export const DT_NAMES: Record<number, string> = {
  [DT_BOOLEAN]: 'BOOLEAN', [DT_INT8]: 'INT8', [DT_INT16]: 'INT16', [DT_INT32]: 'INT32', [DT_INT64]: 'INT64',
  [DT_UINT8]: 'UINT8', [DT_UINT16]: 'UINT16', [DT_UINT32]: 'UINT32', [DT_UINT64]: 'UINT64',
  [DT_STRING]: 'STRING', [DT_SINGLE]: 'SINGLE', [DT_DOUBLE]: 'DOUBLE', [DT_LOCALE]: 'LOCALE',
  [DT_GUID]: 'GUID', [DT_ENUM]: 'ENUM', [DT_CLASS]: 'CLASS', [DT_STRONG_PTR]: 'STRONG_PTR',
  [DT_WEAK_PTR]: 'WEAK_PTR', [DT_REFERENCE]: 'REFERENCE',
};

// ── Types ────────────────────────────────────────────────

/** Binary struct definition parsed from Game2.dcb */
export interface StructDef {
  nameOffset: number;
  parentTypeIndex: number;
  attributeCount: number;
  firstAttributeIndex: number;
  structSize: number;
  /** Resolved after parsing from string table */
  name: string;
}

/** Binary property definition parsed from Game2.dcb */
export interface PropertyDef {
  nameOffset: number;
  structIndex: number;
  dataType: number;
  conversionType: number;
  padding: number;
  /** Resolved after parsing from string table */
  name: string;
}

/** Binary record definition parsed from Game2.dcb */
export interface RecordDef {
  nameOffset: number;
  fileNameOffset: number;
  structIndex: number;
  id: string;
  instanceIndex: number;
  structSize: number;
  /** Resolved after parsing from string table */
  name: string;
  /** Resolved after parsing from string table */
  fileName: string;
}

export interface DataForgeData {
  header: {
    version: number;
    structDefinitionCount: number;
    propertyDefinitionCount: number;
    enumDefinitionCount: number;
    dataMappingCount: number;
    recordDefinitionCount: number;
    booleanValueCount: number; int8ValueCount: number; int16ValueCount: number;
    int32ValueCount: number; int64ValueCount: number;
    uint8ValueCount: number; uint16ValueCount: number; uint32ValueCount: number; uint64ValueCount: number;
    singleValueCount: number; doubleValueCount: number;
    guidValueCount: number; stringIdValueCount: number; localeValueCount: number; enumValueCount: number;
    strongValueCount: number; weakValueCount: number; referenceValueCount: number; enumOptionCount: number;
    textLength: number; textLength2: number;
  };
  structDefs: StructDef[];
  propertyDefs: PropertyDef[];
  dataMappings: { structCount: number; structIndex: number }[];
  records: RecordDef[];
  stringTable1: Map<number, string>;
  stringTable2: Map<number, string>;
  valueArrayOffsets: Record<string, number>;
  dataOffset: number;
  structToDataOffsetMap: Map<number, number>;
}

// ── GUID helpers ─────────────────────────────────────────

export function readGuidAt(buf: Buffer, pos: number): string {
  const d1 = buf.readUInt32LE(pos);
  const d2 = buf.readUInt16LE(pos + 4);
  const d3 = buf.readUInt16LE(pos + 6);
  const d4 = buf.slice(pos + 8, pos + 16).toString("hex");
  return `${d1.toString(16).padStart(8, "0")}-${d2.toString(16).padStart(4, "0")}-${d3.toString(16).padStart(4, "0")}-${d4.substring(0, 4)}-${d4.substring(4)}`;
}

// ── Struct property resolver ─────────────────────────────

export function getStructProperties(dfData: DataForgeData, structIndex: number): PropertyDef[] {
  const { structDefs, propertyDefs } = dfData;
  const sd = structDefs[structIndex];
  if (!sd) return [];
  const hierarchy: StructDef[] = [];
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
  const props: PropertyDef[] = [];
  for (const h of hierarchy) {
    for (let pi = h.firstAttributeIndex; pi < h.firstAttributeIndex + h.attributeCount; pi++) {
      if (propertyDefs[pi]) props.push(propertyDefs[pi]);
    }
  }
  return props;
}

// ── Instance reader ──────────────────────────────────────

export function readInstance(
  dfData: DataForgeData, dcbBuffer: Buffer,
  structIndex: number, variantIndex: number,
  depth = 0, maxDepth = 3,
): Record<string, any> | null {
  if (depth > maxDepth) return null;
  const buf = dcbBuffer;
  const { structDefs, structToDataOffsetMap, dataOffset } = dfData;
  const mapOffset = structToDataOffsetMap.get(structIndex);
  if (mapOffset === undefined) return null;
  const sd = structDefs[structIndex];
  if (!sd) return null;
  const instancePos = dataOffset + mapOffset + variantIndex * sd.structSize;
  if (instancePos + sd.structSize > buf.length) return null;
  const allProps = getStructProperties(dfData, structIndex);
  const result: Record<string, any> = { __type: sd.name };
  let pos = instancePos;
  for (const prop of allProps) {
    if (prop.conversionType === 0) {
      const [val, newPos] = readValueInline(dfData, dcbBuffer, buf, pos, prop, depth, maxDepth);
      result[prop.name] = val;
      pos = newPos;
    } else {
      if (pos + 8 > buf.length) break;
      const count = buf.readUInt32LE(pos); pos += 4;
      const firstIndex = buf.readUInt32LE(pos); pos += 4;
      const arr: any[] = [];
      const limit = Math.min(count, 200);
      for (let i = 0; i < limit; i++) arr.push(readValueAtIndex(dfData, dcbBuffer, firstIndex + i, prop, depth, maxDepth));
      result[prop.name] = arr;
    }
  }
  return result;
}

function readValueInline(
  dfData: DataForgeData, dcbBuffer: Buffer,
  buf: Buffer, pos: number, prop: PropertyDef,
  depth: number, maxDepth: number,
): [any, number] {
  if (pos >= buf.length) return [null, pos];
  const dt = prop.dataType;
  switch (dt) {
    case DT_BOOLEAN: return [buf.readUInt8(pos) !== 0, pos + 1];
    case DT_INT8:    return [buf.readInt8(pos), pos + 1];
    case DT_INT16:   return [buf.readInt16LE(pos), pos + 2];
    case DT_INT32:   return [buf.readInt32LE(pos), pos + 4];
    case DT_INT64:   return [Number(buf.readBigInt64LE(pos)), pos + 8];
    case DT_UINT8:   return [buf.readUInt8(pos), pos + 1];
    case DT_UINT16:  return [buf.readUInt16LE(pos), pos + 2];
    case DT_UINT32:  return [buf.readUInt32LE(pos), pos + 4];
    case DT_UINT64:  return [Number(buf.readBigUInt64LE(pos)), pos + 8];
    case DT_STRING: {
      const strOff = buf.readUInt32LE(pos);
      return [dfData.stringTable1.get(strOff) ?? `STR_${strOff}`, pos + 4];
    }
    case DT_SINGLE:  return [Math.round(buf.readFloatLE(pos) * 1e6) / 1e6, pos + 4];
    case DT_DOUBLE:  return [buf.readDoubleLE(pos), pos + 8];
    case DT_LOCALE: {
      const locOff = buf.readUInt32LE(pos);
      return [dfData.stringTable1.get(locOff) ?? `LOC_${locOff}`, pos + 4];
    }
    case DT_GUID:    return [readGuidAt(buf, pos), pos + 16];
    case DT_ENUM: {
      const enumOff = buf.readUInt32LE(pos);
      return [dfData.stringTable1.get(enumOff) ?? `ENUM_${enumOff}`, pos + 4];
    }
    case DT_CLASS: {
      const nestedIdx = prop.structIndex;
      const nestedProps = getStructProperties(dfData, nestedIdx);
      const nestedResult: Record<string, any> = {};
      const sd = dfData.structDefs[nestedIdx];
      if (sd) nestedResult.__type = sd.name;
      let curPos = pos;
      if (depth < maxDepth) {
        for (const np of nestedProps) {
          if (np.conversionType === 0) {
            const [v, np2] = readValueInline(dfData, dcbBuffer, buf, curPos, np, depth + 1, maxDepth);
            nestedResult[np.name] = v;
            curPos = np2;
          } else {
            if (curPos + 8 > buf.length) break;
            const cnt = buf.readUInt32LE(curPos); curPos += 4;
            const fi = buf.readUInt32LE(curPos); curPos += 4;
            const arr: any[] = [];
            for (let j = 0; j < Math.min(cnt, 200); j++) arr.push(readValueAtIndex(dfData, dcbBuffer, fi + j, np, depth + 1, maxDepth));
            nestedResult[np.name] = arr;
          }
        }
        return [nestedResult, curPos];
      }
      return [{ __type: sd?.name, __skipped: true }, pos + (sd?.structSize || 0)];
    }
    case DT_STRONG_PTR: {
      const sIdx = buf.readUInt32LE(pos);
      const vIdx = buf.readUInt16LE(pos + 4);
      if (sIdx === 0xFFFFFFFF) return [null, pos + 8];
      if (depth < maxDepth) return [readInstance(dfData, dcbBuffer, sIdx, vIdx, depth + 1, maxDepth), pos + 8];
      return [{ __strongPtr: `${dfData.structDefs[sIdx]?.name || `S${sIdx}`}[${vIdx}]` }, pos + 8];
    }
    case DT_WEAK_PTR: {
      const sIdx = buf.readUInt32LE(pos);
      const vIdx = buf.readUInt16LE(pos + 4);
      if (sIdx === 0xFFFFFFFF) return [null, pos + 8];
      return [{ __weakPtr: `${dfData.structDefs[sIdx]?.name || `S${sIdx}`}[${vIdx}]` }, pos + 8];
    }
    case DT_REFERENCE: {
      const rGuid = readGuidAt(buf, pos + 4);
      return [{ __ref: rGuid }, pos + 20];
    }
    default:
      logger.warn(`Unknown dataType: 0x${dt.toString(16)} for prop ${prop.name} — skipping 4 bytes`, { module: 'dataforge' });
      return [null, pos + 4];
  }
}

function readValueAtIndex(
  dfData: DataForgeData, dcbBuffer: Buffer,
  index: number, prop: PropertyDef,
  depth: number, maxDepth: number,
): unknown {
  const buf = dcbBuffer;
  const va = dfData.valueArrayOffsets;
  const dt = prop.dataType;
  switch (dt) {
    case DT_BOOLEAN: return buf.readUInt8(va.boolean + index) !== 0;
    case DT_INT8:    return buf.readInt8(va.int8 + index);
    case DT_INT16:   return buf.readInt16LE(va.int16 + index * 2);
    case DT_INT32:   return buf.readInt32LE(va.int32 + index * 4);
    case DT_INT64:   return Number(buf.readBigInt64LE(va.int64 + index * 8));
    case DT_UINT8:   return buf.readUInt8(va.uint8 + index);
    case DT_UINT16:  return buf.readUInt16LE(va.uint16 + index * 2);
    case DT_UINT32:  return buf.readUInt32LE(va.uint32 + index * 4);
    case DT_UINT64:  return Number(buf.readBigUInt64LE(va.uint64 + index * 8));
    case DT_STRING: {
      const strOff = buf.readUInt32LE(va.stringId + index * 4);
      return dfData.stringTable1.get(strOff) ?? '';
    }
    case DT_SINGLE:  return Math.round(buf.readFloatLE(va.single + index * 4) * 1e6) / 1e6;
    case DT_DOUBLE:  return buf.readDoubleLE(va.double + index * 8);
    case DT_LOCALE: {
      const locOff = buf.readUInt32LE(va.locale + index * 4);
      return dfData.stringTable1.get(locOff) ?? '';
    }
    case DT_GUID:    return readGuidAt(buf, va.guid + index * 16);
    case DT_ENUM: {
      const enumOff = buf.readUInt32LE(va.enum + index * 4);
      return dfData.stringTable1.get(enumOff) ?? '';
    }
    case DT_STRONG_PTR: {
      const off = va.strong + index * 8;
      const sIdx = buf.readUInt32LE(off);
      const vIdx = buf.readUInt16LE(off + 4);
      if (sIdx === 0xFFFFFFFF) return null;
      if (depth < maxDepth) return readInstance(dfData, dcbBuffer, sIdx, vIdx, depth + 1, maxDepth);
      return { __strongPtr: `${dfData.structDefs[sIdx]?.name}[${vIdx}]` };
    }
    case DT_WEAK_PTR: {
      const off = va.weak + index * 8;
      const sIdx = buf.readUInt32LE(off);
      const vIdx = buf.readUInt16LE(off + 4);
      if (sIdx === 0xFFFFFFFF) return null;
      return { __weakPtr: `${dfData.structDefs[sIdx]?.name}[${vIdx}]` };
    }
    case DT_REFERENCE: {
      const off = va.reference + index * 20;
      const rGuid = readGuidAt(buf, off + 4);
      return { __ref: rGuid };
    }
    case DT_CLASS: {
      const nestedIdx = prop.structIndex;
      if (depth < maxDepth) return readInstance(dfData, dcbBuffer, nestedIdx, index, depth + 1, maxDepth);
      return { __class: dfData.structDefs[nestedIdx]?.name };
    }
    default: return null;
  }
}

// ── Binary parser ────────────────────────────────────────

export function parseDataForge(buf: Buffer): DataForgeData {
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
    textLength: u32(), textLength2: 0 as number,
  };
  header.textLength2 = version >= 6 ? u32() : 0;

  const structDefs: StructDef[] = [];
  for (let i = 0; i < header.structDefinitionCount; i++) {
    structDefs.push({ nameOffset: i32(), parentTypeIndex: i32(), attributeCount: u16(), firstAttributeIndex: u16(), structSize: u32(), name: '' });
  }

  const propertyDefs: PropertyDef[] = [];
  for (let i = 0; i < header.propertyDefinitionCount; i++) {
    propertyDefs.push({ nameOffset: u32(), structIndex: u16(), dataType: u16(), conversionType: u16() & 0xFF, padding: u16(), name: '' });
  }

  off += header.enumDefinitionCount * 8; // skip enums

  const dataMappings: { structCount: number; structIndex: number }[] = [];
  for (let i = 0; i < header.dataMappingCount; i++) {
    dataMappings.push(version >= 5 ? { structCount: u32(), structIndex: u32() } : { structCount: u16(), structIndex: u16() });
  }

  const records: RecordDef[] = [];
  for (let i = 0; i < header.recordDefinitionCount; i++) {
    const nameOffset = i32(); const fileNameOffset = i32(); const structIndex = i32();
    const id = readGuid(); const instanceIndex = u16(); const structSize = u16();
    records.push({ nameOffset, fileNameOffset, structIndex, id, instanceIndex, structSize, name: '', fileName: '' });
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
  valueArrayOffsets.enumOption = valueArrayOffsets.reference + header.referenceValueCount * 20;
  off = valueArrayOffsets.enumOption + header.enumOptionCount * 4;

  logger.debug(`Value arrays: ${vaBase} -> ${off} (${off - vaBase} bytes)`, { module: 'dataforge' });

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

  logger.debug(`Data section: offset=${dataOffset}, size=${lastOff}, endCheck=${dataOffset + lastOff === buf.length ? 'OK' : 'MISMATCH'}`, { module: 'dataforge' });

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
