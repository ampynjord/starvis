/**
 * STARAPI - UNIFIED SERVICES & PROVIDERS
 * All business logic, providers, and types in one file
 */
import { createHash } from "crypto";
import { readFileSync, statSync } from "fs";
import { FileHandle, open } from "fs/promises";
import type { Pool, PoolConnection } from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { inflateRawSync } from "zlib";
import { DB_CONFIG, P4K_CONFIG } from "./utils/config.js";
import { MANUFACTURER_CODES, RSI_TO_P4K_ALIASES } from "./utils/p4k-aliases.js";
import type { P4KEntry, P4KVehicleData, TransformedShip } from "./utils/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Re-export for backward compatibility
export { DB_CONFIG, MANUFACTURER_CODES, P4K_CONFIG };
export type { P4KEntry, P4KVehicleData, TransformedShip };

// =============== SCHEMA INIT ===============
export async function initializeSchema(conn: PoolConnection): Promise<void> {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  console.log("📄 Loading schema from:", schemaPath);
  try {
    const schema = readFileSync(schemaPath, "utf-8");
    // Remove comments and empty lines, then split by ;
    const cleaned = schema.replace(/--.*$/gm, "").replace(/\n\s*\n/g, "\n");
    const statements = cleaned.split(";").map(s => s.trim()).filter(s => s.length > 10);
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    for (const sql of statements) {
      console.log(`⚙️  Executing: ${sql.substring(0, 50)}...`);
      await conn.execute(sql);
    }
    
    // Create composite indexes (with error handling for duplicates)
    const indexes = [
      "CREATE INDEX idx_manufacturer_status ON ships (manufacturer_code, production_status)",
      "CREATE INDEX idx_size_role ON ships (size, role)",
      "CREATE INDEX idx_cargo_spec ON ship_specs (cargo_scu)",
      "CREATE INDEX idx_crew_spec ON ship_specs (max_crew)"
    ];
    
    for (const indexSql of indexes) {
      try {
        await conn.execute(indexSql);
        console.log(`✅ Index created: ${indexSql.match(/INDEX (\w+)/)?.[1]}`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME') {
          console.log(`⏭️  Index already exists: ${indexSql.match(/INDEX (\w+)/)?.[1]}`);
        } else {
          console.warn(`⚠️  Index creation failed: ${e.message}`);
        }
      }
    }
    
    console.log("✅ Schema initialized");
    
    // Migrations: add columns that may not exist yet
    const migrations = [
      "ALTER TABLE ship_specs ADD COLUMN afterburner_speed DECIMAL(10,2) COMMENT 'Afterburner/boost forward speed from P4K' AFTER max_speed",
      "ALTER TABLE ship_specs ADD COLUMN weapon_hardpoints TINYINT UNSIGNED COMMENT 'Number of weapon hardpoints' AFTER hydrogen_fuel",
      "ALTER TABLE ship_specs ADD COLUMN missile_racks TINYINT UNSIGNED COMMENT 'Number of missile racks' AFTER weapon_hardpoints",
      "ALTER TABLE ship_specs ADD COLUMN turrets TINYINT UNSIGNED COMMENT 'Number of turrets' AFTER missile_racks",
      "ALTER TABLE ship_specs ADD COLUMN actual_mass DECIMAL(15,2) COMMENT 'Actual mass from P4K (kg)' AFTER turrets",
      "ALTER TABLE ship_specs ADD COLUMN em_signature DECIMAL(10,2) COMMENT 'EM signature (electromagnetic)' AFTER actual_mass",
      "ALTER TABLE ship_specs ADD COLUMN ir_signature DECIMAL(10,2) COMMENT 'IR signature (thermal)' AFTER em_signature",
      "ALTER TABLE ship_specs ADD COLUMN cs_signature DECIMAL(10,2) COMMENT 'CS signature (cross-section radar)' AFTER ir_signature",
      "ALTER TABLE ship_specs ADD COLUMN shield_faces TINYINT UNSIGNED COMMENT 'Number of shield faces' AFTER cs_signature",
      "ALTER TABLE ship_specs ADD COLUMN radar_range DECIMAL(10,2) COMMENT 'Radar detection range (m)' AFTER shield_faces",
    ];
    for (const sql of migrations) {
      try { await conn.execute(sql); console.log(`✅ Migration: ${sql.substring(0, 60)}...`); }
      catch (e: any) { if (e.code === 'ER_DUP_FIELDNAME') { /* column already exists */ } else console.warn(`⚠️ Migration skipped: ${e.message}`); }
    }
  } catch (e) {
    console.error("❌ Schema error:", e);
    throw e;
  }
}

// =============== P4K PROVIDER ===============
let fzstd: { decompress: (data: Uint8Array) => Uint8Array } | null = null;
async function loadFzstd() { if (!fzstd) { try { fzstd = await import("fzstd"); } catch {} } return fzstd; }

const CENTRAL_DIR_SIG = 0x02014b50, END_SIG = 0x06054b50, ZIP64_END_SIG = 0x06064b50, ZIP64_LOC_SIG = 0x07064b50, LOCAL_SIG = 0x04034b50;

export class P4KProvider {
  private fd: FileHandle | null = null;
  private fileSize = 0;
  private entries = new Map<string, P4KEntry>();
  private entriesLower = new Map<string, P4KEntry>();
  private entriesLoaded = false;
  private totalEntries = 0;
  private centralDirOffset = 0;
  private centralDirSize = 0;

  constructor(private p4kPath: string) {}

  async open(): Promise<void> {
    this.fileSize = statSync(this.p4kPath).size;
    this.fd = await open(this.p4kPath, "r");
    await this.readEndOfCentralDirectory();
    console.log(`📦 P4K ouvert: ${this.totalEntries.toLocaleString()} entrées`);
  }

  async close(): Promise<void> { if (this.fd) { await this.fd.close(); this.fd = null; this.entries.clear(); this.entriesLoaded = false; } }

  private async readEndOfCentralDirectory(): Promise<void> {
    if (!this.fd) throw new Error("P4K non ouvert");
    const searchSize = Math.min(65558, this.fileSize);
    const buf = Buffer.alloc(searchSize);
    await this.fd.read(buf, 0, searchSize, this.fileSize - searchSize);
    let eocdOff = -1;
    for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === END_SIG) { eocdOff = this.fileSize - searchSize + i; break; }
    if (eocdOff === -1) throw new Error("EOCD not found");
    const eocd = Buffer.alloc(22);
    await this.fd.read(eocd, 0, 22, eocdOff);
    this.totalEntries = eocd.readUInt16LE(10);
    this.centralDirSize = eocd.readUInt32LE(12);
    this.centralDirOffset = eocd.readUInt32LE(16);
    if (this.totalEntries === 0xffff || this.centralDirOffset === 0xffffffff) {
      const loc = Buffer.alloc(20);
      await this.fd.read(loc, 0, 20, eocdOff - 20);
      if (loc.readUInt32LE(0) === ZIP64_LOC_SIG) {
        const z64Off = Number(loc.readBigUInt64LE(8));
        const z64 = Buffer.alloc(56);
        await this.fd.read(z64, 0, 56, z64Off);
        if (z64.readUInt32LE(0) === ZIP64_END_SIG) {
          this.totalEntries = Number(z64.readBigUInt64LE(32));
          this.centralDirSize = Number(z64.readBigUInt64LE(40));
          this.centralDirOffset = Number(z64.readBigUInt64LE(48));
        }
      }
    }
  }

  async loadAllEntries(onProgress?: (c: number, t: number) => void): Promise<void> {
    if (this.entriesLoaded) return;
    if (!this.fd) throw new Error("P4K non ouvert");
    const CHUNK = 64 * 1024 * 1024;
    let offset = this.centralDirOffset, processed = 0;
    let buf = Buffer.alloc(CHUNK), bufOff = 0, bufEnd = 0;
    const ensure = async (n: number) => {
      if (bufOff + n > bufEnd) {
        const rem = bufEnd - bufOff;
        if (rem > 0) buf.copy(buf, 0, bufOff, bufEnd);
        bufOff = 0; bufEnd = rem;
        const toRead = Math.min(CHUNK - bufEnd, this.centralDirOffset + this.centralDirSize - offset);
        if (toRead > 0) { const { bytesRead } = await this.fd!.read(buf, bufEnd, toRead, offset); bufEnd += bytesRead; offset += bytesRead; }
      }
      return bufOff + n <= bufEnd;
    };
    while (processed < this.totalEntries) {
      if (!(await ensure(46))) break;
      if (buf.readUInt32LE(bufOff) !== CENTRAL_DIR_SIG) break;
      const comp = buf.readUInt16LE(bufOff + 10), flags = buf.readUInt16LE(bufOff + 8);
      let cSize = buf.readUInt32LE(bufOff + 20), uSize = buf.readUInt32LE(bufOff + 24);
      const fnLen = buf.readUInt16LE(bufOff + 28), exLen = buf.readUInt16LE(bufOff + 30), cmLen = buf.readUInt16LE(bufOff + 32);
      let locOff = buf.readUInt32LE(bufOff + 42);
      const total = 46 + fnLen + exLen + cmLen;
      if (!(await ensure(total))) break;
      const fn = buf.toString("utf8", bufOff + 46, bufOff + 46 + fnLen);
      if (cSize === 0xffffffff || uSize === 0xffffffff || locOff === 0xffffffff) {
        let exOff = bufOff + 46 + fnLen;
        const exEnd = exOff + exLen;
        while (exOff < exEnd) {
          const hid = buf.readUInt16LE(exOff), dsz = buf.readUInt16LE(exOff + 2);
          if (hid === 0x0001) {
            let fo = exOff + 4;
            if (uSize === 0xffffffff) { uSize = Number(buf.readBigUInt64LE(fo)); fo += 8; }
            if (cSize === 0xffffffff) { cSize = Number(buf.readBigUInt64LE(fo)); fo += 8; }
            if (locOff === 0xffffffff) locOff = Number(buf.readBigUInt64LE(fo));
            break;
          }
          exOff += 4 + dsz;
        }
      }
      const entry: P4KEntry = { fileName: fn, uncompressedSize: uSize, compressedSize: cSize, compressionMethod: comp, isDirectory: fn.endsWith("/"), isEncrypted: (flags & 1) !== 0, dataOffset: 0, localHeaderOffset: locOff };
      this.entries.set(fn, entry);
      this.entriesLower.set(fn.toLowerCase(), entry);
      bufOff += total;
      processed++;
      if (onProgress && processed % 50000 === 0) onProgress(processed, this.totalEntries);
    }
    this.entriesLoaded = true;
  }

  async findFiles(pattern: RegExp, limit = 100): Promise<P4KEntry[]> {
    await this.loadAllEntries();
    const r: P4KEntry[] = [];
    for (const e of this.entries.values()) if (pattern.test(e.fileName)) { r.push(e); if (r.length >= limit) break; }
    return r;
  }

  async getEntry(fn: string): Promise<P4KEntry | undefined> {
    await this.loadAllEntries();
    const norm = fn.replace(/\//g, "\\");
    return this.entries.get(norm) || this.entriesLower.get(norm.toLowerCase());
  }

  async readFileFromEntry(entry: P4KEntry): Promise<Buffer> {
    if (!this.fd) throw new Error("P4K non ouvert");
    const lh = Buffer.alloc(30);
    await this.fd.read(lh, 0, 30, entry.localHeaderOffset);
    if (lh.readUInt32LE(0) !== LOCAL_SIG) throw new Error("Invalid local header");
    const fnLen = lh.readUInt16LE(26), exLen = lh.readUInt16LE(28);
    const dataOff = entry.localHeaderOffset + 30 + fnLen + exLen;
    const comp = Buffer.alloc(entry.compressedSize);
    await this.fd.read(comp, 0, entry.compressedSize, dataOff);
    if (entry.compressionMethod === 0) return comp;
    if (entry.compressionMethod === 8) return inflateRawSync(comp);
    if (entry.compressionMethod === 93 || entry.compressionMethod === 100) {
      const z = await loadFzstd();
      if (!z) throw new Error("ZSTD unavailable");
      try {
        return Buffer.from(z.decompress(new Uint8Array(comp)));
      } catch (err) {
        console.error(`ZSTD decompression failed for ${entry.fileName} (compressed: ${entry.compressedSize}, uncompressed: ${entry.uncompressedSize}, method: ${entry.compressionMethod}):`, err);
        throw new Error(`invalid zstd data for ${entry.fileName}`);
      }
    }
    throw new Error(`Unsupported compression: ${entry.compressionMethod}`);
  }

  async getStats() {
    await this.loadAllEntries();
    let total = 0, compressed = 0;
    const dirs: Record<string, number> = {}, exts: Record<string, number> = {};
    for (const e of this.entries.values()) {
      total += e.uncompressedSize; compressed += e.compressedSize;
      const parts = e.fileName.split("/"), root = parts[0];
      if (root && !e.isDirectory) dirs[root] = (dirs[root] || 0) + 1;
      const ext = e.fileName.split(".").pop()?.toLowerCase();
      if (ext && !e.isDirectory) exts[ext] = (exts[ext] || 0) + 1;
    }
    return {
      totalEntries: this.totalEntries, totalSize: total, compressedSize: compressed,
      topDirectories: Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([path, count]) => ({ path, count })),
      topExtensions: Object.entries(exts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([ext, count]) => ({ ext, count })),
    };
  }
}

// =============== P4K SERVICE ===============
export class P4KService {
  private provider: P4KProvider | null = null;
  private dcbBuffer: Buffer | null = null;
  private dfData: any = null;

  constructor(private p4kPath: string) {}

  async init(): Promise<void> {
    console.log("🚀 Init P4K service...");
    this.provider = new P4KProvider(this.p4kPath);
    await this.provider.open();
    console.log("✅ P4K ready");
  }

  async close(): Promise<void> { if (this.provider) { await this.provider.close(); this.provider = null; } }

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
    // Build vehicle UUID index for fast lookups
    this.buildVehicleIndex();
    
    return { 
      version: this.dfData.header.version, 
      structCount: this.dfData.header.structDefinitionCount, 
      recordCount: this.dfData.header.recordDefinitionCount,
      vehicleCount: this.vehicleIndex.size
    };
  }

  private parseDataForge(buf: Buffer) {
    let off = 0;
    const i32 = () => { const v = buf.readInt32LE(off); off += 4; return v; };
    const u16 = () => { const v = buf.readUInt16LE(off); off += 2; return v; };
    const u32 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
    
    // Read a CigGuid (16 bytes) - format: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    const readGuid = () => {
      const d1 = buf.readUInt32LE(off);
      const d2 = buf.readUInt16LE(off + 4);
      const d3 = buf.readUInt16LE(off + 6);
      const d4 = buf.slice(off + 8, off + 16).toString("hex");
      off += 16;
      return `${d1.toString(16).padStart(8, "0")}-${d2.toString(16).padStart(4, "0")}-${d3.toString(16).padStart(4, "0")}-${d4.substring(0, 4)}-${d4.substring(4)}`;
    };
    
    // Header
    off += 4; // skip signature
    const version = u32();
    off += 8; // skip unknown fields
    
    const header = { 
      version, 
      structDefinitionCount: i32(), 
      propertyDefinitionCount: i32(), 
      enumDefinitionCount: i32(), 
      dataMappingCount: i32(), 
      recordDefinitionCount: i32(), 
      booleanValueCount: i32(), 
      int8ValueCount: i32(), 
      int16ValueCount: i32(), 
      int32ValueCount: i32(), 
      int64ValueCount: i32(), 
      uint8ValueCount: i32(), 
      uint16ValueCount: i32(), 
      uint32ValueCount: i32(), 
      uint64ValueCount: i32(), 
      singleValueCount: i32(), 
      doubleValueCount: i32(), 
      guidValueCount: i32(), 
      stringIdValueCount: i32(), 
      localeValueCount: i32(), 
      enumValueCount: i32(), 
      strongValueCount: i32(), 
      weakValueCount: i32(), 
      referenceValueCount: i32(), 
      enumOptionCount: i32(), 
      textLength: u32(), 
      textLength2: version >= 6 ? u32() : 0 
    };
    
    // StructDefinitions (each 16 bytes)
    const structDefs: any[] = [];
    for (let i = 0; i < header.structDefinitionCount; i++) {
      structDefs.push({ 
        nameOffset: i32(), // DataCoreStringId2
        parentTypeIndex: i32(), 
        attributeCount: u16(), 
        firstAttributeIndex: u16(), 
        structSize: u32() 
      });
    }
    
    // PropertyDefinitions (each 12 bytes) - NOW PARSED!
    const propertyDefs: any[] = [];
    for (let i = 0; i < header.propertyDefinitionCount; i++) {
      propertyDefs.push({
        nameOffset: u32(),            // DataCoreStringId2 (4 bytes)
        structIndex: u16(),           // Index/StructIndex for varClass (2 bytes)
        dataType: u16(),              // EDataType (2 bytes)
        conversionType: u16() & 0xFF, // EConversionType masked (2 bytes)
        padding: u16()                // VariantIndex/Padding (2 bytes)
      });
    }
    
    // EnumDefinitions (each 8 bytes) - skip, not needed for value reading
    off += header.enumDefinitionCount * 8;
    
    // DataMappings (v5+: 8 bytes each = structCount u32 + structIndex u32)
    const dataMappings: { structCount: number; structIndex: number }[] = [];
    for (let i = 0; i < header.dataMappingCount; i++) {
      if (version >= 5) {
        dataMappings.push({ structCount: u32(), structIndex: u32() });
      } else {
        dataMappings.push({ structCount: u16(), structIndex: u16() });
      }
    }
    
    // RecordDefinitions (each 32 bytes)
    const records: any[] = [];
    for (let i = 0; i < header.recordDefinitionCount; i++) {
      const nameOffset = i32();     // DataCoreStringId2 - 4 bytes
      const fileNameOffset = i32(); // DataCoreStringId - 4 bytes
      const structIndex = i32();    // int - 4 bytes
      const id = readGuid();        // CigGuid - 16 bytes (THIS IS THE UUID!)
      const instanceIndex = u16();  // ushort - 2 bytes (variantIndex)
      const structSize = u16();     // ushort - 2 bytes
      records.push({ nameOffset, fileNameOffset, structIndex, id, instanceIndex, structSize });
    }
    
    // Compute value array offsets (indexed arrays for ARRAY-type properties)
    // Order: Int8, Int16, Int32, Int64, UInt8, UInt16, UInt32, UInt64, Boolean, Single, Double, Guid, StringId, Locale, Enum, Strong, Weak, Reference, EnumOption
    const vaBase = off;
    const valueArrayOffsets = {
      int8:       vaBase,
      int16:      vaBase + header.int8ValueCount * 1,
      int32:      0, int64: 0, uint8: 0, uint16: 0, uint32: 0, uint64: 0,
      boolean:    0, single: 0, double: 0, guid: 0, stringId: 0,
      locale:     0, enum: 0, strong: 0, weak: 0, reference: 0, enumOption: 0
    };
    valueArrayOffsets.int32    = valueArrayOffsets.int16    + header.int16ValueCount * 2;
    valueArrayOffsets.int64    = valueArrayOffsets.int32    + header.int32ValueCount * 4;
    valueArrayOffsets.uint8    = valueArrayOffsets.int64    + header.int64ValueCount * 8;
    valueArrayOffsets.uint16   = valueArrayOffsets.uint8    + header.uint8ValueCount * 1;
    valueArrayOffsets.uint32   = valueArrayOffsets.uint16   + header.uint16ValueCount * 2;
    valueArrayOffsets.uint64   = valueArrayOffsets.uint32   + header.uint32ValueCount * 4;
    valueArrayOffsets.boolean  = valueArrayOffsets.uint64   + header.uint64ValueCount * 8;
    valueArrayOffsets.single   = valueArrayOffsets.boolean  + header.booleanValueCount * 1;
    valueArrayOffsets.double   = valueArrayOffsets.single   + header.singleValueCount * 4;
    valueArrayOffsets.guid     = valueArrayOffsets.double   + header.doubleValueCount * 8;
    valueArrayOffsets.stringId = valueArrayOffsets.guid     + header.guidValueCount * 16;
    valueArrayOffsets.locale   = valueArrayOffsets.stringId + header.stringIdValueCount * 4;
    valueArrayOffsets.enum     = valueArrayOffsets.locale   + header.localeValueCount * 4;
    valueArrayOffsets.strong   = valueArrayOffsets.enum     + header.enumValueCount * 4;
    valueArrayOffsets.weak     = valueArrayOffsets.strong   + header.strongValueCount * 8;
    valueArrayOffsets.reference= valueArrayOffsets.weak     + header.weakValueCount * 8;
    valueArrayOffsets.enumOption= valueArrayOffsets.reference + header.referenceValueCount * 20;
    
    // Skip past all value arrays
    off = valueArrayOffsets.enumOption + header.enumOptionCount * 4;
    
    console.log(`[DF] Value arrays: ${vaBase} -> ${off} (${off - vaBase} bytes)`);
    
    // String table 1 (text / fileNames)
    const st1Start = off;
    const st1 = new Map<number, string>();
    let sOff = 0, s = "";
    while (off < st1Start + header.textLength) { 
      const b = buf[off++]; 
      if (b === 0) { st1.set(sOff, s); sOff = off - st1Start; s = ""; } 
      else s += String.fromCharCode(b); 
    }
    
    // String table 2 (blob / names, struct names) - version 6+
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
    
    // DATA section starts right after string tables (struct instance data)
    const dataOffset = off;
    
    // Build StructToDataOffsetMap from DataMappings (same algo as unp4k)
    const structToDataOffsetMap = new Map<number, number>();
    let lastOff = 0;
    for (let i = 0; i < dataMappings.length; i++) {
      const dm = dataMappings[i];
      const structDef = structDefs[i]; // unp4k uses dataMappingIndex for struct lookup
      if (!structToDataOffsetMap.has(dm.structIndex)) {
        structToDataOffsetMap.set(dm.structIndex, lastOff);
      }
      lastOff += dm.structCount * (structDef?.structSize || 0);
    }
    
    console.log(`[DF] Data section: offset=${dataOffset}, size=${lastOff}, endCheck=${dataOffset + lastOff === buf.length ? 'OK' : `MISMATCH (expected ${buf.length}, got ${dataOffset + lastOff})`}`);
    
    // Resolve names
    const nameTable = header.version >= 6 ? st2 : st1;
    for (const sd of structDefs) sd.name = nameTable.get(sd.nameOffset) || `STRUCT_${sd.nameOffset}`;
    for (const pd of propertyDefs) pd.name = nameTable.get(pd.nameOffset) || `PROP_${pd.nameOffset}`;
    for (const r of records) { 
      r.name = nameTable.get(r.nameOffset) || `RECORD_${r.nameOffset}`; 
      r.fileName = st1.get(r.fileNameOffset) || `FILE_${r.fileNameOffset}`; 
    }
    
    return { 
      header, structDefs, propertyDefs, dataMappings, records, 
      stringTable1: st1, stringTable2: st2,
      valueArrayOffsets, dataOffset, structToDataOffsetMap
    };
  }

  // ============ DataForge Instance Reader ============
  
  // EDataType constants (from unp4k Enums.cs)
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

  /**
   * Get all property definitions for a struct, including inherited from parent structs.
   * Returns properties in hierarchy order (parent first, then self).
   */
  private getStructProperties(structIndex: number): any[] {
    if (!this.dfData) return [];
    const { structDefs, propertyDefs } = this.dfData;
    const sd = structDefs[structIndex];
    if (!sd) return [];
    
    // Build hierarchy: parent first, then self
    const hierarchy: any[] = [];
    const visited = new Set<number>();
    const buildHierarchy = (idx: number) => {
      if (visited.has(idx)) return;
      visited.add(idx);
      const s = structDefs[idx];
      if (!s) return;
      if (s.parentTypeIndex !== -1 && s.parentTypeIndex !== 0xFFFFFFFF) {
        buildHierarchy(s.parentTypeIndex);
      }
      hierarchy.push(s);
    };
    buildHierarchy(structIndex);
    
    // Collect properties from all structs in hierarchy
    const props: any[] = [];
    for (const h of hierarchy) {
      for (let pi = h.firstAttributeIndex; pi < h.firstAttributeIndex + h.attributeCount; pi++) {
        if (propertyDefs[pi]) props.push(propertyDefs[pi]);
      }
    }
    return props;
  }

  /**
   * Read a struct instance from the DATA section of the DataForge file.
   * @param structIndex - Which struct type
   * @param variantIndex - Which instance of that type
   * @param depth - Current recursion depth (for limiting nested reads)
   * @param maxDepth - Maximum recursion depth
   */
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
    const result: Record<string, any> = {};
    result.__type = sd.name;
    let pos = instancePos;
    
    for (const prop of allProps) {
      if (prop.conversionType === 0) {
        // Attribute: read value inline from DATA section
        const [val, newPos] = this.readValueInline(buf, pos, prop, depth, maxDepth);
        result[prop.name] = val;
        pos = newPos;
      } else {
        // Array: read (count u32 + firstIndex u32) from inline, then elements from indexed arrays
        if (pos + 8 > buf.length) break;
        const count = buf.readUInt32LE(pos); pos += 4;
        const firstIndex = buf.readUInt32LE(pos); pos += 4;
        const arr: any[] = [];
        const limit = Math.min(count, 200);
        for (let i = 0; i < limit; i++) {
          arr.push(this.readValueAtIndex(firstIndex + i, prop, depth, maxDepth));
        }
        result[prop.name] = arr;
      }
    }
    
    return result;
  }

  /**
   * Read a single value inline from the DATA section (for ConversionType == Attribute).
   */
  private readValueInline(buf: Buffer, pos: number, prop: any, depth: number, maxDepth: number): [any, number] {
    if (pos >= buf.length) return [null, pos];
    const dt = prop.dataType;
    
    switch (dt) {
      case P4KService.DT_BOOLEAN: return [buf.readUInt8(pos) !== 0, pos + 1];
      case P4KService.DT_INT8:    return [buf.readInt8(pos), pos + 1];
      case P4KService.DT_INT16:   return [buf.readInt16LE(pos), pos + 2];
      case P4KService.DT_INT32:   return [buf.readInt32LE(pos), pos + 4];
      case P4KService.DT_INT64:   return [Number(buf.readBigInt64LE(pos)), pos + 8];
      case P4KService.DT_UINT8:   return [buf.readUInt8(pos), pos + 1];
      case P4KService.DT_UINT16:  return [buf.readUInt16LE(pos), pos + 2];
      case P4KService.DT_UINT32:  return [buf.readUInt32LE(pos), pos + 4];
      case P4KService.DT_UINT64:  return [Number(buf.readBigUInt64LE(pos)), pos + 8];
      case P4KService.DT_STRING: {
        const strOff = buf.readUInt32LE(pos);
        return [this.dfData!.stringTable1.get(strOff) ?? `STR_${strOff}`, pos + 4];
      }
      case P4KService.DT_SINGLE:  return [Math.round(buf.readFloatLE(pos) * 1e6) / 1e6, pos + 4];
      case P4KService.DT_DOUBLE:  return [buf.readDoubleLE(pos), pos + 8];
      case P4KService.DT_LOCALE: {
        const locOff = buf.readUInt32LE(pos);
        return [this.dfData!.stringTable1.get(locOff) ?? `LOC_${locOff}`, pos + 4];
      }
      case P4KService.DT_GUID: {
        const g = this.readGuidAt(buf, pos);
        return [g, pos + 16];
      }
      case P4KService.DT_ENUM: {
        const enumOff = buf.readUInt32LE(pos);
        return [this.dfData!.stringTable1.get(enumOff) ?? `ENUM_${enumOff}`, pos + 4];
      }
      case P4KService.DT_CLASS: {
        // Nested struct inline - read properties from current position
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
              for (let j = 0; j < Math.min(cnt, 200); j++) {
                arr.push(this.readValueAtIndex(fi + j, np, depth + 1, maxDepth));
              }
              nestedResult[np.name] = arr;
            }
          }
          return [nestedResult, curPos];
        }
        // At max depth, skip the struct data
        return [{ __type: sd?.name, __skipped: true }, pos + (sd?.structSize || 0)];
      }
      case P4KService.DT_STRONG_PTR: {
        const sIdx = buf.readUInt32LE(pos);
        const vIdx = buf.readUInt16LE(pos + 4);
        // padding 2 bytes
        if (sIdx === 0xFFFFFFFF) return [null, pos + 8];
        if (depth < maxDepth) {
          const nested = this.readInstance(sIdx, vIdx, depth + 1, maxDepth);
          return [nested, pos + 8];
        }
        const sName = this.dfData!.structDefs[sIdx]?.name || `S${sIdx}`;
        return [{ __strongPtr: `${sName}[${vIdx}]` }, pos + 8];
      }
      case P4KService.DT_WEAK_PTR: {
        const sIdx = buf.readUInt32LE(pos);
        const vIdx = buf.readUInt16LE(pos + 4);
        if (sIdx === 0xFFFFFFFF) return [null, pos + 8];
        const sName = this.dfData!.structDefs[sIdx]?.name || `S${sIdx}`;
        return [{ __weakPtr: `${sName}[${vIdx}]` }, pos + 8];
      }
      case P4KService.DT_REFERENCE: {
        const rIdx = buf.readUInt32LE(pos);
        const rGuid = this.readGuidAt(buf, pos + 4);
        return [{ __ref: rGuid }, pos + 20];
      }
      default:
        console.warn(`[DF] Unknown dataType: 0x${dt.toString(16)} for prop ${prop.name}`);
        return [null, pos];
    }
  }

  /**
   * Read a value from the indexed value arrays (for ARRAY-type properties).
   */
  private readValueAtIndex(index: number, prop: any, depth: number, maxDepth: number): any {
    if (!this.dfData || !this.dcbBuffer) return null;
    const buf = this.dcbBuffer;
    const va = this.dfData.valueArrayOffsets;
    const dt = prop.dataType;
    
    switch (dt) {
      case P4KService.DT_BOOLEAN: return buf.readUInt8(va.boolean + index) !== 0;
      case P4KService.DT_INT8:    return buf.readInt8(va.int8 + index);
      case P4KService.DT_INT16:   return buf.readInt16LE(va.int16 + index * 2);
      case P4KService.DT_INT32:   return buf.readInt32LE(va.int32 + index * 4);
      case P4KService.DT_INT64:   return Number(buf.readBigInt64LE(va.int64 + index * 8));
      case P4KService.DT_UINT8:   return buf.readUInt8(va.uint8 + index);
      case P4KService.DT_UINT16:  return buf.readUInt16LE(va.uint16 + index * 2);
      case P4KService.DT_UINT32:  return buf.readUInt32LE(va.uint32 + index * 4);
      case P4KService.DT_UINT64:  return Number(buf.readBigUInt64LE(va.uint64 + index * 8));
      case P4KService.DT_STRING: {
        const strOff = buf.readUInt32LE(va.stringId + index * 4);
        return this.dfData.stringTable1.get(strOff) ?? '';
      }
      case P4KService.DT_SINGLE:  return Math.round(buf.readFloatLE(va.single + index * 4) * 1e6) / 1e6;
      case P4KService.DT_DOUBLE:  return buf.readDoubleLE(va.double + index * 8);
      case P4KService.DT_LOCALE: {
        const locOff = buf.readUInt32LE(va.locale + index * 4);
        return this.dfData.stringTable1.get(locOff) ?? '';
      }
      case P4KService.DT_GUID:    return this.readGuidAt(buf, va.guid + index * 16);
      case P4KService.DT_ENUM: {
        const enumOff = buf.readUInt32LE(va.enum + index * 4);
        return this.dfData.stringTable1.get(enumOff) ?? '';
      }
      case P4KService.DT_STRONG_PTR: {
        const off = va.strong + index * 8;
        const sIdx = buf.readUInt32LE(off);
        const vIdx = buf.readUInt16LE(off + 4);
        if (sIdx === 0xFFFFFFFF) return null;
        if (depth < maxDepth) return this.readInstance(sIdx, vIdx, depth + 1, maxDepth);
        return { __strongPtr: `${this.dfData.structDefs[sIdx]?.name}[${vIdx}]` };
      }
      case P4KService.DT_WEAK_PTR: {
        const off = va.weak + index * 8;
        const sIdx = buf.readUInt32LE(off);
        const vIdx = buf.readUInt16LE(off + 4);
        if (sIdx === 0xFFFFFFFF) return null;
        return { __weakPtr: `${this.dfData.structDefs[sIdx]?.name}[${vIdx}]` };
      }
      case P4KService.DT_REFERENCE: {
        const off = va.reference + index * 20;
        const rGuid = this.readGuidAt(buf, off + 4);
        return { __ref: rGuid };
      }
      case P4KService.DT_CLASS: {
        // Array of inline classes - read from data mapped area
        const nestedIdx = prop.structIndex;
        if (depth < maxDepth) return this.readInstance(nestedIdx, index, depth + 1, maxDepth);
        return { __class: this.dfData.structDefs[nestedIdx]?.name };
      }
      default: return null;
    }
  }

  /**
   * Helper: read a CigGuid at a specific buffer offset
   */
  private readGuidAt(buf: Buffer, pos: number): string {
    const d1 = buf.readUInt32LE(pos);
    const d2 = buf.readUInt16LE(pos + 4);
    const d3 = buf.readUInt16LE(pos + 6);
    const d4 = buf.slice(pos + 8, pos + 16).toString("hex");
    return `${d1.toString(16).padStart(8, "0")}-${d2.toString(16).padStart(4, "0")}-${d3.toString(16).padStart(4, "0")}-${d4.substring(0, 4)}-${d4.substring(4)}`;
  }

  /**
   * Read a record's instance data by record index
   */
  readRecordInstance(recordIndex: number, maxDepth = 3): Record<string, any> | null {
    if (!this.dfData) return null;
    const rec = this.dfData.records[recordIndex];
    if (!rec) return null;
    return this.readInstance(rec.structIndex, rec.instanceIndex, 0, maxDepth);
  }

  // Build index of vehicle UUIDs from spaceships and groundvehicles records
  private vehicleIndex = new Map<string, { uuid: string; name: string; className: string }>();
  
  private buildVehicleIndex() {
    if (!this.dfData) return;
    
    // Find EntityClassDefinition struct index
    const entityClassDefIndex = this.dfData.structDefs.findIndex((s: any) => s.name === "EntityClassDefinition");
    
    for (const r of this.dfData.records) {
      // Only process EntityClassDefinition records in vehicles folders
      if (r.structIndex !== entityClassDefIndex) continue;
      // Include: spaceships, groundvehicles, actors (for ATLS/PowerSuits)
      const isVehicle = r.fileName?.includes('/spaceships/') || 
                        r.fileName?.includes('/groundvehicles/') ||
                        (r.fileName?.includes('/actor/actors/') && r.name?.includes('ARGO_ATLS'));
      if (!isVehicle) continue;
      
      // Extract class name from record name (e.g., "EntityClassDefinition.AEGS_Avenger_Titan" -> "AEGS_Avenger_Titan")
      const className = r.name?.replace('EntityClassDefinition.', '') || '';
      if (!className) continue;
      
      // Skip AI templates, test variants, etc.
      const lowerName = className.toLowerCase();
      if (lowerName.includes('_ai_') || lowerName.includes('_test') || lowerName.includes('_template') || 
          lowerName.includes('_unmanned') || lowerName.includes('_indestructible') || lowerName.includes('_prison')) continue;
      
      this.vehicleIndex.set(className.toLowerCase(), {
        uuid: r.id,
        name: r.name,
        className
      });
    }
    
    console.log(`[DF] Built vehicle index: ${this.vehicleIndex.size} vehicles`);
    
    // Debug: dump struct type distribution
    const structCounts = new Map<string, number>();
    for (const r of this.dfData!.records) {
      const sname = this.dfData!.structDefs[r.structIndex]?.name || `unknown(${r.structIndex})`;
      structCounts.set(sname, (structCounts.get(sname) || 0) + 1);
    }
    const sorted = [...structCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    console.log(`[DF] Top struct types in records: ${sorted.map(([k,v]) => `${k}=${v}`).join(', ')}`);
  }

  // Get vehicle UUID by class name (checks aliases too)
  getVehicleUUID(className: string): string | undefined {
    const lowerName = className.toLowerCase();
    
    // Direct lookup
    let entry = this.vehicleIndex.get(lowerName);
    if (entry) return entry.uuid;
    
    // Try alias lookup (RSI name -> P4K name)
    const aliasKey = Object.keys(RSI_TO_P4K_ALIASES).find(k => k.toLowerCase() === lowerName);
    if (aliasKey) {
      const p4kName = RSI_TO_P4K_ALIASES[aliasKey];
      entry = this.vehicleIndex.get(p4kName.toLowerCase());
      if (entry) return entry.uuid;
    }
    
    return undefined;
  }

  // Get all vehicle definitions with their real UUIDs
  getVehicleDefinitions(): Map<string, { uuid: string; name: string; className: string }> {
    return this.vehicleIndex;
  }

  searchRecords(pattern: string, limit = 100) {
    if (!this.dfData) throw new Error("DataForge not loaded");
    const rx = new RegExp(pattern, "i"), res: any[] = [];
    for (const r of this.dfData.records) { 
      if (rx.test(r.fileName) || rx.test(r.name)) { 
        res.push({ 
          name: r.name, 
          fileName: r.fileName, 
          uuid: r.id, // The real UUID from DataForge!
          structType: this.dfData.structDefs[r.structIndex]?.name || "Unknown",
          structIndex: r.structIndex
        }); 
        if (res.length >= limit) break; 
      } 
    }
    return res;
  }

  // Get all struct types
  getStructTypes(): string[] {
    if (!this.dfData) throw new Error("DataForge not loaded");
    return this.dfData.structDefs.map((s: any) => s.name);
  }

  // Search by struct type
  searchByStructType(type: string, limit = 100) {
    if (!this.dfData) throw new Error("DataForge not loaded");
    const rx = new RegExp(type, "i"), res: any[] = [];
    for (let i = 0; i < this.dfData.structDefs.length; i++) {
      if (rx.test(this.dfData.structDefs[i].name)) {
        // Find all records using this struct
        for (const r of this.dfData.records) {
          if (r.structIndex === i) {
            res.push({ 
              name: r.name, 
              fileName: r.fileName, 
              uuid: r.id,
              structType: this.dfData.structDefs[i].name 
            });
            if (res.length >= limit) break;
          }
        }
      }
    }
    return res;
  }

  // Get vehicles from DataForge - EntityClassDefinition records with Ship tag
  getVehicleRecords(): Array<{ name: string; fileName: string; uuid: string; structType: string }> {
    if (!this.dfData) throw new Error("DataForge not loaded");
    const vehicles: any[] = [];
    
    // Find EntityClassDefinition struct index
    const entityClassIndex = this.dfData.structDefs.findIndex((s: any) => 
      s.name === "EntityClassDefinition" || s.name.includes("EntityClassDefinition")
    );
    
    // Find all vehicle-related records
    for (const r of this.dfData.records) {
      // Check if it's an entity class or if the fileName contains vehicle/ship paths
      if (r.structIndex === entityClassIndex || 
          r.fileName.toLowerCase().includes("vehicle") ||
          r.fileName.toLowerCase().includes("spaceships")) {
        vehicles.push({
          name: r.name,
          fileName: r.fileName,
          uuid: r.id,
          structType: this.dfData.structDefs[r.structIndex]?.name || "Unknown"
        });
      }
    }
    return vehicles;
  }

  async findFiles(pattern: string, limit = 100) { if (!this.provider) throw new Error("Not init"); return this.provider.findFiles(new RegExp(pattern, "i"), limit); }
  async getP4KStats() { if (!this.provider) throw new Error("Not init"); const s = await this.provider.getStats(); return { ...s, compressionRatio: 1 - s.compressedSize / s.totalSize }; }
  isDataForgeLoaded() { return this.dfData !== null; }

  async readFile(path: string): Promise<Buffer | null> {
    if (!this.provider) throw new Error("Not init");
    const entry = await this.provider.getEntry(path);
    if (!entry) return null;
    return this.provider.readFileFromEntry(entry);
  }

  /**
   * Extract vehicle stats from DataForge by reading struct instance data.
   * Navigates EntityClassDefinition -> Components -> specific component params.
   */
  async extractVehicleStats(className: string): Promise<{
    hull_hp?: number;
    shield_hp?: number;
    quantum_fuel?: number;
    hydrogen_fuel?: number;
    scm_speed?: number;
    max_speed?: number;
    afterburner_speed?: number;
    pitch_max?: number;
    yaw_max?: number;
    roll_max?: number;
    acceleration_main?: number;
    acceleration_retro?: number;
    acceleration_vtol?: number;
    acceleration_maneuvering?: number;
    weapon_hardpoints?: number;
    missile_racks?: number;
    turrets?: number;
    actual_mass?: number;
    em_signature?: number;
    ir_signature?: number;
    cs_signature?: number;
    shield_faces?: number;
    radar_range?: number;
    crew_size?: number;
    length?: number;
    beam?: number;
    height?: number;
  } | null> {
    if (!this.dfData || !this.dcbBuffer) return null;
    
    try {
      // Find EntityClassDefinition struct index
      const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
      if (entityClassIdx === -1) return null;
      
      // Find the record matching this className
      const record = this.dfData.records.find((r: any) =>
        r.structIndex === entityClassIdx && 
        (r.name?.replace('EntityClassDefinition.', '') === className ||
         r.name === className)
      );
      if (!record) {
        // Try case-insensitive
        const lc = className.toLowerCase();
        const rec2 = this.dfData.records.find((r: any) =>
          r.structIndex === entityClassIdx && 
          r.name?.toLowerCase().includes(lc)
        );
        if (!rec2) return null;
        return this.extractStatsFromRecord(rec2);
      }
      
      return this.extractStatsFromRecord(record);
    } catch (err) {
      console.error(`[P4K] Error extracting DataForge stats for ${className}:`, err);
      return null;
    }
  }

  /**
   * Extract stats from a resolved EntityClassDefinition record instance.
   * Strategy: 
   * 1. Read the EntityClassDef to get components (VehicleComponentParams, etc.)
   * 2. Find the corresponding SCItem record (which has Mass, IFCS data, etc.)
   * 3. Merge stats from both sources
   */
  private extractStatsFromRecord(record: any): Record<string, number> | null {
    // Read EntityClassDef with greater depth to resolve component internals
    const data = this.readInstance(record.structIndex, record.instanceIndex, 0, 5);
    if (!data) return null;
    
    const stats: Record<string, number> = {};
    
    // Check StaticEntityClassData for physics controller (Mass)
    const staticData = data.StaticEntityClassData;
    if (Array.isArray(staticData)) {
      for (const sd of staticData) {
        if (!sd || typeof sd !== 'object') continue;
        const sdType = sd.__type || '';
        if (sdType === 'SEntitySpaceShipPhysicsControllerParams' || sdType.includes('PhysicsController')) {
          const mass = sd.Mass;
          if (typeof mass === 'number' && mass > 0) stats.actual_mass = Math.round(mass * 100) / 100;
        }
      }
    }
    
    // === Extract from EntityClassDef Components (depth=5 already set) ===
    const components = data.Components;
    if (Array.isArray(components)) {
      for (const comp of components) {
        if (!comp || typeof comp !== 'object' || !comp.__type) continue;
        const type = comp.__type as string;
        
        // VehicleComponentParams: crewSize, hull HP, bounding box
        if (type === 'VehicleComponentParams') {
          const crew = comp.crewSize;
          if (typeof crew === 'number' && crew > 0) stats.crew_size = crew;
          const hullHp = comp.vehicleHullDamageNormalizationValue;
          if (typeof hullHp === 'number' && hullHp > 0) stats.hull_hp = Math.round(hullHp);
          const bbox = comp.maxBoundingBoxSize;
          if (bbox && typeof bbox === 'object') {
            if (typeof bbox.x === 'number') stats.length = Math.round(bbox.x * 100) / 100;
            if (typeof bbox.y === 'number') stats.beam = Math.round(bbox.y * 100) / 100;
            if (typeof bbox.z === 'number') stats.height = Math.round(bbox.z * 100) / 100;
          }
        }
        
        // SEntityComponentDefaultLoadoutParams: follow loadout for flight controller
        if (type === 'SEntityComponentDefaultLoadoutParams') {
          const entries = comp.loadout?.entries;
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              const portName = (entry.itemPortName || '').toLowerCase();
              const entClassName = entry.entityClassName || '';
              
              if (portName === 'hardpoint_controller_flight' && entClassName && this.dfData) {
                const fcRecord = this.findEntityRecord(entClassName);
                if (fcRecord) {
                  const fcData = this.readInstance(fcRecord.structIndex, fcRecord.instanceIndex, 0, 5);
                  if (fcData && Array.isArray(fcData.Components)) {
                    for (const fcComp of fcData.Components) {
                      if (!fcComp?.__type) continue;
                      const fcType = fcComp.__type as string;
                      
                      // IFCSParams: speed, angular velocity
                      if (fcType === 'IFCSParams') {
                        const scmSpeed = fcComp.scmSpeed;
                        if (typeof scmSpeed === 'number' && scmSpeed > 0) stats.scm_speed = Math.round(scmSpeed);
                        const boostFwd = fcComp.boostSpeedForward;
                        if (typeof boostFwd === 'number' && boostFwd > 0) stats.afterburner_speed = Math.round(boostFwd);
                        const maxSpd = fcComp.maxSpeed;
                        if (typeof maxSpd === 'number' && maxSpd > 0) stats.max_speed = Math.round(maxSpd);
                        const maxAV = fcComp.maxAngularVelocity;
                        if (maxAV && typeof maxAV === 'object') {
                          if (typeof maxAV.x === 'number' && maxAV.x > 0) stats.pitch_max = Math.round(maxAV.x * 100) / 100;
                          if (typeof maxAV.y === 'number' && maxAV.y > 0) stats.yaw_max = Math.round(maxAV.y * 100) / 100;
                          if (typeof maxAV.z === 'number' && maxAV.z > 0) stats.roll_max = Math.round(maxAV.z * 100) / 100;
                        }
                      }
                      
                      // SEntitySpaceShipPhysicsControllerParams: Mass
                      if (fcType === 'SEntitySpaceShipPhysicsControllerParams') {
                        const mass = fcComp.Mass;
                        if (typeof mass === 'number' && mass > 0) stats.actual_mass = Math.round(mass * 100) / 100;
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        // SHealthComponentParams
        if (type === 'SHealthComponentParams') {
          const hp = comp.Health;
          if (typeof hp === 'number' && hp > 1) stats.health_multiplier = hp;
        }
        
        // Any component with mass at top level
        if (!stats.actual_mass) {
          const mass = typeof comp.mass === 'number' ? comp.mass : (typeof comp.Mass === 'number' ? comp.Mass : undefined);
          if (mass && mass > 10) stats.actual_mass = Math.round(mass * 100) / 100;
        }
      }
    }
    
    return Object.keys(stats).length > 0 ? stats : null;
  }

  // Helper: find a numeric value by key in an object (recursive)
  private findNumIn(obj: any, ...keys: string[]): number | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === 'number' && v !== 0 && isFinite(v)) return v;
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const found = this.findNumIn(val, ...keys);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  // Find an EntityClassDefinition record by entityClassName
  private findEntityRecord(entityClassName: string): any | null {
    if (!this.dfData) return null;
    const entityClassIdx = this.dfData.structDefs.findIndex((s: any) => s.name === 'EntityClassDefinition');
    if (entityClassIdx === -1) return null;
    
    // Try exact match first
    for (const r of this.dfData.records) {
      if (r.structIndex === entityClassIdx) {
        const name = r.name?.replace('EntityClassDefinition.', '') || '';
        if (name === entityClassName) return r;
      }
    }
    // Try case-insensitive
    const lc = entityClassName.toLowerCase();
    for (const r of this.dfData.records) {
      if (r.structIndex === entityClassIdx) {
        const name = (r.name || '').toLowerCase();
        if (name.includes(lc)) return r;
      }
    }
    return null;
  }
}

// =============== SHIP SERVICE ===============
// Generate a temporary UUID for ships not in game (concept, etc)
function generateTempUuid(shipId: string | number, shipName: string): string {
  const hash = createHash("sha256").update(`temp-ship-${shipId}-${shipName}`).digest("hex");
  return `ffffffff-${hash.substring(0, 4)}-4${hash.substring(5, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 24)}`;
}

export class ShipService {
  private cache = new Map<string, TransformedShip>();
  private lastSync: Date | null = null;

  constructor(private pool: Pool) {}

  async syncFromShipMatrix(): Promise<{ total: number; synced: number; errors: number }> {
    console.log("📡 Syncing from Ship-Matrix...");
    const stats = { total: 0, synced: 0, errors: 0 };
    try {
      const res = await fetch("https://robertsspaceindustries.com/ship-matrix/index", { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json() as { success: number; data: any[] };
      if (data.success !== 1 || !data.data) throw new Error("Invalid response");
      stats.total = data.data.length;
      console.log(`✅ Retrieved ${stats.total} ships`);
      const conn = await this.pool.getConnection();
      await conn.beginTransaction();
      for (const ship of data.data) {
        try {
          // Generate temp UUID - will be replaced by p4k_uuid during enrichment if ship is in game
          const tempUuid = generateTempUuid(ship.id, ship.name);
          const mfgTag = ship.manufacturer?.code || "UNKN";
          const mfgName = ship.manufacturer?.name || "Unknown";
          const mfgDesc = ship.manufacturer?.description || null;
          const thumb = ship.media?.[0]?.images?.store_small ? (ship.media[0].images.store_small.startsWith("http") ? ship.media[0].images.store_small : `https://robertsspaceindustries.com${ship.media[0].images.store_small}`) : null;
          
          // Auto-create manufacturer if not exists (using data from API)
          await conn.execute(
            `INSERT INTO manufacturers (code, name, description) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description)`,
            [mfgTag, mfgName, mfgDesc]
          );
          
          // Check if ship already exists (by name+manufacturer_code) to preserve UUID
          const [existing] = await conn.execute<any[]>("SELECT uuid FROM ships WHERE name=? AND manufacturer_code=? LIMIT 1", [ship.name, mfgTag]);
          const shipUuid = existing.length > 0 ? existing[0].uuid : tempUuid;
          await conn.execute(
            `INSERT INTO ships (uuid, rsi_id, name, thumbnail_url, manufacturer_code, role, description, production_status, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE rsi_id=VALUES(rsi_id), name=VALUES(name), thumbnail_url=VALUES(thumbnail_url),
             manufacturer_code=VALUES(manufacturer_code), role=VALUES(role),
             description=VALUES(description), production_status=VALUES(production_status), synced_at=VALUES(synced_at)`,
            [shipUuid, ship.id, ship.name, thumb, mfgTag, ship.focus || "Multi-purpose", ship.description || "", ship.production_status || "in-concept", ship["time_modified.unfiltered"] ? new Date(ship["time_modified.unfiltered"]) : new Date()]
          );
          // Calculate ship size based on dimensions
          const shipSize = ship.length ? (ship.length < 15 ? 'Snub' : ship.length < 40 ? 'Small' : ship.length < 80 ? 'Medium' : ship.length < 150 ? 'Large' : 'Capital') : null;
          if (shipSize) {
            await conn.execute("UPDATE ships SET size=? WHERE uuid=?", [shipSize, shipUuid]);
          }
          await conn.execute(
            `INSERT INTO ship_specs (ship_uuid, length, beam, height, mass, cargo_scu, scm_speed, max_speed, min_crew, max_crew)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE length=VALUES(length), beam=VALUES(beam), height=VALUES(height), mass=VALUES(mass), cargo_scu=VALUES(cargo_scu), scm_speed=VALUES(scm_speed), max_speed=VALUES(max_speed), min_crew=VALUES(min_crew), max_crew=VALUES(max_crew)`,
            [shipUuid, ship.length || null, ship.beam || null, ship.height || null, ship.mass || null, ship.cargocapacity || null, ship.scm_speed || null, ship.afterburner_speed || null, ship.min_crew || 1, ship.max_crew || 1]
          );
          this.cache.set(shipUuid, { id: shipUuid, name: ship.name, manufacturer: ship.manufacturer?.name, size: ship.size, productionStatus: ship.production_status });
          stats.synced++;
        } catch (e) { console.error(`  ❌ ${ship.name}:`, e); stats.errors++; }
      }
      await conn.commit();
      conn.release();
      this.lastSync = new Date();
      console.log(`✅ Sync: ${stats.synced}/${stats.total} (${stats.errors} errors)`);
    } catch (e) { console.error("Sync failed:", e); throw e; }
    return stats;
  }

  async getAllShips(): Promise<TransformedShip[]> {
    try {
      const [rows] = await this.pool.execute(`
        SELECT s.uuid, s.name, m.name as manufacturer, s.size, s.production_status as productionStatus,
               s.class_name, s.manufacturer_code, s.name as p4k_display_name, s.p4k_base_path,
               NULL as p4k_main_model, s.p4k_model_count, 0 as p4k_interior_model_count, 
               0 as p4k_exterior_model_count, s.p4k_texture_count, NULL as p4k_models, s.enriched_at as p4k_enriched_at
        FROM ships s
        LEFT JOIN manufacturers m ON s.manufacturer_code = m.code
        ORDER BY s.name
      `);
      return (rows as any[]).map(r => ({
        id: r.uuid,
        uuid: r.uuid,
        name: r.name,
        manufacturer: r.manufacturer,
        size: r.size,
        productionStatus: r.productionStatus,
        p4kData: r.class_name ? {
          className: r.class_name,
          manufacturerCode: r.manufacturer_code,
          displayName: r.p4k_display_name,
          basePath: r.p4k_base_path,
          mainModel: r.p4k_main_model,
          modelCount: r.p4k_model_count,
          interiorModelCount: r.p4k_interior_model_count,
          exteriorModelCount: r.p4k_exterior_model_count,
          textureCount: r.p4k_texture_count,
          models: null,
          enrichedAt: r.p4k_enriched_at
        } : null
      } as TransformedShip));
    } catch (e) { 
      console.error(`[ShipService] getAllShips ERROR:`, e); 
      return Array.from(this.cache.values()); 
    }
  }

  async getShipById(id: string): Promise<any | null> {
    const [rows] = await this.pool.execute(`
      SELECT s.uuid, s.name, s.thumbnail_url, m.name as manufacturer, s.manufacturer_code, s.role, s.description, s.production_status, s.synced_at,
             s.class_name, s.manufacturer_code as p4k_manufacturer_code, s.name as p4k_display_name, s.p4k_base_path,
             NULL as p4k_main_model, s.p4k_model_count, 0 as p4k_interior_model_count,
             0 as p4k_exterior_model_count, s.p4k_texture_count, NULL as p4k_models, s.enriched_at as p4k_enriched_at
      FROM ships s
      LEFT JOIN manufacturers m ON s.manufacturer_code = m.code
      WHERE s.uuid = ? LIMIT 1
    `, [id]);
    const ship = (rows as any[])[0];
    if (!ship) return null;
    return {
      uuid: ship.uuid,
      name: ship.name,
      model: ship.name,
      thumbnail: ship.thumbnail_url,
      manufacturer: ship.manufacturer,
      manufacturer_tag: ship.manufacturer_code,
      focus: ship.role,
      description: ship.description,
      production_state: ship.production_status,
      last_updated: ship.synced_at,
      p4kData: ship.class_name ? {
        className: ship.class_name,
        manufacturerCode: ship.p4k_manufacturer_code,
        displayName: ship.p4k_display_name,
        basePath: ship.p4k_base_path,
        mainModel: ship.p4k_main_model,
        modelCount: ship.p4k_model_count,
        interiorModelCount: ship.p4k_interior_model_count,
        exteriorModelCount: ship.p4k_exterior_model_count,
        textureCount: ship.p4k_texture_count,
        models: null,
        enrichedAt: ship.p4k_enriched_at
      } : null
    };
  }

  async searchShips(q: string): Promise<TransformedShip[]> {
    const lq = q.toLowerCase();
    return (await this.getAllShips()).filter(s => s.name.toLowerCase().includes(lq) || s.manufacturer?.toLowerCase().includes(lq));
  }

  async getStats() {
    const ships = await this.getAllShips();
    const stats: any = { totalShips: ships.length, shipsByStatus: {}, shipsByManufacturer: {} };
    for (const s of ships) { if (s.productionStatus) stats.shipsByStatus[s.productionStatus] = (stats.shipsByStatus[s.productionStatus] || 0) + 1; if (s.manufacturer) stats.shipsByManufacturer[s.manufacturer] = (stats.shipsByManufacturer[s.manufacturer] || 0) + 1; }
    return stats;
  }

  async getShipComponents(id: string) {
    const [a] = await this.pool.execute("SELECT * FROM ship_avionics WHERE ship_uuid = ?", [id]);
    const [p] = await this.pool.execute("SELECT * FROM ship_propulsion WHERE ship_uuid = ?", [id]);
    const [t] = await this.pool.execute("SELECT * FROM ship_thrusters WHERE ship_uuid = ?", [id]);
    const [s] = await this.pool.execute("SELECT * FROM ship_systems WHERE ship_uuid = ?", [id]);
    const [w] = await this.pool.execute("SELECT * FROM ship_weaponry WHERE ship_uuid = ?", [id]);
    return { avionics: a, propulsion: p, thrusters: t, systems: s, weaponry: w };
  }

  async getComponentsByType(id: string, type: string) {
    const [rows] = await this.pool.execute(`SELECT * FROM ship_${type} WHERE ship_uuid = ?`, [id]);
    return rows;
  }

  async getGallery(id: string) { const [rows] = await this.pool.execute("SELECT id, image_url, alt_text, title FROM ship_gallery WHERE ship_uuid = ?", [id]); return rows; }
  async get3DModels(id: string) { const [rows] = await this.pool.execute("SELECT id, file_name, file_path_p4k, file_size_bytes FROM ship_3dmodels WHERE ship_uuid = ?", [id]); return rows; }
}

// =============== P4K ENRICHMENT SERVICE ===============
export class P4KEnrichmentService {
  private vehicleData = new Map<string, P4KVehicleData>();
  private loaded = false;

  constructor(private pool: Pool, private p4kService: P4KService) {}

  async loadVehicleData(onProgress?: (m: string) => void): Promise<number> {
    if (this.loaded) return this.vehicleData.size;

    // First, load DataForge to get real UUIDs
    onProgress?.("Loading DataForge for vehicle UUIDs...");
    try {
      await this.p4kService.loadDataForge((m) => onProgress?.(m));
    } catch (e) {
      console.warn("[P4K] Could not load DataForge:", e);
    }

    // Scan P4K for ship models
    onProgress?.("Scanning P4K for ships...");
    const shipFiles = await this.p4kService.findFiles("Data\\\\Objects\\\\Spaceships\\\\Ships\\\\[A-Z]+\\\\[^\\\\]+\\\\", 500000);
    const folders = new Map<string, string[]>();
    for (const f of shipFiles) {
      const m = f.fileName.match(/^(Data\\Objects\\Spaceships\\Ships\\([A-Z]+)\\([^\\]+))\\/i);
      if (m) { const files = folders.get(m[1]) || []; files.push(f.fileName); folders.set(m[1], files); }
    }
    onProgress?.(`Found ${folders.size} ship folders`);
    
    for (const [basePath, files] of folders) {
      const m = basePath.match(/\\Ships\\([A-Z]+)\\([^\\]+)$/i);
      if (!m) continue;
      const mfgCode = m[1].toUpperCase(), folderName = m[2];
      const cgf = files.filter(f => /\.cgf(\.\d+)?$/i.test(f)), cgfm = files.filter(f => /\.cgfm(\.\d+)?$/i.test(f));
      const allModels = [...cgf, ...cgfm];
      const mainModel = cgf.find(f => !/_lod\d/i.test(f) && !/interior/i.test(f) && !/wreck/i.test(f));
      const intModels = allModels.filter(f => /interior/i.test(f) || /\\int\\/i.test(f));
      const extModels = allModels.filter(f => !intModels.includes(f));
      const displayName = folderName.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
      const className = `${mfgCode}_${folderName}`;
      
      // Try to get real UUID from DataForge first
      let uuid = this.p4kService.getVehicleUUID(className);
      
      // Fallback to deterministic UUID if not found in DataForge
      if (!uuid) {
        const hash = createHash("sha256").update(className).digest("hex");
        uuid = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
      }
      
      const data: P4KVehicleData = { uuid, className, displayName, manufacturer: MANUFACTURER_CODES[mfgCode] || mfgCode, manufacturerCode: mfgCode, mainModel, interiorModels: intModels, exteriorModels: extModels, allModels, texturePaths: files.filter(f => /\.(dds|tif)(\.\d+)?$/i.test(f)), basePath };
      const norm = displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
      this.vehicleData.set(norm, data);
      const folderNorm = folderName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (folderNorm !== norm) this.vehicleData.set(folderNorm, data);
    }
    this.loaded = true;
    onProgress?.(`Loaded ${this.vehicleData.size} ship models`);
    return this.vehicleData.size;
  }

  // Normalize special characters to ASCII equivalents
  private normalizeShipName(name: string): string {
    return name
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove diacritics (ā -> a, etc.)
      .replace(/[''.]/g, "")  // Remove apostrophes and dots
      .replace(/\s+/g, "_")   // Spaces to underscores
      .replace(/-/g, "_");    // Hyphens to underscores
  }

  // Find vehicle by name, also check DataForge for variants
  findVehicleData(name: string, mfg?: string): P4KVehicleData | undefined {
    const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    // Build className variants to try
    const mfgCode = mfg ? Object.entries(MANUFACTURER_CODES).find(([k, v]) => v === mfg)?.[0] || mfg.substring(0, 4).toUpperCase() : "";
    const shipName = this.normalizeShipName(name); // Normalize special chars, spaces, hyphens
    
    // Build multiple variant patterns for DataForge lookup
    const classNameVariants: string[] = [];
    
    // Common RSI -> P4K name transformations
    const nameVariations = [
      shipName,                                          // Gladius_Pirate_Edition, ROC_DS, SanTokYai
      name.replace(/\s+/g, "").replace(/-/g, "_"),       // GladiusPirateEdition, ROC_DS
      shipName.replace(/_Edition$/i, ""),                // Gladius_Pirate
      shipName.replace(/Pirate_Edition$/i, "PIR"),       // Gladius_PIR
      shipName.replace(/Edition$/i, "").replace(/_$/, ""), // Handle other Editions
      shipName.replace(/Best_In_Show_Edition_\d+$/i, "BIS"), // BIS variants
      shipName.replace(/_Best_In_Show_Edition_\d+$/i, ""), // Remove BIS suffix
      // Hercules -> Starlifter transformation
      shipName.replace(/^(A2|C2|M2)_Hercules$/i, "Starlifter_$1"),
      // Ares -> Starfighter transformation
      shipName.replace(/^Ares_(Ion|Inferno)$/i, "Starfighter_$1"),
      // Mercury -> Star_Runner
      shipName.replace(/^Mercury$/i, "Star_Runner"),
      // San'tok.yāi special chars
      shipName.replace(/[^a-z0-9_]/gi, ""),
      // P-72 Archimedes -> P72
      shipName.replace(/^P-(\d+)_/i, "P$1_"),
      // F8C Lightning -> Hornet_F8C
      shipName.replace(/^F8C_Lightning/i, "Hornet_F8C"),
      // ROC-DS -> ROC_Dual
      shipName.replace(/ROC-DS$/i, "ROC_Dual"),
      // CSV-SM -> CSV_Cargo
      shipName.replace(/CSV-SM$/i, "CSV_Cargo"),
      // Lynx -> Ursa_Rover
      shipName.replace(/^Lynx$/i, "Ursa_Rover"),
    ];
    
    for (const variation of nameVariations) {
      if (mfgCode) classNameVariants.push(`${mfgCode}_${variation}`);
      classNameVariants.push(variation);
    }
    
    // Remove duplicates and empty strings
    const uniqueVariants = [...new Set(classNameVariants)].filter(Boolean);
    
    // Try to get real UUID from DataForge for this specific variant
    for (const variant of uniqueVariants) {
      const dfUuid = this.p4kService.getVehicleUUID(variant);
      if (dfUuid) {
        // Found in DataForge - now find matching P4K data
        let p4kData = this.vehicleData.get(norm);
        if (!p4kData && mfg) p4kData = this.vehicleData.get((mfg + name).toLowerCase().replace(/[^a-z0-9]/g, ""));
        if (!p4kData) {
          // Fuzzy match
          for (const [k, v] of this.vehicleData) {
            if (k.includes(norm) || norm.includes(k)) { p4kData = v; break; }
          }
        }
        if (p4kData) {
          return { ...p4kData, uuid: dfUuid };
        }
        // Have DataForge UUID but no P4K model data - still return with UUID
        return { uuid: dfUuid, className: variant, displayName: name, manufacturer: mfg || "", manufacturerCode: mfgCode, interiorModels: [], exteriorModels: [], allModels: [], texturePaths: [], basePath: "" };
      }
    }
    
    // Fallback to old behavior
    let data = this.vehicleData.get(norm);
    if (data) return data;
    
    if (mfg) { 
      data = this.vehicleData.get((mfg + name).toLowerCase().replace(/[^a-z0-9]/g, "")); 
      if (data) return data;
    }
    
    // Fuzzy match
    for (const [k, v] of this.vehicleData) {
      if (k.includes(norm) || norm.includes(k)) return v;
    }
    return undefined;
  }

  async enrichAllShips(onProgress?: (m: string) => void): Promise<{ enriched: number; notFound: number }> {
    if (!this.loaded) await this.loadVehicleData(onProgress);
    const [rows] = await this.pool.execute("SELECT uuid, name, manufacturer_code FROM ships");
    const ships = rows as Array<{ uuid: string; name: string; manufacturer_code: string }>;;
    let enriched = 0, notFound = 0;
    const usedUuids = new Set<string>();
    const classNameCount = new Map<string, number>(); // Track how many ships share each className
    onProgress?.(`Enriching ${ships.length} ships...`);
    for (const ship of ships) {
      const p4k = this.findVehicleData(ship.name, ship.manufacturer_code);
      if (p4k) {
        const baseP4kUuid = p4k.uuid;
        if (!baseP4kUuid) continue; // Skip if no UUID (should not happen)
        const modelsJson = JSON.stringify({ all: p4k.allModels.filter(m => !/_lod\d/i.test(m)).slice(0, 50), interior: p4k.interiorModels.slice(0, 20), exterior: p4k.exteriorModels.filter(m => !/_lod\d/i.test(m)).slice(0, 20) });
        const oldUuid = ship.uuid;
        
        // Check if base P4K UUID already used (variants share same P4K folder/className)
        const [existing] = await this.pool.execute<any[]>("SELECT uuid FROM ships WHERE uuid=? AND uuid != ?", [baseP4kUuid, oldUuid]);
        const baseUuidAlreadyUsed = existing.length > 0 || usedUuids.has(baseP4kUuid);
        
        // For variants (when base UUID is already used), generate a variant UUID derived from the base
        let finalUuid = baseP4kUuid;
        if (baseUuidAlreadyUsed) {
          // Generate variant UUID: take base UUID and modify last segment with ship name hash
          const nameHash = createHash("sha256").update(ship.name).digest("hex").substring(0, 12);
          const baseParts = baseP4kUuid.split('-');
          finalUuid = `${baseParts[0]}-${baseParts[1]}-${baseParts[2]}-${baseParts[3]}-${nameHash}`;
          
          // Ensure this variant UUID is unique
          let suffix = 0;
          while (usedUuids.has(finalUuid)) {
            suffix++;
            const suffixHash = createHash("sha256").update(ship.name + suffix).digest("hex").substring(0, 12);
            finalUuid = `${baseParts[0]}-${baseParts[1]}-${baseParts[2]}-${baseParts[3]}-${suffixHash}`;
          }
        }
        
        // Replace UUID if:
        // 1. Current UUID is temporary (starts with ffffffff-)
        // 2. OR: finalUuid is different from current
        const isTemporaryUuid = oldUuid.startsWith('ffffffff-');
        const shouldReplaceUuid = isTemporaryUuid || oldUuid !== finalUuid;
        
        if (shouldReplaceUuid && !usedUuids.has(finalUuid)) {
          usedUuids.add(finalUuid);
          await this.pool.execute("SET FOREIGN_KEY_CHECKS=0");
          // Update ships table with P4K metadata and new UUID
          await this.pool.execute(`UPDATE ships SET uuid=?, class_name=?, p4k_base_path=?, p4k_model_count=?, p4k_texture_count=?, enriched_at=NOW() WHERE uuid=?`,
            [finalUuid, p4k.className, p4k.basePath || null, p4k.allModels.length, p4k.texturePaths.length, oldUuid]);
          // Update foreign keys in ship_specs
          await this.pool.execute(`UPDATE ship_specs SET ship_uuid=? WHERE ship_uuid=?`, [finalUuid, oldUuid]);
          await this.pool.execute("SET FOREIGN_KEY_CHECKS=1");
        } else {
          // Just enrich without changing UUID
          await this.pool.execute(`UPDATE ships SET class_name=?, p4k_base_path=?, p4k_model_count=?, p4k_texture_count=?, enriched_at=NOW() WHERE uuid=?`,
            [p4k.className, p4k.basePath || null, p4k.allModels.length, p4k.texturePaths.length, ship.uuid]);
        }
        
        // Extract and save advanced stats from loadout XML
        try {
          const stats = await this.p4kService.extractVehicleStats(p4k.className);
          if (stats && Object.keys(stats).length > 0) {
            // Build UPDATE query dynamically based on available stats
            const updateFields: string[] = [];
            const updateValues: any[] = [];
            
            if (stats.hull_hp !== undefined) { updateFields.push('hull_hp = ?'); updateValues.push(stats.hull_hp); }
            if (stats.shield_hp !== undefined) { updateFields.push('shield_hp = ?'); updateValues.push(stats.shield_hp); }
            if (stats.quantum_fuel !== undefined) { updateFields.push('quantum_fuel = ?'); updateValues.push(stats.quantum_fuel); }
            if (stats.hydrogen_fuel !== undefined) { updateFields.push('hydrogen_fuel = ?'); updateValues.push(stats.hydrogen_fuel); }
            if (stats.scm_speed !== undefined) { updateFields.push('scm_speed = ?'); updateValues.push(stats.scm_speed); }
            if (stats.max_speed !== undefined) { updateFields.push('max_speed = ?'); updateValues.push(stats.max_speed); }
            if (stats.afterburner_speed !== undefined) { updateFields.push('afterburner_speed = ?'); updateValues.push(stats.afterburner_speed); }
            if (stats.pitch_max !== undefined) { updateFields.push('pitch_max = ?'); updateValues.push(stats.pitch_max); }
            if (stats.yaw_max !== undefined) { updateFields.push('yaw_max = ?'); updateValues.push(stats.yaw_max); }
            if (stats.roll_max !== undefined) { updateFields.push('roll_max = ?'); updateValues.push(stats.roll_max); }
            if (stats.acceleration_main !== undefined) { updateFields.push('acceleration_main = ?'); updateValues.push(stats.acceleration_main); }
            if (stats.acceleration_retro !== undefined) { updateFields.push('acceleration_retro = ?'); updateValues.push(stats.acceleration_retro); }
            if (stats.acceleration_vtol !== undefined) { updateFields.push('acceleration_vtol = ?'); updateValues.push(stats.acceleration_vtol); }
            if (stats.acceleration_maneuvering !== undefined) { updateFields.push('acceleration_maneuvering = ?'); updateValues.push(stats.acceleration_maneuvering); }
            if (stats.weapon_hardpoints !== undefined) { updateFields.push('weapon_hardpoints = ?'); updateValues.push(stats.weapon_hardpoints); }
            if (stats.missile_racks !== undefined) { updateFields.push('missile_racks = ?'); updateValues.push(stats.missile_racks); }
            if (stats.turrets !== undefined) { updateFields.push('turrets = ?'); updateValues.push(stats.turrets); }
            if (stats.actual_mass !== undefined) { updateFields.push('actual_mass = ?'); updateValues.push(stats.actual_mass); }
            if (stats.em_signature !== undefined) { updateFields.push('em_signature = ?'); updateValues.push(stats.em_signature); }
            if (stats.ir_signature !== undefined) { updateFields.push('ir_signature = ?'); updateValues.push(stats.ir_signature); }
            if (stats.cs_signature !== undefined) { updateFields.push('cs_signature = ?'); updateValues.push(stats.cs_signature); }
            if (stats.shield_faces !== undefined) { updateFields.push('shield_faces = ?'); updateValues.push(stats.shield_faces); }
            if (stats.radar_range !== undefined) { updateFields.push('radar_range = ?'); updateValues.push(stats.radar_range); }
            if (stats.crew_size !== undefined) { updateFields.push('min_crew = ?'); updateValues.push(stats.crew_size); updateFields.push('max_crew = ?'); updateValues.push(stats.crew_size); }
            if (stats.length !== undefined) { updateFields.push('length = ?'); updateValues.push(stats.length); }
            if (stats.beam !== undefined) { updateFields.push('beam = ?'); updateValues.push(stats.beam); }
            if (stats.height !== undefined) { updateFields.push('height = ?'); updateValues.push(stats.height); }
            
            if (updateFields.length > 0) {
              updateValues.push(finalUuid);
              await this.pool.execute(
                `UPDATE ship_specs SET ${updateFields.join(', ')} WHERE ship_uuid = ?`,
                updateValues
              );
              console.log(`[Enrich] Updated ${updateFields.length} stats for ${ship.name}`);
            }
          }
        } catch (err) {
          console.warn(`[Enrich] Failed to extract stats for ${ship.name}:`, err);
        }
        
        enriched++;
      } else notFound++;
    }
    onProgress?.(`Enrichment done: ${enriched}/${ships.length}`);
    return { enriched, notFound };
  }
}
