/**
 * Demo: How to use extract-wad-chunks.ts
 */

import { extractWadByHash, extractWadChunks, extractWadSkinBins } from './extract-wad-chunks';

// ============================================================================
// Demo 1: Extract using hashes.game.txt
// ============================================================================

async function demo1_withHashesFile() {
  console.log('=== Demo 1: Extract with hashes.game.txt ===\n');

  const result = await extractWadChunks({
    wadPath: 'path/to/Champion.wad.client',
    hashesPath: 'path/to/hashes.game.txt',
    files: [
      'data/characters/aatrox/skins/skin0.bin',
      'data/characters/aatrox/skins/skin1.bin',
      'data/characters/aatrox/animations/skin8.bin',
    ],
    outputDir: './extracted',
  });

  console.log('Result:', result);
  // {
  //   success: true,
  //   files: [
  //     {
  //       path: 'data/characters/aatrox/skins/skin0.bin',
  //       hash: '54b27815ab6ee84a',
  //       outputPath: './extracted/skin0.bin',
  //       size: 2048
  //     },
  //     ...
  //   ]
  // }
}

// ============================================================================
// Demo 2: Direct hash extraction (without hashes.game.txt)
// ============================================================================

export async function demo2_directHash() {
  console.log('\n=== Demo 2: Extract with direct hashes ===\n');

  const result = await extractWadByHash({
    wadPath: 'C:\\Users\\18074\\Downloads\\Heimerdinger.wad.client',
    files: [
      {
        hash: 'b474b7d95a12df1b',
        filePath: 'data/characters/heimerdinger/skins/skin1.bin',
      },
    ],
    outputDir: 'C:\\Users\\18074\\Downloads\\extra',
  });

  console.log('Result:', result);
  // {
  //   success: true,
  //   files: [
  //     {
  //       filePath: 'data/characters/aatrox/skins/skin0.bin',
  //       hash: '54b27815ab6ee84a',
  //       outputPath: './extracted/skin0.bin',
  //       size: 2048
  //     },
  //     ...
  //   ]
  // }
}

// ============================================================================
// Demo 3: Error handling
// ============================================================================

async function demo3_errorHandling() {
  console.log('\n=== Demo 3: Error handling ===\n');

  const result = await extractWadByHash({
    wadPath: 'path/to/Champion.wad.client',
    files: [
      {
        hash: 'ffffffffffffffff', // Non-existent hash
        filePath: 'data/nonexistent.bin',
      },
    ],
    outputDir: './extracted',
  });

  console.log('Result:', result);
  // {
  //   success: false,
  //   files: [
  //     {
  //       filePath: 'data/nonexistent.bin',
  //       hash: 'ffffffffffffffff',
  //       error: 'Chunk not found with hash: ffffffffffffffff'
  //     }
  //   ]
  // }

  // Check individual results
  for (const file of result.files) {
    if (file.error) {
      console.error(`Failed to extract ${file.filePath}: ${file.error}`);
    } else {
      console.log(`✓ Extracted ${file.filePath} to ${file.outputPath}`);
    }
  }
}

// ============================================================================
// Demo 4: Extract all data/characters/*/skins/skin<number>.bin files
// ============================================================================

export async function demo4_extractSkinBins() {
  console.log('\n=== Demo 4: Extract all skin<number>.bin files ===\n');

  const result = await extractWadSkinBins({
    wadPath: 'C:\\Users\\18074\\Downloads\\Heimerdinger.wad.client',
    hashesPath: 'C:\\Users\\18074\\AppData\\Local\\lol-skin-ll\\tools\\hashes.game.txt',
    outputDir: 'C:\\Users\\18074\\Downloads\\extra',
  });

  console.log('Result:', result);
  // Files are saved with original relative paths, for example:
  // ./extracted/data/characters/aatrox/skins/skin0.bin
  // ./extracted/data/characters/aatrox/skins/skin1.bin
}

export const demo4_extractSkin0Bins = demo4_extractSkinBins;

// ============================================================================
// Run demos
// ============================================================================

async function runAllDemos() {
  try {
    // Uncomment to run demos
    // await demo1_withHashesFile()
    // await demo2_directHash()
    // await demo3_errorHandling()
    // await demo4_extractSkinBins()

    console.log('\n✅ All demos completed');
  } catch (error) {
    console.error('❌ Error running demos:', error);
  }
}

// Execute if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllDemos();
}
