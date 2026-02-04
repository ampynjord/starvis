#!/usr/bin/env node
/**
 * Script pour lister les véhicules dans le DataForge P4K
 */
import { statSync } from "fs";
import { open } from "fs/promises";
import { inflateRawSync } from "zlib";

const P4K_PATH = process.env.P4K_PATH || "/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k";
const SEARCH_TERM = process.argv[2]?.toLowerCase() || "";

console.log(`🔍 Recherche de véhicules${SEARCH_TERM ? ` contenant "${SEARCH_TERM}"` : ""}...`);

const CENTRAL_DIR_SIG = 0x02014b50;
const ZIP64_END_SIG = 0x06064b50;
const ZIP64_LOC_SIG = 0x07064b50;
const LOCAL_SIG = 0x04034b50;

async function readP4KEntry(fd, offset, compSize, uncompSize) {
  const localBuf = Buffer.alloc(30);
  await fd.read(localBuf, 0, 30, offset);
  if (localBuf.readUInt32LE(0) !== LOCAL_SIG) return null;
  
  const nameLen = localBuf.readUInt16LE(26);
  const extraLen = localBuf.readUInt16LE(28);
  const dataOff = offset + 30 + nameLen + extraLen;
  
  const compressed = Buffer.alloc(compSize);
  await fd.read(compressed, 0, compSize, dataOff);
  
  try {
    return inflateRawSync(compressed);
  } catch {
    return compressed;
  }
}

async function main() {
  const fileSize = statSync(P4K_PATH).size;
  const fd = await open(P4K_PATH, "r");
  
  const scanSize = Math.min(1024 * 1024, fileSize);
  const endBuf = Buffer.alloc(scanSize);
  await fd.read(endBuf, 0, scanSize, fileSize - scanSize);
  
  let zip64EndOff = 0, centralDirOff = 0, totalEntries = 0;
  for (let i = scanSize - 22; i >= 0; i--) {
    if (endBuf.readUInt32LE(i) === ZIP64_LOC_SIG) {
      zip64EndOff = Number(endBuf.readBigUInt64LE(i + 8));
      break;
    }
  }
  
  if (zip64EndOff > 0) {
    const z64Buf = Buffer.alloc(56);
    await fd.read(z64Buf, 0, 56, zip64EndOff);
    if (z64Buf.readUInt32LE(0) === ZIP64_END_SIG) {
      totalEntries = Number(z64Buf.readBigUInt64LE(32));
      centralDirOff = Number(z64Buf.readBigUInt64LE(48));
    }
  }

  // Find vehicle definitions XML
  const vehicleDefsPath = "Data/Libs/Foundry/Records/entities/spaceships/vehicle_definitions.xml";
  
  console.log(`📊 Total entries: ${totalEntries}`);
  console.log(`⏳ Searching for vehicle_definitions.xml...`);
  
  // Scan central directory
  let offset = centralDirOff;
  const chunkSize = 10 * 1024 * 1024;
  
  for (let scanned = 0; scanned < totalEntries; scanned++) {
    const headerBuf = Buffer.alloc(46);
    await fd.read(headerBuf, 0, 46, offset);
    
    if (headerBuf.readUInt32LE(0) !== CENTRAL_DIR_SIG) break;
    
    const compSize = headerBuf.readUInt32LE(20);
    const uncompSize = headerBuf.readUInt32LE(24);
    const nameLen = headerBuf.readUInt16LE(28);
    const extraLen = headerBuf.readUInt16LE(30);
    const commentLen = headerBuf.readUInt16LE(32);
    let localOffset = headerBuf.readUInt32LE(42);
    
    const nameBuf = Buffer.alloc(nameLen);
    await fd.read(nameBuf, 0, nameLen, offset + 46);
    const filename = nameBuf.toString("utf8");
    
    // Handle ZIP64 extra field
    if (localOffset === 0xFFFFFFFF || compSize === 0xFFFFFFFF) {
      const extraBuf = Buffer.alloc(extraLen);
      await fd.read(extraBuf, 0, extraLen, offset + 46 + nameLen);
      let pos = 0;
      while (pos < extraLen) {
        const tag = extraBuf.readUInt16LE(pos);
        const size = extraBuf.readUInt16LE(pos + 2);
        if (tag === 0x0001) {
          let fieldPos = 4;
          if (uncompSize === 0xFFFFFFFF) fieldPos += 8;
          if (compSize === 0xFFFFFFFF) fieldPos += 8;
          if (localOffset === 0xFFFFFFFF) {
            localOffset = Number(extraBuf.readBigUInt64LE(pos + fieldPos));
          }
          break;
        }
        pos += 4 + size;
      }
    }
    
    // Check if this is a vehicle definition file
    if (filename.toLowerCase().includes("spaceships") && filename.endsWith(".xml")) {
      const lowerName = filename.toLowerCase();
      if (lowerName.includes(SEARCH_TERM) || 
          (SEARCH_TERM === "" && (lowerName.includes("xian") || lowerName.includes("p72") || lowerName.includes("archimedes") || lowerName.includes("scout")))) {
        console.log(`\n📄 Found: ${filename}`);
        
        // Read and parse
        const realCompSize = compSize === 0xFFFFFFFF ? Number(headerBuf.readBigUInt64LE(20)) : compSize;
        const realUncompSize = uncompSize === 0xFFFFFFFF ? Number(headerBuf.readBigUInt64LE(24)) : uncompSize;
        
        // Extract UUID from content
        if (realCompSize < 10000000) { // Don't read huge files
          const content = await readP4KEntry(fd, localOffset, realCompSize || compSize, realUncompSize || uncompSize);
          if (content) {
            const text = content.toString("utf8");
            const uuidMatch = text.match(/__ref\s+guid="([^"]+)"/i);
            const classMatch = text.match(/ClassName[^>]*>([^<]+)/i) || text.match(/class="([^"]+)"/i);
            if (uuidMatch) console.log(`   UUID: ${uuidMatch[1]}`);
            if (classMatch) console.log(`   Class: ${classMatch[1]}`);
          }
        }
      }
    }
    
    offset += 46 + nameLen + extraLen + commentLen;
    if (scanned % 100000 === 0) {
      process.stdout.write(`\r⏳ Scanned: ${scanned}/${totalEntries}`);
    }
  }
  
  await fd.close();
  console.log("\n✅ Done!");
}

main().catch(console.error);
