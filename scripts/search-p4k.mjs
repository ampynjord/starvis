#!/usr/bin/env node
/**
 * Script pour rechercher des vaisseaux dans le DataForge P4K
 */
import { statSync } from "fs";
import { open } from "fs/promises";

const P4K_PATH = process.env.P4K_PATH || "/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k";
const SEARCH_TERM = process.argv[2] || "khartu";

console.log(`🔍 Recherche de "${SEARCH_TERM}" dans le P4K...`);
console.log(`📦 P4K: ${P4K_PATH}`);

// Simple P4K reading functions
const CENTRAL_DIR_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const ZIP64_END_SIG = 0x06064b50;
const ZIP64_LOC_SIG = 0x07064b50;

async function searchInP4K() {
  const fileSize = statSync(P4K_PATH).size;
  const fd = await open(P4K_PATH, "r");
  
  // Read end of file for ZIP structures
  const scanSize = Math.min(1024 * 1024, fileSize);
  const endBuf = Buffer.alloc(scanSize);
  await fd.read(endBuf, 0, scanSize, fileSize - scanSize);
  
  // Find ZIP64 end locator
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
  
  console.log(`📊 Total entries: ${totalEntries}, Central dir offset: ${centralDirOff}`);
  
  // Search in central directory for matching filenames
  const searchLower = SEARCH_TERM.toLowerCase();
  const matches = [];
  let offset = centralDirOff;
  
  const chunkSize = 100 * 1024 * 1024; // 100MB chunks
  let chunk = Buffer.alloc(chunkSize);
  let chunkStart = centralDirOff;
  await fd.read(chunk, 0, chunkSize, chunkStart);
  
  for (let i = 0; i < totalEntries && matches.length < 100; i++) {
    const localOff = offset - chunkStart;
    if (localOff + 46 > chunk.length) {
      // Need to load next chunk
      chunkStart = offset;
      await fd.read(chunk, 0, chunkSize, chunkStart);
    }
    
    const relOff = offset - chunkStart;
    const sig = chunk.readUInt32LE(relOff);
    if (sig !== CENTRAL_DIR_SIG) {
      console.log(`❌ Invalid signature at ${offset}`);
      break;
    }
    
    const fnLen = chunk.readUInt16LE(relOff + 28);
    const efLen = chunk.readUInt16LE(relOff + 30);
    const fcLen = chunk.readUInt16LE(relOff + 32);
    const fileName = chunk.toString("utf-8", relOff + 46, relOff + 46 + fnLen);
    
    if (fileName.toLowerCase().includes(searchLower)) {
      matches.push(fileName);
    }
    
    offset += 46 + fnLen + efLen + fcLen;
    
    if (i % 100000 === 0) {
      process.stdout.write(`\r⏳ Scanning: ${i}/${totalEntries} (${matches.length} matches)`);
    }
  }
  
  await fd.close();
  
  console.log(`\n\n✅ Trouvé ${matches.length} fichiers contenant "${SEARCH_TERM}":\n`);
  
  // Group by directory
  const dirs = new Map();
  for (const m of matches) {
    const parts = m.split("/");
    const dir = parts.slice(0, -1).join("/");
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(parts[parts.length - 1]);
  }
  
  for (const [dir, files] of dirs) {
    console.log(`📁 ${dir}/`);
    for (const f of files.slice(0, 5)) {
      console.log(`   - ${f}`);
    }
    if (files.length > 5) console.log(`   ... et ${files.length - 5} autres`);
    console.log();
  }
}

searchInP4K().catch(console.error);
