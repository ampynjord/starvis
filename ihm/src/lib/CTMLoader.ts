/**
 * CTMLoader for Three.js â€” OpenCTM format reader
 *
 * Ported from Three.js r92 examples (MIT License)
 * Original ctm.js by Juan Mellado (MIT License)
 * Original lzma.js ported from the LZMA Java implementation
 *
 * Supports RAW, MG1 and MG2 compressed streams.
 * http://openctm.sourceforge.net/
 */

import * as THREE from 'three';

// â”€â”€â”€ LZMA decoder (ported from Three.js r92 lzma.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/* biome-ignore-all lint: embedded external library, do not lint */
/* eslint-disable */

const LZMA = (() => {
  function initBitModels(probs: number[], len: number) {
    let i = len;
    while (i--) probs[i] = 1024;
  }

  class OutWindow {
    _windowSize = 0;
    _buffer: number[] = [];
    _pos = 0;
    _streamPos = 0;
    _stream: OutStream | null = null;

    create(windowSize: number) {
      if (!this._buffer || this._windowSize !== windowSize) this._buffer = [];
      this._windowSize = windowSize;
      this._pos = 0;
      this._streamPos = 0;
    }
    flush() {
      let size = this._pos - this._streamPos;
      if (size !== 0) {
        while (size--) this._stream!.writeByte(this._buffer[this._streamPos++]);
        if (this._pos >= this._windowSize) this._pos = 0;
        this._streamPos = this._pos;
      }
    }
    releaseStream() {
      this.flush();
      this._stream = null;
    }
    setStream(stream: OutStream) {
      this.releaseStream();
      this._stream = stream;
    }
    init(solid: boolean) {
      if (!solid) {
        this._streamPos = 0;
        this._pos = 0;
      }
    }
    copyBlock(distance: number, len: number) {
      let pos = this._pos - distance - 1;
      if (pos < 0) pos += this._windowSize;
      while (len--) {
        if (pos >= this._windowSize) pos = 0;
        this._buffer[this._pos++] = this._buffer[pos++];
        if (this._pos >= this._windowSize) this.flush();
      }
    }
    putByte(b: number) {
      this._buffer[this._pos++] = b;
      if (this._pos >= this._windowSize) this.flush();
    }
    getByte(distance: number) {
      let pos = this._pos - distance - 1;
      if (pos < 0) pos += this._windowSize;
      return this._buffer[pos];
    }
  }

  class RangeDecoder {
    _stream: CTMStream | null = null;
    _code = 0;
    _range = -1;
    setStream(stream: CTMStream) {
      this._stream = stream;
    }
    releaseStream() {
      this._stream = null;
    }
    init() {
      let i = 5;
      this._code = 0;
      this._range = -1;
      while (i--) this._code = (this._code << 8) | this._stream!.readByte();
    }
    decodeDirectBits(numTotalBits: number) {
      let result = 0,
        i = numTotalBits;
      while (i--) {
        this._range >>>= 1;
        const t = (this._code - this._range) >>> 31;
        this._code -= this._range & (t - 1);
        result = (result << 1) | (1 - t);
        if ((this._range & 0xff000000) === 0) {
          this._code = (this._code << 8) | this._stream!.readByte();
          this._range <<= 8;
        }
      }
      return result;
    }
    decodeBit(probs: number[], index: number) {
      const prob = probs[index];
      const newBound = (this._range >>> 11) * prob;
      if ((this._code ^ 0x80000000) < (newBound ^ 0x80000000)) {
        this._range = newBound;
        probs[index] += (2048 - prob) >>> 5;
        if ((this._range & 0xff000000) === 0) {
          this._code = (this._code << 8) | this._stream!.readByte();
          this._range <<= 8;
        }
        return 0;
      }
      this._range -= newBound;
      this._code -= newBound;
      probs[index] -= prob >>> 5;
      if ((this._range & 0xff000000) === 0) {
        this._code = (this._code << 8) | this._stream!.readByte();
        this._range <<= 8;
      }
      return 1;
    }
  }

  class BitTreeDecoder {
    _models: number[];
    _numBitLevels: number;
    constructor(numBitLevels: number) {
      this._models = [];
      this._numBitLevels = numBitLevels;
    }
    init() {
      initBitModels(this._models, 1 << this._numBitLevels);
    }
    decode(rd: RangeDecoder) {
      let m = 1,
        i = this._numBitLevels;
      while (i--) m = (m << 1) | rd.decodeBit(this._models, m);
      return m - (1 << this._numBitLevels);
    }
    reverseDecode(rd: RangeDecoder) {
      let m = 1,
        symbol = 0,
        i = 0;
      for (; i < this._numBitLevels; i++) {
        const bit = rd.decodeBit(this._models, m);
        m = (m << 1) | bit;
        symbol |= bit << i;
      }
      return symbol;
    }
  }

  function reverseDecode2(models: number[], startIndex: number, rd: RangeDecoder, numBitLevels: number) {
    let m = 1,
      symbol = 0,
      i = 0;
    for (; i < numBitLevels; i++) {
      const bit = rd.decodeBit(models, startIndex + m);
      m = (m << 1) | bit;
      symbol |= bit << i;
    }
    return symbol;
  }

  class Decoder2 {
    _decoders: number[] = [];
    init() {
      initBitModels(this._decoders, 0x300);
    }
    decodeNormal(rd: RangeDecoder) {
      let symbol = 1;
      do {
        symbol = (symbol << 1) | rd.decodeBit(this._decoders, symbol);
      } while (symbol < 0x100);
      return symbol & 0xff;
    }
    decodeWithMatchByte(rd: RangeDecoder, matchByte: number) {
      let symbol = 1,
        matchBit: number,
        bit: number;
      do {
        matchBit = (matchByte >> 7) & 1;
        matchByte <<= 1;
        bit = rd.decodeBit(this._decoders, ((1 + matchBit) << 8) + symbol);
        symbol = (symbol << 1) | bit;
        if (matchBit !== bit) {
          while (symbol < 0x100) symbol = (symbol << 1) | rd.decodeBit(this._decoders, symbol);
          break;
        }
      } while (symbol < 0x100);
      return symbol & 0xff;
    }
  }

  class LiteralDecoder {
    _coders: Decoder2[] = [];
    _numPrevBits = 0;
    _numPosBits = 0;
    _posMask = 0;
    create(numPosBits: number, numPrevBits: number) {
      if (this._coders && this._numPrevBits === numPrevBits && this._numPosBits === numPosBits) return;
      this._numPosBits = numPosBits;
      this._posMask = (1 << numPosBits) - 1;
      this._numPrevBits = numPrevBits;
      this._coders = [];
      let i = 1 << (this._numPrevBits + this._numPosBits);
      while (i--) this._coders[i] = new Decoder2();
    }
    init() {
      let i = 1 << (this._numPrevBits + this._numPosBits);
      while (i--) this._coders[i].init();
    }
    getDecoder(pos: number, prevByte: number) {
      return this._coders[((pos & this._posMask) << this._numPrevBits) + ((prevByte & 0xff) >>> (8 - this._numPrevBits))];
    }
  }

  class LenDecoder {
    _choice: number[] = [];
    _lowCoder: BitTreeDecoder[] = [];
    _midCoder: BitTreeDecoder[] = [];
    _highCoder = new BitTreeDecoder(8);
    _numPosStates = 0;
    create(numPosStates: number) {
      for (; this._numPosStates < numPosStates; this._numPosStates++) {
        this._lowCoder[this._numPosStates] = new BitTreeDecoder(3);
        this._midCoder[this._numPosStates] = new BitTreeDecoder(3);
      }
    }
    init() {
      let i = this._numPosStates;
      initBitModels(this._choice, 2);
      while (i--) {
        this._lowCoder[i].init();
        this._midCoder[i].init();
      }
      this._highCoder.init();
    }
    decode(rd: RangeDecoder, posState: number) {
      if (rd.decodeBit(this._choice, 0) === 0) return this._lowCoder[posState].decode(rd);
      if (rd.decodeBit(this._choice, 1) === 0) return 8 + this._midCoder[posState].decode(rd);
      return 16 + this._highCoder.decode(rd);
    }
  }

  class OutStream {
    data: number[] = [];
    writeByte(b: number) {
      this.data.push(b);
    }
  }

  class LZMADecoder {
    _outWindow = new OutWindow();
    _rangeDecoder = new RangeDecoder();
    _isMatchDecoders: number[] = [];
    _isRepDecoders: number[] = [];
    _isRepG0Decoders: number[] = [];
    _isRepG1Decoders: number[] = [];
    _isRepG2Decoders: number[] = [];
    _isRep0LongDecoders: number[] = [];
    _posSlotDecoder = [new BitTreeDecoder(6), new BitTreeDecoder(6), new BitTreeDecoder(6), new BitTreeDecoder(6)];
    _posDecoders: number[] = [];
    _posAlignDecoder = new BitTreeDecoder(4);
    _lenDecoder = new LenDecoder();
    _repLenDecoder = new LenDecoder();
    _literalDecoder = new LiteralDecoder();
    _dictionarySize = -1;
    _dictionarySizeCheck = -1;
    _posStateMask = 0;

    setDictionarySize(size: number) {
      if (size < 0) return false;
      if (this._dictionarySize !== size) {
        this._dictionarySize = size;
        this._dictionarySizeCheck = Math.max(size, 1);
        this._outWindow.create(Math.max(this._dictionarySizeCheck, 4096));
      }
      return true;
    }
    setLcLpPb(lc: number, lp: number, pb: number) {
      const numPosStates = 1 << pb;
      if (lc > 8 || lp > 4 || pb > 4) return false;
      this._literalDecoder.create(lp, lc);
      this._lenDecoder.create(numPosStates);
      this._repLenDecoder.create(numPosStates);
      this._posStateMask = numPosStates - 1;
      return true;
    }
    init() {
      let i = 4;
      this._outWindow.init(false);
      initBitModels(this._isMatchDecoders, 192);
      initBitModels(this._isRep0LongDecoders, 192);
      initBitModels(this._isRepDecoders, 12);
      initBitModels(this._isRepG0Decoders, 12);
      initBitModels(this._isRepG1Decoders, 12);
      initBitModels(this._isRepG2Decoders, 12);
      initBitModels(this._posDecoders, 114);
      this._literalDecoder.init();
      while (i--) this._posSlotDecoder[i].init();
      this._lenDecoder.init();
      this._repLenDecoder.init();
      this._posAlignDecoder.init();
      this._rangeDecoder.init();
    }
    decode(inStream: CTMStream, outStream: OutStream, outSize: number) {
      let state = 0,
        rep0 = 0,
        rep1 = 0,
        rep2 = 0,
        rep3 = 0;
      let nowPos64 = 0,
        prevByte = 0;

      this._rangeDecoder.setStream(inStream);
      this._outWindow.setStream(outStream);
      this.init();

      while (outSize < 0 || nowPos64 < outSize) {
        const posState = nowPos64 & this._posStateMask;
        if (this._rangeDecoder.decodeBit(this._isMatchDecoders, (state << 4) + posState) === 0) {
          const decoder2 = this._literalDecoder.getDecoder(nowPos64++, prevByte);
          prevByte =
            state >= 7
              ? decoder2.decodeWithMatchByte(this._rangeDecoder, this._outWindow.getByte(rep0))
              : decoder2.decodeNormal(this._rangeDecoder);
          this._outWindow.putByte(prevByte);
          state = state < 4 ? 0 : state - (state < 10 ? 3 : 6);
        } else {
          let len = 0;
          if (this._rangeDecoder.decodeBit(this._isRepDecoders, state) === 1) {
            if (this._rangeDecoder.decodeBit(this._isRepG0Decoders, state) === 0) {
              if (this._rangeDecoder.decodeBit(this._isRep0LongDecoders, (state << 4) + posState) === 0) {
                state = state < 7 ? 9 : 11;
                len = 1;
              }
            } else {
              let distance: number;
              if (this._rangeDecoder.decodeBit(this._isRepG1Decoders, state) === 0) {
                distance = rep1;
              } else {
                if (this._rangeDecoder.decodeBit(this._isRepG2Decoders, state) === 0) {
                  distance = rep2;
                } else {
                  distance = rep3;
                  rep3 = rep2;
                }
                rep2 = rep1;
              }
              rep1 = rep0;
              rep0 = distance!;
            }
            if (len === 0) {
              len = 2 + this._repLenDecoder.decode(this._rangeDecoder, posState);
              state = state < 7 ? 8 : 11;
            }
          } else {
            rep3 = rep2;
            rep2 = rep1;
            rep1 = rep0;
            len = 2 + this._lenDecoder.decode(this._rangeDecoder, posState);
            state = state < 7 ? 7 : 10;
            const posSlot = this._posSlotDecoder[len <= 5 ? len - 2 : 3].decode(this._rangeDecoder);
            if (posSlot >= 4) {
              const numDirectBits = (posSlot >> 1) - 1;
              rep0 = (2 | (posSlot & 1)) << numDirectBits;
              if (posSlot < 14) {
                rep0 += reverseDecode2(this._posDecoders, rep0 - posSlot - 1, this._rangeDecoder, numDirectBits);
              } else {
                rep0 += this._rangeDecoder.decodeDirectBits(numDirectBits - 4) << 4;
                rep0 += this._posAlignDecoder.reverseDecode(this._rangeDecoder);
                if (rep0 < 0) {
                  if (rep0 === -1) break;
                  return false;
                }
              }
            } else {
              rep0 = posSlot;
            }
          }
          if (rep0 >= nowPos64 || rep0 >= this._dictionarySizeCheck) return false;
          this._outWindow.copyBlock(rep0, len);
          nowPos64 += len;
          prevByte = this._outWindow.getByte(0);
        }
      }
      this._outWindow.flush();
      this._outWindow.releaseStream();
      this._rangeDecoder.releaseStream();
      return true;
    }
    setDecoderProperties(properties: CTMStream) {
      const value = properties.readByte();
      const lc = value % 9,
        rem = ~~(value / 9),
        lp = rem % 5,
        pb = ~~(rem / 5);
      if (!this.setLcLpPb(lc, lp, pb)) return false;
      let dictSize = properties.readByte();
      dictSize |= properties.readByte() << 8;
      dictSize |= properties.readByte() << 16;
      dictSize += properties.readByte() * 16777216;
      return this.setDictionarySize(dictSize);
    }
  }

  function decompress(properties: CTMStream, inStream: CTMStream, outStream: OutStream, outSize: number) {
    const decoder = new LZMADecoder();
    if (!decoder.setDecoderProperties(properties)) throw new Error('Incorrect LZMA stream properties');
    if (!decoder.decode(inStream, outStream, outSize)) throw new Error('Error in LZMA data stream');
    return true;
  }

  return { decompress };
})();

/* eslint-enable */

// â”€â”€â”€ OpenCTM reader (ported from Three.js r92 ctm.js, MIT) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CTM_COMPRESSION_RAW = 0x00574152;
const CTM_COMPRESSION_MG1 = 0x0031474d;
const CTM_COMPRESSION_MG2 = 0x0032474d;
const CTM_FLAG_NORMALS = 0x00000001;
const IS_LITTLE_ENDIAN = (() => {
  const buf = new ArrayBuffer(2),
    bytes = new Uint8Array(buf),
    ints = new Uint16Array(buf);
  bytes[0] = 1;
  return ints[0] === 1;
})();

class CTMStream {
  data: Uint8Array;
  offset: number;
  TWO_POW_MINUS23 = 2 ** -23;
  TWO_POW_MINUS126 = 2 ** -126;

  constructor(data: Uint8Array, offset = 0) {
    this.data = data;
    this.offset = offset;
  }
  readByte() {
    return this.data[this.offset++] & 0xff;
  }
  readInt32() {
    let i = this.readByte();
    i |= this.readByte() << 8;
    i |= this.readByte() << 16;
    return i | (this.readByte() << 24);
  }
  readFloat32() {
    let m = this.readByte();
    m += this.readByte() << 8;
    const b1 = this.readByte(),
      b2 = this.readByte();
    m += (b1 & 0x7f) << 16;
    const e = ((b2 & 0x7f) << 1) | ((b1 & 0x80) >>> 7);
    const s = b2 & 0x80 ? -1 : 1;
    if (e === 255) return m !== 0 ? NaN : s * Infinity;
    if (e > 0) return s * (1 + m * this.TWO_POW_MINUS23) * 2 ** (e - 127);
    if (m !== 0) return s * m * this.TWO_POW_MINUS126;
    return s * 0;
  }
  readString() {
    const len = this.readInt32();
    this.offset += len;
    return String.fromCharCode.apply(null, Array.from(this.data.subarray(this.offset - len, this.offset)));
  }
  readArrayInt32(array: Uint32Array) {
    for (let i = 0; i < array.length; i++) array[i] = this.readInt32();
    return array;
  }
  readArrayFloat32(array: Float32Array) {
    for (let i = 0; i < array.length; i++) array[i] = this.readFloat32();
    return array;
  }
}

class CTMInterleavedStream {
  data: Uint8Array;
  offset: number;
  count: number;
  len: number;
  constructor(typedArray: Float32Array | Uint32Array, count: number) {
    this.data = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    this.offset = IS_LITTLE_ENDIAN ? 3 : 0;
    this.count = count * 4;
    this.len = this.data.length;
  }
  writeByte(value: number) {
    this.data[this.offset] = value;
    this.offset += this.count;
    if (this.offset >= this.len) {
      this.offset -= this.len - 4;
      if (this.offset >= this.count) this.offset -= this.count + (IS_LITTLE_ENDIAN ? 1 : -1);
    }
  }
}

interface CTMBody {
  indices: Uint32Array;
  vertices: Float32Array;
  normals?: Float32Array;
  uvMaps?: { name: string; filename: string; uv: Float32Array }[];
  attrMaps?: { name: string; attr: Float32Array }[];
}

interface MG2Header {
  vertexPrecision: number;
  normalPrecision: number;
  lowerBoundx: number;
  lowerBoundy: number;
  lowerBoundz: number;
  higherBoundx: number;
  higherBoundy: number;
  higherBoundz: number;
  divx: number;
  divy: number;
  divz: number;
  sizex: number;
  sizey: number;
  sizez: number;
}

function lzmaDecompress(stream: CTMStream, interleavedOut: CTMInterleavedStream, outSize: number) {
  // biome-ignore lint: the LZMA decoder uses duck-typing for the output stream
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LZMA.decompress(stream, stream, interleavedOut as any, outSize);
}

function ctmRestoreIndices(indices: Uint32Array, len: number) {
  let i = 3;
  if (len > 0) {
    indices[2] += indices[0];
    indices[1] += indices[0];
  }
  for (; i < len; i += 3) {
    indices[i] += indices[i - 3];
    if (indices[i] === indices[i - 3]) indices[i + 1] += indices[i - 2];
    else indices[i + 1] += indices[i];
    indices[i + 2] += indices[i];
  }
}

function ctmRestoreGridIndices(gridIndices: Uint32Array, len: number) {
  for (let i = 1; i < len; i++) gridIndices[i] += gridIndices[i - 1];
}

function ctmRestoreVertices(vertices: Float32Array, grid: MG2Header, gridIndices: Uint32Array, precision: number) {
  const intVertices = new Uint32Array(vertices.buffer, vertices.byteOffset, vertices.length);
  const ydiv = grid.divx,
    zdiv = ydiv * grid.divy;
  let prevGridIdx = 0x7fffffff,
    prevDelta = 0;
  let i = 0,
    j = 0;
  const len = gridIndices.length;
  for (; i < len; j += 3) {
    let x = gridIndices[i++];
    const gridIdx = x;
    const z = ~~(x / zdiv);
    x -= ~~(z * zdiv);
    const y = ~~(x / ydiv);
    x -= ~~(y * ydiv);
    let delta = intVertices[j];
    if (gridIdx === prevGridIdx) delta += prevDelta;
    vertices[j] = grid.lowerBoundx + x * grid.sizex + precision * delta;
    vertices[j + 1] = grid.lowerBoundy + y * grid.sizey + precision * intVertices[j + 1];
    vertices[j + 2] = grid.lowerBoundz + z * grid.sizez + precision * intVertices[j + 2];
    prevGridIdx = gridIdx;
    prevDelta = delta;
  }
}

function ctmCalcSmoothNormals(indices: Uint32Array, vertices: Float32Array) {
  const smooth = new Float32Array(vertices.length);
  for (let i = 0, k = indices.length; i < k; ) {
    const indx = indices[i++] * 3,
      indy = indices[i++] * 3,
      indz = indices[i++] * 3;
    const v1x = vertices[indy] - vertices[indx];
    const v2x = vertices[indz] - vertices[indx];
    const v1y = vertices[indy + 1] - vertices[indx + 1];
    const v2y = vertices[indz + 1] - vertices[indx + 1];
    const v1z = vertices[indy + 2] - vertices[indx + 2];
    const v2z = vertices[indz + 2] - vertices[indx + 2];
    const nx = v1y * v2z - v1z * v2y;
    const ny = v1z * v2x - v1x * v2z;
    const nz = v1x * v2y - v1y * v2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const nx2 = len > 1e-10 ? nx / len : nx;
    const ny2 = len > 1e-10 ? ny / len : ny;
    const nz2 = len > 1e-10 ? nz / len : nz;
    smooth[indx] += nx2;
    smooth[indx + 1] += ny2;
    smooth[indx + 2] += nz2;
    smooth[indy] += nx2;
    smooth[indy + 1] += ny2;
    smooth[indy + 2] += nz2;
    smooth[indz] += nx2;
    smooth[indz + 1] += ny2;
    smooth[indz + 2] += nz2;
  }
  for (let i = 0, k = smooth.length; i < k; i += 3) {
    const len = Math.sqrt(smooth[i] ** 2 + smooth[i + 1] ** 2 + smooth[i + 2] ** 2);
    if (len > 1e-10) {
      smooth[i] /= len;
      smooth[i + 1] /= len;
      smooth[i + 2] /= len;
    }
  }
  return smooth;
}

function ctmRestoreNormals(normals: Float32Array, smooth: Float32Array, precision: number) {
  const intNormals = new Uint32Array(normals.buffer, normals.byteOffset, normals.length);
  const PI_DIV_2 = Math.PI * 0.5;
  for (let i = 0, k = normals.length; i < k; i += 3) {
    const ro = intNormals[i] * precision;
    const phi = intNormals[i + 1];
    if (phi === 0) {
      normals[i] = smooth[i] * ro;
      normals[i + 1] = smooth[i + 1] * ro;
      normals[i + 2] = smooth[i + 2] * ro;
    } else {
      const theta = phi <= 4 ? (intNormals[i + 2] - 2) * PI_DIV_2 : ((intNormals[i + 2] * 4) / phi - 2) * PI_DIV_2;
      const phiRad = phi * precision * PI_DIV_2;
      const sinPhi = ro * Math.sin(phiRad);
      const nx = sinPhi * Math.cos(theta),
        ny = sinPhi * Math.sin(theta),
        nz = ro * Math.cos(phiRad);
      const bz = smooth[i + 1],
        byVal = smooth[i] - smooth[i + 2];
      const len = Math.sqrt(2 * bz * bz + byVal * byVal);
      const by = len > 1e-20 ? byVal / len : byVal;
      const bz2 = len > 1e-20 ? bz / len : bz;
      normals[i] = smooth[i] * nz + (smooth[i + 1] * bz2 - smooth[i + 2] * by) * ny - bz2 * nx;
      normals[i + 1] = smooth[i + 1] * nz - (smooth[i + 2] + smooth[i]) * bz2 * ny + by * nx;
      normals[i + 2] = smooth[i + 2] * nz + (smooth[i] * by + smooth[i + 1] * bz2) * ny + bz2 * nx;
    }
  }
}

function ctmRestoreMap(map: Float32Array, count: number, precision: number) {
  const intMap = new Uint32Array(map.buffer, map.byteOffset, map.length);
  for (let i = 0; i < count; i++) {
    let delta = 0;
    for (let j = i; j < map.length; j += count) {
      const value = intMap[j];
      delta += value & 1 ? -((value + 1) >> 1) : value >> 1;
      map[j] = delta * precision;
    }
  }
}

function parseCTM(data: Uint8Array): CTMBody {
  const stream = new CTMStream(data);

  // Header
  stream.readInt32(); // "OCTM" magic
  const fileFormat = stream.readInt32();
  if (fileFormat !== 5) throw new Error(`Unsupported CTM version: ${fileFormat}`);

  const compressionMethod = stream.readInt32();
  const vertexCount = stream.readInt32();
  const triangleCount = stream.readInt32();
  const uvMapCount = stream.readInt32();
  const attrMapCount = stream.readInt32();
  const flags = stream.readInt32();
  stream.readString(); // comment

  const hasNormals = !!(flags & CTM_FLAG_NORMALS);

  // Allocate body
  const triLen = triangleCount * 3,
    vertLen = vertexCount * 3,
    normLen = hasNormals ? vertexCount * 3 : 0,
    uvLen = vertexCount * 2,
    attrLen = vertexCount * 4;
  const totalWords = triLen + vertLen + normLen + uvLen * uvMapCount + attrLen * attrMapCount;
  const buf = new ArrayBuffer(totalWords * 4);

  const body: CTMBody = {
    indices: new Uint32Array(buf, 0, triLen),
    vertices: new Float32Array(buf, triLen * 4, vertLen),
  };
  if (hasNormals) body.normals = new Float32Array(buf, (triLen + vertLen) * 4, normLen);
  if (uvMapCount) {
    body.uvMaps = [];
    for (let j = 0; j < uvMapCount; j++)
      body.uvMaps.push({ name: '', filename: '', uv: new Float32Array(buf, (triLen + vertLen + normLen + j * uvLen) * 4, uvLen) });
  }
  if (attrMapCount) {
    body.attrMaps = [];
    for (let j = 0; j < attrMapCount; j++)
      body.attrMaps.push({
        name: '',
        attr: new Float32Array(buf, (triLen + vertLen + normLen + uvLen * uvMapCount + j * attrLen) * 4, attrLen),
      });
  }

  if (compressionMethod === CTM_COMPRESSION_RAW) {
    readRAW(stream, body);
  } else if (compressionMethod === CTM_COMPRESSION_MG1) {
    readMG1(stream, body);
  } else if (compressionMethod === CTM_COMPRESSION_MG2) {
    readMG2(stream, body, vertexCount);
  } else {
    throw new Error('Unknown CTM compression method');
  }

  return body;
}

function readRAW(stream: CTMStream, body: CTMBody) {
  stream.readInt32();
  stream.readArrayInt32(body.indices);
  stream.readInt32();
  stream.readArrayFloat32(body.vertices);
  if (body.normals) {
    stream.readInt32();
    stream.readArrayFloat32(body.normals);
  }
  if (body.uvMaps)
    for (const uv of body.uvMaps) {
      stream.readInt32();
      uv.name = stream.readString();
      uv.filename = stream.readString();
      stream.readArrayFloat32(uv.uv);
    }
  if (body.attrMaps)
    for (const attr of body.attrMaps) {
      stream.readInt32();
      attr.name = stream.readString();
      stream.readArrayFloat32(attr.attr);
    }
}

function lzmaBlock(stream: CTMStream, arr: Float32Array | Uint32Array, stride: number) {
  stream.readInt32(); // packed size (ignored â€” stream is sequential)
  const out = new CTMInterleavedStream(arr, stride);
  lzmaDecompress(stream, out, arr.byteLength);
}

function readMG1(stream: CTMStream, body: CTMBody) {
  stream.readInt32();
  lzmaBlock(stream, body.indices, 3);
  ctmRestoreIndices(body.indices, body.indices.length);
  stream.readInt32();
  lzmaBlock(stream, body.vertices, 1);
  if (body.normals) {
    stream.readInt32();
    lzmaBlock(stream, body.normals, 3);
  }
  if (body.uvMaps)
    for (const uv of body.uvMaps) {
      stream.readInt32();
      uv.name = stream.readString();
      uv.filename = stream.readString();
      lzmaBlock(stream, uv.uv, 2);
    }
  if (body.attrMaps)
    for (const attr of body.attrMaps) {
      stream.readInt32();
      attr.name = stream.readString();
      lzmaBlock(stream, attr.attr, 4);
    }
}

function readMG2(stream: CTMStream, body: CTMBody, vertexCount: number) {
  // MG2 header
  stream.readInt32(); // "MG2H"
  const mg2: MG2Header = {
    vertexPrecision: stream.readFloat32(),
    normalPrecision: stream.readFloat32(),
    lowerBoundx: stream.readFloat32(),
    lowerBoundy: stream.readFloat32(),
    lowerBoundz: stream.readFloat32(),
    higherBoundx: stream.readFloat32(),
    higherBoundy: stream.readFloat32(),
    higherBoundz: stream.readFloat32(),
    divx: stream.readInt32(),
    divy: stream.readInt32(),
    divz: stream.readInt32(),
    sizex: 0,
    sizey: 0,
    sizez: 0,
  };
  mg2.sizex = (mg2.higherBoundx - mg2.lowerBoundx) / mg2.divx;
  mg2.sizey = (mg2.higherBoundy - mg2.lowerBoundy) / mg2.divy;
  mg2.sizez = (mg2.higherBoundz - mg2.lowerBoundz) / mg2.divz;

  // Vertices
  stream.readInt32();
  lzmaBlock(stream, body.vertices, 3);
  // Grid indices
  stream.readInt32();
  const gridIndices = new Uint32Array(vertexCount);
  lzmaBlock(stream, gridIndices, 1);
  ctmRestoreGridIndices(gridIndices, gridIndices.length);
  ctmRestoreVertices(body.vertices, mg2, gridIndices, mg2.vertexPrecision);

  // Indices
  stream.readInt32();
  lzmaBlock(stream, body.indices, 3);
  ctmRestoreIndices(body.indices, body.indices.length);

  // Normals
  if (body.normals) {
    stream.readInt32();
    lzmaBlock(stream, body.normals, 3);
    const smooth = ctmCalcSmoothNormals(body.indices, body.vertices);
    ctmRestoreNormals(body.normals, smooth, mg2.normalPrecision);
  }

  // UV maps
  if (body.uvMaps) {
    for (const uv of body.uvMaps) {
      stream.readInt32();
      uv.name = stream.readString();
      uv.filename = stream.readString();
      const precision = stream.readFloat32();
      lzmaBlock(stream, uv.uv, 2);
      ctmRestoreMap(uv.uv, 2, precision);
    }
  }

  // Attr maps
  if (body.attrMaps) {
    for (const attr of body.attrMaps) {
      stream.readInt32();
      attr.name = stream.readString();
      const precision = stream.readFloat32();
      lzmaBlock(stream, attr.attr, 4);
      ctmRestoreMap(attr.attr, 4, precision);
    }
  }
}

// â”€â”€â”€ Three.js Loader wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class CTMLoader extends THREE.Loader {
  load(
    url: string,
    onLoad: (geometry: THREE.BufferGeometry) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ) {
    const loader = new THREE.FileLoader(this.manager);
    loader.setResponseType('arraybuffer');
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(
      url,
      (buffer) => {
        try {
          onLoad(this.parse(buffer as ArrayBuffer));
        } catch (e) {
          if (onError) onError(e);
          else console.error(e);
          this.manager.itemError(url);
        }
      },
      onProgress,
      onError,
    );
  }

  parse(buffer: ArrayBuffer): THREE.BufferGeometry {
    const body = parseCTM(new Uint8Array(buffer));

    const geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(body.indices, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(body.vertices, 3));
    if (body.normals) geo.setAttribute('normal', new THREE.BufferAttribute(body.normals, 3));
    if (body.uvMaps?.length) geo.setAttribute('uv', new THREE.BufferAttribute(body.uvMaps[0].uv, 2));

    if (!body.normals) geo.computeVertexNormals();

    // Centre la gÃ©omÃ©trie
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    return geo;
  }
}
