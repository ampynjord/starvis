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
import { MANUFACTURER_CODES, RSI_TO_P4K_ALIASES } from "./p4k-aliases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Re-export for backward compatibility
export { MANUFACTURER_CODES };

// =============== CONFIG ===============
export const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "starapi",
  password: process.env.DB_PASSWORD || "starapi",
  database: process.env.DB_NAME || "starapi",
  waitForConnections: true,
  connectionLimit: 10,
};

// =============== TYPES ===============
export interface TransformedShip {
  id: string; uuid?: string; chassisId?: number | null; name: string;
  manufacturer?: string; manufacturerTag?: string; slug?: string; url?: string;
  description?: string; focus?: string; role?: string; productionStatus?: string;
  size?: string; type?: string; crew?: { min?: number; max?: number };
  mass?: number; cargocapacity?: number; length?: number; beam?: number; height?: number;
  scmSpeed?: number; afterburnerSpeed?: number; lastModified?: string | null;
  media?: { storeThumb?: string; storeBanner?: string };
  specifications?: Array<{ name: string; value: string }>;
  mediaGallery?: any[]; syncedAt?: Date; dataSource?: string;
  p4kData?: {
    className: string;
    manufacturerCode: string | null;
    displayName: string;
    basePath: string | null;
    mainModel: string | null;
    modelCount: number;
    interiorModelCount: number;
    exteriorModelCount: number;
    textureCount: number;
    models: { all: string[]; interior: string[]; exterior: string[] } | null;
    enrichedAt: Date | null;
  } | null;
}

export interface P4KEntry {
  fileName: string; uncompressedSize: number; compressedSize: number;
  compressionMethod: number; isDirectory: boolean; isEncrypted: boolean;
  dataOffset: number; localHeaderOffset: number;
}

export interface P4KVehicleData {
  uuid?: string; className: string; displayName: string;
  manufacturer: string; manufacturerCode: string;
  mainModel?: string; interiorModels: string[]; exteriorModels: string[];
  allModels: string[]; texturePaths: string[]; basePath: string;
}

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
      return Buffer.from(z.decompress(new Uint8Array(comp)));
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
    
    // Skip PropertyDefinitions (12 bytes each) and EnumDefinitions (8 bytes each) and DataMappings (8 bytes each)
    off += header.propertyDefinitionCount * 12 + header.enumDefinitionCount * 8 + header.dataMappingCount * 8;
    
    // RecordDefinitions - CORRECTED structure based on StarBreaker!
    // Each record is 28 bytes: nameOffset(4) + fileNameOffset(4) + structIndex(4) + guid(16) + instanceIndex(2) + structSize(2) = 32 bytes
    // Wait, let me recalculate: 4 + 4 + 4 + 16 + 2 + 2 = 32 bytes
    const records: any[] = [];
    for (let i = 0; i < header.recordDefinitionCount; i++) {
      const nameOffset = i32();     // DataCoreStringId2 - 4 bytes
      const fileNameOffset = i32(); // DataCoreStringId - 4 bytes
      const structIndex = i32();    // int - 4 bytes
      const id = readGuid();        // CigGuid - 16 bytes (THIS IS THE UUID!)
      const instanceIndex = u16();  // ushort - 2 bytes
      const structSize = u16();     // ushort - 2 bytes
      records.push({ nameOffset, fileNameOffset, structIndex, id, instanceIndex, structSize });
    }
    
    // Calculate valuesSize in EXACT read order from StarBreaker
    const valuesSize = 
      header.int8ValueCount * 1 +       // Int8Values (sbyte)
      header.int16ValueCount * 2 +      // Int16Values (short)
      header.int32ValueCount * 4 +      // Int32Values (int)
      header.int64ValueCount * 8 +      // Int64Values (long)
      header.uint8ValueCount * 1 +      // UInt8Values (byte)
      header.uint16ValueCount * 2 +     // UInt16Values (ushort)
      header.uint32ValueCount * 4 +     // UInt32Values (uint)
      header.uint64ValueCount * 8 +     // UInt64Values (ulong)
      header.booleanValueCount * 1 +    // BooleanValues (bool) - after uints, before singles!
      header.singleValueCount * 4 +     // SingleValues (float)
      header.doubleValueCount * 8 +     // DoubleValues (double)
      header.guidValueCount * 16 +      // GuidValues (CigGuid = 16 bytes)
      header.stringIdValueCount * 4 +   // StringIdValues (DataCoreStringId = 4 bytes)
      header.localeValueCount * 4 +     // LocaleValues (DataCoreStringId = 4 bytes)
      header.enumValueCount * 4 +       // EnumValues (DataCoreStringId = 4 bytes)
      header.strongValueCount * 8 +     // StrongValues (DataCorePointer = 8 bytes: structIndex + instanceIndex)
      header.weakValueCount * 8 +       // WeakValues (DataCorePointer = 8 bytes)
      header.referenceValueCount * 20 + // ReferenceValues (DataCoreReference = 20 bytes: instanceIndex 4 + CigGuid 16)
      header.enumOptionCount * 4;       // EnumOptions (DataCoreStringId2 = 4 bytes)
    
    console.log(`[DF] Before values, off=${off}`);
    off += valuesSize;
    
    // String table 1 (fileNames)
    const st1Start = off;
    const st1 = new Map<number, string>();
    let sOff = 0, s = "";
    while (off < st1Start + header.textLength) { 
      const b = buf[off++]; 
      if (b === 0) { st1.set(sOff, s); sOff = off - st1Start; s = ""; } 
      else s += String.fromCharCode(b); 
    }
    
    // String table 2 (names, struct names) - version 6+
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
    
    // Resolve names
    const nameTable = header.version >= 6 ? st2 : st1;
    for (const sd of structDefs) sd.name = nameTable.get(sd.nameOffset) || `STRUCT_${sd.nameOffset}`;
    for (const r of records) { 
      r.name = nameTable.get(r.nameOffset) || `RECORD_${r.nameOffset}`; 
      r.fileName = st1.get(r.fileNameOffset) || `FILE_${r.fileNameOffset}`; 
    }
    
    return { header, structDefs, records, stringTable1: st1, stringTable2: st2 };
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
          const thumb = ship.media?.[0]?.images?.store_small ? (ship.media[0].images.store_small.startsWith("http") ? ship.media[0].images.store_small : `https://robertsspaceindustries.com${ship.media[0].images.store_small}`) : null;
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
        enriched++;
      } else notFound++;
    }
    onProgress?.(`Enrichment done: ${enriched}/${ships.length}`);
    return { enriched, notFound };
  }
}
