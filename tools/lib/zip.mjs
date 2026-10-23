// Minimal deterministic ZIP writer/reader (deflate, no ZIP64), enough for plugin packages.

import zlib from "node:zlib";

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

export function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

// Fixed timestamp keeps archives reproducible: 2026-01-01 00:00:00.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const VERSION_MADE_BY = (3 << 8) | 20; // Unix, spec 2.0
const UNIX_FILE_MODE = (0o100644 << 16) >>> 0;

export function createZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, data] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const nameBytes = Buffer.from(name, "utf8");
        const compressed = zlib.deflateRawSync(data, { level: 9 });
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        locals.push(local, nameBytes, compressed);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(VERSION_MADE_BY, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(UNIX_FILE_MODE, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length + compressed.length;
    }
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(centrals.length / 2, 8);
    end.writeUInt16LE(centrals.length / 2, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
}

// Reads archives produced by createZip (and other simple deflate/store ZIPs).
export function readZip(buffer) {
    const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (endOffset < 0) throw new Error("not a ZIP archive");
    const count = buffer.readUInt16LE(endOffset + 10);
    let cursor = buffer.readUInt32LE(endOffset + 16);
    const files = new Map();
    for (let index = 0; index < count; index += 1) {
        if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("corrupt central directory");
        const method = buffer.readUInt16LE(cursor + 10);
        const crc = buffer.readUInt32LE(cursor + 16);
        const size = buffer.readUInt32LE(cursor + 20);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const localOffset = buffer.readUInt32LE(cursor + 42);
        const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
        const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
        const raw = buffer.subarray(dataStart, dataStart + size);
        const data = method === 8 ? zlib.inflateRawSync(raw) : method === 0 ? raw : null;
        if (!data) throw new Error("unsupported compression method for " + name);
        if (crc32(data) !== crc) throw new Error("CRC mismatch for " + name);
        files.set(name, data);
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return files;
}
