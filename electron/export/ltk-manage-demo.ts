/**
 * 皮肤应用工具 - 使用示例
 * 这个文件展示如何使用 standalone-skin-applier 的常见场景
 */

import {
  type SkinApplyOptions,
  type SkinGenerationOptions,
  applySkin,
  generateSkin,
} from './ltk-manage';

/**
 * 示例 1: 生成单个英雄的单个皮肤
 */
export async function example1_GenerateSingleSkin() {
  console.log('\n=== 示例 1: 生成 Ahri 的默认皮肤 ===\n');

  try {
    const fantomeFiles = await generateSkin({
      wadPath: 'E:/game/Riot Games/League of Legends/Game/DATA/FINAL/Champions/Ahri.wad.client',
      champion: 'Ahri',
      skinIds: [1], // 只生成皮肤 0
      outputDir: 'C:\\Users\\18074\\Downloads\\skins',
      author: 'Example Bot',
    });

    console.log('✓ 生成成功！输出文件：');
    fantomeFiles.forEach((file) => console.log(`  - ${file}`));
  } catch (error) {
    console.error('✗ 生成失败:', error);
  }
}

/**
 * 示例 2: 生成多个皮肤
 */
export async function example2_GenerateMultipleSkins() {
  console.log('\n=== 示例 2: 生成 Lux 的所有皮肤 ===\n');

  try {
    const fantomeFiles = await generateSkin({
      wadPath: 'C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/Lux.wad.client',
      champion: 'Lux',
      skinIds: [0, 1, 2, 3, 4, 5, 6], // 生成多个皮肤
      outputDir: './output/lux_skins',
      author: 'Skin Collection',
    });

    console.log(`✓ 成功生成 ${fantomeFiles.length} 个皮肤`);
  } catch (error) {
    console.error('✗ 生成失败:', error);
  }
}

/**
 * 示例 3: 应用皮肤到游戏
 */
export async function example3_ApplySkinToGame() {
  console.log('\n=== 示例 3: 应用皮肤到游戏 ===\n');

  try {
    await applySkin({
      gamePath: 'E:/game/Riot Games/League of Legends/Game',
      fantomePaths: [
        'C:\\Users\\18074\\AppData\\Local\\lol-skin-ll\\skins\\wad_skins\\11\\11_89.zip',
      ],
      timeout: 300000, // 5 分钟超时
    });

    console.log('✓ 皮肤已应用到游戏！');
  } catch (error) {
    console.error('✗ 应用失败:', error);
  }
}

/**
 * 示例 4: 完整流程 - 生成并应用
 */
export async function example4_CompleteWorkflow() {
  console.log('\n=== 示例 4: 完整流程（生成 + 应用）===\n');

  try {
    // 步骤 1: 生成皮肤
    console.log('📦 步骤 1: 生成皮肤...');
    const fantomeFiles = await generateSkin({
      wadPath: 'C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/KhaZix.wad.client',
      champion: 'KhaZix',
      skinIds: [0, 1, 2],
      outputDir: './output/khazix',
      author: 'Complete Workflow',
    });

    console.log(`✓ 生成完成，共 ${fantomeFiles.length} 个皮肤\n`);

    // 步骤 2: 应用皮肤
    console.log('🎮 步骤 2: 应用皮肤到游戏...');
    await applySkin({
      gamePath: 'C:/Riot Games/League of Legends/Game',
      fantomePaths: fantomeFiles,
    });

    console.log('✓ 应用完成！皮肤已在游戏中生效');
  } catch (error) {
    console.error('✗ 流程中断:', error);
  }
}

/**
 * 示例 5: 批量处理多个英雄
 */
export async function example5_BulkProcessMultipleChampions() {
  console.log('\n=== 示例 5: 批量处理多个英雄 ===\n');

  const champions = [
    { name: 'Ahri', skinIds: [0, 1] },
    { name: 'Lux', skinIds: [0, 2, 4] },
    { name: 'Qiyana', skinIds: [0, 1, 3] },
  ];

  const allFantomeFiles: string[] = [];

  try {
    for (const champion of champions) {
      console.log(`\n📦 生成 ${champion.name} 的皮肤...`);

      const files = await generateSkin({
        wadPath: `C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/${champion.name}.wad.client`,
        champion: champion.name,
        skinIds: champion.skinIds,
        outputDir: `./output/bulk/${champion.name}`,
        author: 'Bulk Processor',
      });

      allFantomeFiles.push(...files);
      console.log(`✓ ${champion.name} 生成完成（${files.length} 个皮肤）`);
    }

    console.log(`\n✓ 总共生成 ${allFantomeFiles.length} 个皮肤`);
    console.log('\n生成的所有文件:');
    allFantomeFiles.forEach((file) => console.log(`  - ${file}`));
  } catch (error) {
    console.error('✗ 批量处理失败:', error);
  }
}

/**
 * 示例 6: 仅应用已生成的皮肤（快速应用）
 */
export async function example6_QuickApplyExistingSkins() {
  console.log('\n=== 示例 6: 快速应用已生成的皮肤 ===\n');

  const existingSkins = [
    './output/skins/Ahri_Skin0.fantome',
    './output/skins/Ahri_Skin1.fantome',
    './output/lux_skins/Lux_Skin0.fantome',
    './output/lux_skins/Lux_Skin2.fantome',
  ];

  try {
    console.log(`准备应用 ${existingSkins.length} 个皮肤...`);

    await applySkin({
      gamePath: 'C:/Riot Games/League of Legends/Game',
      fantomePaths: existingSkins,
      timeout: 600000, // 10 分钟超时
    });

    console.log('✓ 所有皮肤已应用！');
  } catch (error) {
    console.error('✗ 应用失败:', error);
  }
}

/**
 * 示例 7: 错误处理
 */
export async function example7_ErrorHandling() {
  console.log('\n=== 示例 7: 错误处理演示 ===\n');

  // 尝试生成不存在的 WAD 文件
  try {
    console.log('尝试生成不存在的 WAD 文件...');
    await generateSkin({
      wadPath: 'C:/NonExistent/Path/Champion.wad.client',
      champion: 'FakeChamp',
      skinIds: [0],
      outputDir: './output',
    });
  } catch (error) {
    console.log(`✓ 正确捕获错误: ${error}`);
  }

  // 尝试应用不存在的皮肤文件
  try {
    console.log('\n尝试应用不存在的皮肤文件...');
    await applySkin({
      gamePath: 'C:/Riot Games/League of Legends/Game',
      fantomePaths: ['./output/NonExistent.fantome'],
    });
  } catch (error) {
    console.log(`✓ 正确捕获错误: ${error}`);
  }

  // 尝试应用到不存在的游戏目录
  try {
    console.log('\n尝试应用到不存在的游戏目录...');
    await applySkin({
      gamePath: 'C:/NonExistent/Game',
      fantomePaths: ['./output/skins/Ahri_Skin0.fantome'],
    });
  } catch (error) {
    console.log(`✓ 正确捕获错误: ${error}`);
  }
}

/**
 * 示例 8: 自定义超时时间
 */
export async function example8_CustomTimeout() {
  console.log('\n=== 示例 8: 自定义超时时间 ===\n');

  try {
    // 为需要更长时间的操作增加超时时间
    const fantomeFiles = await generateSkin({
      wadPath: 'C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/Ahri.wad.client',
      champion: 'Ahri',
      skinIds: [0, 1, 2, 3, 4, 5],
      outputDir: './output/skins',
      author: 'Timeout Test',
    });

    console.log('✓ 生成完成');

    // 应用时使用更长的超时时间（15 分钟）
    await applySkin({
      gamePath: 'C:/Riot Games/League of Legends/Game',
      fantomePaths: fantomeFiles,
      timeout: 900000, // 15 分钟
    });

    console.log('✓ 应用完成');
  } catch (error) {
    console.error('✗ 失败:', error);
  }
}

/**
 * 主函数 - 运行示例
 */
async function main() {
  const exampleNum = process.argv[2] || '1';

  console.log('皮肤应用工具 - 使用示例');
  console.log('=========================');

  try {
    switch (exampleNum) {
      case '1':
        await example1_GenerateSingleSkin();
        break;
      case '2':
        await example2_GenerateMultipleSkins();
        break;
      case '3':
        await example3_ApplySkinToGame();
        break;
      case '4':
        await example4_CompleteWorkflow();
        break;
      case '5':
        await example5_BulkProcessMultipleChampions();
        break;
      case '6':
        await example6_QuickApplyExistingSkins();
        break;
      case '7':
        await example7_ErrorHandling();
        break;
      case '8':
        await example8_CustomTimeout();
        break;
      default:
        console.log(`
未知示例: ${exampleNum}

可用的示例:
  1 - 生成单个皮肤
  2 - 生成多个皮肤
  3 - 应用皮肤到游戏
  4 - 完整流程（生成 + 应用）
  5 - 批量处理多个英雄
  6 - 快速应用已生成的皮肤
  7 - 错误处理演示
  8 - 自定义超时时间

使用方式:
  npx ts-node scripts/standalone-skin-applier.examples.ts [示例号]

示例:
  npx ts-node scripts/standalone-skin-applier.examples.ts 1
  npx ts-node scripts/standalone-skin-applier.examples.ts 4
        `);
    }
  } catch (error) {
    console.error('执行示例时出错:', error);
    process.exit(1);
  }
}

// 只在直接运行时执行
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
