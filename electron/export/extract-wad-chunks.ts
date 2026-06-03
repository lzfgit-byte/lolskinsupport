/**
 * Extract multiple chunks from WAD.client file based on file paths.
 *
 * Two methods available:
 * 1. extractWadChunks: Uses hashes.game.txt for file path to hash mapping
 * 2. extractWadByHash: Direct hash extraction (no hashes.game.txt needed)
 *
 * Usage Example 1 - With hashes.game.txt:
 *   import { extractWadChunks } from './extract-wad-chunks.ts'
 *   const result = await extractWadChunks({
 *     wadPath: 'Champion.wad.client',
 *     hashesPath: 'hashes.game.txt',
 *     files: ['data/characters/aatrox/skins/skin0.bin'],
 *     outputDir: './extracted'
 *   })
 *
 * Usage Example 2 - Direct hash extraction:
 *   import { extractWadByHash } from './extract-wad-chunks.ts'
 *   const result = await extractWadByHash({
 *     wadPath: 'Champion.wad.client',
 *     files: [
 *       { hash: '54b27815ab6ee84a', filePath: 'data/characters/aatrox/skins/skin0.bin' },
 *       { hash: '9302b5ae60fcc1c0', filePath: 'data/characters/aatrox/skins/skin1.bin' }
 *     ],
 *     outputDir: './extracted'
 *   })
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { LogMsgUtil } from '../utils/message';

// Optional dependency - gracefully handle if not installed
let fzstd: any;

try {
  fzstd = require('fzstd');
} catch (e) {
  // Will handle Zstd decompression error when needed
}

// ============================================================================
// WAD Format Constants
// ============================================================================

enum WADCompressionType {
  Raw = 0,
  Gzip = 1,
  Satellite = 2,
  Zstd = 3,
  ZstdChunked = 4,
}

interface WADChunk {
  id: number;
  hash: string;
  offset: number;
  compressedSize: number;
  decompressedSize: number;
  compressionType: WADCompressionType;
  duplicated: boolean;
  subchunkStart: number;
  subchunkCount: number;
  checksum: bigint;
}

interface WADHeader {
  signature: string;
  versionMajor: number;
  versionMinor: number;
  checksum: bigint;
  chunkCount: number;
}

// ============================================================================
// WAD Parser
// ============================================================================

class WADParser {
  private buffer: Buffer;
  private position = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  private readBytes(length: number): Buffer {
    const bytes = this.buffer.subarray(this.position, this.position + length);
    this.position += length;
    return bytes;
  }

  private readString(length: number): string {
    return this.readBytes(length).toString('ascii');
  }

  private readUInt8(): number {
    const value = this.buffer.readUInt8(this.position);
    this.position += 1;
    return value;
  }

  private readUInt16LE(): number {
    const value = this.buffer.readUInt16LE(this.position);
    this.position += 2;
    return value;
  }

  private readUInt32LE(): number {
    const value = this.buffer.readUInt32LE(this.position);
    this.position += 4;
    return value;
  }

  private readUInt64LE(): bigint {
    const value = this.buffer.readBigUInt64LE(this.position);
    this.position += 8;
    return value;
  }

  parseHeader(): WADHeader {
    this.position = 0;

    const signature = this.readString(2);
    if (signature !== 'RW') {
      throw new Error('Invalid WAD signature');
    }

    const versionMajor = this.readUInt8();
    const versionMinor = this.readUInt8();

    const paddingSize = versionMajor >= 3 ? 256 : 83;
    this.position += paddingSize;

    // @ts-ignore
    let checksum = 0n;
    if (versionMajor >= 2) {
      checksum = this.readUInt64LE();
    }

    const chunkCount = this.readUInt32LE();

    return {
      signature,
      versionMajor,
      versionMinor,
      checksum,
      chunkCount,
    };
  }

  parseChunks(header: WADHeader): WADChunk[] {
    const chunks: WADChunk[] = [];

    for (let i = 0; i < header.chunkCount; i++) {
      const hash = this.readUInt64LE().toString(16).padStart(16, '0');
      const offset = this.readUInt32LE();
      const compressedSize = this.readUInt32LE();
      const decompressedSize = this.readUInt32LE();

      const compressionTypeByte = this.readUInt8();
      const compressionType = compressionTypeByte & 0x0f;
      const subchunkCount = compressionTypeByte >> 4;

      const duplicated = this.readUInt8() !== 0;
      const subchunkStart = this.readUInt16LE();

      // @ts-ignore
      let checksum = 0n;
      if (header.versionMajor >= 2) {
        checksum = this.readUInt64LE();
      }

      chunks.push({
        id: i,
        hash,
        offset,
        compressedSize,
        decompressedSize,
        compressionType,
        duplicated,
        subchunkStart,
        subchunkCount,
        checksum,
      });
    }

    return chunks;
  }

  extractChunk(chunk: WADChunk): Buffer {
    const rawData = this.buffer.subarray(chunk.offset, chunk.offset + chunk.compressedSize);
    return this.decompressChunk(rawData, chunk.compressionType);
  }

  private decompressChunk(data: Buffer, compressionType: WADCompressionType): Buffer {
    switch (compressionType) {
      case WADCompressionType.Raw:
        return data;

      case WADCompressionType.Gzip:
        return zlib.gunzipSync(data);

      case WADCompressionType.Zstd:
      case WADCompressionType.ZstdChunked:
        if (fzstd) {
          try {
            const decompressed = fzstd.decompress(new Uint8Array(data));
            return Buffer.from(decompressed);
          } catch (error) {
            console.warn('Zstd decompression failed:', error);
            return data;
          }
        } else {
          throw new Error(
            'Zstd compression requires fzstd library. Install with: npm install fzstd'
          );
        }

      case WADCompressionType.Satellite:
        throw new Error('Satellite compression is not supported');

      default:
        throw new Error(`Unknown compression type: ${compressionType}`);
    }
  }
}

// ============================================================================
// Hash Lookup from File
// ============================================================================

/**
 * Parse hashes.game.txt file
 * Format: <hash> <file_path>
 * Returns a Map<hash, file_path>
 */
function parseHashesFile(filePath: string): Map<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

  const hashMap = new Map<string, string>();

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const hash = parts[0].toLowerCase().padStart(16, '0');
      const filePath = parts.slice(1).join(' ');
      hashMap.set(hash, filePath);
    }
  }

  return hashMap;
}

/**
 * Reverse map: file_path -> hash
 */
function createFilePathToHashMap(hashMap: any): Map<string, string> {
  const pathToHash = new Map<string, string>();
  for (const [hash, filePath] of hashMap) {
    pathToHash.set(filePath.toLowerCase(), hash);
  }
  return pathToHash;
}

// ============================================================================
// Main Export Function
// ============================================================================

interface ExtractOptions {
  wadPath: string;
  hashesPath: string;
  files: string[];
  outputDir: string;
}

interface ExtractResult {
  success: boolean;
  files: {
    path: string;
    hash: string;
    outputPath?: string;
    error?: string;
    size?: number;
    [x: string]: any;
  }[];
  [x: string]: any;
}

interface FileHashPair {
  hash: string;
  filePath: string;
}

interface ExtractByHashOptions {
  wadPath: string;
  files: FileHashPair[];
  outputDir: string;
}

interface ExtractByHashResult {
  success: boolean;
  files: {
    filePath: string;
    hash: string;
    outputPath?: string;
    error?: string;
    size?: number;
  }[];
}

interface ExtractSkinBinsOptions {
  wadPath: string;
  hashesPath: string;
  outputDir: string;
  logFlag?: boolean;
}

interface ExtractSkinBinsResult {
  success: boolean;
  matched: number;
  files: {
    filePath: string;
    hash: string;
    outputPath?: string;
    error?: string;
    size?: number;
  }[];
}

/**
 * Extract multiple files from WAD.client based on file paths
 *
 * @param options - Configuration object
 * @returns Result object with status for each file
 */
async function extractWadChunks(options: ExtractOptions): Promise<ExtractResult> {
  const { wadPath, hashesPath, files, outputDir } = options;
  const results: ExtractResult = {
    success: true,
    files: [],
  };

  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Parse hashes file
    console.log(`📖 Reading hashes file: ${hashesPath}`);
    const hashMap = parseHashesFile(hashesPath);
    const pathToHashMap = createFilePathToHashMap(hashMap);
    console.log(`   Loaded ${hashMap.size} hashes`);

    // Read WAD file
    console.log(`📦 Reading WAD file: ${wadPath}`);
    const wadBuffer = fs.readFileSync(wadPath);
    const wadParser = new WADParser(wadBuffer);

    // Parse WAD header
    console.log(`🔍 Parsing WAD header...`);
    const header = wadParser.parseHeader();
    console.log(`   Format: v${header.versionMajor}.${header.versionMinor}`);
    console.log(`   Chunks: ${header.chunkCount}`);

    // Parse chunks
    console.log(`🔍 Parsing ${header.chunkCount} chunks...`);
    const chunks = wadParser.parseChunks(header);
    const chunksByHash = new Map<string, WADChunk>();
    for (const chunk of chunks) {
      chunksByHash.set(chunk.hash, chunk);
    }

    // Process each file
    console.log(`\n📂 Processing ${files.length} file(s)...\n`);

    for (const filePath of files) {
      const filePathLower = filePath.toLowerCase();
      const result: any = {
        path: filePath,
        hash: '',
      };

      try {
        // Find hash from lookup file
        const hash = pathToHashMap.get(filePathLower);

        if (!hash) {
          throw new Error(`File path not found in hashes.game.txt: ${filePath}`);
        }

        result.hash = hash;

        // Find chunk by hash
        const chunk = chunksByHash.get(hash);
        if (!chunk) {
          throw new Error(`Chunk not found with hash: ${hash}`);
        }

        // Extract chunk
        console.log(`   ✓ Found chunk (${formatSize(chunk.decompressedSize)})`);
        const chunkData = wadParser.extractChunk(chunk);

        // Determine output path
        const fileName = path.basename(filePath);
        const outputPath = path.join(outputDir, fileName);

        // Create output subdirectory if needed
        const outputFileDir = path.dirname(outputPath);
        if (!fs.existsSync(outputFileDir)) {
          fs.mkdirSync(outputFileDir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(outputPath, chunkData);
        console.log(`   📝 Saved to: ${outputPath}\n`);

        result.outputPath = outputPath;
        result.size = chunkData.length;
        results.files.push(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Failed: ${errorMsg}\n`);
        result.error = errorMsg;
        results.files.push(result);
        results.success = false;
      }
    }

    // Summary
    const succeeded = results.files.filter((f) => !f.error).length;
    console.log(`\n📊 Summary: ${succeeded}/${files.length} files extracted successfully`);

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Fatal error: ${errorMsg}`);
    results.success = false;
    return results;
  }
}

/**
 * Extract multiple files from WAD.client by providing hash values directly
 *
 * @param options - Configuration object with hash values
 * @returns Result object with status for each file
 */
async function extractWadByHash(options: ExtractByHashOptions): Promise<ExtractByHashResult> {
  const { wadPath, files, outputDir } = options;
  const results: ExtractByHashResult = {
    success: true,
    files: [],
  };

  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Read WAD file
    console.log(`📦 Reading WAD file: ${wadPath}`);
    const wadBuffer = fs.readFileSync(wadPath);
    const wadParser = new WADParser(wadBuffer);

    // Parse WAD header
    console.log(`🔍 Parsing WAD header...`);
    const header = wadParser.parseHeader();
    console.log(`   Format: v${header.versionMajor}.${header.versionMinor}`);
    console.log(`   Chunks: ${header.chunkCount}`);

    // Parse chunks
    console.log(`🔍 Parsing ${header.chunkCount} chunks...`);
    const chunks = wadParser.parseChunks(header);
    const chunksByHash = new Map<string, WADChunk>();
    for (const chunk of chunks) {
      chunksByHash.set(chunk.hash, chunk);
    }

    // Process each file
    console.log(`\n📂 Processing ${files.length} file(s)...\n`);

    for (const fileInfo of files) {
      const result: Record<string, any> = {
        filePath: fileInfo.filePath,
        hash: fileInfo.hash.toLowerCase().padStart(16, '0'),
      };

      try {
        // Find chunk by hash
        const chunk = chunksByHash.get(result.hash);
        if (!chunk) {
          throw new Error(`Chunk not found with hash: ${result.hash}`);
        }

        // Extract chunk
        console.log(`   ✓ Found chunk (${formatSize(chunk.decompressedSize)})`);
        const chunkData = wadParser.extractChunk(chunk);

        // Determine output path
        const fileName = path.basename(fileInfo.filePath);
        const outputPath = path.join(outputDir, fileName);

        // Create output subdirectory if needed
        const outputFileDir = path.dirname(outputPath);
        if (!fs.existsSync(outputFileDir)) {
          fs.mkdirSync(outputFileDir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(outputPath, chunkData);
        console.log(`   📝 Saved to: ${outputPath}\n`);

        result.outputPath = outputPath;
        result.size = chunkData.length;
        // @ts-ignore
        results.files.push(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Failed: ${errorMsg}\n`);
        result.error = errorMsg;
        // @ts-ignore
        results.files.push(result);
        results.success = false;
      }
    }

    // Summary
    const succeeded = results.files.filter((f) => !f.error).length;
    console.log(`\n📊 Summary: ${succeeded}/${files.length} files extracted successfully`);

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Fatal error: ${errorMsg}`);
    results.success = false;
    return results;
  }
}

/**
 * Extract all skin<number>.bin files under data/characters/<character>/skins from WAD.client.
 * Files are written to outputDir with their original relative paths preserved.
 *
 * @param options - WAD path, hashes.game.txt path and output directory
 * @returns Result object with status for each matched skin<number>.bin file
 */
async function extractWadSkinBins(options: ExtractSkinBinsOptions): Promise<ExtractSkinBinsResult> {
  const { wadPath, hashesPath, outputDir, logFlag = false } = options;
  const results: ExtractSkinBinsResult = {
    success: true,
    matched: 0,
    files: [],
  };
  const logData = (str: string) => {
    if (logFlag) {
      LogMsgUtil.sendLogMsg(str);
    }
  };

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const hashMap = parseHashesFile(hashesPath);
    const skinBinFiles: FileHashPair[] = [];

    hashMap.forEach((filePath, hash) => {
      const normalizedFilePath = filePath.replace(/\\/g, '/').toLowerCase();
      if (/^data\/characters\/[^/]+\/skins\/skin\d+\.bin$/.test(normalizedFilePath)) {
        skinBinFiles.push({
          hash,
          filePath: normalizedFilePath,
        });
      }
    });

    results.matched = skinBinFiles.length;
    logData(`   Matched ${skinBinFiles.length} skin<number>.bin file(s)`);

    logData(`Reading WAD file: ${wadPath}`);
    const wadBuffer = fs.readFileSync(wadPath);
    const wadParser = new WADParser(wadBuffer);

    logData(`Parsing WAD header...`);
    const header = wadParser.parseHeader();
    logData(`   Format: v${header.versionMajor}.${header.versionMinor}`);
    logData(`   Chunks: ${header.chunkCount}`);

    logData(`Parsing ${header.chunkCount} chunks...`);
    const chunks = wadParser.parseChunks(header);
    const chunksByHash = new Map<string, WADChunk>();
    for (const chunk of chunks) {
      chunksByHash.set(chunk.hash, chunk);
    }

    logData(`\nProcessing ${skinBinFiles.length} skin<number>.bin file(s)...\n`);

    for (const fileInfo of skinBinFiles) {
      const result: ExtractSkinBinsResult['files'][number] = {
        filePath: fileInfo.filePath,
        hash: fileInfo.hash,
      };

      const chunk = chunksByHash.get(fileInfo.hash);
      if (!chunk) {
        continue;
      }

      logData(`   Found ${fileInfo.filePath} (${formatSize(chunk.decompressedSize)})`);
      const chunkData = wadParser.extractChunk(chunk);
      const outputPath = path.join(outputDir, ...fileInfo.filePath.split('/'));
      const outputFileDir = path.dirname(outputPath);

      if (!fs.existsSync(outputFileDir)) {
        fs.mkdirSync(outputFileDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, chunkData);

      result.outputPath = outputPath;
      result.size = chunkData.length;
      results.files.push(result);
    }

    const succeeded = results.files.filter((f) => !f.error).length;
    logData(
      `\nSummary: ${succeeded}/${skinBinFiles.length} skin<number>.bin files extracted successfully`
    );

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logData(`Fatal error: ${errorMsg}`);
    results.success = false;
    return results;
  }
}

const extractWadSkin0Bins = extractWadSkinBins;

// ============================================================================
// Utilities
// ============================================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// Export for use as module
export { extractWadChunks, extractWadByHash, extractWadSkin0Bins, extractWadSkinBins };
