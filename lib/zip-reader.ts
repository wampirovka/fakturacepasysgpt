import { Buffer } from "node:buffer";

export function readZip(buffer: Buffer): Record<string, string> {
  const files: Record<string, string> = {};
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      const method = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
      const dataStart = nameStart + nameLength + extraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);

      if (method !== 0) {
        throw new Error("Export používá nepodporovanou kompresi.");
      }

      files[name] = data.toString("utf8");
      offset = dataStart + compressedSize;
      continue;
    }

    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    throw new Error("Neplatný ZIP export.");
  }

  return files;
}
