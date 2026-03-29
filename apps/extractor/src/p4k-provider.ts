/**
 * P4K Provider - Reads Star Citizen .p4k archive files (ZIP64 with AES encryption)
 * Handles: ZIP parsing, AES-128-CBC decryption, Zstd/Deflate decompression
 */
import { createDecipheriv } from 'node:crypto';
import { statSync } from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import logger from './logger.js';

export interface P4KEntry {
  fileName: string;
  uncompressedSize: number;
  compressedSize: number;
  compressionMethod: number;
  isDirectory: boolean;
  isEncrypted: boolean;
  dataOffset: number;
  localHeaderOffset: number;
}

// CIG P4K AES-128-CBC encryption key (known/public from unp4k)
const P4K_AES_KEY = Buffer.from([0x5e, 0x7a, 0x20, 0x02, 0x30, 0x2e, 0xeb, 0x1a, 0x3b, 0xb6, 0x17, 0xc3, 0x0f, 0xde, 0x1e, 0x47]);
const P4K_AES_IV = Buffer.alloc(16, 0x00);

const CENTRAL_DIR_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const ZIP64_END_SIG = 0x06064b50;
const ZIP64_LOC_SIG = 0x07064b50;
const LOCAL_SIG = 0x04034b50;

let fzstd: { decompress: (data: Uint8Array) => Uint8Array } | null = null;
async function loadFzstd() {
  if (!fzstd) {
    try {
      fzstd = await import('fzstd');
    } catch {}
  }
  return fzstd;
}

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
    this.fd = await open(this.p4kPath, 'r');
    await this.readEndOfCentralDirectory();
    logger.info(`P4K opened: ${this.totalEntries.toLocaleString()} entries`, { module: 'p4k' });
  }

  async close(): Promise<void> {
    if (this.fd) {
      await this.fd.close();
      this.fd = null;
      this.entries.clear();
      this.entriesLoaded = false;
    }
  }

  private async readEndOfCentralDirectory(): Promise<void> {
    if (!this.fd) throw new Error('P4K not open');
    const searchSize = Math.min(65558, this.fileSize);
    const buf = Buffer.alloc(searchSize);
    await this.fd.read(buf, 0, searchSize, this.fileSize - searchSize);
    let eocdOff = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === END_SIG) {
        eocdOff = this.fileSize - searchSize + i;
        break;
      }
    }
    if (eocdOff === -1) throw new Error('EOCD not found');
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
    if (!this.fd) throw new Error('P4K not open');
    const CHUNK = 64 * 1024 * 1024;
    let offset = this.centralDirOffset,
      processed = 0;
    let buf = Buffer.alloc(CHUNK),
      bufOff = 0,
      bufEnd = 0;
    const ensure = async (n: number) => {
      if (bufOff + n > bufEnd) {
        const rem = bufEnd - bufOff;
        if (rem > 0) buf.copy(buf, 0, bufOff, bufEnd);
        bufOff = 0;
        bufEnd = rem;
        const toRead = Math.min(CHUNK - bufEnd, this.centralDirOffset + this.centralDirSize - offset);
        if (toRead > 0) {
          const { bytesRead } = await this.fd!.read(buf, bufEnd, toRead, offset);
          bufEnd += bytesRead;
          offset += bytesRead;
        }
      }
      return bufOff + n <= bufEnd;
    };
    while (processed < this.totalEntries) {
      if (!(await ensure(46))) break;
      if (buf.readUInt32LE(bufOff) !== CENTRAL_DIR_SIG) break;
      const comp = buf.readUInt16LE(bufOff + 10),
        flags = buf.readUInt16LE(bufOff + 8);
      let cSize = buf.readUInt32LE(bufOff + 20),
        uSize = buf.readUInt32LE(bufOff + 24);
      const fnLen = buf.readUInt16LE(bufOff + 28),
        exLen = buf.readUInt16LE(bufOff + 30),
        cmLen = buf.readUInt16LE(bufOff + 32);
      let locOff = buf.readUInt32LE(bufOff + 42);
      const total = 46 + fnLen + exLen + cmLen;
      if (!(await ensure(total))) break;
      const fn = buf.toString('utf8', bufOff + 46, bufOff + 46 + fnLen);
      if (cSize === 0xffffffff || uSize === 0xffffffff || locOff === 0xffffffff) {
        let exOff = bufOff + 46 + fnLen;
        const exEnd = exOff + exLen;
        while (exOff < exEnd) {
          const hid = buf.readUInt16LE(exOff),
            dsz = buf.readUInt16LE(exOff + 2);
          if (hid === 0x0001) {
            let fo = exOff + 4;
            if (uSize === 0xffffffff) {
              uSize = Number(buf.readBigUInt64LE(fo));
              fo += 8;
            }
            if (cSize === 0xffffffff) {
              cSize = Number(buf.readBigUInt64LE(fo));
              fo += 8;
            }
            if (locOff === 0xffffffff) locOff = Number(buf.readBigUInt64LE(fo));
            break;
          }
          exOff += 4 + dsz;
        }
      }
      const entry: P4KEntry = {
        fileName: fn,
        uncompressedSize: uSize,
        compressedSize: cSize,
        compressionMethod: comp,
        isDirectory: fn.endsWith('/'),
        isEncrypted: (flags & 1) !== 0,
        dataOffset: 0,
        localHeaderOffset: locOff,
      };
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
    for (const e of this.entries.values()) {
      if (pattern.test(e.fileName)) {
        r.push(e);
        if (r.length >= limit) break;
      }
    }
    return r;
  }

  async getEntry(fn: string): Promise<P4KEntry | undefined> {
    await this.loadAllEntries();
    const norm = fn.replace(/\//g, '\\');
    return this.entries.get(norm) || this.entriesLower.get(norm.toLowerCase());
  }

  async readFileFromEntry(entry: P4KEntry): Promise<Buffer> {
    if (!this.fd) throw new Error('P4K not open');
    const lh = Buffer.alloc(30);
    await this.fd.read(lh, 0, 30, entry.localHeaderOffset);
    if (lh.readUInt32LE(0) !== LOCAL_SIG) throw new Error('Invalid local header');
    const fnLen = lh.readUInt16LE(26),
      exLen = lh.readUInt16LE(28);
    const dataOff = entry.localHeaderOffset + 30 + fnLen + exLen;
    let comp = Buffer.alloc(entry.compressedSize);
    await this.fd.read(comp, 0, entry.compressedSize, dataOff);

    // Check for CIG AES encryption
    let isEncrypted = false;
    if (exLen >= 169) {
      const extra = Buffer.alloc(exLen);
      await this.fd.read(extra, 0, exLen, entry.localHeaderOffset + 30 + fnLen);
      isEncrypted = extra[168] > 0x00;
    }
    if (!isEncrypted && (entry.compressionMethod === 93 || entry.compressionMethod === 100)) {
      if (comp.length >= 4 && comp.readUInt32LE(0) !== 0xfd2fb528) isEncrypted = true;
    }

    // Decrypt AES if needed
    if (isEncrypted) {
      const decipher = createDecipheriv('aes-128-cbc', P4K_AES_KEY, P4K_AES_IV);
      decipher.setAutoPadding(false);
      const decrypted = Buffer.concat([decipher.update(comp), decipher.final()]);
      let end = decrypted.length;
      while (end > 0 && decrypted[end - 1] === 0x00) end--;
      comp = decrypted.subarray(0, end);
    }

    if (entry.compressionMethod === 0) return comp;
    if (entry.compressionMethod === 8) return inflateRawSync(comp);
    if (entry.compressionMethod === 93 || entry.compressionMethod === 100) {
      const z = await loadFzstd();
      if (!z) throw new Error('ZSTD unavailable');
      return Buffer.from(z.decompress(new Uint8Array(comp)));
    }
    throw new Error(`Unsupported compression: ${entry.compressionMethod}`);
  }

  async getStats() {
    await this.loadAllEntries();
    let total = 0,
      compressed = 0;
    const dirs: Record<string, number> = {},
      exts: Record<string, number> = {};
    for (const e of this.entries.values()) {
      total += e.uncompressedSize;
      compressed += e.compressedSize;
      const parts = e.fileName.split('/'),
        root = parts[0];
      if (root && !e.isDirectory) dirs[root] = (dirs[root] || 0) + 1;
      const ext = e.fileName.split('.').pop()?.toLowerCase();
      if (ext && !e.isDirectory) exts[ext] = (exts[ext] || 0) + 1;
    }
    return {
      totalEntries: this.totalEntries,
      totalSize: total,
      compressedSize: compressed,
      topDirectories: Object.entries(dirs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([path, count]) => ({ path, count })),
      topExtensions: Object.entries(exts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([ext, count]) => ({ ext, count })),
    };
  }
}
