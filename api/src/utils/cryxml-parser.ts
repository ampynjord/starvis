/**
 * CryXML Binary Format Parser
 * 
 * Parses CryXmlB binary files used by CryEngine / Star Citizen.
 * Based on the reference C# implementation from dolkensp/unp4k:
 *   src/unforge/CryXmlB/CryXmlSerializer.cs
 *   src/unforge/CryXmlB/CryXmlNode.cs
 *   src/unforge/CryXmlB/CryXmlReference.cs
 *   src/unforge/CryXmlB/CryXmlValue.cs
 *
 * ## CryXML Binary Format Specification
 *
 * ### Magic Header
 *   Bytes 0..6: "CryXmlB" (or "CryXml\0" or "CRY3SDK")
 *   Followed by null-terminator bytes (consumed via ReadCString)
 *   headerLength = stream position after consuming the magic + trailing bytes
 *
 * ### Byte Order Detection
 *   Read first Int32 after header as Big-Endian → fileLength.
 *   If fileLength ≠ buffer.length → re-read as Little-Endian.
 *   All subsequent integers use the detected byte order.
 *
 * ### Header Fields (9 × Int32, starting at headerLength)
 *   +0x00  fileLength           Total file size
 *   +0x04  nodeTableOffset      Absolute offset to node table
 *   +0x08  nodeTableCount       Number of nodes
 *   +0x0C  attributeTableOffset Absolute offset to attribute table
 *   +0x10  attributeTableCount  Number of attributes (references)
 *   +0x14  childTableOffset     Absolute offset to child/order table
 *   +0x18  childTableCount      Number of child entries
 *   +0x1C  stringTableOffset    Absolute offset to string data
 *   +0x20  stringTableCount     Length of string data in bytes
 *
 * ### Node Table (28 bytes per entry)
 *   +0x00  NodeNameOffset      Int32  → string table offset for tag name
 *   +0x04  ContentOffset       Int32  → string table offset for text content
 *   +0x08  AttributeCount      Int16  → number of attributes on this node
 *   +0x0A  ChildCount          Int16  → number of child nodes
 *   +0x0C  ParentNodeID        Int32  → index of parent node (-1 for root)
 *   +0x10  FirstAttributeIndex Int32  → index into attribute table
 *   +0x14  FirstChildIndex     Int32  → index into child table
 *   +0x18  Reserved            Int32  → unused
 *
 * ### Attribute Table (8 bytes per entry)
 *   +0x00  NameOffset   Int32  → string table offset for attribute name
 *   +0x04  ValueOffset  Int32  → string table offset for attribute value
 *
 * ### Child Table (4 bytes per entry)
 *   +0x00  NodeID  Int32  → ID of the child node
 *
 * ### String Table
 *   Starts at stringTableOffset, extends to end of file.
 *   Contains consecutive null-terminated UTF-8 strings.
 *   Referenced by offset relative to stringTableOffset.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CryXmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: CryXmlNode[];
  content?: string;
}

interface RawNode {
  nodeID: number;
  nodeNameOffset: number;
  contentOffset: number;
  attributeCount: number;
  childCount: number;
  parentNodeID: number;
  firstAttributeIndex: number;
  firstChildIndex: number;
  reserved: number;
}

interface RawAttribute {
  nameOffset: number;
  valueOffset: number;
}

// ---------------------------------------------------------------------------
// Low-level binary helpers
// ---------------------------------------------------------------------------

type ByteOrder = 'BE' | 'LE';

function readInt32(buf: Buffer, offset: number, order: ByteOrder): number {
  return order === 'BE' ? buf.readInt32BE(offset) : buf.readInt32LE(offset);
}

function readUInt32(buf: Buffer, offset: number, order: ByteOrder): number {
  return order === 'BE' ? buf.readUInt32BE(offset) : buf.readUInt32LE(offset);
}

function readInt16(buf: Buffer, offset: number, order: ByteOrder): number {
  return order === 'BE' ? buf.readInt16BE(offset) : buf.readInt16LE(offset);
}

/** Read a null-terminated string starting at `offset`. Returns [string, bytesConsumed]. */
function readCString(buf: Buffer, offset: number): [string, number] {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) {
    end++;
  }
  const str = buf.toString('utf8', offset, end);
  // consume the null terminator if present
  return [str, end - offset + (end < buf.length ? 1 : 0)];
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

const MAGIC_CRYXMLB = 'CryXmlB';
const MAGIC_CRYXML = 'CryXml';
const MAGIC_CRY3SDK = 'CRY3SDK';

const NODE_SIZE = 28;
const ATTRIBUTE_SIZE = 8;
const CHILD_ENTRY_SIZE = 4;

/**
 * Detect if a buffer contains CryXML binary data.
 */
export function isCryXmlB(buf: Buffer): boolean {
  if (buf.length < 7) return false;
  const magic = buf.toString('ascii', 0, 7);
  return magic === MAGIC_CRYXMLB || magic.startsWith(MAGIC_CRYXML) || magic === MAGIC_CRY3SDK;
}

/**
 * Parse a CryXML binary buffer into a tree structure.
 * Returns null if the buffer is already plain XML (starts with '<').
 * Throws on invalid / unrecognized format.
 */
export function parseCryXml(buf: Buffer): CryXmlNode {
  if (buf.length === 0) {
    throw new Error('CryXML: empty buffer');
  }

  // Already plain XML?
  if (buf[0] === 0x3C /* '<' */) {
    return null as any;
  }

  if (buf[0] !== 0x43 /* 'C' */) {
    throw new Error('CryXML: unknown format (first byte is not "C")');
  }

  // -----------------------------------------------------------------------
  // 1. Read & validate magic header
  // -----------------------------------------------------------------------
  const magic7 = buf.toString('ascii', 0, 7);
  let headerLength: number;

  if (magic7 === MAGIC_CRYXMLB || magic7.startsWith(MAGIC_CRYXML)) {
    // "CryXmlB\0" or "CryXml\0\0" — consume until (and including) the null terminator
    let pos = 7;
    while (pos < buf.length && buf[pos] !== 0) pos++;
    if (pos < buf.length) pos++; // skip null terminator
    headerLength = pos;
  } else if (magic7 === MAGIC_CRY3SDK) {
    // CRY3SDK followed by 2 extra bytes
    headerLength = 7 + 2;
  } else {
    throw new Error(`CryXML: unknown magic "${magic7}"`);
  }

  // -----------------------------------------------------------------------
  // 2. Detect byte order (try Big-Endian first, like the C# reference)
  // -----------------------------------------------------------------------
  let order: ByteOrder = 'BE';
  let fileLength = readInt32(buf, headerLength, order);

  if (fileLength !== buf.length) {
    order = 'LE';
    fileLength = readInt32(buf, headerLength, order);
  }

  // -----------------------------------------------------------------------
  // 3. Read header table (9 × Int32)
  // -----------------------------------------------------------------------
  let off = headerLength;
  /*fileLength       */ off += 4;
  const nodeTableOffset = readInt32(buf, off, order); off += 4;
  const nodeTableCount = readInt32(buf, off, order); off += 4;
  const attrTableOffset = readInt32(buf, off, order); off += 4;
  const attrTableCount = readInt32(buf, off, order); off += 4;
  const childTableOffset = readInt32(buf, off, order); off += 4;
  const childTableCount = readInt32(buf, off, order); off += 4;
  const stringTableOffset = readInt32(buf, off, order); off += 4;
  const stringTableCount = readInt32(buf, off, order); off += 4;

  // -----------------------------------------------------------------------
  // 4. Build string dictionary (offset → string)
  //    Strings are null-terminated, referenced by offset relative to stringTableOffset.
  // -----------------------------------------------------------------------
  const stringMap = new Map<number, string>();
  {
    let pos = stringTableOffset;
    const end = Math.min(buf.length, stringTableOffset + stringTableCount);
    // Also read until actual end-of-buffer in case stringTableCount is inaccurate
    const realEnd = buf.length;
    const limit = Math.max(end, realEnd);

    while (pos < limit) {
      const relativeOffset = pos - stringTableOffset;
      const [str, consumed] = readCString(buf, pos);
      stringMap.set(relativeOffset, str);
      pos += consumed;
      if (consumed === 0) break; // safety
    }
  }

  const getString = (offset: number): string => {
    return stringMap.get(offset) ?? '';
  };

  // -----------------------------------------------------------------------
  // 5. Parse node table
  // -----------------------------------------------------------------------
  const nodes: RawNode[] = [];
  for (let i = 0; i < nodeTableCount; i++) {
    const base = nodeTableOffset + i * NODE_SIZE;
    nodes.push({
      nodeID: i,
      nodeNameOffset: readInt32(buf, base + 0, order),
      contentOffset: readInt32(buf, base + 4, order),
      attributeCount: readInt16(buf, base + 8, order),
      childCount: readInt16(buf, base + 10, order),
      parentNodeID: readInt32(buf, base + 12, order),
      firstAttributeIndex: readInt32(buf, base + 16, order),
      firstChildIndex: readInt32(buf, base + 20, order),
      reserved: readInt32(buf, base + 24, order),
    });
  }

  // -----------------------------------------------------------------------
  // 6. Parse attribute table
  // -----------------------------------------------------------------------
  const attributes: RawAttribute[] = [];
  for (let i = 0; i < attrTableCount; i++) {
    const base = attrTableOffset + i * ATTRIBUTE_SIZE;
    attributes.push({
      nameOffset: readInt32(buf, base + 0, order),
      valueOffset: readInt32(buf, base + 4, order),
    });
  }

  // -----------------------------------------------------------------------
  // 7. Parse child table (order table)
  //    Each entry is the node-ID of a child.  Not strictly needed for
  //    reconstruction since nodes carry ParentNodeID, but kept for
  //    completeness / future use.
  // -----------------------------------------------------------------------
  // const childEntries: number[] = [];
  // for (let i = 0; i < childTableCount; i++) {
  //   childEntries.push(readInt32(buf, childTableOffset + i * CHILD_ENTRY_SIZE, order));
  // }

  // -----------------------------------------------------------------------
  // 8. Reconstruct the XML tree
  //
  //    The reference C# implementation iterates nodes in order, uses a
  //    running attributeIndex, and links children via ParentNodeID.
  //    We replicate that exact logic here.
  // -----------------------------------------------------------------------
  const xmlNodes: CryXmlNode[] = [];
  const nodeMap = new Map<number, CryXmlNode>();

  let attributeIndex = 0;

  for (const raw of nodes) {
    const tag = getString(raw.nodeNameOffset);
    const attrs: Record<string, string> = {};

    // Read attributes using the running index (matches C# reference)
    for (let i = 0; i < raw.attributeCount; i++) {
      if (attributeIndex < attributes.length) {
        const ref = attributes[attributeIndex];
        const name = getString(ref.nameOffset);
        const value = getString(ref.valueOffset);
        attrs[name] = value;
        attributeIndex++;
      }
    }

    const node: CryXmlNode = {
      tag,
      attributes: attrs,
      children: [],
    };

    // Text content
    const content = getString(raw.contentOffset);
    if (content && content.trim().length > 0) {
      node.content = content;
    }

    nodeMap.set(raw.nodeID, node);
    xmlNodes.push(node);

    // Attach to parent
    if (nodeMap.has(raw.parentNodeID)) {
      nodeMap.get(raw.parentNodeID)!.children.push(node);
    }
  }

  // The root is the first node (or the node without a valid parent)
  if (xmlNodes.length === 0) {
    throw new Error('CryXML: no nodes found');
  }

  return xmlNodes[0];
}

/**
 * Convert a CryXmlNode tree back to an XML string.
 * Useful for debugging / verification.
 */
export function cryXmlToString(node: CryXmlNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const attrStr = Object.entries(node.attributes)
    .map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`)
    .join('');

  if (node.children.length === 0 && !node.content) {
    return `${pad}<${node.tag}${attrStr} />`;
  }

  const parts: string[] = [];
  parts.push(`${pad}<${node.tag}${attrStr}>`);

  if (node.content) {
    parts.push(`${pad}  ${escapeXmlText(node.content)}`);
  }

  for (const child of node.children) {
    parts.push(cryXmlToString(child, indent + 1));
  }

  parts.push(`${pad}</${node.tag}>`);
  return parts.join('\n');
}

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
